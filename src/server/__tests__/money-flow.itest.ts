/**
 * Money-flow INTEGRATION test (real Postgres + mocked upstream).
 *
 * Runs only via `npm run itest` (needs a live DB from `npm run db:up` + migrate).
 * Drives the production route tree (createApp) through supertest and mocks the
 * CloseRouter upstream with nock to verify the real billing path end-to-end:
 *   - success  => balance drops by exactly the computed cost, usage_records=success
 *   - upstream error (502) => balance unchanged (reservation fully refunded),
 *     usage_records=error, cost 0 (K1 live verification)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import nock from "nock";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { MASTER_MODELS } from "../../master-models.js";

const UPSTREAM = process.env.CLOSEROUTER_BASE_URL || "https://api.closerouter.dev/v1";
const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const FULL_KEY = "yzk_live_aaaaaaaaaaaaaaaaaaaaaaaa"; // 24 hex-ish chars after prefix
const PREFIX = `yzk_live_${FULL_KEY.slice("yzk_live_".length, "yzk_live_".length + 3)}`;

// Pick a real text model that supports /v1/chat/completions.
const MODEL = MASTER_MODELS.find((m) => m.type === "Metin" && m.endpoints.includes("chat"))!;

const app = createApp();

async function getBalance(): Promise<number> {
  const rows = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, TEST_USER_ID)).limit(1);
  return Number(rows[0]?.b ?? 0);
}

beforeAll(async () => {
  // Ensure a system_config row exists with a known kur.
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE SET kur = 47, live_kur = 47, kur_buffer = 0.03, text_carpan = 3.0
  `;

  // Clean any prior test rows.
  await dbSql`DELETE FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM api_keys WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;

  await db.insert(users).values({
    id: TEST_USER_ID,
    email: "moneyflow@test.local",
    adSoyad: "Money Flow",
    bakiyeTL: "100.0000",
    durum: "aktif",
  });

  const keyHash = await bcrypt.hash(FULL_KEY, 10);
  await db.insert(apiKeys).values({
    userId: TEST_USER_ID,
    ad: "itest-key",
    maskedKey: "yzk_live_••••",
    keyHash,
    prefix: PREFIX,
    aktif: true,
  });

  // Make sure the model is not disabled by an override.
  await dbSql`DELETE FROM model_overrides WHERE model_id = ${MODEL.id}`;
});

afterAll(async () => {
  await dbSql`DELETE FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM api_keys WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;
  await dbSql.end();
});

beforeEach(async () => {
  nock.cleanAll();
  // Reset balance AND clear prior ledger/usage so a previous case's
  // fire-and-forget settle cannot bleed into the next assertion.
  await dbSql`DELETE FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`UPDATE users SET bakiye_tl = '100.0000' WHERE id = ${TEST_USER_ID}::uuid`;
});

async function waitForUsageRecord(requestId: string, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbSql<{ status: string; cost_tl: string; remaining_tl: string }[]>`
      SELECT status, cost_tl, remaining_tl FROM usage_records
      WHERE request_id = ${requestId}
      LIMIT 1
    `;
    if (rows[0]) return rows[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}

describe("money flow: /v1/chat/completions billing", () => {
  it("charges the customer on a successful upstream call", async () => {
    nock(new URL(UPSTREAM).origin)
      .post(/\/chat\/completions$/)
      .reply(200, {
        id: "chatcmpl_ok",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1000, completion_tokens: 200 },
      });

    const before = await getBalance();
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ model: MODEL.id, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);
    const costHeader = Number(res.headers["x-yz-cost-tl"]);
    const requestId = res.headers["x-yz-request-id"];
    expect(costHeader).toBeGreaterThan(0);

    const usage = await waitForUsageRecord(requestId);
    expect(usage?.status).toBe("success");
    expect(Number(usage?.cost_tl)).toBeCloseTo(costHeader, 2);

    const after = await getBalance();
    // Balance dropped by ~the charged cost (within rounding).
    expect(before - after).toBeCloseTo(costHeader, 2);
  });

  it("does NOT charge the customer when upstream returns 502 (K1)", async () => {
    nock(new URL(UPSTREAM).origin)
      .post(/\/chat\/completions$/)
      .reply(502, { error: "upstream boom" });

    const before = await getBalance();
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ model: MODEL.id, messages: [{ role: "user", content: "hi" }] });

    // Upstream error is surfaced (non-2xx).
    expect(res.status).toBeGreaterThanOrEqual(400);
    // On the error path the proxy does not set X-YZ-Request-Id, but the
    // request-id middleware always sets X-Request-Id (the same id used for billing).
    const requestId = res.headers["x-yz-request-id"] || res.headers["x-request-id"];
    expect(requestId).toBeTruthy();

    // The error-path settle (refund) is fire-and-forget; wait for its usage row.
    const errRow = await waitForUsageRecord(requestId);
    expect(errRow?.status).toBe("error");
    expect(Number(errRow?.cost_tl)).toBe(0);

    // After the refund settles, balance returns to the start (K1: no charge).
    let after = before;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      after = await getBalance();
      if (Math.abs(after - before) < 0.0001) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(after).toBeCloseTo(before, 4);
  });

  it("bills two requests separately even when the client reuses X-Request-Id (K2)", async () => {
    // Two successful upstream calls; the client sends the SAME X-Request-Id on both.
    nock(new URL(UPSTREAM).origin)
      .post(/\/chat\/completions$/)
      .twice()
      .reply(200, {
        id: "chatcmpl_ok",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1000, completion_tokens: 200 },
      });

    const before = await getBalance();
    const clientId = "client-replayed-id-should-be-ignored";

    const res1 = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .set("X-Request-Id", clientId)
      .send({ model: MODEL.id, messages: [{ role: "user", content: "hi" }] });
    const res2 = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .set("X-Request-Id", clientId)
      .send({ model: MODEL.id, messages: [{ role: "user", content: "hi" }] });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Server-generated ids must differ despite the identical client header.
    const id1 = res1.headers["x-yz-request-id"];
    const id2 = res2.headers["x-yz-request-id"];
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(clientId);

    const u1 = await waitForUsageRecord(id1);
    const u2 = await waitForUsageRecord(id2);
    expect(u1?.status).toBe("success");
    expect(u2?.status).toBe("success");

    // Both requests were billed (no idempotent free ride): balance dropped by
    // roughly twice a single request's cost.
    const single = Number(res1.headers["x-yz-cost-tl"]);
    const after = await getBalance();
    expect(before - after).toBeCloseTo(single * 2, 2);
  });
});
