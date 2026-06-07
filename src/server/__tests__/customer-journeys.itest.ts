/**
 * Customer journey integration tests (real Postgres).
 *
 * Covers money-path gaps: redeem→purchase chains, boundary balance conditions,
 * HTTP error contracts, forbidden-model slot behaviour, expired/disabled redeem
 * codes, slot release on upstream 5xx, and delivery-order visibility rules.
 *
 * Run: npm run itest (needs db:up + db:migrate)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../services/auth-service.js";

// ── Shared test user IDs (all-hex UUIDs) ────────────────────────────────────
const UID_J2 = "00001001-0000-0000-0000-000000000001"; // J2-REDEEM-BALANCE-THEN-BUY-004
const UID_J3 = "00001002-0000-0000-0000-000000000002"; // J3-EXACT-BALANCE-006
const UID_J3B = "00001003-0000-0000-0000-000000000003"; // J3-SECOND-PURCHASE-402-CONTRACT-017
const UID_J2F = "00001004-0000-0000-0000-000000000004"; // J2-FORBIDDEN-MODEL-005
const UID_RD2 = "00001005-0000-0000-0000-000000000005"; // RD-002 expired code
const UID_RD6 = "00001006-0000-0000-0000-000000000006"; // RD-006 disabled package
const UID_B1 = "00001007-0000-0000-0000-000000000007";  // GAP-B1 slot release on 5xx
const UID_J5 = "00001008-0000-0000-0000-000000000008";  // J5-DELIVERY-USER-GET-009

// ── Package IDs ───────────────────────────────────────────────────────────────
const PKG_60TL = "cj-itest-pkg-60tl";     // request_limit, 60 TL, gpt-5.5 allowed
const PKG_GPT_ONLY = "cj-itest-pkg-gpt";  // request_limit, 0 TL, gpt-5.5 only (not Claude)
const PKG_DELIVERY = "cj-itest-delivery";  // account_delivery, 60 TL
const PKG_DISABLED = "cj-itest-disabled";  // for RD-006 disabled package

// ── API key for J5 HTTP supertest ────────────────────────────────────────────
const FULL_KEY_J5 = "yzk_live_cccccccccccccccccccccccc";

const app = createApp();

// ── Helpers ───────────────────────────────────────────────────────────────────
async function balance(uid: string): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, uid)).limit(1);
  return Number(r[0]?.b ?? 0);
}

function token(uid: string): string {
  return signAccessToken({ sub: uid, role: "user" });
}

async function insertUser(id: string, email: string, bakiyeTL: string) {
  await db.insert(users).values({
    id,
    email,
    adSoyad: "CJ Itest",
    bakiyeTL,
    durum: "aktif",
  } as never);
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  // Ensure system_config row with known kur exists
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE SET kur = 47, live_kur = 47, kur_buffer = 0.03
  `;

  // Tear down any leftover state from previous runs
  const allUids = [UID_J2, UID_J3, UID_J3B, UID_J2F, UID_RD2, UID_RD6, UID_B1, UID_J5];
  for (const uid of allUids) {
    await dbSql`DELETE FROM account_delivery_orders WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM redeem_code_uses WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM usage_records WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM transactions WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM api_keys WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${uid}::uuid`;
  }
  await dbSql`DELETE FROM redeem_codes WHERE code LIKE 'CJ-ITEST-%'`;
  await dbSql`DELETE FROM packages WHERE id IN (${PKG_60TL}, ${PKG_GPT_ONLY}, ${PKG_DELIVERY}, ${PKG_DISABLED})`;

  // Create packages
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled)
    VALUES
      (${PKG_60TL},    'Test 60TL Pkg',      'Test', '', 'request_limit',   10, 7, ${JSON.stringify(["gpt-5.5"])}::jsonb,         60, true),
      (${PKG_GPT_ONLY},'GPT-Only Pkg',       'Test', '', 'request_limit',   5,  7, ${JSON.stringify(["gpt-5.5"])}::jsonb,          0,  true),
      (${PKG_DELIVERY},'Delivery Pkg',       'Test', '', 'account_delivery', 0,  30, '[]'::jsonb,                                 60, true),
      (${PKG_DISABLED},'Disabled Pkg',       'Test', '', 'request_limit',    5,  7, ${JSON.stringify(["gpt-5.5"])}::jsonb,          0,  false)
  `;

  // Create users
  await insertUser(UID_J2,  "cj-j2@test.local",  "0");      // will be credited via code
  await insertUser(UID_J3,  "cj-j3@test.local",  "60.0000"); // balance == package price
  await insertUser(UID_J3B, "cj-j3b@test.local", "60.0000"); // for HTTP 402 contract
  await insertUser(UID_J2F, "cj-j2f@test.local", "0");       // balance=0, GPT-only pkg
  await insertUser(UID_RD2, "cj-rd2@test.local", "50.0000"); // for expired code
  await insertUser(UID_RD6, "cj-rd6@test.local", "50.0000"); // for disabled-package code
  await insertUser(UID_B1,  "cj-b1@test.local",  "100.0000"); // slot release on 5xx
  await insertUser(UID_J5,  "cj-j5@test.local",  "100.0000"); // delivery HTTP test

  // Redeem codes
  await dbSql`INSERT INTO redeem_codes (code, tip, amount_tl, max_uses) VALUES ('CJ-ITEST-BAL60', 'balance', 60, 1)`;
  // Expired code: expires_at = now() - 1 second
  await dbSql`INSERT INTO redeem_codes (code, tip, amount_tl, max_uses, expires_at) VALUES ('CJ-ITEST-EXPIRED', 'balance', 30, 5, now() - interval '1 second')`;
  // Package code pointing to disabled package
  await dbSql`INSERT INTO redeem_codes (code, tip, package_id, max_uses) VALUES ('CJ-ITEST-DISABLED-PKG', 'package', ${PKG_DISABLED}, 5)`;

  // API key for J5 (delivery HTTP test) — bcrypt hash
  const keyHash = await bcrypt.hash(FULL_KEY_J5, 10);
  await db.insert(apiKeys).values({
    userId: UID_J5,
    ad: "cj-j5-key",
    maskedKey: "yzk_live_••••",
    keyHash,
    prefix: FULL_KEY_J5.slice(0, 12),
    aktif: true,
  });

  // Dummy api key for B1 (needed as a valid FK for recordPackageUsage)
  await db.insert(apiKeys).values({
    userId: UID_B1,
    ad: "cj-b1-key",
    maskedKey: "yzk_live_••••",
    keyHash: "unused",
    prefix: "yzk_live_b1",
    aktif: true,
  });
});

afterAll(async () => {
  const allUids = [UID_J2, UID_J3, UID_J3B, UID_J2F, UID_RD2, UID_RD6, UID_B1, UID_J5];
  for (const uid of allUids) {
    await dbSql`DELETE FROM account_delivery_orders WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM redeem_code_uses WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM usage_records WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM transactions WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM api_keys WHERE user_id = ${uid}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${uid}::uuid`;
  }
  await dbSql`DELETE FROM redeem_codes WHERE code LIKE 'CJ-ITEST-%'`;
  await dbSql`DELETE FROM packages WHERE id IN (${PKG_60TL}, ${PKG_GPT_ONLY}, ${PKG_DELIVERY}, ${PKG_DISABLED})`;
  await dbSql.end();
});

// ── J2-REDEEM-BALANCE-THEN-BUY-004 ──────────────────────────────────────────
describe("J2-REDEEM-BALANCE-THEN-BUY-004: redeem 60TL code → purchase 60TL package → balance=0, ledger chain", () => {
  it("credits 60TL via balance code, then purchase debits exactly 60TL → balance=0 with full ledger chain", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");

    // Step 1: user starts at 0, redeems a 60TL balance code
    expect(await balance(UID_J2)).toBe(0);
    const redeemResult = await redeemCode(UID_J2, "CJ-ITEST-BAL60");
    expect(redeemResult.tip).toBe("balance");
    expect(redeemResult.amountTL).toBe(60);
    expect(redeemResult.newBalanceTL).toBe(60);
    expect(await balance(UID_J2)).toBe(60);

    // Step 2: purchase the 60TL package — should succeed and drain balance to 0
    const purchaseResult = await purchasePackageWithBalance(UID_J2, PKG_60TL, "cj-j2-buy-1");
    expect(purchaseResult.tip).toBe("request_limit");
    expect(purchaseResult.newBalanceTL).toBe(0);
    expect(purchaseResult.entitlementId).toBeTruthy();
    expect(await balance(UID_J2)).toBe(0);

    // Step 3: verify ledger chain — two transactions must exist in order
    const txRows = await dbSql<{ tip: string; miktar_tl: string; sonraki_bakiye: string }[]>`
      SELECT tip, miktar_tl, sonraki_bakiye FROM transactions
      WHERE user_id = ${UID_J2}::uuid
      ORDER BY timestamp ASC
    `;
    expect(txRows.length).toBe(2);
    // First: hediye_kod credit of +60
    expect(txRows[0].tip).toBe("hediye_kod");
    expect(Number(txRows[0].miktar_tl)).toBe(60);
    expect(Number(txRows[0].sonraki_bakiye)).toBe(60);
    // Second: paket_satin_alma debit of -60
    expect(txRows[1].tip).toBe("paket_satin_alma");
    expect(Number(txRows[1].miktar_tl)).toBe(-60);
    expect(Number(txRows[1].sonraki_bakiye)).toBe(0);

    // Step 4: entitlement exists in DB
    const ents = await dbSql`SELECT * FROM user_package_entitlements WHERE user_id = ${UID_J2}::uuid AND status = 'active'`;
    expect(ents.length).toBe(1);
  });
});

// ── J3-EXACT-BALANCE-006 ─────────────────────────────────────────────────────
describe("J3-EXACT-BALANCE-006: balance == price boundary → first succeeds, second fails", () => {
  it("first purchase succeeds (balance → 0), second purchase throws InsufficientBalanceError", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const { InsufficientBalanceError } = await import("../lib/errors.js");

    // Balance is exactly 60 TL, package costs 60 TL
    expect(await balance(UID_J3)).toBe(60);

    const result = await purchasePackageWithBalance(UID_J3, PKG_60TL, "cj-j3-exact-1");
    expect(result.newBalanceTL).toBe(0);
    expect(result.tip).toBe("request_limit");
    expect(await balance(UID_J3)).toBe(0);

    // Second purchase with no balance must reject
    await expect(
      purchasePackageWithBalance(UID_J3, PKG_60TL, "cj-j3-exact-2"),
    ).rejects.toThrow(InsufficientBalanceError);

    // Balance unchanged at 0
    expect(await balance(UID_J3)).toBe(0);
  });
});

// ── J3-SECOND-PURCHASE-402-CONTRACT-017 ─────────────────────────────────────
describe("J3-SECOND-PURCHASE-402-CONTRACT-017: InsufficientBalanceError → HTTP 402 body shape", () => {
  it("returns status=402 with correct JSON shape when balance is insufficient", async () => {
    // First, drain the balance
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    await purchasePackageWithBalance(UID_J3B, PKG_60TL, "cj-j3b-drain");
    expect(await balance(UID_J3B)).toBe(0);

    // Second purchase via HTTP — must return 402 with expected body shape
    const res = await request(app)
      .post(`/api/user/packages/${PKG_60TL}/purchase`)
      .set("Authorization", `Bearer ${token(UID_J3B)}`)
      .send({});

    expect(res.status).toBe(402);
    // Body must have: error (string), code (number = 402), requestId (string)
    expect(typeof res.body.error).toBe("string");
    expect(res.body.code).toBe(402);
    expect(typeof res.body.requestId).toBe("string");
    // Balance still 0 — no double debit
    expect(await balance(UID_J3B)).toBe(0);
  });
});

// ── J2-FORBIDDEN-MODEL-005 ───────────────────────────────────────────────────
describe("J2-FORBIDDEN-MODEL-005: GPT-only package + balance=0 + Claude request → 402, no slot consumed", () => {
  it("does not consume a slot when requested model is not in allowedModels and balance=0", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const { tryReservePackageSlot, checkPackageCoverage } = await import("../services/entitlement-service.js");

    // Grant a GPT-only package (fiyat=0, so debit 0 TL, balance stays 0)
    const r = await purchasePackageWithBalance(UID_J2F, PKG_GPT_ONLY, "cj-j2f-gpt-buy");
    expect(r.tip).toBe("request_limit");
    expect(r.entitlementId).toBeTruthy();
    // balance remains 0 (package was free)
    expect(await balance(UID_J2F)).toBe(0);

    // Claude model is NOT in allowed_models for GPT-only package
    const claudeModel = "claude-sonnet-4-6"; // canonical, not in GPT-only list
    const claudeCovered = await checkPackageCoverage(UID_J2F, claudeModel);
    expect(claudeCovered).toBe(false);

    // tryReservePackageSlot must also return covered=false for Claude
    const slotResult = await tryReservePackageSlot(UID_J2F, claudeModel);
    expect(slotResult.covered).toBe(false);

    // Verify no slot was actually incremented (requests_today still 0)
    const ents = await dbSql<{ requests_today: number }[]>`
      SELECT requests_today FROM user_package_entitlements
      WHERE user_id = ${UID_J2F}::uuid AND status = 'active'
      LIMIT 1
    `;
    expect(ents.length).toBe(1);
    expect(ents[0].requests_today).toBe(0);

    // GPT model IS covered (happy path sanity)
    const gptCovered = await checkPackageCoverage(UID_J2F, "gpt-5.5");
    expect(gptCovered).toBe(true);
  });
});

// ── RD-002 ──────────────────────────────────────────────────────────────────
describe("RD-002: redeemCode with expired code → 400 'Kodun süresi dolmuş', balance unchanged", () => {
  it("rejects an expired code with correct Turkish error message, does not credit balance", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    const { AppError } = await import("../lib/errors.js");

    const before = await balance(UID_RD2);
    await expect(redeemCode(UID_RD2, "CJ-ITEST-EXPIRED")).rejects.toThrow("Kodun süresi dolmuş");

    // Error must be an AppError(400)
    let caught: unknown;
    try {
      await redeemCode(UID_RD2, "CJ-ITEST-EXPIRED");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as { statusCode: number }).statusCode).toBe(400);

    // Balance must be unchanged
    expect(await balance(UID_RD2)).toBe(before);
  });
});

// ── RD-006 ──────────────────────────────────────────────────────────────────
describe("RD-006: redeemCode for package code pointing to disabled package → 400 'Kod paketi geçersiz/kapalı'", () => {
  it("rejects a package code when the target package is disabled", async () => {
    const { redeemCode } = await import("../services/redeem-code-service.js");
    const { AppError } = await import("../lib/errors.js");

    const before = await balance(UID_RD6);
    await expect(redeemCode(UID_RD6, "CJ-ITEST-DISABLED-PKG")).rejects.toThrow("Kod paketi geçersiz/kapalı");

    // Must be AppError 400
    let caught: unknown;
    try {
      await redeemCode(UID_RD6, "CJ-ITEST-DISABLED-PKG");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as { statusCode: number }).statusCode).toBe(400);

    // No entitlement created
    const ents = await dbSql`SELECT id FROM user_package_entitlements WHERE user_id = ${UID_RD6}::uuid`;
    expect(ents.length).toBe(0);

    // Balance unchanged
    expect(await balance(UID_RD6)).toBe(before);
  });
});

// ── GAP-B1 ──────────────────────────────────────────────────────────────────
describe("GAP-B1: slot release on upstream 5xx — requests_today decremented, balance unchanged, error row costTL=0", () => {
  it("releasePackageSlot reverses the reserved slot, recordPackageUsage error branch writes costTL='0'", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const { tryReservePackageSlot, releasePackageSlot, recordPackageUsage } = await import("../services/entitlement-service.js");

    // Fetch the dummy api key ID we inserted for B1 in beforeAll
    const keyRows = await dbSql<{ id: string }[]>`SELECT id FROM api_keys WHERE user_id = ${UID_B1}::uuid LIMIT 1`;
    expect(keyRows.length).toBe(1);
    const apiKeyId = keyRows[0].id;

    // Give user a GPT-only package (0 TL cost — balance stays untouched)
    const purchaseResult = await purchasePackageWithBalance(UID_B1, PKG_GPT_ONLY, "cj-b1-pkg-buy");
    expect(purchaseResult.entitlementId).toBeTruthy();

    // Reserve a slot (simulating start of a proxied request)
    const slotResult = await tryReservePackageSlot(UID_B1, "gpt-5.5");
    expect(slotResult.covered).toBe(true);
    const slotEntId = slotResult.entitlementId!;

    // Confirm requests_today incremented to 1
    const beforeRelease = await dbSql<{ requests_today: number }[]>`
      SELECT requests_today FROM user_package_entitlements WHERE id = ${slotEntId}::uuid
    `;
    expect(beforeRelease[0].requests_today).toBe(1);

    // Simulate upstream 5xx: release the slot (K1 quota twin)
    await releasePackageSlot(slotEntId);

    // requests_today must be back to 0
    const afterRelease = await dbSql<{ requests_today: number }[]>`
      SELECT requests_today FROM user_package_entitlements WHERE id = ${slotEntId}::uuid
    `;
    expect(afterRelease[0].requests_today).toBe(0);

    // Balance unchanged
    expect(await balance(UID_B1)).toBe(100);

    // Record the error usage row (the actual upstream-error path writes costTL="0").
    const reqId = "cj-b1-req-error-001";
    await recordPackageUsage({
      userId: UID_B1,
      apiKeyId,
      modelId: "gpt-5.5",
      entitlementId: slotEntId,
      inputUsage: 0,
      outputUsage: 0,
      responseMs: 100,
      status: "error",
      requestId: reqId,
      errorCode: "upstream_5xx",
    });

    // usage_records row must exist with status='error' and costTL='0' (the STRING "0")
    const usageRows = await dbSql<{ status: string; cost_tl: string; billed_via: string }[]>`
      SELECT status, cost_tl, billed_via FROM usage_records
      WHERE request_id = ${reqId} AND user_id = ${UID_B1}::uuid
      LIMIT 1
    `;
    expect(usageRows.length).toBe(1);
    expect(usageRows[0].status).toBe("error");
    // costTL for package billing is stored as "0" (numeric column, rounds to 0.0000)
    expect(Number(usageRows[0].cost_tl)).toBe(0);
    expect(usageRows[0].billed_via).toBe("package");
  });
});

// ── J5-DELIVERY-USER-GET-009 ─────────────────────────────────────────────────
describe("J5-DELIVERY-USER-GET-009: GET /api/user/delivery-orders — teslimPayload=null when pending, visible after markDelivered", () => {
  it("returns teslimPayload=null while order is pending; exposes payload after admin markDelivered", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const { markDeliveryDelivered } = await import("../services/account-delivery-service.js");

    // Purchase a delivery package → order is created in 'bekliyor' state
    const purchaseResult = await purchasePackageWithBalance(UID_J5, PKG_DELIVERY, "cj-j5-delivery-buy", "user@example.com");
    expect(purchaseResult.tip).toBe("account_delivery");
    expect(purchaseResult.deliveryOrderId).toBeTruthy();
    const orderId = purchaseResult.deliveryOrderId!;

    // GET /api/user/delivery-orders while pending → teslimPayload must be null
    const resPending = await request(app)
      .get("/api/user/delivery-orders")
      .set("Authorization", `Bearer ${token(UID_J5)}`);

    expect(resPending.status).toBe(200);
    expect(Array.isArray(resPending.body)).toBe(true);

    const pendingOrder = resPending.body.find((o: { id: string }) => o.id === orderId);
    expect(pendingOrder).toBeDefined();
    expect(pendingOrder.durum).toBe("bekliyor");
    // teslimPayload must NOT be exposed while pending
    expect(pendingOrder.teslimPayload).toBeNull();

    // Admin marks order as delivered with a real payload
    const deliveryPayload = "ACTIVATION-CODE-XYZ-789";
    await markDeliveryDelivered(orderId, "admin-cj-j5", deliveryPayload, "Delivered for itest");

    // GET /api/user/delivery-orders after delivery → teslimPayload is now visible
    const resDelivered = await request(app)
      .get("/api/user/delivery-orders")
      .set("Authorization", `Bearer ${token(UID_J5)}`);

    expect(resDelivered.status).toBe(200);
    const deliveredOrder = resDelivered.body.find((o: { id: string }) => o.id === orderId);
    expect(deliveredOrder).toBeDefined();
    expect(deliveredOrder.durum).toBe("teslim_edildi");
    // Payload is now exposed
    expect(deliveredOrder.teslimPayload).toBe(deliveryPayload);
  });
});
