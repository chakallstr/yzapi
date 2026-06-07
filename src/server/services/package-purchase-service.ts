import { randomUUID } from "node:crypto";
import { dbSql } from "../db/client.js";
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
}

async function loadPurchaseState(userId: string, txKey: string): Promise<PurchaseResult> {
  const balRows = await dbSql<{ bakiye_tl: string }[]>`
    SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid LIMIT 1
  `;
  const txRows = await dbSql<{ id: string }[]>`
    SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1
  `;
  let entitlementId = "";
  if (txRows.length) {
    const entRows = await dbSql<{ id: string }[]>`
      SELECT id FROM user_package_entitlements WHERE purchase_transaction_id = ${txRows[0].id}::uuid LIMIT 1
    `;
    entitlementId = entRows[0]?.id ?? "";
  }
  return { entitlementId, newBalanceTL: Number(balRows[0]?.bakiye_tl ?? 0), duplicate: true };
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
    SELECT id, ad, fiyat_tl, sure_gun, gunluk_istek_limiti, allowed_models, enabled, tip,
           is_configurable, min_gunluk_istek, max_gunluk_istek, min_sure_gun, max_sure_gun,
           birim_fiyat_usd_per_50
    FROM packages WHERE id = ${packageId} LIMIT 1
  `;
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];
  if (!pkg.enabled) throw new AppError(400, "Paket satışta değil");
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

  try {
    return await dbSql.begin(async (txSql) => {
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
}
