import { randomUUID } from "node:crypto";
import { dbSql } from "../db/client.js";
import { InsufficientBalanceError, AppError } from "../lib/errors.js";
import { grantPackageEntitlement } from "./entitlement-service.js";

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
): Promise<PurchaseResult> {
  const txKey = "pkg_purchase_" + (idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : randomUUID());

  // Ön-kontrol: bu key ile zaten satın alınmışsa tekrar TAHSİL ETME (idempotent).
  const dup = await dbSql<{ id: string }[]>`
    SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1
  `;
  if (dup.length) {
    return await loadPurchaseState(userId, txKey);
  }

  const pkgRows = await dbSql<any[]>`
    SELECT id, ad, fiyat_tl, sure_gun, gunluk_istek_limiti, allowed_models, enabled, tip
    FROM packages WHERE id = ${packageId} LIMIT 1
  `;
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];
  if (!pkg.enabled) throw new AppError(400, "Paket satışta değil");
  if (pkg.tip !== "request_limit" && pkg.tip !== "account_delivery") {
    throw new AppError(400, "Bu paket tipi henüz desteklenmiyor");
  }
  // ₺0 paketler (deneme/anahtar) DOĞRUDAN satın alınamaz — yalnız redeem kodu ile
  // verilir (grantPackageEntitlement). Bu, ücretsiz-açık-satış abuse'ünü engeller.
  if (Number(pkg.fiyat_tl) <= 0) {
    throw new AppError(400, "Bu paket yalnızca kod/anahtar ile verilir");
  }

  const fiyatTL = Number(pkg.fiyat_tl);

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
        sureGun: pkg.sure_gun,
        gunlukIstekLimiti: pkg.gunluk_istek_limiti,
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
