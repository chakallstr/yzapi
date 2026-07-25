/**
 * CodeFast provisioning — turns a freshly-granted entitlement into a live
 * CodeFast customer order and stores the per-customer key on the entitlement.
 *
 * Called AFTER the yzapi balance transaction commits (never inside the money
 * `dbSql.begin` — this makes a network side-effect). Never throws to the caller:
 * on failure it marks the entitlement `cf_status='failed'` so a retry job can
 * pick it up (the CodeFast `Idempotency-Key` makes a retry safe — no double charge).
 *
 * Auto products → order returns `cf_rc_live_…` immediately → status 'provisioned'.
 * Claude Max (manual_review) → no key yet → status 'pending_manual' (admin delivers later).
 */
import { dbSql } from "../db/client.js";
import { encryptApiKey } from "./api-key-service.js";
import { cfCreateOrder, cfGetOrder, extractCustomerKey, CodefastError } from "./codefast-reseller-service.js";

/**
 * Lazy provisioning batch boyutu: CF'den her seferinde alınan ünite (peşin tüm limit DEĞİL).
 * 50 → 150 (2026-06-19): Codex/agent istemcileri açılışta saniyeler içinde onlarca istek atıyor;
 * 50'lik ilk batch hızlı patlamada async top-up CF order'ı inmeden 0'a düşüp `upstream_403`
 * (CF kota reddi) üretiyordu. Daha büyük ilk batch soğuk-başlangıç 403'ünü kapatır
 * (kullanılmayan üniteye yine para verilmez — top-up paket CF kotasına gelince durur).
 */
export const CF_INITIAL_BATCH_UNITS = 150;

/**
 * Top-up (lazy artış) batch boyutu — İLK order'dan AYRI ve daha KÜÇÜK.
 * İlk order 150 kalır (soğuk-başlangıç 403 koruması, yukarıdaki yorum). Ama paket
 * ısındıktan SONRA buffer'ı küçük artışlarla doldur: müşteri kullandıkça 50'şer al,
 * böylece kullanılmayan üniteye CF'ye peşin para verilmez (paket süresi bitince
 * almadığımız ünite zarar yazmaz). Eşik (CF_TOPUP_THRESHOLD_UNITS) AYNI kaldığı için
 * ongoing burst-403 riski artmaz — yalnız peşin alım azalır.
 */
export const CF_TOPUP_BATCH_UNITS = 50;

export interface CfPkgMeta {
  cfCatalogId: string;
  cfApiSlug: string;
  cfManual: boolean;
  gunlukIstekLimiti: number;
  sureGun: number;
  cfTokenMillions?: number | null;
  /** DOLU → order template_id ile yapılır (CF panel şablonu); NULL/boş → items[catalog_id] akışı. */
  cfTemplateId?: string | null;
}

export interface ProvisionResult {
  cfStatus: "provisioned" | "pending_manual" | "failed";
  cfOrderId?: string;
}

