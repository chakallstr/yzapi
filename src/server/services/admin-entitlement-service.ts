// src/server/services/admin-entitlement-service.ts
import { randomUUID } from "node:crypto";
import { dbSql } from "../db/client.js";
import { env } from "../lib/env.js";
import { AppError, InsufficientBalanceError } from "../lib/errors.js";
import { grantPackageEntitlement } from "./entitlement-service.js";
import { generateUniquePurchaseRef } from "./purchase-ref.js";
import { cfSeatDecoupled } from "./package-purchase-service.js";
import { usdWalletEnabled, currentSellKur } from "./billing-service.js";

// ── Public types ─────────────────────────────────────────────────────────────

export interface AdminGrantParams {
  userId: string;
  packageId: string;            // taban/şablon paket (allowedModels + CF kablolama + kategori ondan)
  dailyLimit?: number;          // override; yoksa pkg.gunluk_istek_limiti
  durationDays?: number;        // override; yoksa pkg.sure_gun
  charge: "gift" | "balance";
  chargeTL?: number;            // charge==="balance" iken zorunlu (>0)
  adminId: string;
  note: string;                 // zorunlu audit notu
  idempotencyKey?: string;      // yoksa randomUUID
}

export interface AdminGrantResult {
  entitlementId: string;
  newBalanceTL: number;
  chargedTL: number;
  duplicate?: boolean;
}

export type RefundMode = "full" | "partial" | "none";

export interface AdminMoneyResult {
  refundedTL: number;
  newBalanceTL: number;
}

export interface AdminUpdateFields {
  dailyLimit?: number;
  remaining?: number;           // SADECE non-CF (cf_units_ordered=0); CF'de 400
  expiresAt?: string;           // ISO 8601
  paused?: boolean;
  status?: "active" | "cancelled";
}

// ── Task 1 / Task 2: adminGrantEntitlement ───────────────────────────────────

