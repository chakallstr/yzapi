import { randomUUID } from "node:crypto";
import { dbSql } from "../db/client.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { InsufficientBalanceError, AppError } from "../lib/errors.js";
import { grantPackageEntitlement } from "./entitlement-service.js";

/** Configurable paket için anlık fiyat hesabı (TL + USD). */
export async function previewConfigurablePrice(
  packageId: string,
  customLimit: number,
  customDays: number,
): Promise<{ fiyatTL: number; fiyatUsd: number; birimFiyatUsd: number }> {
  const [pkgRows, cfgRows] = await Promise.all([
    dbSql<any[]>`
      SELECT is_configurable, min_gunluk_istek, max_gunluk_istek,
             min_sure_gun, max_sure_gun, birim_fiyat_usd_per_50, enabled
      FROM packages WHERE id = ${packageId} LIMIT 1
    `,
    dbSql<{ live_kur: string; kur_buffer: string }[]>`
      SELECT live_kur, kur_buffer FROM system_config WHERE id = 1 LIMIT 1
    `,
  ]);
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];
  if (!pkg.enabled) throw new AppError(400, "Paket satışta değil");
  if (!pkg.is_configurable) throw new AppError(400, "Bu paket özelleştirilebilir değil");

  const minLimit = Number(pkg.min_gunluk_istek ?? 50);
  const maxLimit = Number(pkg.max_gunluk_istek ?? 5000);
  const minDays = Number(pkg.min_sure_gun ?? 1);
  const maxDays = Number(pkg.max_sure_gun ?? 30);
  const birim = Number(pkg.birim_fiyat_usd_per_50 ?? 0.90);

  if (customLimit < minLimit || customLimit > maxLimit)
    throw new AppError(400, `Limit ${minLimit}–${maxLimit} arasında olmalı`);
  if (customDays < minDays || customDays > maxDays)
    throw new AppError(400, `Süre ${minDays}–${maxDays} gün arasında olmalı`);

  const liveKur = Number(cfgRows[0]?.live_kur ?? 0);
  const kurBuffer = Number(cfgRows[0]?.kur_buffer ?? 0.03);
  const sellKur = liveKur * (1 + kurBuffer);

  const fiyatUsd = Math.ceil(customLimit / 50) * birim * customDays;
  const fiyatTL = Math.round(fiyatUsd * sellKur * 100) / 100;
  return { fiyatTL, fiyatUsd: Math.round(fiyatUsd * 100) / 100, birimFiyatUsd: birim };
}

export interface PurchaseResult {
  entitlementId?: string;
  deliveryOrderId?: string;
  tip?: "request_limit" | "account_delivery";
  newBalanceTL: number;
  duplicate?: boolean;
  /** CodeFast paketinde tedarik durumu: provisioned (anında) | pending_manual (Claude elle teslim). */
  cfStatus?: "provisioned" | "pending_manual" | "failed";
}

async function loadPurchaseState(userId: string, txKey: string): Promise<PurchaseResult> {
  const balRows = await dbSql<{ bakiye_tl: string }[]>`
    SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid LIMIT 1
  `;
  const txRows = await dbSql<{ id: string }[]>`
    SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1
  `;
  let entitlementId = "";
  let cfStatus: PurchaseResult["cfStatus"] | undefined;
  if (txRows.length) {
    const entRows = await dbSql<{ id: string; cf_status: string | null }[]>`
      SELECT id, cf_status FROM user_package_entitlements WHERE purchase_transaction_id = ${txRows[0].id}::uuid LIMIT 1
    `;
    entitlementId = entRows[0]?.id ?? "";
    cfStatus = (entRows[0]?.cf_status as PurchaseResult["cfStatus"]) ?? undefined;
  }
  return { entitlementId, newBalanceTL: Number(balRows[0]?.bakiye_tl ?? 0), duplicate: true, cfStatus };
}

/**
 * Bakiye ile paket satın alma (request-limit). Atomik + IDEMPOTENT ledger debit.
 * billing-service'e DOKUNMAZ; ayrı money path. Mevcut creditUserBalance deseninin debit ikizi.
 * idempotencyKey aynı satın alma için sabit verilirse (client) çift tahsil önlenir
 * (transactions.idempotency_key UNIQUE + ön-kontrol + concurrent 23505 yakalama).
 */
