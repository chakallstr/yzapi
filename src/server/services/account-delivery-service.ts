import { dbSql } from "../db/client.js";
import { AppError } from "../lib/errors.js";

export async function listUserDeliveryOrders(userId: string) {
  const rows = await dbSql<any[]>`
    SELECT o.id, o.package_id, p.ad AS paket_adi, o.amount_tl, o.durum, o.contact,
           o.olusturma, o.teslim, o.teslim_payload, o.not
    FROM account_delivery_orders o
    LEFT JOIN packages p ON p.id = o.package_id
    WHERE o.user_id = ${userId}::uuid
    ORDER BY o.olusturma DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    packageId: r.package_id,
    paketAdi: r.paket_adi,
    amountTL: Number(r.amount_tl),
    durum: r.durum,
    contact: r.contact,
    olusturma: r.olusturma,
    teslim: r.teslim,
    // teslim_payload (kimlik/aktivasyon) yalnız teslim edildiyse kullanıcıya gösterilir.
    teslimPayload: r.durum === "teslim_edildi" ? r.teslim_payload : null,
    not: r.not,
  }));
}

export async function listAllDeliveryOrders() {
  const rows = await dbSql<any[]>`
    SELECT o.id, o.user_id, u.email AS user_email, o.package_id, p.ad AS paket_adi,
           o.amount_tl, o.durum, o.contact, o.olusturma, o.teslim, o.onaylayan, o.not
    FROM account_delivery_orders o
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN packages p ON p.id = o.package_id
    ORDER BY o.olusturma DESC
    LIMIT 500
  `;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    packageId: r.package_id,
    paketAdi: r.paket_adi,
    amountTL: Number(r.amount_tl),
    durum: r.durum,
    contact: r.contact,
    olusturma: r.olusturma,
    teslim: r.teslim,
    onaylayan: r.onaylayan,
    not: r.not,
  }));
}

/** Admin: siparişi teslim edildi olarak işaretle (kimlik/kod payload + not). */
export async function markDeliveryDelivered(id: string, adminId: string, teslimPayload: string, note?: string): Promise<void> {
  const rows = await dbSql<{ durum: string }[]>`SELECT durum FROM account_delivery_orders WHERE id = ${id}::uuid LIMIT 1`;
  if (!rows.length) throw new AppError(404, "Sipariş bulunamadı");
  if (rows[0].durum !== "bekliyor") throw new AppError(409, `Sipariş zaten ${rows[0].durum} durumunda.`);
  await dbSql`
    UPDATE account_delivery_orders
    SET durum = 'teslim_edildi', teslim_payload = ${teslimPayload ?? ""}, teslim = now(),
        onaylayan = ${adminId}, not = ${note ?? null}
    WHERE id = ${id}::uuid AND durum = 'bekliyor'
  `;
}

/** Admin: siparişi iptal et + ödenen tutarı bakiyeye İADE et (atomik, tek seferlik). */
export async function cancelDeliveryWithRefund(id: string, adminId: string, note?: string): Promise<{ refundedTL: number; newBalanceTL: number }> {
  return await dbSql.begin(async (txSql) => {
    const rows = await txSql<any[]>`
      SELECT user_id, amount_tl, durum FROM account_delivery_orders WHERE id = ${id}::uuid LIMIT 1 FOR UPDATE
    `;
    if (!rows.length) throw new AppError(404, "Sipariş bulunamadı");
    const o = rows[0];
    if (o.durum !== "bekliyor") throw new AppError(409, `Sipariş zaten ${o.durum} durumunda.`);
    const amountTL = Number(o.amount_tl);

    const upd = await txSql<{ bakiye_tl: string; email: string }[]>`
      UPDATE users SET bakiye_tl = bakiye_tl + ${amountTL}::numeric, updated_at = now()
      WHERE id = ${o.user_id}::uuid RETURNING bakiye_tl, email
    `;
    if (!upd.length) throw new AppError(404, "Kullanıcı bulunamadı");
    const newBalance = Number(upd[0].bakiye_tl);

    await txSql`
      INSERT INTO transactions
        (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
      VALUES
        (${o.user_id}::uuid, ${upd[0].email}, 'iade', ${amountTL}::numeric,
         ${(newBalance - amountTL).toFixed(4)}::numeric, ${newBalance.toFixed(4)}::numeric,
         ${"Hesap-teslim iptal iadesi"}, 'bakiye', ${"delivery_refund_" + id})
    `;
    await txSql`
      UPDATE account_delivery_orders SET durum = 'iptal', onaylayan = ${adminId}, teslim = now(), not = ${note ?? null}
      WHERE id = ${id}::uuid AND durum = 'bekliyor'
    `;
    return { refundedTL: amountTL, newBalanceTL: newBalance };
  });
}