/** Admin: kullanıcıya paket VER (her zaman yeni satır). charge=gift → bakiye sabit; balance → chargeTL düş. */
export async function adminGrantEntitlement(p: AdminGrantParams): Promise<AdminGrantResult> {
  if (!p.note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  const idem = (p.idempotencyKey && p.idempotencyKey.trim()) || randomUUID();
  const txKey = "admin_grant_" + idem;

  const pkgRows = await dbSql<any[]>`
    SELECT id, ad, gunluk_istek_limiti, sure_gun, allowed_models,
           cf_catalog_id, cf_api_slug, cf_manual, cf_token_millions, cf_template_id
    FROM packages WHERE id = ${p.packageId} LIMIT 1`;
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];

  const limit = p.dailyLimit != null ? Math.floor(p.dailyLimit) : Number(pkg.gunluk_istek_limiti);
  const days = p.durationDays != null ? Math.floor(p.durationDays) : Number(pkg.sure_gun);
  if (!(limit > 0)) throw new AppError(400, "Günlük limit > 0 olmalı");
  if (!(days > 0)) throw new AppError(400, "Süre (gün) > 0 olmalı");

  let chargeTL = 0;
  if (p.charge === "balance") {
    chargeTL = Number(p.chargeTL);
    if (!(chargeTL > 0)) throw new AppError(400, "Tahsil tutarı > 0 olmalı");
  }

  // İdempotent ön-kontrol
  const dup = await dbSql<{ id: string }[]>`SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1`;
  if (dup.length) {
    const ent = await dbSql<{ id: string }[]>`SELECT id FROM user_package_entitlements WHERE purchase_transaction_id = ${dup[0].id}::uuid LIMIT 1`;
    const bal = await dbSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${p.userId}::uuid LIMIT 1`;
    return { entitlementId: ent[0]?.id ?? "", newBalanceTL: Number(bal[0]?.bakiye_tl ?? 0), chargedTL: chargeTL, duplicate: true };
  }

  let result: AdminGrantResult;
  try {
    result = await dbSql.begin(async (txSql) => {
      const usdMode = usdWalletEnabled();
      const sellKur = usdMode ? await currentSellKur() : 0;
      const chargeUsd = usdMode && sellKur > 0 ? Math.round((chargeTL / sellKur) * 1e6) / 1e6 : 0;
      let newBalance: number;
      let email: string;
      let newUsd = 0;
      if (p.charge === "balance") {
        if (usdMode) {
          const upd = await txSql<{ bakiye_usd: string; bakiye_tl: string; email: string }[]>`
            UPDATE users SET bakiye_usd = bakiye_usd - ${chargeUsd.toFixed(6)}::numeric,
              bakiye_tl = (bakiye_usd - ${chargeUsd.toFixed(6)}::numeric) * ${sellKur}::numeric, son_aktivite = now()
            WHERE id = ${p.userId}::uuid AND bakiye_usd >= ${chargeUsd.toFixed(6)}::numeric
            RETURNING bakiye_usd, bakiye_tl, email`;
          if (!upd.length) throw new InsufficientBalanceError("Tahsil için yeterli bakiye yok");
          newUsd = Number(upd[0].bakiye_usd); newBalance = Number(upd[0].bakiye_tl); email = upd[0].email;
        } else {
          const upd = await txSql<{ bakiye_tl: string; email: string }[]>`
            UPDATE users SET bakiye_tl = bakiye_tl - ${chargeTL}::numeric, son_aktivite = now()
            WHERE id = ${p.userId}::uuid AND bakiye_tl >= ${chargeTL}::numeric
            RETURNING bakiye_tl, email`;
          if (!upd.length) throw new InsufficientBalanceError("Tahsil için yeterli bakiye yok");
          newBalance = Number(upd[0].bakiye_tl); email = upd[0].email;
        }
      } else {
        const u = await txSql<{ bakiye_tl: string; bakiye_usd: string | null; email: string }[]>`SELECT bakiye_tl, bakiye_usd, email FROM users WHERE id = ${p.userId}::uuid LIMIT 1`;
        if (!u.length) throw new AppError(404, "Kullanıcı bulunamadı");
        newBalance = Number(u[0].bakiye_tl); email = u[0].email; newUsd = Number(u[0].bakiye_usd ?? 0);
      }
      const prev = p.charge === "balance" ? newBalance + chargeTL : newBalance;
      const prevUsd = p.charge === "balance" ? newUsd + chargeUsd : newUsd;
      const ref = await generateUniquePurchaseRef(txSql, new Date());
      const miktarUsdVal = p.charge === "balance" ? -chargeUsd : 0;
      const txRows = usdMode
        ? await txSql<{ id: string }[]>`
        INSERT INTO transactions
          (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key, purchase_ref, package_id,
           miktar_usd, kur_at_transaction, onceki_bakiye_usd, sonraki_bakiye_usd)
        VALUES
          (${p.userId}::uuid, ${email}, ${p.charge === "balance" ? "paket_satin_alma" : "admin_hediye"},
           ${p.charge === "balance" ? -chargeTL : 0}::numeric, ${prev}::numeric, ${newBalance}::numeric,
           ${(p.charge === "balance" ? "Admin paket (tahsil): " : "Admin hediye: ") + pkg.ad + " — " + p.note}, 'bakiye',
           ${txKey}, ${ref}, ${p.packageId},
           ${miktarUsdVal.toFixed(6)}::numeric, ${sellKur}::numeric, ${prevUsd.toFixed(6)}::numeric, ${newUsd.toFixed(6)}::numeric)
        RETURNING id`
        : await txSql<{ id: string }[]>`
        INSERT INTO transactions
          (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key, purchase_ref, package_id)
        VALUES
          (${p.userId}::uuid, ${email}, ${p.charge === "balance" ? "paket_satin_alma" : "admin_hediye"},
           ${p.charge === "balance" ? -chargeTL : 0}::numeric, ${prev}::numeric, ${newBalance}::numeric,
           ${(p.charge === "balance" ? "Admin paket (tahsil): " : "Admin hediye: ") + pkg.ad + " — " + p.note}, 'bakiye',
           ${txKey}, ${ref}, ${p.packageId})
        RETURNING id`;
      const { entitlementId } = await grantPackageEntitlement(txSql, {
        userId: p.userId, packageId: p.packageId, sureGun: days, gunlukIstekLimiti: limit,
        allowedModels: pkg.allowed_models ?? [], purchaseTransactionId: txRows[0].id,
      }, true /* ayriSatir: admin grant HER ZAMAN yeni satır */);
      return { entitlementId, newBalanceTL: newBalance, chargedTL: chargeTL };
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      const t = await dbSql<{ id: string }[]>`SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1`;
      const ent = await dbSql<{ id: string }[]>`SELECT id FROM user_package_entitlements WHERE purchase_transaction_id = ${t[0]?.id}::uuid LIMIT 1`;
      const bal = await dbSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${p.userId}::uuid LIMIT 1`;
      return { entitlementId: ent[0]?.id ?? "", newBalanceTL: Number(bal[0]?.bakiye_tl ?? 0), chargedTL: chargeTL, duplicate: true };
    }
    throw e;
  }

  // CodeFast provisioning — para tx COMMIT olduktan SONRA (network side-effect tx dışında).
  // purchasePackageWithBalance / giftPackageToUser ile aynı desen; admin grant da CF tedarik etmeli.
  if (env.CODEFAST_RESELLER_ENABLED && (pkg.cf_catalog_id || pkg.cf_template_id) && !cfSeatDecoupled(pkg, env.CODEX_SEAT_ONLY) && result.entitlementId) {
    const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
    const prov = await provisionCodefastEntitlement({
      entitlementId: result.entitlementId,
      userId: p.userId,
      externalOrderId: txKey,
      pkg: {
        cfCatalogId: pkg.cf_catalog_id,
        cfApiSlug: pkg.cf_api_slug,
        cfManual: pkg.cf_manual === true,
        gunlukIstekLimiti: limit,
        sureGun: days,
        cfTokenMillions: pkg.cf_token_millions ? Number(pkg.cf_token_millions) : null,
        cfTemplateId: pkg.cf_template_id ?? null,
      },
      username: p.userId,
    });
    if (prov.cfStatus === "failed") {
      await dbSql`
        UPDATE user_package_entitlements SET status = 'revoked', updated_at = now()
        WHERE id = ${result.entitlementId}::uuid AND status = 'active'
      `.catch(() => { /* best effort */ });
      throw new AppError(503, "CF paket tedarik edilemedi; hak revoke edildi.");
    }
  }
  return result;
}

