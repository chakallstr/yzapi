/**
 * Web Search INTEGRATION test (real Postgres + mocked upstream /web-search).
 *
 * Runs only via `npm run itest` (needs a live DB from `npm run db:up` + migrate).
 * Drives the production route tree (createApp) through supertest and mocks the
 * upstream web-search with nock to verify:
 *   - standalone /v1/web-search => $0.001 fee charged, balance drops, usage_records
 *     (type=web_search) + ledger transaction created, RECONCILIATION DRIFT = 0
 *   - no upstream results => NO charge (cost 0), ledger drift = 0
 *   - upstream serper_key_id / web_search_id NEVER leak to the client
 *   - chat auto-augment (web_search:true, current question) => search performed,
 *     extra $0.001 fee + token cost, ledger drift = 0
 *   - non-current question with web_search:true => NO search, NO extra fee
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
import { getReconciliationReport } from "../services/reconciliation-service.js";

const UPSTREAM = process.env.CLOSEROUTER_BASE_URL || "https://api.closerouter.dev/v1";
const TEST_USER_ID = "22222222-2222-2222-2222-222222222222";
const FULL_KEY = "yzk_live_bbbbbbbbbbbbbbbbbbbbbbbb";
const PREFIX = `yzk_live_${FULL_KEY.slice("yzk_live_".length, "yzk_live_".length + 3)}`;

const MODEL = MASTER_MODELS.find((m) => m.type === "Metin" && m.endpoints.includes("chat"))!;
const app = createApp();

// $0.001 × sellKur (47 × 1.03 = 48.41) = 0.04841 → round4 = 0.0484.
const EXPECTED_FEE_TL = 0.0484;

const SAMPLE_SEARCH = {
  results: [
    { title: "Elon Musk - Wikipedia", link: "https://en.wikipedia.org/wiki/Elon_Musk", snippet: "CEO of Tesla and SpaceX", position: 1 },
    { title: "Latest news", link: "https://example.com/news", snippet: "güncel haber", position: 2 },
  ],
  serper_key_id: "019e7e33-SECRET-KEY-ID",
  web_search_id: "58ea-INTERNAL-ID",
  query: "Elon Musk kim",
};

async function getBalance(): Promise<number> {
  const rows = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, TEST_USER_ID)).limit(1);
  return Number(rows[0]?.b ?? 0);
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
    email: "websearch@test.local",
    adSoyad: "Web Search",
    bakiyeTL: "100.0000",
    durum: "aktif",
  });
  const keyHash = await bcrypt.hash(FULL_KEY, 10);
  await db.insert(apiKeys).values({
    userId: TEST_USER_ID,
    ad: "itest-ws-key",
    maskedKey: "yzk_live_••••",
    keyHash,
    prefix: PREFIX,
    aktif: true,
  });
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
  await dbSql`DELETE FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${TEST_USER_ID}::uuid`;
  await dbSql`UPDATE users SET bakiye_tl = '100.0000', toplam_harcama_tl = '0', toplam_istek = 0 WHERE id = ${TEST_USER_ID}::uuid`;
  // Seed a matching deposit so balance == ledger (drift baseline = 0). Without this
  // the directly-seeded 100 TL has no ledger entry → drift would be 100 regardless
  // of our code. With it, every charge that writes BOTH a balance decrement and a
  // ledger tx keeps drift at exactly 0 (the property we are verifying).
  await dbSql`
    INSERT INTO transactions (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, idempotency_key)
    VALUES (${TEST_USER_ID}::uuid, 'websearch@test.local', 'yukleme', '100.0000', '0', '100.0000', 'itest seed', 'ws_itest_seed_deposit')
  `;
});

async function userDrift(): Promise<number> {
  const report = await getReconciliationReport();
  const d = report.userDrifts.find((u) => u.userId === TEST_USER_ID);
  return d ? Math.abs(d.driftTL) : 0;
}

describe("standalone /v1/web-search billing", () => {
  it("charges a fixed $0.001 fee, creates ledger + usage rows, drift=0, no secret leak", async () => {
    nock(new URL(UPSTREAM).origin).post(/\/web-search$/).reply(200, SAMPLE_SEARCH);

    const before = await getBalance();
    const res = await request(app)
      .post("/v1/web-search")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ query: "Elon Musk kim", num: 3 });

    expect(res.status).toBe(200);
    expect(res.body.object).toBe("web_search");
    expect(res.body.results).toHaveLength(2);
    expect(Number(res.body.cost.tl)).toBeCloseTo(EXPECTED_FEE_TL, 4);

    // No-leak: upstream internal fields must not appear anywhere in the response.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("serper_key_id");
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("web_search_id");
    expect(serialized).not.toContain("INTERNAL");

    // Balance dropped by exactly the fee.
    const after = await getBalance();
    expect(before - after).toBeCloseTo(EXPECTED_FEE_TL, 4);

    // usage_records row (type=web_search) + ledger transaction created.
    const usageRows = await dbSql<{ type: string; cost_tl: string; status: string }[]>`
      SELECT type, cost_tl::text, status FROM usage_records WHERE user_id = ${TEST_USER_ID}::uuid ORDER BY timestamp DESC LIMIT 1
    `;
    expect(usageRows[0].type).toBe("web_search");
    expect(usageRows[0].status).toBe("success");
    expect(Number(usageRows[0].cost_tl)).toBeCloseTo(EXPECTED_FEE_TL, 4);

    const txRows = await dbSql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM transactions
      WHERE user_id = ${TEST_USER_ID}::uuid AND tip = 'kullanim'
    `;
    expect(Number(txRows[0].c)).toBe(1);

    // RECONCILIATION DRIFT = 0 (bakiye == ledger).
    expect(await userDrift()).toBeLessThan(0.0001);
  });

  it("does NOT charge when upstream returns no results (cost 0, drift=0)", async () => {
    nock(new URL(UPSTREAM).origin).post(/\/web-search$/).reply(200, { results: [] });

    const before = await getBalance();
    const res = await request(app)
      .post("/v1/web-search")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ query: "asldkfjaslkdfj nonexistent" });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(Number(res.body.cost.tl)).toBe(0);

    const after = await getBalance();
    expect(after).toBeCloseTo(before, 4); // no charge
    expect(await userDrift()).toBeLessThan(0.0001);
  });

  it("rejects empty query with 400", async () => {
    const res = await request(app)
      .post("/v1/web-search")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ query: "" });
    expect(res.status).toBe(400);
  });

  it("idempotent: a second settle for the same web-search request id does not double charge", async () => {
    // We can't easily replay the same server request id via HTTP (it's server-generated),
    // so this asserts the DB-level guard directly through the billing service.
    const { chargeWebSearch } = await import("../services/web-search-billing-service.js");
    const keyRow = await dbSql<{ id: string }[]>`SELECT id::text FROM api_keys WHERE user_id = ${TEST_USER_ID}::uuid LIMIT 1`;
    const apiKeyId = keyRow[0].id;
    const before = await getBalance();
    const rid = "ws_idem-test-123";
    const r1 = await chargeWebSearch({ userId: TEST_USER_ID, apiKeyId, webSearchRequestId: rid, resultCount: 2, responseMs: 10, status: "success", source: "standalone" });
    const r2 = await chargeWebSearch({ userId: TEST_USER_ID, apiKeyId, webSearchRequestId: rid, resultCount: 2, responseMs: 10, status: "success", source: "standalone" });
    expect(r1.alreadyCharged).toBe(false);
    expect(r2.alreadyCharged).toBe(true);
    const after = await getBalance();
    expect(before - after).toBeCloseTo(EXPECTED_FEE_TL, 4); // charged ONCE
    expect(await userDrift()).toBeLessThan(0.0001);
  });
});

describe("chat auto-augment (web_search:true)", () => {
  it("performs search on a current question, charges token cost + $0.001 fee, drift=0", async () => {
    nock(new URL(UPSTREAM).origin).post(/\/web-search$/).reply(200, SAMPLE_SEARCH);
    nock(new URL(UPSTREAM).origin)
      .post(/\/chat\/completions$/)
      .reply(200, {
        id: "chatcmpl_aug",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "Elon Musk Tesla CEO'su [1]" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1500, completion_tokens: 80 },
      });

    const before = await getBalance();
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ model: MODEL.id, web_search: true, messages: [{ role: "user", content: "Elon Musk kim?" }] });

    expect(res.status).toBe(200);
    const requestId = res.headers["x-yz-request-id"];

    // Wait for both the chat usage row and the web-search fee row.
    const deadline = Date.now() + 4000;
    let wsRow: any;
    while (Date.now() < deadline) {
      const rows = await dbSql<{ type: string; cost_tl: string }[]>`
        SELECT type, cost_tl::text FROM usage_records WHERE request_id = ${`ws_${requestId}`} LIMIT 1
      `;
      if (rows[0]) { wsRow = rows[0]; break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(wsRow?.type).toBe("web_search");
    expect(Number(wsRow?.cost_tl)).toBeCloseTo(EXPECTED_FEE_TL, 4);

    // Total drop = token cost + fee; both positive, drift must be 0.
    const after = await getBalance();
    expect(before - after).toBeGreaterThan(EXPECTED_FEE_TL);
    expect(await userDrift()).toBeLessThan(0.0001);
  });

  it("does NOT search a non-current question (no web-search fee row)", async () => {
    nock(new URL(UPSTREAM).origin)
      .post(/\/chat\/completions$/)
      .reply(200, {
        id: "chatcmpl_plain",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "42" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      });

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${FULL_KEY}`)
      .send({ model: MODEL.id, web_search: true, messages: [{ role: "user", content: "bana bir toplama fonksiyonu yaz" }] });

    expect(res.status).toBe(200);
    const requestId = res.headers["x-yz-request-id"];
    // Give any async fee a chance; then assert NO web-search row exists.
    await new Promise((r) => setTimeout(r, 300));
    const rows = await dbSql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM usage_records WHERE request_id = ${`ws_${requestId}`}
    `;
    expect(Number(rows[0].c)).toBe(0);
    expect(await userDrift()).toBeLessThan(0.0001);
  });
});
