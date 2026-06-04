import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const UID = "66666666-6666-6666-6666-666666666666";
const PKG = "test-delivery-pkg";
let order1 = "";
let order2 = "";

async function bal(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}
async function cleanup() {
  await dbSql`DELETE FROM account_delivery_orders WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({ id: UID, email: "del@test.local", adSoyad: "Del", bakiyeTL: "100.0000", durum: "aktif" } as never);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled)
    VALUES (${PKG}, 'Cursor Pro Test', 'Hesaplar', 'account_delivery', 0, 30, '[]'::jsonb, 40, true)
  `;
});

afterAll(cleanup);

describe("account-delivery flow (real PG)", () => {
  it("purchase debits balance and creates a pending order", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const r = await purchasePackageWithBalance(UID, PKG, "del-key-1", "user@gmail.com");
    expect(r.tip).toBe("account_delivery");
    expect(r.deliveryOrderId).toBeTruthy();
    order1 = r.deliveryOrderId!;
    expect(await bal()).toBe(60);
    const o = await dbSql<any[]>`SELECT durum, contact FROM account_delivery_orders WHERE id = ${order1}::uuid`;
    expect(o[0].durum).toBe("bekliyor");
    expect(o[0].contact).toBe("user@gmail.com");
  });

  it("admin marks the order delivered (payload stored)", async () => {
    const { markDeliveryDelivered } = await import("../services/account-delivery-service.js");
    await markDeliveryDelivered(order1, "admin-1", "ACTIVATION-CODE-123", "ok");
    const o = await dbSql<any[]>`SELECT durum, teslim_payload FROM account_delivery_orders WHERE id = ${order1}::uuid`;
    expect(o[0].durum).toBe("teslim_edildi");
    expect(o[0].teslim_payload).toBe("ACTIVATION-CODE-123");
  });

  it("cancel refunds balance and is single-use", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const { cancelDeliveryWithRefund } = await import("../services/account-delivery-service.js");
    const r = await purchasePackageWithBalance(UID, PKG, "del-key-2", "x@gmail.com"); // 60 → 20
    order2 = r.deliveryOrderId!;
    expect(await bal()).toBe(20);

    const res = await cancelDeliveryWithRefund(order2, "admin-1", "iptal");
    expect(res.refundedTL).toBe(40);
    expect(await bal()).toBe(60); // refunded

    await expect(cancelDeliveryWithRefund(order2, "admin-1", "tekrar")).rejects.toThrow(); // 409 — single use
    expect(await bal()).toBe(60); // not double-refunded
  });

  it("a delivered order cannot be cancelled/refunded", async () => {
    const { cancelDeliveryWithRefund } = await import("../services/account-delivery-service.js");
    await expect(cancelDeliveryWithRefund(order1, "admin-1", "x")).rejects.toThrow();
    expect(await bal()).toBe(60);
  });
});
