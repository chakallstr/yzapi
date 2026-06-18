/**
 * per_user_once (kişi başı 1 kez) INTEGRATION testi (real Postgres).
 * Ücretsiz + per_user_once paket: ilk alış başarılı (bedava), ikinci alış 400 ile engellenir.
 * Guard provisioning'den ÖNCE çalıştığı için CF gerekmez (cf_catalog_id yok → CF yolu atlanır).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbSql, db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { purchasePackageWithBalance } from "../services/package-purchase-service.js";

const UID = "b0000037-0000-0000-0000-0000000000a1";
const PKG = "test-puo-free-itest";

async function balance(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}
async function cleanup() {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({ id: UID, email: "puo-itest@test.local", adSoyad: "PUO Itest", bakiyeTL: "100.0000", durum: "aktif" } as any);
  // Ücretsiz + per_user_once; cf_catalog_id YOK → CF provisioning atlanır, entitlement doğrudan verilir.
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista, per_user_once)
    VALUES (${PKG}, 'Free PUO', 'NVIDIA', '', 'request_limit', 1000, 1, ${JSON.stringify(["gpt-5.5"])}::jsonb, 0, true, true, true)
  `;
});
afterAll(cleanup);

describe("per_user_once (kişi başı 1 kez)", () => {
  it("ilk alış başarılı + bedava (bakiye değişmez)", async () => {
    const before = await balance();
    const res = await purchasePackageWithBalance(UID, PKG, "puo-1");
    expect(res.entitlementId).toBeTruthy();
    expect(await balance()).toBe(before); // ücretsiz
  });

  it("ikinci alış 400 ile engellenir (zaten alınmış)", async () => {
    await expect(purchasePackageWithBalance(UID, PKG, "puo-2")).rejects.toThrow(/bir kez/i);
  });
});