// ── Task 3: adminUpdateEntitlement ───────────────────────────────────────────

/** Admin: mevcut entitlement'ı düzenle. remaining SADECE non-CF (cf_units_ordered=0). */
export async function adminUpdateEntitlement(entId: string, f: AdminUpdateFields, _adminId: string, note: string): Promise<{ ok: true }> {
  if (!note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  return await dbSql.begin(async (txSql) => {
    const rows = await txSql<any[]>`
      SELECT daily_limit_snapshot, cf_units_ordered FROM user_package_entitlements WHERE id = ${entId}::uuid LIMIT 1 FOR UPDATE`;
    if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
    const cur = rows[0];
    const isCf = Number(cur.cf_units_ordered) > 0;

    if (f.dailyLimit != null) {
      if (!(f.dailyLimit > 0)) throw new AppError(400, "Günlük limit > 0 olmalı");
      await txSql`UPDATE user_package_entitlements SET daily_limit_snapshot = ${Math.floor(f.dailyLimit)}::int, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.remaining != null) {
      if (isCf) throw new AppError(400, "CF paketinde kalan kota elle düzenlenemez (CF havuzu/ayna). Telafi için 'Yenile/Ekle' kullanın.");
      const limit = f.dailyLimit != null ? Math.floor(f.dailyLimit) : Number(cur.daily_limit_snapshot);
      const used = Math.max(0, limit - Math.floor(f.remaining));
      await txSql`UPDATE user_package_entitlements SET requests_today = ${used}::int, last_reset_date = CURRENT_DATE, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.expiresAt != null) {
      const d = new Date(f.expiresAt);
      if (Number.isNaN(d.getTime())) throw new AppError(400, "Geçersiz bitiş tarihi");
      await txSql`UPDATE user_package_entitlements SET expires_at = ${d.toISOString()}::timestamptz, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.paused != null) {
      await txSql`UPDATE user_package_entitlements SET paused = ${f.paused}, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.status != null) {
      if (f.status !== "active" && f.status !== "cancelled") throw new AppError(400, "Geçersiz durum");
      await txSql`UPDATE user_package_entitlements SET status = ${f.status}, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    return { ok: true as const };
  });
}

// ── Task 4: cancel / refund / delete ─────────────────────────────────────────

/** Ortak iade çekirdeği: idempotent bakiye+iade tx (tek transaction). amount<=0 → iade yok. */
async function doRefund(txSql: any, userId: string, amount: number, idemKey: string, aciklama: string): Promise<{ refundedTL: number; newBalanceTL: number }> {
  if (!(amount > 0)) {
    const b = await txSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid LIMIT 1`;
    return { refundedTL: 0, newBalanceTL: Number(b[0]?.bakiye_tl ?? 0) };
  }
  const dup = await txSql<{ id: string }[]>`SELECT id FROM transactions WHERE idempotency_key = ${idemKey} LIMIT 1`;
  if (dup.length) {
    const b = await txSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid LIMIT 1`;
    return { refundedTL: 0, newBalanceTL: Number(b[0]?.bakiye_tl ?? 0) }; // zaten iade edildi
  }
  if (usdWalletEnabled()) {
    const kur = await currentSellKur();
    const usd = kur > 0 ? Math.round((amount / kur) * 1e6) / 1e6 : 0;
    const usdStr = usd.toFixed(6);
    const upd = await txSql<{ bakiye_usd: string; bakiye_tl: string; email: string }[]>`
      UPDATE users SET bakiye_usd = bakiye_usd + ${usdStr}::numeric,
        bakiye_tl = (bakiye_usd + ${usdStr}::numeric) * ${kur}::numeric, updated_at = now()
      WHERE id = ${userId}::uuid RETURNING bakiye_usd, bakiye_tl, email`;
    if (!upd.length) throw new AppError(404, "Kullanıcı bulunamadı");
    const newUsd = Number(upd[0].bakiye_usd);
    const newBalance = Number(upd[0].bakiye_tl);
    await txSql`
      INSERT INTO transactions (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key,
        miktar_usd, kur_at_transaction, onceki_bakiye_usd, sonraki_bakiye_usd)
      VALUES (${userId}::uuid, ${upd[0].email}, 'iade', ${amount}::numeric,
              ${(newBalance - amount).toFixed(4)}::numeric, ${newBalance.toFixed(4)}::numeric, ${aciklama}, 'bakiye', ${idemKey},
              ${usdStr}::numeric, ${kur}::numeric, ${(newUsd - usd).toFixed(6)}::numeric, ${newUsd.toFixed(6)}::numeric)`;
    return { refundedTL: amount, newBalanceTL: newBalance };
  }
  const upd = await txSql<{ bakiye_tl: string; email: string }[]>`
    UPDATE users SET bakiye_tl = bakiye_tl + ${amount}::numeric, updated_at = now()
    WHERE id = ${userId}::uuid RETURNING bakiye_tl, email`;
  if (!upd.length) throw new AppError(404, "Kullanıcı bulunamadı");
  const newBalance = Number(upd[0].bakiye_tl);
  await txSql`
    INSERT INTO transactions (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
    VALUES (${userId}::uuid, ${upd[0].email}, 'iade', ${amount}::numeric,
            ${(newBalance - amount).toFixed(4)}::numeric, ${newBalance.toFixed(4)}::numeric, ${aciklama}, 'bakiye', ${idemKey})`;
  return { refundedTL: amount, newBalanceTL: newBalance };
}

/** Entitlement'ın satın-alma tutarını (tam-iade için) çöz. */
async function resolveFullAmount(txSql: any, entId: string): Promise<{ userId: string; amount: number; status: string }> {
  const rows = await txSql<any[]>`
    SELECT e.user_id, e.status, t.miktar_tl
    FROM user_package_entitlements e LEFT JOIN transactions t ON t.id = e.purchase_transaction_id
    WHERE e.id = ${entId}::uuid LIMIT 1 FOR UPDATE OF e`;
  if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
  return { userId: rows[0].user_id, amount: Math.abs(Number(rows[0].miktar_tl) || 0), status: rows[0].status };
}

/**
 * İptal (+iade seçimi): status=cancelled + opsiyonel iade. İdempotent (admin_cancel_<entId>).
 * NOT (bilinçli davranış): aynı entitlement ikinci kez iptal edilirse iade TEKRARLANMAZ —
 * `doRefund` aynı idempotency anahtarını görüp `refundedTL:0` döner (çift-iade koruması). Bu yüzden
 * "zaten iptal" durumu 409 değil, 200 + `refundedTL:0`'dır (ağ retry'ı güvenli kalsın); UI detayı
 * yeniden yükleyip 'İPTAL' durumunu zaten gösterir.
 */
export async function adminCancelEntitlement(entId: string, refund: RefundMode, amountTL: number | undefined, _adminId: string, note: string): Promise<AdminMoneyResult> {
  if (!note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  return await dbSql.begin(async (txSql) => {
    const { userId, amount: fullAmount } = await resolveFullAmount(txSql, entId);
    await txSql`UPDATE user_package_entitlements SET status = 'cancelled', expires_at = now(), updated_at = now() WHERE id = ${entId}::uuid AND status <> 'cancelled'`;
    let toRefund = 0;
    if (refund === "full") toRefund = fullAmount;
    else if (refund === "partial") { toRefund = Number(amountTL); if (!(toRefund > 0)) throw new AppError(400, "Kısmi iade tutarı > 0 olmalı"); }
    return await doRefund(txSql, userId, toRefund, "admin_cancel_" + entId, "Paket iptal iadesi — " + note);
  });
}

/**
 * Standalone iade: paket AKTİF kalır, sadece para iade. Günde 1 (admin_refund_<entId>_<gün>).
 * NOT (bilinçli davranış): gün-bazlı idempotency anahtarı çift-iadeyi engeller — aynı gün ikinci çağrı
 * (tutar farklı olsa bile) sessizce `refundedTL:0` döner. Aynı gün ikinci, farklı tutarlı iade gerekirse
 * 'partial' yerine ayrı bir bakiye-ayarı (admin bakiye uçları) kullanılmalı.
 */
export async function adminRefundEntitlement(entId: string, refund: Exclude<RefundMode, "none">, amountTL: number | undefined, _adminId: string, note: string): Promise<AdminMoneyResult> {
  if (!note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  return await dbSql.begin(async (txSql) => {
    const { userId, amount: fullAmount } = await resolveFullAmount(txSql, entId);
    const toRefund = refund === "full" ? fullAmount : Number(amountTL);
    if (!(toRefund > 0)) throw new AppError(400, "İade tutarı > 0 olmalı");
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return await doRefund(txSql, userId, toRefund, "admin_refund_" + entId + "_" + day, "Paket iadesi — " + note);
  });
}

/** Hard delete (yanlış/test kaydı). Geçmiş kalmaz; transactions (FK soft) korunur. */
export async function adminDeleteEntitlement(entId: string, _adminId: string): Promise<{ ok: true }> {
  const rows = await dbSql<{ id: string }[]>`DELETE FROM user_package_entitlements WHERE id = ${entId}::uuid RETURNING id`;
  if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
  return { ok: true };
}

// ── Task 5: adminRenewEntitlement ────────────────────────────────────────────

/** Admin yenileme: entitlement'ın paketinden YENİ satır (snapshot limit/süre korunur). gift = ücretsiz. */
export async function adminRenewEntitlement(entId: string, charge: "gift" | "balance", chargeTL: number | undefined, adminId: string, note: string): Promise<AdminGrantResult> {
  if (!note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  const rows = await dbSql<any[]>`
    SELECT e.user_id, e.package_id, e.daily_limit_snapshot, e.activated_at, e.expires_at
    FROM user_package_entitlements e WHERE e.id = ${entId}::uuid LIMIT 1`;
  if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
  const e = rows[0];
  const ms = new Date(e.expires_at).getTime() - new Date(e.activated_at).getTime();
  const days = Math.max(1, Math.round(ms / 86_400_000));
  return adminGrantEntitlement({
    userId: e.user_id, packageId: e.package_id, dailyLimit: Number(e.daily_limit_snapshot), durationDays: days,
    charge, chargeTL, adminId, note: "Yenileme: " + note,
  });
}