export async function provisionCodefastEntitlement(args: {
  entitlementId: string;
  userId: string;
  externalOrderId: string;
  pkg: CfPkgMeta;
  email?: string;
  username?: string;
}): Promise<ProvisionResult> {
  const { entitlementId, userId, externalOrderId, pkg } = args;
  // HİBRİT: cf_template_id doluysa CF panel şablonuyla (template_id), yoksa items[catalog_id] ile order.
  const useTemplate = typeof pkg.cfTemplateId === "string" && pkg.cfTemplateId.length > 0;
  // LAZY PROVISIONING: istek-bazlı (items) pakette CF'den PEŞİN tüm limit değil, ilk batch (50) alınır;
  // tükettikçe top-up ile 50'şer eklenir, toplam paketin CF kotasına (gunlukIstekLimiti) ulaşınca durur.
  // Kullanılmayan üniteye para vermeyiz. Token/template paketlerde lazy YOK (limit CF tarafında tanımlı).
  const useLazyBatch = !pkg.cfTokenMillions && !useTemplate;
  const firstBatch = useLazyBatch ? Math.min(CF_INITIAL_BATCH_UNITS, pkg.gunlukIstekLimiti) : pkg.gunlukIstekLimiti;
  const item = pkg.cfTokenMillions
    ? { catalog_id: pkg.cfCatalogId, claude_token_millions: pkg.cfTokenMillions }
    : { catalog_id: pkg.cfCatalogId, limit_amount: firstBatch, duration_days: pkg.sureGun };
  const orderReq = {
    external_customer_id: userId,
    external_order_id: externalOrderId,
    customer: { email: args.email, username: args.username },
    create_customer_api_key: true,
    ...(useTemplate ? { template_id: pkg.cfTemplateId as string } : { items: [item] }),
  };

  try {
    const order = await cfCreateOrder(orderReq, externalOrderId);
    let key = extractCustomerKey(order);
    const isManualProduct = order.manual_review_required || pkg.cfManual;
    // CF artık auto-fulfillment yapıyor (Claude dahil): key POST'ta DÖNMÜYOR (async fulfillment).
    // order.status "pending" → "fulfilled" olana kadar poll et, sonra GET customer_api_key.api_key gelir.
    // Manuel ürün (pkg.cfManual=true) hariç — o hâlâ pending_manual'da admin bekler.
    if (!key && !isManualProduct) {
      const deadline = Date.now() + 120_000; // max 2 dk bekle
      while (Date.now() < deadline) {
        try {
          const fresh = await cfGetOrder(order.order.id);
          key = extractCustomerKey(fresh);
          if (key) break;
          // fulfilled ama key yok → kurtarılamaz
          if (fresh.order?.status === "fulfilled" && !key) break;
        } catch (e) {
          // rate limit → retry_after_seconds kadar bekle
          const msg = e instanceof CodefastError ? e.message : String((e as Error)?.message ?? e);
          const m = /retry_after_seconds["']?\s*:\s*(\d+)/.exec(msg);
          const is429 = e instanceof CodefastError && e.status === 429;
          if (is429) {
            const waitSec = m ? Number(m[1]) + 1 : 5;
            await new Promise((r) => setTimeout(r, waitSec * 1000));
            continue;
          }
        }
        await new Promise((r) => setTimeout(r, 12_000)); // 12s poll aralığı
      }
      if (!key) {
        // Son çare: bir kez daha GET dene, hâlâ yoksa failed (müşteri iade edilir).
        try {
          const fresh = await cfGetOrder(order.order.id);
          key = extractCustomerKey(fresh);
        } catch { /* yut */ }
      }
      if (!key) {
        await dbSql`
          UPDATE user_package_entitlements
          SET cf_customer_id = ${userId}, cf_order_id = ${order.order.id}, cf_api_slug = ${pkg.cfApiSlug},
              cf_status = 'failed', updated_at = now()
          WHERE id = ${entitlementId}::uuid
        `.catch(() => {});
        console.error("[codefast] auto product returned no customer key (irrecoverable)", entitlementId, order.order.id);
        return { cfStatus: "failed", cfOrderId: order.order.id };
      }
    }
    const manual = isManualProduct || !key; // manuel ürün: key yok → pending_manual (beklenen)
    const status: ProvisionResult["cfStatus"] = manual ? "pending_manual" : "provisioned";
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_customer_id = ${userId},
          cf_order_id = ${order.order.id},
          cf_api_slug = ${pkg.cfApiSlug},
          cf_rc_key_cipher = ${key ? encryptApiKey(key) : null},
          cf_status = ${status},
          cf_units_ordered = ${useLazyBatch ? firstBatch : 0},
          updated_at = now()
      WHERE id = ${entitlementId}::uuid
    `;
    return { cfStatus: status, cfOrderId: order.order.id };
  } catch (e) {
    const status = e instanceof CodefastError ? e.status : undefined;
    await dbSql`
      UPDATE user_package_entitlements SET cf_status = 'failed', updated_at = now()
      WHERE id = ${entitlementId}::uuid
    `.catch(() => {});
    console.error("[codefast] provisioning failed", { entitlementId, status });
    return { cfStatus: "failed" };
  }
}

/**
 * CF buffer bu eşiğin (ünite) altına inince bir sonraki batch alınır.
 * 15 → 75 (2026-06-19): top-up'ı daha erken tetikle ki async CF order, buffer 0'a düşmeden
 * insin (aksi halde eşik ile 0 arasındaki istekler `upstream_403` yer). cf_remaining mirror'ı
 * sağlıklı çalıştığında etkili; mirror NULL iken (remaining=0 sayılır) zaten her istekte tetiklenir.
 */
export const CF_TOPUP_THRESHOLD_UNITS = 75;

/**
 * CF reseller policy bir order'ın duration_days'ine ÜST sınır koyar (canlıda 90g "duration above
 * reseller policy" 400 verdi; satılan sabit paketler 1/7/15/30g sorunsuz). Order süresini bununla
 * clamp'leriz — alınan ÜNİTE adedini (limit_amount) DEĞİŞTİRMEZ, yalnız o batch'in CF-tarafı
 * geçerlilik süresini sınırlar (entitlement ömrü yzapi'de expires_at ile zaten enforce edilir).
 * Gerçek tavan dökümanla teyit edilince güncellenebilir; 30 konservatif-güvenli.
 */
export const CF_MAX_DURATION_DAYS = 30;

/**
 * Lazy provisioning top-up: CF buffer'ı azaldıysa (cf_remaining < eşik) ve paketin CF toplamına
 * (daily_limit_snapshot) henüz ulaşılmadıysa, CF'den +50 ünite alır. Toplam kotaya gelince DURUR
 * → müşterinin kullanmadığı isteğe para verilmez. Idempotent (key = batch indeksi, çift çekim yok),
 * ASLA throw etmez (fire-and-forget; isteği bloklamaz; concurrent loser UPDATE'i no-op).
 */
export async function topUpCfIfNeeded(entitlementId: string, _poolRemainingOverride?: number | null): Promise<void> {
  try {
    const rows = await dbSql<any[]>`
      SELECT e.cf_customer_id, e.cf_status, e.cf_remaining, e.cf_units_ordered,
             e.daily_limit_snapshot AS cap, e.expires_at, p.cf_catalog_id
      FROM user_package_entitlements e JOIN packages p ON p.id = e.package_id
      WHERE e.id = ${entitlementId}::uuid LIMIT 1`;
    const e = rows[0];
    if (!e || e.cf_status !== "provisioned") return;
    const ordered = Number(e.cf_units_ordered) || 0;
    const cap = Number(e.cap) || 0;
    if (ordered <= 0) return;            // lazy değil (template/token paketi) → atla
    if (ordered >= cap) return;          // paketin TÜM CF kotası alındı → dur (telafi yok)
    const remaining = e.cf_remaining == null ? 0 : Number(e.cf_remaining);
    if (remaining >= CF_TOPUP_THRESHOLD_UNITS) return; // buffer yeterli
    if (!e.cf_customer_id || !e.cf_catalog_id) return;
    const batch = Math.min(CF_TOPUP_BATCH_UNITS, cap - ordered);
    if (batch <= 0) return;
    // Süre = entitlement'ın KALAN ömrü (gün), p.sure_gun DEĞİL. Configurable ("Kendin Yap")
    // pakette p.sure_gun = şablon tavanı (90) → CF reseller policy "duration above" ile 400 REDDEDER
    // (ilk order müşterinin SEÇTİĞİ süreyle açıldığı için geçer; top-up p.sure_gun ile patlardı).
    // CF_MAX_DURATION_DAYS ile clamp → kümülatif EXTEND kalan-ömrü policy'yi aşsa bile order geçer.
    const msLeft = new Date(e.expires_at).getTime() - Date.now();
    if (!Number.isFinite(msLeft) || msLeft <= 0) return; // süresi geçmiş/bozuk hakka boşa CF parası harcama
    const durationDays = Math.min(CF_MAX_DURATION_DAYS, Math.max(1, Math.ceil(msLeft / 86_400_000)));
    const idemp = `topup-${entitlementId}-b${ordered}`;
    await cfCreateOrder({
      external_customer_id: e.cf_customer_id,
      external_order_id: idemp,
      create_customer_api_key: false,
      items: [{ catalog_id: e.cf_catalog_id, limit_amount: batch, duration_days: durationDays }],
    } as Parameters<typeof cfCreateOrder>[0], idemp);
    // Yalnız bu batch'i İLK uygulayan UPDATE eder (guard: cf_units_ordered = ordered); CF zaten idempotent.
    // ⚠️ cf_remaining'i de +batch bump et (deadlock fix): CF gerçekten +batch teslim etti; bump etmezsek
    // gate "tüketim = ordered - remaining" cap'e kilitlenir (ordered=cap & remaining=0 → istek CF'ye
    // gitmeden yerel reddedilir → mirror tazelenemez → kalıcı kilit). Bir sonraki başarılı settle CF'nin
    // gerçek header'ı ile mutlak set eder → yakınsar. LEAST(...,cap) optimistic tabanı cap'i aşıramaz.
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_units_ordered = ${ordered + batch},
          cf_remaining = LEAST(COALESCE(cf_remaining, 0) + ${batch}, daily_limit_snapshot),
          cf_remaining_at = now(),
          updated_at = now()
      WHERE id = ${entitlementId}::uuid AND cf_units_ordered = ${ordered}`;
  } catch (err) {
    const status = err instanceof CodefastError ? err.status : undefined;
    console.error("[codefast] top-up failed", { entitlementId, status });
  }
}

export async function topUpClaudeTokenOverride(entitlementId: string): Promise<void> {
  await topUpCfIfNeeded(entitlementId);
}

/**
 * Admin manual delivery: after CodeFast admin delivers a Claude Max key,
 * attach the cf_rc_live_ key to the pending entitlement and mark provisioned.
 */
export async function attachManualCustomerKey(entitlementId: string, customerApiKey: string): Promise<boolean> {
  const key = customerApiKey.trim();
  // Format: cf_rc_live_ + key gövdesi (yalnız güvenli karakterler), makul uzunluk sınırı.
  if (!/^cf_rc_live_[A-Za-z0-9_-]{8,160}$/.test(key)) {
    throw new CodefastError(400, "Geçersiz customer key (cf_rc_live_ formatında olmalı)");
  }
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements
    SET cf_rc_key_cipher = ${encryptApiKey(key)}, cf_status = 'provisioned', updated_at = now()
    WHERE id = ${entitlementId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}
