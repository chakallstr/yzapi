/**
 * Redeem-only (kategori='Deneme') trial paketi INTEGRATION testi (real Postgres).
 * Doğrular: Deneme paketi public grid'de GÖRÜNMEZ, doğrudan satın alınamaz (yalnız kod),
 * ama generateRedeemCodes + redeemCode ile key üzerinden hak verilir (bedava, bakiye değişmez).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbSql, db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { listPublicPackages } from "../services/package-service.js";
import { purchasePackageWithBalance } from "../services/package-purchase-service.js";
import { generateRedeemCodes, redeemCode } from "../services/redeem-code-service.js";

const UID = "d3000044-0000-0000-0000-00000000dede";
const PKG = "test-deneme-redeem-itest";

async function balance(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}
async function cleanup() {
  await dbSql`DELETE FROM redeem_code_uses WHERE code_id IN (SELECT id FROM redeem_codes WHERE package_id = ${PKG})`;
  await dbSql`DELETE FROM redeem_codes WHERE package_id = ${PKG}`;
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({ id: UID, email: "deneme-itest@test.local", adSoyad: "Deneme Itest", bakiyeTL: "1000.0000", durum: "aktif" } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista)
    VALUES (${PKG}, 'Test Key — Codex 50', 'Deneme', 'test', 'request_limit', 50, 1, ${JSON.stringify(["gpt-5.5"])}::jsonb, 0, true, true)
  `;
});
afterAll(cleanup);

describe("redeem-only (Deneme) trial", () => {
  it("public grid'de GÖRÜNMEZ", async () => {
    const list = await listPublicPackages();
    expect(list.find((p: any) => p.id === PKG)).toBeUndefined();
  });

  it("doğrudan satın alınamaz (Deneme guard), bakiye değişmez", async () => {
    const before = await balance();
    await expect(purchasePackageWithBalance(UID, PKG, "deneme-buy-try")).rejects.toThrow(/yalnızca kod/i);
    expect(await balance()).toBe(before);
  });

  it("key üret + redeem et → hak verilir, bedava (bakiye değişmez)", async () => {
    const before = await balance();
    const { codes } = await generateRedeemCodes({ tip: "package", packageId: PKG, count: 2, prefix: "TEST", maxUses: 1, perUserOnce: true });
    expect(codes).toHaveLength(2);
    expect(codes[0]).toMatch(/^TEST-[A-Z0-9]{10}$/);
    const res = await redeemCode(UID, codes[0]);
    expect(res.tip).toBe("package");
    expect((res as any).entitlementId).toBeTruthy();
    expect(await balance()).toBe(before); // bedava — para hareketi yok
  });
});