export async function purchasePackageWithBalance(
  userId: string,
  packageId: string,
  idempotencyKey?: string,
  contact?: string,
  customLimit?: number,
  customDays?: number,
): Promise<PurchaseResult> {
  const txKey = "pkg_purchase_" + userId + "_" + (idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : randomUUID());

  // Ön-kontrol: bu key ile zaten satın alınmışsa tekrar TAHSİL ETME (idempotent).
  const dup = await dbSql<{ id: string }[]>`
    SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1
  `;
  if (dup.length) {
    return await loadPurchaseState(userId, txKey);
  }

  const pkgRows = await dbSql<any[]>`
    SELECT id, ad, fiyat_tl, sure_gun, gunluk_istek_limiti, allowed_models, enabled, satista, tip,
           is_configurable, min_gunluk_istek, max_gunluk_istek, min_sure_gun, max_sure_gun,
           birim_fiyat_usd_per_50,
           cf_catalog_id, cf_api_slug, cf_manual, cf_token_millions
    FROM packages WHERE id = ${packageId} LIMIT 1
  `;
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];
  if (!pkg.enabled) throw new AppError(400, "Paket satışta değil");
  // satista=false → vitrinde ama satın alma henüz kapalı ("en kısa sürede satışta")
  if (pkg.satista === false) throw new AppError(400, "Paket henüz satışta değil — en kısa sürede satışa açılacak");
  if (pkg.tip !== "request_limit" && pkg.tip !== "account_delivery") {
    throw new AppError(400, "Bu paket tipi henüz desteklenmiyor");
  }
  if (Number(pkg.fiyat_tl) < 0) {
    throw new AppError(400, "Negatif fiyatlı paket satın alınamaz");
  }

  // Configurable paket: limit + süre body'den gelir, fiyat sunucuda hesaplanır.
  let fiyatTL: number;
  let effectiveLimit: number;
  let effectiveDays: number;
  if (pkg.is_configurable) {
    if (!customLimit || !customDays) throw new AppError(400, "Configurable paket için limit ve süre gerekli");
    const preview = await previewConfigurablePrice(packageId, customLimit, customDays);
    fiyatTL = preview.fiyatTL;
    effectiveLimit = customLimit;
    effectiveDays = customDays;
  } else {
    fiyatTL = Number(pkg.fiyat_tl);
    effectiveLimit = Number(pkg.gunluk_istek_limiti);
    effectiveDays = Number(pkg.sure_gun);
  }

  // CodeFast paket: satıştan ÖNCE quote ön-kontrolü (orderlanabilir mi?). Bakiye DÜŞMEZ.
  // Ürün CF tarafında satılamaz durumdaysa müşteriyi hiç tahsil etmeden 503 ile durdur.
  // Yalnız request_limit: account_delivery'de CF provisioning yok (yanlış cf_catalog_id'yi savun).
  if (env.CODEFAST_RESELLER_ENABLED && pkg.cf_catalog_id && pkg.tip === "request_limit") {
    const { cfQuote } = await import("./codefast-reseller-service.js");
    try {
      await cfQuote([
        pkg.cf_token_millions
          ? { catalog_id: pkg.cf_catalog_id, claude_token_millions: Number(pkg.cf_token_millions) }
          : { catalog_id: pkg.cf_catalog_id, limit_amount: effectiveLimit, duration_days: effectiveDays },
      ]);
    } catch {
      throw new AppError(503, "Bu paket şu anda tedarik edilemiyor; lütfen daha sonra tekrar deneyin.");
    }
  }

  let result: PurchaseResult;
  try {
    result = await dbSql.begin(async (txSql) => {
      const updated = await txSql<{ bakiye_tl: string; email: string }[]>`
        UPDATE users
        SET bakiye_tl = bakiye_tl - ${fiyatTL}::numeric, son_aktivite = now()
        WHERE id = ${userId}::uuid AND bakiye_tl >= ${fiyatTL}::numeric
        RETURNING bakiye_tl, email
      `;
      if (!updated.length) throw new InsufficientBalanceError("Paket için yeterli bakiye yok");
      const newBalance = Number(updated[0].bakiye_tl);
      const prevBalance = newBalance + fiyatTL;

      // idempotency_key UNIQUE: eşzamanlı mükerrer istek burada 23505 fırlatır → tx rollback
      // (debit geri alınır), kaybeden istek aşağıdaki catch'te idempotent duruma döner.
      const txRows = await txSql<{ id: string }[]>`
        INSERT INTO transactions
          (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
        VALUES
          (${userId}::uuid, ${updated[0].email}, 'paket_satin_alma', ${-fiyatTL}::numeric,
           ${prevBalance}::numeric, ${newBalance}::numeric, ${"Paket: " + pkg.ad}, 'bakiye',
           ${txKey})
        RETURNING id
      `;
      const txId = txRows[0].id;

      if (pkg.tip === "account_delivery") {
        const ord = await txSql<{ id: string }[]>`
          INSERT INTO account_delivery_orders
            (user_id, package_id, amount_tl, contact, durum, purchase_transaction_id)
          VALUES
            (${userId}::uuid, ${packageId}, ${fiyatTL}::numeric, ${contact ?? ""}, 'bekliyor', ${txId}::uuid)
          RETURNING id
        `;
        return { deliveryOrderId: ord[0].id, newBalanceTL: newBalance, tip: "account_delivery" as const };
      }

      const entitlementId = await grantPackageEntitlement(txSql, {
        userId,
        packageId,
        sureGun: effectiveDays,
        gunlukIstekLimiti: effectiveLimit,
        allowedModels: pkg.allowed_models ?? [],
        purchaseTransactionId: txId,
      });
      return { entitlementId, newBalanceTL: newBalance, tip: "request_limit" as const };
    });
  } catch (e) {
    // Eşzamanlı mükerrer (UNIQUE idempotency_key) → çift tahsil olmadı; mevcut durumu döndür.
    if ((e as { code?: string })?.code === "23505") {
      return await loadPurchaseState(userId, txKey);
    }
    throw e;
  }

  // CodeFast provisioning — para tx COMMIT olduktan SONRA (network side-effect tx dışında).
  // pending_manual (Claude elle teslim) bir HATA değildir; yalnız 'failed'te iade edilir.
  if (env.CODEFAST_RESELLER_ENABLED && pkg.cf_catalog_id && result.tip === "request_limit" && result.entitlementId) {
    const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
    const prov = await provisionCodefastEntitlement({
      entitlementId: result.entitlementId,
      userId,
      externalOrderId: txKey,
      pkg: {
        cfCatalogId: pkg.cf_catalog_id,
        cfApiSlug: pkg.cf_api_slug,
        cfManual: pkg.cf_manual === true,
        gunlukIstekLimiti: effectiveLimit,
        sureGun: effectiveDays,
        cfTokenMillions: pkg.cf_token_millions ? Number(pkg.cf_token_millions) : null,
      },
      username: userId,
    });
    if (prov.cfStatus === "failed") {
      await refundFailedCodefastPurchase(userId, result.entitlementId, fiyatTL, txKey, pkg.ad);
      throw new AppError(503, "Paket tedarik edilemedi; ücret bakiyenize iade edildi. Lütfen tekrar deneyin.");
    }
    result.cfStatus = prov.cfStatus; // 'provisioned' | 'pending_manual'
  }
  return result;
}

