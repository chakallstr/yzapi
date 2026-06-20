import { db, dbSql } from "../db/client.js";
import { usageRecords } from "../db/schema.js";

export interface PackageCoverage {
  covered: boolean;
  entitlementId?: string;
  maxContextTokens?: number;
  tpmLimit?: number;
  packageId?: string;
  // Paket-bazlı upstream override (ikisi de doluysa proxy bu endpoint'i kullanır)
  providerBaseUrl?: string;
  providerApiKeyCipher?: string;
  // CodeFast müşteri-başına override: entitlement'a sabitlenen proxy slug + cf_rc_live_ key.
  // Doluysa proxy reseller-api/proxy/<slug>'a forward eder; cfStatus=pending_manual ise
  // (Claude elle teslim) key henüz yok → proxy 409 döner.
  cfApiSlug?: string;
  cfRcKeyCipher?: string;
  cfStatus?: string;
}

// In-memory fixed-window TPM tracker keyed by "userId:packageId"
interface TpmWindow { minute: number; tokens: number }
const tpmTracker = new Map<string, TpmWindow>();

/** Returns false if the TPM limit would be exceeded; records tokens on success. */
export function consumeTpmOrDeny(userId: string, packageId: string, tokens: number, limit: number): boolean {
  const key = `${userId}:${packageId}`;
  const minute = Math.floor(Date.now() / 60_000);
  const w = tpmTracker.get(key);
  const current = w?.minute === minute ? w.tokens : 0;
  if (current + tokens > limit) return false;
  tpmTracker.set(key, { minute, tokens: current + tokens });
  return true;
}

