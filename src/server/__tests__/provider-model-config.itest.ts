/**
 * panel-provider-model-config INTEGRATION test (real Postgres + mocked upstream).
 *
 * Task 9 of .kiro/specs/panel-provider-model-config/tasks.md.
 * Runs only via `npm run itest` (needs a live DB from `npm run db:up` + migrate).
 * Mirrors the money-flow.itest.ts setup: it seeds a funded user/key, drives the
 * production route tree (createApp) through supertest, and mocks the provider
 * upstream with nock. It verifies, against the REAL billing/reconciliation code:
 *
 *   1. (Req 7.2 / 7.4) A billed /v1/chat/completions request for an ENABLED
 *      added model runs the identical reserve→settle path as a master text
 *      model: 200, a usage_records row for that model id, and the balance drops
 *      by exactly the settled cost.
 *   2. (Req 8.4) POST /api/admin/provider/test-connection (success AND failure)
 *      writes nothing — transactions + usage_records counts are unchanged.
 *   3. (Req 11.3) After added-model billed requests + a saveProviderConfig
 *      change, getReconciliationReport() shows the feature contributes ZERO
 *      drift (the billed user stays perfectly reconciled and global drift is
 *      unchanged by these operations).
 *   4. (Req 10.2) The new admin endpoints reject a missing token (401) and a
 *      non-admin token (403) and leave the database unchanged.
 *
 * NOTE (deviation, see report): this dev DB is shared with pre-seeded users that
 * already carry a non-zero GLOBAL ledger drift (balances seeded without matching
 * ledger rows). A literal `report.totals.driftTL === 0` is therefore impossible
 * here without destroying unrelated seed data. The faithful, robust assertion
 * for Req 11.3 is that the FEATURE introduces no drift: the ledger-funded test
 * user never appears in `userDrifts` (per-user drift 0) and the global drift is
 * identical before/after the added-model billing + provider-config change.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import nock from "nock";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../services/auth-service.js";
import { createAddedModel, deleteAddedModel } from "../services/added-model-service.js";
import {
  saveProviderConfig,
  invalidateProviderConfigCache,
} from "../services/provider-config-service.js";
import { getReconciliationReport } from "../services/reconciliation-service.js";
import { ADMIN_EMAIL } from "../middleware/admin-auth.js";

const UPSTREAM = process.env.CLOSEROUTER_BASE_URL || "https://api.closerouter.dev/v1";
const UPSTREAM_ORIGIN = new URL(UPSTREAM).origin;

// Distinct ids/emails so this file never collides with the seed data or
// money-flow.itest.ts (vitest runs each file in its own worker, but distinct
// rows keep the shared DB clean either way).
const BILLING_USER_ID = "a1111111-1111-1111-1111-111111111111";
const ADMIN_USER_ID = "a2222222-2222-2222-2222-222222222222";
const NONADMIN_USER_ID = "a3333333-3333-3333-3333-333333333333";
const RECON_USER_ID = "a4444444-4444-4444-4444-444444444444";

const BILLING_KEY = "yzk_live_bbbbbbbbbbbbbbbbbbbbbbbb";
const RECON_KEY = "yzk_live_cccccccccccccccccccccccc";
const billingPrefix = `yzk_live_${BILLING_KEY.slice("yzk_live_".length, "yzk_live_".length + 3)}`;
const reconPrefix = `yzk_live_${RECON_KEY.slice("yzk_live_".length, "yzk_live_".length + 3)}`;

// An added model id that is NOT a master id/alias (canonicalizeModelId leaves it
// untouched). Priced in USD-per-million so it bills exactly like a text master.
const ADDED_MODEL_ID = "itest-provider/custom-text-model";
const ADDED_MODEL_INPUT_USD = 1.5;
const ADDED_MODEL_OUTPUT_USD = 3.0;

// A second id used only by the non-admin write attempt (must never persist).
const FORBIDDEN_ADDED_MODEL_ID = "itest-provider/should-not-persist";

const app = createApp();

// Snapshots restored in afterAll so the shared dev DB is left as found.
let systemConfigSnapshot: Record<string, unknown> | null = null;
let providerCfgSnapshot: {
  provider_base_url: string | null;
  provider_api_key_cipher: string | null;
  provider_api_key_updated_at: Date | null;
} | null = null;

async function getBalance(userId: string): Promise<number> {
  const rows = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, userId)).limit(1);
  return Number(rows[0]?.b ?? 0);
}

async function countTransactions(): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM transactions`;
  return Number(rows[0].c);
}

async function countUsageRecords(): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM usage_records`;
  return Number(rows[0].c);
}

async function countAddedModels(): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM added_models`;
  return Number(rows[0].c);
}

async function readProviderBaseUrl(): Promise<string | null> {
  const rows = await dbSql<{ provider_base_url: string | null }[]>`
    SELECT provider_base_url FROM system_api_config WHERE id = 1 LIMIT 1
  `;
  return rows[0]?.provider_base_url ?? null;
}

async function waitForUsageRecord(requestId: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await dbSql<{ status: string; cost_tl: string; model_id: string }[]>`
      SELECT status, cost_tl, model_id FROM usage_records WHERE request_id = ${requestId} LIMIT 1
    `;
    if (rows[0]) return rows[0];
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}

async function seedUser(opts: { id: string; email: string; balanceTL: string }) {
  await dbSql`DELETE FROM usage_records WHERE user_id = ${opts.id}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${opts.id}::uuid`;
  await dbSql`DELETE FROM api_keys WHERE user_id = ${opts.id}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${opts.id}::uuid`;
  await db.insert(users).values({
    id: opts.id,
    email: opts.email,
    adSoyad: "ITest User",
    bakiyeTL: opts.balanceTL,
    durum: "aktif",
  });
}

async function seedKey(userId: string, fullKey: string, prefix: string) {
  const keyHash = await bcrypt.hash(fullKey, 10);
  await db.insert(apiKeys).values({
    userId,
    ad: "itest-key",
    maskedKey: "yzk_live_••••",
    keyHash,
    prefix,
    aktif: true,
  });
}

beforeAll(async () => {
  // Snapshot then pin pricing config (id = 1 already exists in this DB) so the
  // computed cost is deterministic. Restored in afterAll.
  const cfgRows = await dbSql<Record<string, unknown>[]>`SELECT * FROM system_config WHERE id = 1 LIMIT 1`;
  systemConfigSnapshot = cfgRows[0] ?? null;
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE
      SET kur = 47, live_kur = 47, kur_buffer = 0.03, text_carpan = 3.0
  `;

  // Snapshot provider config fields so we can restore them (the reconciliation
  // test mutates them via saveProviderConfig).
  const provRows = await dbSql<{
    provider_base_url: string | null;
    provider_api_key_cipher: string | null;
    provider_api_key_updated_at: Date | null;
  }[]>`
    SELECT provider_base_url, provider_api_key_cipher, provider_api_key_updated_at
    FROM system_api_config WHERE id = 1 LIMIT 1
  `;
  providerCfgSnapshot = provRows[0] ?? null;

  // Funded billing user + key (balance seeded directly; this user only asserts
  // a balance delta, not reconciliation).
  await seedUser({ id: BILLING_USER_ID, email: "itest-billing@test.local", balanceTL: "100.0000" });
  await seedKey(BILLING_USER_ID, BILLING_KEY, billingPrefix);

  // Reconciliation user is funded THROUGH the ledger (a yukleme transaction) so
  // its balance equals the sum of its transactions => per-user drift starts at 0.
  await seedUser({ id: RECON_USER_ID, email: "itest-recon@test.local", balanceTL: "100.0000" });
  await seedKey(RECON_USER_ID, RECON_KEY, reconPrefix);
  await dbSql`
    INSERT INTO transactions (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, idempotency_key)
    VALUES (${RECON_USER_ID}::uuid, 'itest-recon@test.local', 'yukleme', 100, 0, 100, 'itest funding', ${`itest_recon_fund_${RECON_USER_ID}`})
  `;

  // Admin user (matches the single-admin allowlist) + an active non-admin user.
  await seedUser({ id: ADMIN_USER_ID, email: ADMIN_EMAIL, balanceTL: "0" });
  await seedUser({ id: NONADMIN_USER_ID, email: "itest-nonadmin@test.local", balanceTL: "0" });

  // Create the enabled added model used by the billing + reconciliation tests.
  await deleteAddedModel(ADDED_MODEL_ID).catch(() => undefined);
  await dbSql`DELETE FROM added_models WHERE model_id = ${ADDED_MODEL_ID}`;
  await dbSql`DELETE FROM added_models WHERE model_id = ${FORBIDDEN_ADDED_MODEL_ID}`;
  await createAddedModel({
    modelId: ADDED_MODEL_ID,
    name: "ITest Custom Text Model",
    providerLabel: "ITest Provider",
    inputUsd: ADDED_MODEL_INPUT_USD,
    outputUsd: ADDED_MODEL_OUTPUT_USD,
    enabled: true,
  });

  // No override should disable the added model.
  await dbSql`DELETE FROM model_overrides WHERE model_id = ${ADDED_MODEL_ID}`;
  invalidateProviderConfigCache();
});

afterAll(async () => {
  // Remove rows this suite created.
  for (const id of [BILLING_USER_ID, RECON_USER_ID, ADMIN_USER_ID, NONADMIN_USER_ID]) {
    await dbSql`DELETE FROM usage_records WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM transactions WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM api_keys WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${id}::uuid`;
  }
  await dbSql`DELETE FROM added_models WHERE model_id = ${ADDED_MODEL_ID}`;
  await dbSql`DELETE FROM added_models WHERE model_id = ${FORBIDDEN_ADDED_MODEL_ID}`;

  // Restore provider config fields.
  if (providerCfgSnapshot) {
    await dbSql`
      UPDATE system_api_config
      SET provider_base_url = ${providerCfgSnapshot.provider_base_url},
          provider_api_key_cipher = ${providerCfgSnapshot.provider_api_key_cipher},
          provider_api_key_updated_at = ${providerCfgSnapshot.provider_api_key_updated_at}
      WHERE id = 1
    `;
  }

  // Restore pricing config (only the fields we pinned).
  if (systemConfigSnapshot) {
    await dbSql`
      UPDATE system_config
      SET kur = ${String(systemConfigSnapshot.kur)}::numeric,
          live_kur = ${String(systemConfigSnapshot.live_kur)}::numeric,
          kur_buffer = ${String(systemConfigSnapshot.kur_buffer)}::numeric,
          text_carpan = ${String(systemConfigSnapshot.text_carpan)}::numeric
      WHERE id = 1
    `;
  }

  invalidateProviderConfigCache();
  await dbSql.end();
});

beforeEach(() => {
  nock.cleanAll();
});

function nockChatSuccess() {
  return nock(UPSTREAM_ORIGIN)
    .post(/\/chat\/completions$/)
    .reply(200, {
      id: "chatcmpl_added_ok",
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 200 },
    });
}

describe("added-model billing (Req 7.2 / 7.4)", () => {
  it("bills an enabled added model via reserve→settle just like a master model", async () => {
    nockChatSuccess();

    const before = await getBalance(BILLING_USER_ID);
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${BILLING_KEY}`)
      .send({ model: ADDED_MODEL_ID, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);

    const costHeader = Number(res.headers["x-yz-cost-tl"]);
    const requestId = res.headers["x-yz-request-id"];
    expect(costHeader).toBeGreaterThan(0);
    expect(requestId).toBeTruthy();

    // A usage_records row was written FOR THE ADDED MODEL id, settled = success.
    const usage = await waitForUsageRecord(requestId);
    expect(usage?.status).toBe("success");
    expect(usage?.model_id).toBe(ADDED_MODEL_ID);
    expect(Number(usage?.cost_tl)).toBeCloseTo(costHeader, 2);

    // Balance decremented by exactly the settled cost (reservation fully
    // refunded, real cost charged) — identical to a master text model.
    const after = await getBalance(BILLING_USER_ID);
    expect(before - after).toBeCloseTo(costHeader, 2);
  });
});

describe("provider test-connection writes nothing (Req 8.4)", () => {
  it("leaves transactions + usage_records counts unchanged on success AND failure", async () => {
    const adminToken = signAccessToken({ sub: ADMIN_USER_ID, role: "user" });

    const txBefore = await countTransactions();
    const usageBefore = await countUsageRecords();

    // Success probe: GET {base}/models => 200.
    nock(UPSTREAM_ORIGIN).get(/\/models$/).reply(200, { object: "list", data: [] });
    const okRes = await request(app)
      .post("/api/admin/provider/test-connection")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerBaseUrl: UPSTREAM, providerApiKey: "sk-itest-probe-key" });
    expect(okRes.status).toBe(200);
    expect(okRes.body.ok).toBe(true);
    expect(okRes.body.upstreamStatus).toBe(200);
    // The probe result never leaks the provider key.
    expect(JSON.stringify(okRes.body)).not.toContain("sk-itest-probe-key");

    // Failure probe: GET {base}/models => 500.
    nock(UPSTREAM_ORIGIN).get(/\/models$/).reply(500, { error: "boom" });
    const failRes = await request(app)
      .post("/api/admin/provider/test-connection")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ providerBaseUrl: UPSTREAM, providerApiKey: "sk-itest-probe-key" });
    expect(failRes.status).toBe(200);
    expect(failRes.body.ok).toBe(false);
    expect(failRes.body.upstreamStatus).toBe(500);

    // Neither probe wrote a single ledger or usage row.
    expect(await countTransactions()).toBe(txBefore);
    expect(await countUsageRecords()).toBe(usageBefore);
  });
});

describe("reconciliation drift unaffected by the feature (Req 11.3)", () => {
  it("added-model billing + provider-config change introduce zero drift", async () => {
    const driftBefore = (await getReconciliationReport()).totals.driftTL;

    // 1) Bill the ledger-funded reconciliation user against the added model.
    nockChatSuccess();
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${RECON_KEY}`)
      .send({ model: ADDED_MODEL_ID, messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(200);
    await waitForUsageRecord(res.headers["x-yz-request-id"]);

    // 2) A provider-config change (does not touch users/transactions at all).
    await saveProviderConfig({ providerBaseUrl: UPSTREAM, providerApiKey: "sk-itest-saved-key" });

    const report = await getReconciliationReport();

    // The billed user stayed perfectly reconciled (balance == its ledger), so it
    // does NOT appear among the drifting users (userDrifts filters |drift| ≥ 1e-4).
    const reconUserDrift = report.userDrifts.find((u) => u.userId === RECON_USER_ID);
    expect(reconUserDrift).toBeUndefined();

    // And the global drift is unchanged by these operations (delta 0).
    expect(Math.abs(report.totals.driftTL - driftBefore)).toBeLessThan(0.0001);
  });
});

describe("new admin endpoints reject non-admin callers (Req 10.2)", () => {
  it("returns 401 without a token and 403 with a non-admin token, leaving the DB unchanged", async () => {
    const nonAdminToken = signAccessToken({ sub: NONADMIN_USER_ID, role: "user" });

    const endpoints: { method: "get" | "post" | "delete"; path: string; body?: Record<string, unknown> }[] = [
      { method: "get", path: "/api/admin/added-models" },
      {
        method: "post",
        path: "/api/admin/added-models",
        body: {
          modelId: FORBIDDEN_ADDED_MODEL_ID,
          name: "Should Not Persist",
          providerLabel: "ITest",
          inputUsd: 1,
          outputUsd: 2,
        },
      },
      { method: "delete", path: `/api/admin/added-models/${encodeURIComponent(ADDED_MODEL_ID)}` },
      {
        method: "post",
        path: "/api/admin/provider/test-connection",
        body: { providerBaseUrl: UPSTREAM, providerApiKey: "sk-should-not-be-used" },
      },
      {
        method: "post",
        path: "/api/admin/api-settings",
        body: { providerBaseUrl: "https://evil.example.com/v1", providerApiKey: "sk-should-not-persist" },
      },
    ];

    // Snapshot every table these endpoints could mutate.
    const addedBefore = await countAddedModels();
    const txBefore = await countTransactions();
    const usageBefore = await countUsageRecords();
    const baseUrlBefore = await readProviderBaseUrl();

    for (const ep of endpoints) {
      // No token => 401 (adminAuth, before any handler runs).
      const noTokenReq = request(app)[ep.method](ep.path);
      const noTokenRes = await (ep.body ? noTokenReq.send(ep.body) : noTokenReq);
      expect(noTokenRes.status).toBe(401);

      // Non-admin token => 403 (valid user JWT, but not the admin email).
      const nonAdminReq = request(app)[ep.method](ep.path).set("Authorization", `Bearer ${nonAdminToken}`);
      const nonAdminRes = await (ep.body ? nonAdminReq.send(ep.body) : nonAdminReq);
      expect(nonAdminRes.status).toBe(403);
    }

    // Nothing was created, deleted, or mutated by the rejected calls.
    expect(await countAddedModels()).toBe(addedBefore);
    expect(await countTransactions()).toBe(txBefore);
    expect(await countUsageRecords()).toBe(usageBefore);
    expect(await readProviderBaseUrl()).toBe(baseUrlBefore);

    // The added model that the DELETE attempt targeted still exists.
    const stillThere = await dbSql<{ model_id: string }[]>`
      SELECT model_id FROM added_models WHERE model_id = ${ADDED_MODEL_ID} LIMIT 1
    `;
    expect(stillThere.length).toBe(1);
    // The forbidden POST never persisted its row.
    const forbidden = await dbSql<{ model_id: string }[]>`
      SELECT model_id FROM added_models WHERE model_id = ${FORBIDDEN_ADDED_MODEL_ID} LIMIT 1
    `;
    expect(forbidden.length).toBe(0);
  });
});