/**
 * CodeFast tedariki başarısız olduğunda satın almayı geri al: entitlement revoke +
 * paket ücretini bakiyeye OTOMATİK iade (idempotent) + (varsa) CF order revoke.
 * Para güvenliği: müşteri ödedi ama hizmet yok → asla boşta para kalmaz.
 */
async function refundFailedCodefastPurchase(
  userId: string,
  entitlementId: string,
  fiyatTL: number,
  txKey: string,
  paketAd: string,
): Promise<void> {
  // ⚠️ ASLA throw ETMEZ — çağıran her durumda 503 "iade edildi" mesajını atabilsin.
  // Her adım BAĞIMSIZ guard'lı: bir adımın hatası diğerlerini engellemez. Sıralama PARAYA
  // göre: önce ücret iadesi (en kritik), sonra entitlement revoke, sonra CF order revoke.

  // 1) ÜCRET İADESİ (idempotent: cf_refund_<txKey> UNIQUE) — ÖNCE.
  const refundKey = "cf_refund_" + txKey;
  try {
    const dup = await dbSql<{ id: string }[]>`SELECT id FROM transactions WHERE idempotency_key = ${refundKey} LIMIT 1`;
    if (!dup.length) {
      await dbSql.begin(async (txSql) => {
        const u = await txSql<{ bakiye_tl: string; email: string }[]>`
          UPDATE users SET bakiye_tl = bakiye_tl + ${fiyatTL}::numeric, son_aktivite = now()
          WHERE id = ${userId}::uuid
          RETURNING bakiye_tl, email
        `;
        if (!u.length) return;
        const sonrasi = Number(u[0].bakiye_tl);
        const oncesi = Math.round((sonrasi - fiyatTL) * 10000) / 10000; // numeric(14,4) parite
        await txSql`
          INSERT INTO transactions
            (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
          VALUES
            (${userId}::uuid, ${u[0].email}, 'iade', ${fiyatTL}::numeric,
             ${oncesi}::numeric, ${sonrasi}::numeric, ${"İade: " + paketAd + " (tedarik başarısız)"}, 'bakiye', ${refundKey})
        `;
      });
    }
  } catch (e) {
    if ((e as { code?: string })?.code !== "23505") {
      // İade BAŞARISIZ — para kritik: alarm bırak (Gözcü/ops görsün), ama akışı bloklama.
      logger.error({ err: e, userId, entitlementId, refundKey }, "codefast refund FAILED — müşteri parası iade edilemedi");
    }
  }
  // 2) entitlement revoke (idempotent: yalnız aktifse)
  try {
    await dbSql`
      UPDATE user_package_entitlements SET status = 'revoked', updated_at = now()
      WHERE id = ${entitlementId}::uuid AND status = 'active'
    `;
  } catch (e) {
    logger.error({ err: e, entitlementId }, "codefast refund — entitlement revoke failed");
  }
  // 3) CF order revoke (varsa) — best-effort, akışı bloklamaz
  try {
    const ent = await dbSql<{ cf_order_id: string | null }[]>`SELECT cf_order_id FROM user_package_entitlements WHERE id = ${entitlementId}::uuid LIMIT 1`;
    const oid = ent[0]?.cf_order_id;
    if (oid) {
      const { cfRevokeOrder } = await import("./codefast-reseller-service.js");
      await cfRevokeOrder(oid).catch(() => {});
    }
  } catch { /* yut */ }
}
