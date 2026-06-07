/**
 * POST /v1/responses integration test (real Postgres + mocked upstream).
 *
 * Runs via `npm run itest` (needs a live DB from `npm run db:up` + migrate).
 * Verifies the Responses API endpoint end-to-end:
 *   - success   => Responses API format returned, balance drops, usage_records=success
 *   - upstream error (502) => balance unchanged (K1), usage_records=error
 *   - auth      => 401 on bad key
 *   - validation => 400 on missing model
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
const UPSTREAM_ORIGIN = new URL(UPSTREAM).origin;

const TEST_USER_ID = "re111111-1111-1111-1111-111111111111";
const FULL_KEY = "yzk_live_rrrrrrrrrrrrrrrrrrrrrrrr";
const PREFIX = `yzk_live_${FULL_KEY.slice("yzk_live_".length, "yzk_live_".length + 3)}`;

// Pick any text model that supports the chat endpoint.
const MODEL = MASTER_MODELS.find((m) => m.type === "Metin" && m.endpoints.includes("chat"))!;

const app = createApp();

async function getBalance(): Promise<number> {
  const rows = await db
    .select({ b: users.bakiyeTL })
    .from(users)
    .where(eq(users.id, TEST_USER_ID))
    .limit(1);
  return Number(rows[0]?.b ?? 0);
}

async function waitForUsageRecord(requestId: string, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbSql<{ status: string; cost_tl: string }[]>`
      SELECT status, cost_tl FROM usage_records
      WHERE request_id = ${requestId}
      LIMIT 1
    `;
    if (rows[0]) return rows[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}

beforeAll(async () => {
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE SET kur = 47, live_kur = 47, kur_buffer = 0.03, text_carpan = 3.0
  `;

  await dbSql`DELETE FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM api_keys WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;

  await db.insert(users).values({
    id: TEST_USER_ID,
    email: "responses-itest@test.local",
    adSoyad: "Responses ITest",
    bakiyeTL: "100.0000",
    durum: "aktif",
  });

  const keyHash = await bcrypt.hash(FULL_KEY, 10);
  await db.insert(apiKeys).values({
    userId: TEST_USER_ID,
    ad: "responses-itest-key",
    maskedKey: "yzk_live_••••",
    keyHash,
    prefix: PREFIX,
    aktif: true,
  });

  await dbSql`DELETE FROM model_overrides WHERE model_id = ${MODEL.id}`;
});

afterAll(async () => {
  nock.cleanAll();
  await dbSql`DELETE FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM api_keys WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;
  await dbSql.end();
});

beforeEach(async () => {
  nock.cleanAll();
  await dbSql`DELETE FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`UPDATE users SET bakiye_tl = '100.0000' WHERE id = ${TEST_USER_ID}::uuid`;
});

describe("POST /v1/responses", () => {
  it("returns Responses API format and charges balance on success", async () => {
    nock(UPSTREAM_ORIGIN)
      .post(/\/chat\/completions$/)
      .reply(200, {
        id: "chatcmpl-responses-ok",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Merhaba!" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 500, completion_tokens: 50 },
      });

    const before = await getBalance();
    const res = await request(app)
      .post("/v1/responses")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ model: MODEL.id, input: "Merhaba de.", stream: false });

    expect(res.status).toBe(200);

    // Responses API format
    expect(res.body.object).toBe("response");
    expect(Array.isArray(res.body.output)).toBe(true);
    expect(res.body.output.length).toBeGreaterThan(0);

    // Billing headers
    const costHeader = Number(res.headers["x-yz-cost-tl"]);
    expect(costHeader).toBeGreaterThan(0);

    const requestId = res.headers["x-yz-request-id"];
    const usage = await waitForUsageRecord(requestId);
    expect(usage?.status).toBe("success");

    const after = await getBalance();
    expect(before - after).toBeCloseTo(costHeader, 2);
  });

  it("does NOT charge on upstream 502 (K1)", async () => {
    nock(UPSTREAM_ORIGIN)
      .post(/\/chat\/completions$/)
      .reply(502, { error: "upstream boom" });

    const before = await getBalance();
    const res = await request(app)
      .post("/v1/responses")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ model: MODEL.id, input: "test", stream: false });

    expect(res.status).toBeGreaterThanOrEqual(400);

    const requestId = res.headers["x-yz-request-id"] || res.headers["x-request-id"];
    expect(requestId).toBeTruthy();

    const errRow = await waitForUsageRecord(requestId);
    expect(errRow?.status).toBe("error");
    expect(Number(errRow?.cost_tl)).toBe(0);

    // Wait for refund
    let after = before;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      after = await getBalance();
      if (Math.abs(after - before) < 0.0001) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(after).toBeCloseTo(before, 4);
  });

  it("returns 401 on missing or invalid API key", async () => {
    const res = await request(app)
      .post("/v1/responses")
      .set("Authorization", "Bearer invalid_key_xyz")
      .send({ model: MODEL.id, input: "test", stream: false });

    expect(res.status).toBe(401);
  });

  it("returns 400 when model field is missing", async () => {
    const res = await request(app)
      .post("/v1/responses")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ input: "test", stream: false });

    expect(res.status).toBe(400);
  });

  it("billing: usage_tokens maps correctly (input_tokens > 0, output_tokens > 0)", async () => {
    nock(UPSTREAM_ORIGIN)
      .post(/\/chat\/completions$/)
      .reply(200, {
        id: "chatcmpl-responses-tokens",
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Tamam." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 300, completion_tokens: 10 },
      });

    const res = await request(app)
      .post("/v1/responses")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ model: MODEL.id, input: "Kısa yanıt ver.", stream: false });

    expect(res.status).toBe(200);
    expect(res.body.usage?.input_tokens).toBeGreaterThan(0);
    expect(res.body.usage?.output_tokens).toBeGreaterThan(0);
  });
});
