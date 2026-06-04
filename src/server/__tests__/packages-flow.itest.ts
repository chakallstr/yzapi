import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const UID = "22222222-2222-2222-2222-222222222222";
const PKG = "test-codex-itest";

async function balance(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}

beforeAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
  await db.insert(users).values({
    id: UID,
    email: "pkg-itest@test.local",
    adSoyad: "Pkg Itest",
    bakiyeTL: "100.0000",
    durum: "aktif",
  } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled)
    VALUES (${PKG}, 'Test Codex', 'GPT/Codex', '', 'request_limit', 2, 1, ${JSON.stringify(["gpt-5.5"])}::jsonb, 40, true)
  `;
});

afterAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
});

describe("package purchase + quota (real PG)", () => {
  it("purchase debits balance atomically and creates entitlement", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const res = await purchasePackageWithBalance(UID, PKG, "itest-buy-1");
    expect(res.newBalanceTL).toBe(60);
    expect(await balance()).toBe(60);
    const ent = await dbSql`SELECT * FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
    expect(ent.length).toBe(1);
  });

  it("purchase is idempotent for the same key (no double debit)", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const res = await purchasePackageWithBalance(UID, PKG, "itest-buy-1"); // same key
    expect(res.duplicate).toBe(true);
    expect(await balance()).toBe(60); // unchanged — not debited again
  });

  it("reserves quota up to daily limit then stops covering", async () => {
    const { tryReservePackageSlot, checkPackageCoverage } = await import("../services/entitlement-service.js");
    expect(await checkPackageCoverage(UID, "gpt-5.5")).toBe(true);
    expect((await tryReservePackageSlot(UID, "gpt-5.5")).covered).toBe(true);
    expect((await tryReservePackageSlot(UID, "gpt-5.5")).covered).toBe(true);
    // limit = 2 → 3rd is not covered
    expect((await tryReservePackageSlot(UID, "gpt-5.5")).covered).toBe(false);
    expect(await checkPackageCoverage(UID, "gpt-5.5")).toBe(false);
  });

  it("does not cover a model outside allowed_models", async () => {
    const { checkPackageCoverage } = await import("../services/entitlement-service.js");
    expect(await checkPackageCoverage(UID, "claude-opus-4.8")).toBe(false);
  });

  it("insufficient balance rejects a fresh purchase", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    await dbSql`UPDATE users SET bakiye_tl = 0 WHERE id = ${UID}::uuid`;
    await expect(purchasePackageWithBalance(UID, PKG, "itest-buy-2")).rejects.toThrow();
    expect(await balance()).toBe(0);
  });
});
