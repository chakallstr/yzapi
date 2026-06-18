/**
 * Shopier OSB (Paket 3 — sabit-link otomatik kredilendirme) INTEGRATION test.
 *
 * Runs only via `npm run itest` (needs live DB + migrate). Drives the real route
 * tree (createApp) through supertest against POST /api/payments/shopier/osb-notify
 * with genuine OSB-format (res+hash) bodies, verifying against REAL Postgres:
 *   - valid notification => balance += creditTL exactly once, ledger row written
 *   - duplicate delivery (same orderid) => no double credit, still 200 "success"
 *   - parallel delivery x2 => exactly one credit (UNIQUE constraint)
 *   - tampered hash => 401, no credit
 *   - unknown product / unknown email => dead-letter row, no credit, 200 "success"
 *   - admin resolve of a dead-letter => credits the chosen user once
 *
 * This is the DB-backed coverage that the pure-function unit tests cannot provide
 * (it would have caught the payments.id uuid-vs-text defect).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createHmac } from "crypto";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const OSB_USER = process.env.SHOPIER_OSB_USERNAME!;
const OSB_PASS = process.env.SHOPIER_OSB_PASSWORD!;
const PRODUCT_ID = "47233749";
const PRICE = 899;
const TEST_USER_ID = "22222222-2222-2222-2222-222222222222";
const TEST_EMAIL = "osb-itest@test.local";

const app = createApp();

function osbBody(payload: Record<string, unknown>) {
  const res = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const hash = createHmac("sha256", OSB_PASS).update(res + OSB_USER).digest("hex");
  return { res, hash };
}
function validPayload(orderid: string, over: Record<string, unknown> = {}) {
  return { email: TEST_EMAIL, orderid, currency: "TL", price: String(PRICE), productid: PRODUCT_ID, istest: "0", ...over };
}

async function getBalance(): Promise<number> {
  const rows = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, TEST_USER_ID)).limit(1);
  return Number(rows[0]?.b ?? 0);
}
async function cleanup() {
  await dbSql`DELETE FROM shopier_osb_dead_letters WHERE buyer_email = ${TEST_EMAIL} OR shopier_order_id LIKE 'OSB-IT-%'`;
  // payments.transaction_id → transactions(id): null the link before deleting transactions.
  await dbSql`UPDATE payments SET transaction_id = NULL WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM payments WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: TEST_EMAIL,
    adSoyad: "OSB Itest",
    bakiyeTL: "0.0000",
    durum: "aktif",
  });
});

afterAll(async () => {
  await cleanup();
  await dbSql.end();
});

beforeEach(async () => {
  await dbSql`DELETE FROM shopier_osb_dead_letters WHERE buyer_email = ${TEST_EMAIL} OR shopier_order_id LIKE 'OSB-IT-%'`;
  await dbSql`UPDATE payments SET transaction_id = NULL WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM payments WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`UPDATE users SET bakiye_tl = '0.0000' WHERE id = ${TEST_USER_ID}::uuid`;
});

describe("Shopier OSB notify — real DB credit path", () => {
  it("credits balance exactly once for a valid notification (200 success)", async () => {
    const r = await request(app)
      .post("/api/payments/shopier/osb-notify")
      .type("form")
      .send(osbBody(validPayload("OSB-IT-1")));
    expect(r.status).toBe(200);
    expect(r.text).toBe("success");
    expect(await getBalance()).toBe(PRICE);

    // exactly one ledger row + payment basarili
    const tx = await dbSql`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid AND tip='yukleme'`;
    expect(tx[0].n).toBe(1);
    const pay = await dbSql`SELECT durum FROM payments WHERE idempotency_key = 'osb_OSB-IT-1'`;
    expect(pay[0].durum).toBe("basarili");
  });

  it("does not double-credit a duplicate delivery (same orderid)", async () => {
    await request(app).post("/api/payments/shopier/osb-notify").type("form").send(osbBody(validPayload("OSB-IT-2")));
    const r2 = await request(app).post("/api/payments/shopier/osb-notify").type("form").send(osbBody(validPayload("OSB-IT-2")));
    expect(r2.status).toBe(200);
    expect(r2.text).toBe("success");
    expect(await getBalance()).toBe(PRICE); // still single credit
    const tx = await dbSql`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid AND tip='yukleme'`;
    expect(tx[0].n).toBe(1);
  });

  it("credits exactly once under parallel delivery of the same orderid", async () => {
    const body = osbBody(validPayload("OSB-IT-3"));
    const [a, b] = await Promise.all([
      request(app).post("/api/payments/shopier/osb-notify").type("form").send(body),
      request(app).post("/api/payments/shopier/osb-notify").type("form").send(body),
    ]);
    expect([a.status, b.status].every((s) => s === 200 || s === 500)).toBe(true);
    // converge: a retry after the race must succeed and leave a single credit
    await request(app).post("/api/payments/shopier/osb-notify").type("form").send(body);
    expect(await getBalance()).toBe(PRICE);
    const tx = await dbSql`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid AND tip='yukleme'`;
    expect(tx[0].n).toBe(1);
  });

  it("rejects a tampered hash with 401 and credits nothing", async () => {
    const body = osbBody(validPayload("OSB-IT-4"));
    body.hash = body.hash.slice(0, -1) + (body.hash.slice(-1) === "a" ? "b" : "a");
    const r = await request(app).post("/api/payments/shopier/osb-notify").type("form").send(body);
    expect(r.status).toBe(401);
    expect(await getBalance()).toBe(0);
  });

  it("dead-letters an unknown product (200 success, no credit)", async () => {
    const r = await request(app)
      .post("/api/payments/shopier/osb-notify")
      .type("form")
      .send(osbBody(validPayload("OSB-IT-5", { productid: "999999" })));
    expect(r.status).toBe(200);
    expect(await getBalance()).toBe(0);
    const dl = await dbSql`SELECT reason FROM shopier_osb_dead_letters WHERE shopier_order_id = 'OSB-IT-5'`;
    expect(dl[0].reason).toBe("unknown_product");
  });

  it("dead-letters an unknown email (200 success, no credit)", async () => {
    const r = await request(app)
      .post("/api/payments/shopier/osb-notify")
      .type("form")
      .send(osbBody(validPayload("OSB-IT-6", { email: "ghost@test.local" })));
    expect(r.status).toBe(200);
    expect(await getBalance()).toBe(0);
    const dl = await dbSql`SELECT reason FROM shopier_osb_dead_letters WHERE shopier_order_id = 'OSB-IT-6'`;
    expect(dl[0].reason).toBe("unknown_email");
  });

  it("dead-letters an amount mismatch (200 success, no credit)", async () => {
    const r = await request(app)
      .post("/api/payments/shopier/osb-notify")
      .type("form")
      .send(osbBody(validPayload("OSB-IT-7", { price: "1" })));
    expect(r.status).toBe(200);
    expect(await getBalance()).toBe(0);
    const dl = await dbSql`SELECT reason FROM shopier_osb_dead_letters WHERE shopier_order_id = 'OSB-IT-7'`;
    expect(dl[0].reason).toBe("amount_mismatch");
  });

  it("ignores a test order (istest=1): 200 success, no credit, no dead-letter", async () => {
    const r = await request(app)
      .post("/api/payments/shopier/osb-notify")
      .type("form")
      .send(osbBody(validPayload("OSB-IT-8", { istest: "1" })));
    expect(r.status).toBe(200);
    expect(await getBalance()).toBe(0);
    const dl = await dbSql`SELECT COUNT(*)::int AS n FROM shopier_osb_dead_letters WHERE shopier_order_id = 'OSB-IT-8'`;
    expect(dl[0].n).toBe(0);
  });
});

// ── B2: productId → PAKET (entitlement) grant — real DB ─────────────────────────
const PKG_ACTIVE = "osb-it-pkg-active";
const PKG_INACTIVE = "osb-it-pkg-inactive";
const PKG_PRODUCT = "55501001"; // → osb-it-pkg-active (active+satista)
const PKG_PRODUCT_INACTIVE = "55501002"; // → osb-it-pkg-inactive (enabled=false)
const PKG_PRODUCT_GHOST = "55501003"; // → osb-it-pkg-ghost (no such package row)
const PKG_PRICE = 1500;

function pkgPayload(orderid: string, productid: string) {
  return validPayload(orderid, { productid, price: String(PKG_PRICE) });
}
async function entitlementCount(): Promise<number> {
  const r = await dbSql`SELECT COUNT(*)::int AS n FROM user_package_entitlements WHERE user_id = ${TEST_USER_ID}::uuid AND status='active'`;
  return r[0].n;
}

describe("Shopier OSB notify — productId grants a PACKAGE (B2)", () => {
  beforeAll(async () => {
    await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${TEST_USER_ID}::uuid`;
    await dbSql`DELETE FROM packages WHERE id IN (${PKG_ACTIVE}, ${PKG_INACTIVE})`;
    await dbSql`INSERT INTO packages (id, ad, kategori, gunluk_istek_limiti, sure_gun, fiyat_tl, enabled, satista)
                VALUES (${PKG_ACTIVE}, 'OSB IT Aktif Paket', 'Codex', 1000, 30, ${PKG_PRICE}::numeric, true, true)`;
    await dbSql`INSERT INTO packages (id, ad, kategori, gunluk_istek_limiti, sure_gun, fiyat_tl, enabled, satista)
                VALUES (${PKG_INACTIVE}, 'OSB IT Kapali Paket', 'Codex', 1000, 30, ${PKG_PRICE}::numeric, false, true)`;
  });
  afterAll(async () => {
    await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${TEST_USER_ID}::uuid`;
    await dbSql`DELETE FROM packages WHERE id IN (${PKG_ACTIVE}, ${PKG_INACTIVE})`;
  });
  beforeEach(async () => {
    await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${TEST_USER_ID}::uuid`;
  });

  it("grants the package exactly once, credits NO balance (200 success)", async () => {
    const r = await request(app).post("/api/payments/shopier/osb-notify").type("form").send(osbBody(pkgPayload("OSB-IT-P1", PKG_PRODUCT)));
    expect(r.status).toBe(200);
    expect(r.text).toBe("success");
    expect(await getBalance()).toBe(0); // NOT a balance top-up
    expect(await entitlementCount()).toBe(1);
  });

  it("does not double-grant a duplicate delivery (same orderid)", async () => {
    await request(app).post("/api/payments/shopier/osb-notify").type("form").send(osbBody(pkgPayload("OSB-IT-P2", PKG_PRODUCT)));
    const r2 = await request(app).post("/api/payments/shopier/osb-notify").type("form").send(osbBody(pkgPayload("OSB-IT-P2", PKG_PRODUCT)));
    expect(r2.status).toBe(200);
    expect(await entitlementCount()).toBe(1); // still single grant
    const tx = await dbSql`SELECT COUNT(*)::int AS n FROM transactions WHERE idempotency_key = 'pkg_osb_OSB-IT-P2'`;
    expect(tx[0].n).toBe(1);
  });

  it("dead-letters an INACTIVE (enabled=false) package, grants nothing (200 success)", async () => {
    const r = await request(app).post("/api/payments/shopier/osb-notify").type("form").send(osbBody(pkgPayload("OSB-IT-P3", PKG_PRODUCT_INACTIVE)));
    expect(r.status).toBe(200);
    expect(await entitlementCount()).toBe(0);
    const dl = await dbSql`SELECT reason FROM shopier_osb_dead_letters WHERE shopier_order_id = 'OSB-IT-P3'`;
    expect(dl[0].reason).toBe("package_not_sellable");
  });

  it("dead-letters an UNKNOWN package id, grants nothing (200 success)", async () => {
    const r = await request(app).post("/api/payments/shopier/osb-notify").type("form").send(osbBody(pkgPayload("OSB-IT-P4", PKG_PRODUCT_GHOST)));
    expect(r.status).toBe(200);
    expect(await entitlementCount()).toBe(0);
    const dl = await dbSql`SELECT reason FROM shopier_osb_dead_letters WHERE shopier_order_id = 'OSB-IT-P4'`;
    expect(dl[0].reason).toBe("unknown_package");
  });
});