/** Salt-okunur: günlük kota bakılmaksızın aktif (süresi dolmamış) paket var mı? */
export async function hasActivePackageForModel(userId: string, modelId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT e.id FROM user_package_entitlements e
    WHERE e.user_id = ${userId}::uuid
      AND e.status = 'active'
      AND e.expires_at > now()
      AND e.allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Salt-okunur: bu modeli kapsayan, süresi geçmemiş, bugün kotası dolmamış aktif hak var mı? */
export async function checkPackageCoverage(userId: string, modelId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT e.id FROM user_package_entitlements e
    JOIN users u ON u.id = e.user_id
    WHERE e.user_id = ${userId}::uuid
      AND u.payg_mode = false        -- "kullandığın kadar öde" modunda paket kapsamı atlanır → bakiye
      AND e.paused = false           -- duraklatılmış paket istek tüketmez
      AND e.status = 'active'
      AND e.expires_at > now()
      AND e.allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
      -- CF paketinde günlük sayaç DEĞİL CF hesabı (cf_remaining) kapılar: CF paketi için daily_limit_snapshot
      -- ÖMÜRLÜK ünite sayısıdır (günlük tavan değil), bu yüzden cf_units_ordered>0 ise per-gün sayaç
      -- (requests_today<daily_limit_snapshot) BLOKLAMAZ — yoksa panel "ünite var" derken kapı 402 verir (RC1/RC2).
      AND (e.cf_units_ordered > 0
           OR e.last_reset_date < CURRENT_DATE
           OR e.requests_today < e.daily_limit_snapshot)
      -- CF lazy gate (CF hesabı bazlı, deadlock-güvenli): cf_units_ordered=0 → lazy değil (eski yol);
      -- cf_remaining NULL → mirror henüz kurulmadı, geçir (ilk istek kurar); >0 → CF'de ünite var, geçir;
      -- =0 & taze → CF tükendi, BLOKLA; =0 ama 10dk'dan eski "stale-0" → güvenlik supabı, geçir (CF/günlük
      -- reset gerçeği konuşsun; manuel rescue'yu kalıcı gereksiz kılar). Eski "ordered-remaining<cap"
      -- formülü, top-up cf_remaining'i bumplamadığında cap'te kalıcı kilitleniyordu.
      AND (e.cf_units_ordered = 0
           OR e.cf_remaining IS NULL
           OR e.cf_remaining > 0
           OR e.cf_remaining_at < now() - interval '10 minutes')
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Atomik: en erken biten kapsayan haktan bir günlük slot rezerve et. */
export async function tryReservePackageSlot(userId: string, modelId: string): Promise<PackageCoverage> {
  const rows = await dbSql<{ id: string; max_context_tokens: number | null; tpm_limit: number | null; package_id: string; provider_base_url: string | null; provider_api_key_cipher: string | null; cf_api_slug: string | null; cf_rc_key_cipher: string | null; cf_status: string | null }[]>`
    UPDATE user_package_entitlements AS upe
    SET requests_today = CASE WHEN upe.last_reset_date < CURRENT_DATE THEN 1 ELSE upe.requests_today + 1 END,
        last_reset_date = CURRENT_DATE,
        updated_at = now()
    FROM packages p
    WHERE p.id = upe.package_id
      AND upe.id = (
        SELECT e.id FROM user_package_entitlements e
        JOIN users u ON u.id = e.user_id
        WHERE e.user_id = ${userId}::uuid
          AND u.payg_mode = false        -- "kullandığın kadar öde" modu → paket atlanır, bakiyeden düşer
          AND e.paused = false           -- duraklatılmış paket istek tüketmez (süre işlemeye devam eder)
          AND e.status = 'active'
          AND e.expires_at > now()
          AND e.allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
          -- CF paketi günlük sayaçtan muaf (checkPackageCoverage ile AYNI — ikisi senkron kalmalı): bkz oradaki açıklama.
          AND (e.cf_units_ordered > 0
               OR e.last_reset_date < CURRENT_DATE
               OR e.requests_today < e.daily_limit_snapshot)
          -- CF lazy gate (checkPackageCoverage ile AYNI semantik — ikisi senkron kalmalı): bkz oradaki açıklama.
          AND (e.cf_units_ordered = 0
               OR e.cf_remaining IS NULL
               OR e.cf_remaining > 0
               OR e.cf_remaining_at < now() - interval '10 minutes')
        -- Düşükten büyüğe tüketim: önce KÜÇÜK paket (daily_limit) bitirilir, sonra büyüğe geçilir
        -- (eşit boyutta önce erken biten). Böylece küçük paketler büyük paketin altında kaybolmaz.
        ORDER BY e.daily_limit_snapshot ASC, e.expires_at ASC
        LIMIT 1
        FOR UPDATE OF e SKIP LOCKED
      )
    RETURNING upe.id, upe.package_id, p.max_context_tokens, p.tpm_limit,
              p.provider_base_url, p.provider_api_key_cipher,
              upe.cf_api_slug, upe.cf_rc_key_cipher, upe.cf_status
  `;
  if (rows.length) {
    const r = rows[0];
    return {
      covered: true,
      entitlementId: r.id,
      packageId: r.package_id,
      maxContextTokens: r.max_context_tokens ?? undefined,
      tpmLimit: r.tpm_limit ?? undefined,
      providerBaseUrl: r.provider_base_url ?? undefined,
      providerApiKeyCipher: r.provider_api_key_cipher ?? undefined,
      cfApiSlug: r.cf_api_slug ?? undefined,
      cfRcKeyCipher: r.cf_rc_key_cipher ?? undefined,
      cfStatus: r.cf_status ?? undefined,
    };
  }
  return { covered: false };
}

/**
 * CF mirror: CodeFast'in `x-codefast-remaining` header'ından yakalanan GERÇEK kalan üniteyi
 * entitlement'a yaz. Panel + gate bunu okuyunca bizim sayaç CF ile birebir senkron olur.
 * remaining null → CF cevabı yoktu (CF dışı sağlayıcı), dokunma.
 */
export async function updateCfRemaining(entitlementId: string, remaining: number | null | undefined): Promise<void> {
  if (remaining == null || !Number.isFinite(remaining)) return;
  await dbSql`
    UPDATE user_package_entitlements
    SET cf_remaining = ${Math.trunc(remaining)}, cf_remaining_at = now(), updated_at = now()
    WHERE id = ${entitlementId}::uuid
  `;
}

/** Hata durumunda slot iadesi (K1'in kota ikizi). */
export async function releasePackageSlot(entitlementId: string): Promise<void> {
  await dbSql`
    UPDATE user_package_entitlements
    SET requests_today = GREATEST(requests_today - 1, 0), updated_at = now()
    WHERE id = ${entitlementId}::uuid
  `;
}

/** Paket isteği için usage_records satırı (costTL=0, billed_via='package'). */
export async function recordPackageUsage(opts: {
  userId: string;
  apiKeyId: string;
  modelId: string;
  entitlementId: string;
  inputUsage: number;
  outputUsage: number;
  responseMs: number;
  status: "success" | "error";
  requestId: string;
  upstreamRequestId?: string;
  errorCode?: string;
}): Promise<void> {
  await db.insert(usageRecords).values({
    userId: opts.userId,
    apiKeyId: opts.apiKeyId,
    modelId: opts.modelId,
    type: "Metin",
    inputUsage: opts.inputUsage,
    outputUsage: opts.outputUsage,
    costUsd: "0",
    costTL: "0",
    requestId: opts.requestId,
    upstreamRequestId: opts.upstreamRequestId,
    errorCode: opts.errorCode,
    responseMs: opts.responseMs,
    status: opts.status,
    billedVia: "package",
    entitlementId: opts.entitlementId,
  }).onConflictDoNothing();
}

/**
 * Bir kullanıcıya paket entitlement'ı VER (aktif aynı paket varsa süreyi uzat, yoksa oluştur).
 * Bir transaction içinde çağrılır (txSql). purchase (bakiye) ve redeem (kod) ORTAK kullanır.
 * Snapshot (daily_limit, allowed_models) burada dondurulur. Para taşımaz.
 */
export async function grantPackageEntitlement(
  txSql: any,
  params: {
    userId: string;
    packageId: string;
    sureGun: number;
    gunlukIstekLimiti: number;
    allowedModels: unknown;
    purchaseTransactionId?: string | null;
  },
  /**
   * true → mevcut aktif aynı-paket hakkı OLSA BİLE süreyi uzatma (EXTEND), HER ZAMAN yeni satır aç.
   * - Configurable ("Kendin Yap") paketlerde her alım farklı (limit×süre) olabilir → birleştirilemez
   *   (eski EXTEND daily_limit'i EZİYORDU → 120→100 downgrade bug'ı). Ayrı satır = her alım tam ödediği.
   * - "Paketimi Yenile" (her pakette) → taze kota = yeni satır.
   * Sabit paketlerde normal alım false → eski EXTEND (aynı daily_limit, süre stack) korunur.
   * Çoklu aktif satır tryReservePackageSlot tarafından zaten destekleniyor (günlük kapasite = toplam).
   */
  ayriSatir = false,
): Promise<{ entitlementId: string; extended: boolean }> {
  const allowedJson = JSON.stringify(params.allowedModels ?? []);
  const txId = params.purchaseTransactionId ?? null;

  const existing = ayriSatir ? [] : await txSql<{ id: string }[]>`
    SELECT id FROM user_package_entitlements
    WHERE user_id = ${params.userId}::uuid AND package_id = ${params.packageId}
      AND status = 'active' AND expires_at > now()
    ORDER BY expires_at DESC LIMIT 1
  `;
  if (existing.length) {
    // EXTEND: CF mirror sayaçlarını re-base et (cf_remaining=NULL → gate "kurulmadı" sayıp geçer →
    // bunu izleyen re-provisioning cf_units_ordered'ı taze firstBatch'e set eder, ilk istek mirror'lar).
    // Aksi halde eski stale cf_remaining=0 EXTEND sonrası deadlock'u kalıcılaştırırdı. CF-dışı pakette
    // cf_remaining zaten NULL → no-op.
    const ext = await txSql<{ id: string }[]>`
      UPDATE user_package_entitlements
      SET expires_at = expires_at + (${params.sureGun}::int * interval '1 day'),
          daily_limit_snapshot = ${params.gunlukIstekLimiti}::int,
          allowed_models_snapshot = ${allowedJson}::jsonb,
          purchase_transaction_id = ${txId}::uuid,
          cf_remaining = NULL,
          cf_remaining_at = NULL,
          updated_at = now()
      WHERE id = ${existing[0].id}::uuid
      RETURNING id
    `;
    return { entitlementId: ext[0].id, extended: true };
  }
  const ins = await txSql<{ id: string }[]>`
    INSERT INTO user_package_entitlements
      (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot,
       activated_at, expires_at, status, requests_today, last_reset_date, purchase_transaction_id)
    VALUES
      (${params.userId}::uuid, ${params.packageId}, ${params.gunlukIstekLimiti}::int, ${allowedJson}::jsonb,
       now(), now() + (${params.sureGun}::int * interval '1 day'), 'active', 0, CURRENT_DATE, ${txId}::uuid)
    RETURNING id
  `;
  return { entitlementId: ins[0].id, extended: false };
}

export interface ActiveEntitlement {
  id: string;
  packageId: string;
  paketAdi: string;
  kategori: string;
  gunlukLimit: number;
  kalanBugun: number;
  kullanilanBugun: number;
  activatedAt: string;
  expiresAt: string;
  allowedModels: string[];
  maxContextTokens?: number;
  /** CF-arkalı pakette CF'nin gerçek kalan ünitesi (mirror); CF dışı pakette null. */
  cfRemaining?: number | null;
}

/**
 * Panel/admin "kullanılan" gösterimi (SALT-GÖSTERİM; kapı/billing/cf_remaining'e DOKUNMAZ).
 * CF paketinde tüketim normalde CF mirror'ından (cf_units_ordered − cf_remaining) okunur; ama CF
 * `x-codefast-remaining` header'ını her cevapta dönmediğinde mirror seed değerinde (=cf_units_ordered)
 * DONAR → tüketim 0 görünür ("kullanilan:0" / paket dolu sanılır) hâlbuki müşteri yüzlerce istek atmıştır.
 * Düzeltme: gerçek başarılı istek sayısıyla (usedSuccess) hizala — tüketim = max(CF-bazlı, başarılı istek),
 * limite kırpılır. Asla "kullanılmamış" göstermez. Kapı bağımsızdır (cf_remaining okur) → bu hesap onu etkilemez.
 */
export function computeDisplayConsumed(
  limit: number,
  cfUnitsOrdered: number,
  cfRemaining: number | null,
  requestsToday: number,
  usedSuccess: number,
): number {
  if (!(cfUnitsOrdered > 0)) return requestsToday; // CF dışı paket: günlük sayaç (eski davranış)
  const cfConsumed = Math.max(0, cfUnitsOrdered - (cfRemaining == null ? cfUnitsOrdered : cfRemaining));
  const used = Number.isFinite(usedSuccess) ? usedSuccess : 0; // veri yoksa CF-bazlıya düş (güvenli)
  return Math.min(limit, Math.max(cfConsumed, used));
}

export async function listUserEntitlements(userId: string): Promise<ActiveEntitlement[]> {
  const rows = await dbSql<any[]>`
    SELECT e.id, e.package_id, p.ad AS paket_adi, p.kategori,
           e.daily_limit_snapshot,
           CASE WHEN e.last_reset_date < CURRENT_DATE THEN 0 ELSE e.requests_today END AS requests_today,
           e.cf_remaining, e.cf_units_ordered, COALESCE(uc.used_success, 0) AS used_success,
           e.activated_at, e.expires_at, e.allowed_models_snapshot, p.max_context_tokens
    FROM user_package_entitlements e
    JOIN packages p ON p.id = e.package_id
    LEFT JOIN (
      SELECT entitlement_id, count(*) AS used_success
      FROM usage_records
      WHERE user_id = ${userId}::uuid AND status = 'success' AND entitlement_id IS NOT NULL
      GROUP BY entitlement_id
    ) uc ON uc.entitlement_id = e.id
    WHERE e.user_id = ${userId}::uuid AND e.status = 'active' AND e.expires_at > now()
    ORDER BY e.expires_at ASC
  `;
  return rows.map((r) => {
    const limit = Number(r.daily_limit_snapshot);
    // CF lazy: "kalan" = paketin CF toplamı (limit) − tüketim. Tüketim = alınan − CF buffer.
    // CF ne düşürürse panel onu gösterir (CF hesabına göre, bizim istek sayacımız DEĞİL).
    const cfLazy = Number(r.cf_units_ordered) > 0;
    const consumed = computeDisplayConsumed(
      limit, Number(r.cf_units_ordered), r.cf_remaining == null ? null : Number(r.cf_remaining),
      Number(r.requests_today), Number(r.used_success),
    );
    const kalan = Math.max(0, limit - consumed);
    const used = consumed;
    return {
      id: r.id,
      packageId: r.package_id,
      paketAdi: r.paket_adi,
      kategori: r.kategori,
      gunlukLimit: limit,
      kullanilanBugun: used,
      kalanBugun: kalan,
      activatedAt: r.activated_at,
      expiresAt: r.expires_at,
      allowedModels: r.allowed_models_snapshot ?? [],
      maxContextTokens: r.max_context_tokens ?? undefined,
      cfRemaining: cfLazy ? kalan : null,
    };
  });
}

// ── "Paketlerim" müşteri paneli: tüm paketler (aktif + duraklatılmış + geçmiş) ─────────────
export interface PanelEntitlement {
  id: string;
  paketAdi: string;
  kategori: string;
  gunlukLimit: number;
  kalan: number;
  kullanilan: number;
  paused: boolean;
  /** aktif | duraklatildi | gunluk_doldu | tukendi | suresi_doldu | <ham status> */
  durum: string;
  activatedAt: string;
  expiresAt: string;
  /** "Paketimi Yenile" gösterilsin mi: istek-limitli + tek-seferlik olmayan paketler. */
  renewable: boolean;
}

/**
 * Müşterinin TÜM paketleri (aktif + bitmiş/süresi dolmuş geçmiş) — Paketlerim sekmesi.
 * Sağlayıcı/CF slug/cipher/maliyet SIZMAZ (sadece ad/kategori/kalan/limit/durum/tarih/paused).
 */
export async function listUserPackagesForPanel(userId: string): Promise<PanelEntitlement[]> {
  const rows = await dbSql<any[]>`
    SELECT e.id, p.ad AS paket_adi, p.kategori, e.daily_limit_snapshot, e.paused,
           CASE WHEN e.last_reset_date < CURRENT_DATE THEN 0 ELSE e.requests_today END AS requests_today,
           e.cf_remaining, e.cf_units_ordered, COALESCE(uc.used_success, 0) AS used_success,
           e.activated_at, e.expires_at, e.status,
           (e.expires_at <= now()) AS expired, p.tip, p.per_user_once
    FROM user_package_entitlements e
    JOIN packages p ON p.id = e.package_id
    LEFT JOIN (
      SELECT entitlement_id, count(*) AS used_success
      FROM usage_records
      WHERE user_id = ${userId}::uuid AND status = 'success' AND entitlement_id IS NOT NULL
      GROUP BY entitlement_id
    ) uc ON uc.entitlement_id = e.id
    WHERE e.user_id = ${userId}::uuid
    ORDER BY (e.status = 'active' AND e.expires_at > now()) DESC, e.activated_at DESC
    LIMIT 100
  `;
  return rows.map((r) => {
    const limit = Number(r.daily_limit_snapshot);
    const cfLazy = Number(r.cf_units_ordered) > 0;
    const consumed = computeDisplayConsumed(
      limit, Number(r.cf_units_ordered), r.cf_remaining == null ? null : Number(r.cf_remaining),
      Number(r.requests_today), Number(r.used_success),
    );
    const kalan = Math.max(0, limit - consumed);
    const expired = r.expired === true;
    const paused = r.paused === true;
    let durum: string;
    if (r.status !== "active") durum = r.status;
    else if (expired) durum = "suresi_doldu";
    else if (paused) durum = "duraklatildi";
    else if (kalan <= 0) durum = cfLazy ? "tukendi" : "gunluk_doldu";
    else durum = "aktif";
    return {
      id: r.id,
      paketAdi: r.paket_adi,
      kategori: r.kategori,
      gunlukLimit: limit,
      kalan,
      kullanilan: consumed,
      paused,
      durum,
      activatedAt: r.activated_at,
      expiresAt: r.expires_at,
      renewable: r.tip === "request_limit" && r.per_user_once !== true,
    };
  });
}

/** Müşteri paketini duraklat/devam ettir (sahiplik kontrollü). Var olmayan/başkasının → false. */
export async function setEntitlementPaused(userId: string, entitlementId: string, paused: boolean): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements SET paused = ${paused}, updated_at = now()
    WHERE id = ${entitlementId}::uuid AND user_id = ${userId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}

/** "Kullandığın kadar öde" modunu aç/kapat (per-kullanıcı). */
export async function setUserPaygMode(userId: string, on: boolean): Promise<void> {
  await dbSql`UPDATE users SET payg_mode = ${on}, updated_at = now() WHERE id = ${userId}::uuid`;
}

export interface PurchaseHistoryItem {
  /** YZK-YYMMDD-XXXX; backfill öncesi eski alımlarda null. */
  ref: string | null;
  packageId: string | null;
  /** packages.ad çözülürse o, yoksa aciklama'daki "Paket: <ad>" metni. */
  paketAdi: string;
  tutarTL: number;
  tarih: string;
}

/**
 * Müşterinin paket satın alma geçmişi (ödeme olayları). Kota/entitlement'tan
 * BAĞIMSIZ; transactions'tan okunur. Sağlayıcı/maliyet sızmaz.
 */
export async function listUserPurchaseHistory(userId: string): Promise<PurchaseHistoryItem[]> {
  const rows = await dbSql<any[]>`
    SELECT t.purchase_ref, t.package_id, t.miktar_tl, t.timestamp, t.aciklama, p.ad AS paket_adi
    FROM transactions t
    LEFT JOIN packages p ON p.id = t.package_id
    WHERE t.user_id = ${userId}::uuid AND t.tip = 'paket_satin_alma'
    ORDER BY t.timestamp DESC
    LIMIT 200
  `;
  return rows.map((r) => ({
    ref: r.purchase_ref ?? null,
    packageId: r.package_id ?? null,
    paketAdi: r.paket_adi ?? (String(r.aciklama || "").replace(/^Paket:\s*/, "").trim() || "Paket"),
    tutarTL: Math.abs(Number(r.miktar_tl) || 0),
    tarih: r.timestamp,
  }));
}
