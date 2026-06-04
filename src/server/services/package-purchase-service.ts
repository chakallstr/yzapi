import { randomUUID } from "node:crypto";
import { dbSql } from "../db/client.js";
import { InsufficientBalanceError, AppError } from "../lib/errors.js";

export interface PurchaseResult {
  entitlementId: string;
  newBalanceTL: number;
}

/**
 * Bakiye ile paket satın alma (request-limit). Atomik + idempotent ledger debit.
 * billing-service'e DOKUNMAZ; ayrı money path. Mevcut creditUserBalance deseninin debit ikizi.
 */
export async function purchasePackageWithBalance(
  userId: string,
  packageId: string,
): Promise<PurchaseResult> {
  const pkgRows = await dbSql<any[]>`
    SELECT id, ad, fiyat_tl, sure_gun, gunluk_istek_limiti, allowed_models, enabled, tip
    FROM packages WHERE id = ${packageId} LIMIT 1
  `;
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];
  if (!pkg.enabled) throw new AppError(400, "Paket satışta değil");
  if (pkg.tip !== "request_limit") throw new AppError(400, "Bu paket tipi henüz desteklenmiyor");

  const fiyatTL = Number(pkg.fiyat_tl);
  const allowedJson = JSON.stringify(pkg.allowed_models ?? []);

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

    const txRows = await txSql<{ id: string }[]>`
      INSERT INTO transactions
        (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
      VALUES
        (${userId}::uuid, ${updated[0].email}, 'paket_satin_alma', ${-fiyatTL}::numeric,
         ${prevBalance}::numeric, ${newBalance}::numeric, ${"Paket: " + pkg.ad}, 'bakiye',
         ${"pkg_purchase_" + randomUUID()})
      RETURNING id
    `;
    const txId = txRows[0].id;

    const existing = await txSql<{ id: string }[]>`
      SELECT id FROM user_package_entitlements
      WHERE user_id = ${userId}::uuid AND package_id = ${packageId}
        AND status = 'active' AND expires_at > now()
      ORDER BY expires_at DESC LIMIT 1
    `;

    let entitlementId: string;
    if (existing.length) {
      const ext = await txSql<{ id: string }[]>`
        UPDATE user_package_entitlements
        SET expires_at = expires_at + (${pkg.sure_gun}::int * interval '1 day'),
            daily_limit_snapshot = ${pkg.gunluk_istek_limiti}::int,
            allowed_models_snapshot = ${allowedJson}::jsonb,
            purchase_transaction_id = ${txId}::uuid,
            updated_at = now()
        WHERE id = ${existing[0].id}::uuid
        RETURNING id
      `;
      entitlementId = ext[0].id;
    } else {
      const ins = await txSql<{ id: string }[]>`
        INSERT INTO user_package_entitlements
          (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot,
           activated_at, expires_at, status, requests_today, last_reset_date, purchase_transaction_id)
        VALUES
          (${userId}::uuid, ${packageId}, ${pkg.gunluk_istek_limiti}::int, ${allowedJson}::jsonb,
           now(), now() + (${pkg.sure_gun}::int * interval '1 day'), 'active', 0, CURRENT_DATE, ${txId}::uuid)
        RETURNING id
      `;
      entitlementId = ins[0].id;
    }
    return { entitlementId, newBalanceTL: newBalance };
  });
}
