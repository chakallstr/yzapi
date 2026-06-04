import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const UA = "33333333-3333-3333-3333-333333333333";
const UB = "44444444-4444-4444-4444-444444444444";
const PKG = "test-redeem-pkg";

async function bal(uid: string): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, uid)).limit(1);
  return Number(r[0]?.b ?? 0);
}

async function cleanup() {
  for (const uid of [UA, UB]) {
    await dbSql`DELETE FROM redeem_code_uses WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM transactions WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${uid}::uuid`;
  }
  await dbSql`DELETE FROM redeem_codes WHERE code LIKE 'ITEST-%'`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({ id: UA, email: "ra@test.local", adSoyad: "RA", bakiyeTL: "0", durum: "aktif" } as any);
  await db.insert(users).values({ id: UB, email: "rb@test.local", adSoyad: "RB", bakiyeTL: "0", durum: "aktif" } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled)
    VALUES (${PKG}, 'Redeem Pkg', 'Test', 'request_limit', 100, 7, ${JSON.stringify(["gpt-5.5"])}::jsonb, 0, true)
  `;
  await dbSql`INSERT INTO redeem_codes (code, tip, amount_tl, max_uses) VALUES ('ITEST-BAL', 'balance', 50, 2)`;
  await dbSql`INSERT INTO redeem_codes (code, tip, amount_tl, max_uses) VALUES ('ITEST-ONE', 'balance', 30, 1)`;
  await dbSql`INSERT INTO redeem_codes (code, tip, package_id, max_uses) VALUES ('ITEST-PKG', 'package', ${PKG}, 5)`;
  await dbSql`INSERT INTO redeem_codes (code, tip, amount_tl, max_uses, enabled) VALUES ('ITEST-OFF', 'balance', 10, 5, false)`;
});

afterAll(cleanup);

describe("redeem flow (real PG)", () => {
  it("balance code credits balance", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    const r = await redeemCode(UA, "ITEST-BAL");
    expect(r).toMatchObject({ tip: "balance", amountTL: 50 });
    expect(await bal(UA)).toBe(50);
  });

  it("same user cannot redeem the same code twice (per-user-once)", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    await expect(redeemCode(UA, "ITEST-BAL")).rejects.toThrow("zaten kulland");
    expect(await bal(UA)).toBe(50); // not credited again
  });

  it("max_uses exhaustion blocks a second user", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    const r = await redeemCode(UA, "ITEST-ONE"); // UA uses the single-use code
    expect(r.amountTL).toBe(30);
    expect(await bal(UA)).toBe(80);
    await expect(redeemCode(UB, "ITEST-ONE")).rejects.toThrow("limiti dolmuş");
  });

  it("package code grants an entitlement", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    const r = await redeemCode(UB, "ITEST-PKG");
    expect(r.tip).toBe("package");
    expect(r.entitlementId).toBeTruthy();
    const ent = await dbSql`SELECT * FROM user_package_entitlements WHERE user_id = ${UB}::uuid`;
    expect(ent.length).toBe(1);
  });

  it("disabled code is rejected", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    await expect(redeemCode(UA, "ITEST-OFF")).rejects.toThrow("aktif değil");
  });

  it("unknown code is rejected", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    await expect(redeemCode(UA, "ITEST-NOPE")).rejects.toThrow("Geçersiz kod");
  });
});
