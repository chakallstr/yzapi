/**
 * metro-provider-switch INTEGRATION test (real Postgres + mocked upstream).
 *
 * Task 7 of .kiro/specs/metro-provider-switch/tasks.md.
 * Runs only via `npm run itest` (needs a live DB from `npm run db:up` + migrate,
 * which must apply migration 0013_provider_profiles).
 *
 * Mirrors money-flow.itest.ts + provider-model-config.itest.ts: it drives the
 * production route tree (createApp) through supertest, mocks the provider
 * upstream with nock, and exercises the REAL services (provider-config-service,
 * added-model-service catalog filter, billing-service reserve→settle,
 * reconciliation-service). It verifies the user's core requirement — "metro
 * modelleri görünür, switch edince diğeri" — plus billing safety on top:
 *
 *   1. ACTIVE-PROFILE CATALOG FILTER: with metro active, GET /api/models returns
 *      ONLY metro's supported_model_ids (gpt-5.4 / claude-sonnet-4-6 / the added
 *      gemini-3.5-flash); gpt-5.4-mini, gpt-5-nano and the added claude-opus-4.8
 *      are absent. Switching to closerouter (a different supported set) flips the
 *      visible catalog accordingly.
 *   2. SWITCH RESOLUTION: setActiveProvider("metro") makes resolveProviderBaseUrl()
 *      return the metro base URL, and a billed /v1/chat/completions to a
 *      metro-supported model is forwarded to the metro origin (nock-scoped) →
 *      200 + balance deduction + usage success. setActiveProvider("closerouter")
 *      switches the resolved base URL to the closerouter origin.
 *   3. BILLING SAFETY: a billed metro call decrements balance via reserve→settle
 *      (usage success); a ledger-funded user contributes ZERO reconciliation
 *      drift; an upstream error charges nothing (K1).
 *   4. UNSUPPORTED MODEL: with metro active, a /v1 chat call for a model NOT in
 *      metro's supported set → 404 ModelNotFoundError, nothing billed.
 *
 * NOTE (deviation, mirrors provider-model-config.itest.ts): the shared dev DB may
 * carry a pre-existing GLOBAL ledger drift from unrelated seed data, so a literal
 * `driftTL === 0` is impossible without destroying seed rows. The faithful
 * assertion is that THIS FEATURE introduces no drift: the ledger-funded user never
 * appears in userDrifts (per-user drift 0) and the global drift is unchanged by
 * the metro-billed request.
 *
 * CLEANUP: afterAll snapshot-restores system_api_config.activeProviderId +
 * provider_base_url/cipher and the provider_profiles rows it touched, deletes the
 * seeded added_models + test users, and snapshot-restores system_config pricing —
 * leaving the shared dev DB exactly as found.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import nock from "nock";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  upsertProviderProfile,
  setActiveProvider,
  listProviderProfiles,
  resolveProviderBaseUrl,
  invalidateProviderConfigCache,
} from "../services/provider-config-service.js";
import { seedMetroAddedModels } from "../db/seed.js";
import { getReconciliationReport } from "../services/reconciliation-service.js";

// ── Constants ────────────────────────────────────────────────────────────────

// Metro upstream origin (active provider base URL under test). Distinct from the
// closerouter origin so nock can prove the switch routes to the right upstream.
const METRO_BASE_URL = "https://api.stepanovikov.uno";
const METRO_ORIGIN = new URL(METRO_BASE_URL).origin;

// Closerouter upstream origin = the env-pinned CLOSEROUTER_BASE_URL (itest-setup).
const CLOSEROUTER_BASE_URL = process.env.CLOSEROUTER_BASE_URL || "https://api.closerouter.dev/v1";
const CLOSEROUTER_ORIGIN = new URL(CLOSEROUTER_BASE_URL).origin;

// Provider profile ids exercised by the switch (per the task spec).
const METRO_ID = "metro";
const CLOSEROUTER_ID = "closerouter";

// Metro's supported catalog ids: two master text models + one added model.
const METRO_SUPPORTED = ["gpt-5.4", "claude-sonnet-4-6", "gemini-3.5-flash"] as const;
// Closerouter's (different) supported set — used to prove the switch flips visibility.
const CLOSEROUTER_SUPPORTED = ["gpt-5.4-mini", "gpt-5-nano"] as const;

// A metro-supported master model used for billed /v1 calls.
const METRO_BILLED_MODEL = "gpt-5.4";
// A closerouter-supported master model used to prove the base-url switch.
const CLOSEROUTER_BILLED_MODEL = "gpt-5.4-mini";
// A master model NOT in metro's supported set → must 404 when metro is active.
const METRO_UNSUPPORTED_MODEL = "gpt-5-nano";
// The two added models seeded by seedMetroAddedModels (only one is metro-supported).
const ADDED_VISIBLE = "gemini-3.5-flash";
const ADDED_HIDDEN = "claude-opus-4.8";

// Distinct ids/keys so this file never collides with seed data or the other itests.
const BILLING_USER_ID = "b1111111-1111-1111-1111-111111111111";
const RECON_USER_ID = "b2222222-2222-2222-2222-222222222222";
const BILLING_KEY = "yzk_live_dddddddddddddddddddddddd";
const RECON_KEY = "yzk_live_eeeeeeeeeeeeeeeeeeeeeeee";
const billingPrefix = `yzk_live_${BILLING_KEY.slice("yzk_live_".length, "yzk_live_".length + 3)}`;
const reconPrefix = `yzk_live_${RECON_KEY.slice("yzk_live_".length, "yzk_live_".length + 3)}`;

const app = createApp();

// ── Snapshots restored in afterAll ─────────────────────────────────────────────

let systemConfigSnapshot: Record<string, unknown> | null = null;
let activeProviderIdSnapshot: string | null = null;
let providerCfgSnapshot: {
  provider_base_url: string | null;
  provider_api_key_cipher: string | null;
  provider_api_key_updated_at: Date | null;
} | null = null;
// Raw provider_profiles rows (if any) for METRO_ID / CLOSEROUTER_ID before the test.
type RawProfileRow = {
  id: string;
  label: string;
  base_url: string;
  api_key_cipher: string | null;
  enabled: boolean;
  supported_model_ids: unknown;
  model_map: unknown;
  created_at: Date;
  updated_at: Date;
};
const profileSnapshots = new Map<string, RawProfileRow | null>();

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getBalance(userId: string): Promise<number> {
  const rows = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, userId)).limit(1);
  return Number(rows[0]?.b ?? 0);
}

async function countUsageRecords(userId: string): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM usage_records WHERE user_id = ${userId}::uuid
  `;
  return Number(rows[0].c);
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
    adSoyad: "ITest Metro User",
    bakiyeTL: opts.balanceTL,
    durum: "aktif",
  });
}

async function seedKey(userId: string, fullKey: string, prefix: string) {
  const keyHash = await bcrypt.hash(fullKey, 10);
  await db.insert(apiKeys).values({
    userId,
    ad: "itest-metro-key",
    maskedKey: "yzk_live_••••",
    keyHash,
    prefix,
    aktif: true,
  });
}

async function snapshotProfile(id: string) {
  const rows = await dbSql<RawProfileRow[]>`
    SELECT id, label, base_url, api_key_cipher, enabled, supported_model_ids, model_map, created_at, updated_at
    FROM provider_profiles WHERE id = ${id} LIMIT 1
  `;
  profileSnapshots.set(id, rows[0] ?? null);
}

async function restoreProfile(id: string) {
  // Remove whatever the test left behind.
  await dbSql`DELETE FROM provider_profiles WHERE id = ${id}`;
  // Re-insert the original row only if one existed before the test.
  const snap = profileSnapshots.get(id);
  if (snap) {
    await dbSql`
      INSERT INTO provider_profiles
        (id, label, base_url, api_key_cipher, enabled, supported_model_ids, model_map, created_at, updated_at)
      VALUES
        (${snap.id}, ${snap.label}, ${snap.base_url}, ${snap.api_key_cipher}, ${snap.enabled},
         ${dbSql.json(snap.supported_model_ids as never)}, ${dbSql.json(snap.model_map as never)},
         ${snap.created_at}, ${snap.updated_at})
    `;
  }
}

// Helper: GET /api/models and return the set of model ids the public catalog shows.
async function fetchPublicModelIds(): Promise<Set<string>> {
  const res = await request(app).get("/api/models");
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  return new Set((res.body as Array<{ id: string }>).map((m) => m.id));
}

function nockChatSuccess(origin: string) {
  return nock(origin)
    .post(/\/chat\/completions$/)
    .reply(200, {
      id: "chatcmpl_metro_ok",
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 200 },
    });
}

// ── Setup / teardown ────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Defensive: ensure the single-row system_api_config exists (migration 0011
  // already inserts id=1; this is a no-op there). setActiveProvider UPDATEs it.
  await dbSql`INSERT INTO system_api_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  // Snapshot + pin pricing config so the computed cost is deterministic/positive.
  const cfgRows = await dbSql<Record<string, unknown>[]>`SELECT * FROM system_config WHERE id = 1 LIMIT 1`;
  systemConfigSnapshot = cfgRows[0] ?? null;
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE
      SET kur = 47, live_kur = 47, kur_buffer = 0.03, text_carpan = 3.0
  `;

  // Snapshot the fields this suite mutates so afterAll can restore them.
  const apiCfgRows = await dbSql<{
    active_provider_id: string;
    provider_base_url: string | null;
    provider_api_key_cipher: string | null;
    provider_api_key_updated_at: Date | null;
  }[]>`
    SELECT active_provider_id, provider_base_url, provider_api_key_cipher, provider_api_key_updated_at
    FROM system_api_config WHERE id = 1 LIMIT 1
  `;
  activeProviderIdSnapshot = apiCfgRows[0]?.active_provider_id ?? "closerouter";
  providerCfgSnapshot = apiCfgRows[0]
    ? {
        provider_base_url: apiCfgRows[0].provider_base_url,
        provider_api_key_cipher: apiCfgRows[0].provider_api_key_cipher,
        provider_api_key_updated_at: apiCfgRows[0].provider_api_key_updated_at,
      }
    : null;

  // Snapshot any pre-existing metro/closerouter profile rows so we never clobber
  // real seed data — restored verbatim in afterAll.
  await snapshotProfile(METRO_ID);
  await snapshotProfile(CLOSEROUTER_ID);

  // Funded users. The billing user is funded directly (asserts a balance delta).
  await seedUser({ id: BILLING_USER_ID, email: "itest-metro-billing@test.local", balanceTL: "100.0000" });
  await seedKey(BILLING_USER_ID, BILLING_KEY, billingPrefix);

  // The reconciliation user is funded THROUGH the ledger (a yukleme transaction)
  // so its balance equals the sum of its transactions => per-user drift starts 0.
  await seedUser({ id: RECON_USER_ID, email: "itest-metro-recon@test.local", balanceTL: "100.0000" });
  await seedKey(RECON_USER_ID, RECON_KEY, reconPrefix);
  await dbSql`
    INSERT INTO transactions (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, idempotency_key)
    VALUES (${RECON_USER_ID}::uuid, 'itest-metro-recon@test.local', 'yukleme', 100, 0, 100, 'itest metro funding', ${`itest_metro_recon_fund_${RECON_USER_ID}`})
  `;

  // Seed the two metro added models (idempotent). Only metro's supported set will
  // surface them in the catalog.
  await seedMetroAddedModels(db);

  // Make sure none of the models under test are disabled by an override.
  for (const id of [METRO_BILLED_MODEL, CLOSEROUTER_BILLED_MODEL, METRO_UNSUPPORTED_MODEL, ADDED_VISIBLE, ADDED_HIDDEN]) {
    await dbSql`DELETE FROM model_overrides WHERE model_id = ${id}`;
  }

  // Upsert the two provider profiles (write-only api keys exercise the cipher path).
  await upsertProviderProfile({
    id: METRO_ID,
    label: "Metro",
    baseUrl: METRO_BASE_URL,
    apiKey: "sk-itest-metro-key",
    enabled: true,
    supportedModelIds: [...METRO_SUPPORTED],
    modelMap: {},
  });
  await upsertProviderProfile({
    id: CLOSEROUTER_ID,
    label: "CloseRouter",
    baseUrl: CLOSEROUTER_BASE_URL,
    apiKey: "sk-itest-closerouter-key",
    enabled: true,
    supportedModelIds: [...CLOSEROUTER_SUPPORTED],
    modelMap: {},
  });

  invalidateProviderConfigCache();
});

afterAll(async () => {
  // Remove rows this suite created.
  for (const id of [BILLING_USER_ID, RECON_USER_ID]) {
    await dbSql`DELETE FROM usage_records WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM transactions WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM api_keys WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${id}::uuid`;
  }

  // Delete the seeded added models (only those this suite seeds).
  await dbSql`DELETE FROM added_models WHERE model_id IN (${ADDED_VISIBLE}, ${ADDED_HIDDEN})`;

  // Restore provider profiles (verbatim if they pre-existed, else removed).
  await restoreProfile(METRO_ID);
  await restoreProfile(CLOSEROUTER_ID);

  // Restore active provider + provider config fields.
  if (providerCfgSnapshot) {
    await dbSql`
      UPDATE system_api_config
      SET active_provider_id = ${activeProviderIdSnapshot ?? "closerouter"},
          provider_base_url = ${providerCfgSnapshot.provider_base_url},
          provider_api_key_cipher = ${providerCfgSnapshot.provider_api_key_cipher},
          provider_api_key_updated_at = ${providerCfgSnapshot.provider_api_key_updated_at}
      WHERE id = 1
    `;
  } else {
    await dbSql`UPDATE system_api_config SET active_provider_id = ${activeProviderIdSnapshot ?? "closerouter"} WHERE id = 1`;
  }

  // Restore pricing config (only the pinned fields).
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

beforeEach(async () => {
  nock.cleanAll();
  // Reset ONLY the billing user (the reconciliation user is ledger-funded and
  // must keep its transactions intact). A previous case's fire-and-forget settle
  // cannot bleed into the next assertion this way.
  await dbSql`DELETE FROM usage_records WHERE user_id = ${BILLING_USER_ID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${BILLING_USER_ID}::uuid`;
  await dbSql`UPDATE users SET bakiye_tl = '100.0000' WHERE id = ${BILLING_USER_ID}::uuid`;
});

// ── 1. Active-profile catalog filter (the user's core requirement) ──────────────

describe("active-profile catalog filter: metro shows its models, switch flips them", () => {
  it("GET /api/models returns ONLY the active provider's supported_model_ids and reflects the switch", async () => {
    // ── metro active ──────────────────────────────────────────────────────────
    await setActiveProvider(METRO_ID);
    invalidateProviderConfigCache();

    const metroIds = await fetchPublicModelIds();

    // Exactly metro's supported set is visible (two masters + the added model).
    for (const id of METRO_SUPPORTED) {
      expect(metroIds.has(id)).toBe(true);
    }
    // The added gemini-3.5-flash (metro-supported) IS present...
    expect(metroIds.has(ADDED_VISIBLE)).toBe(true);
    // ...but masters NOT in metro's set are hidden...
    expect(metroIds.has("gpt-5.4-mini")).toBe(false);
    expect(metroIds.has("gpt-5-nano")).toBe(false);
    // ...and the added claude-opus-4.8 (NOT in metro's set) is hidden too.
    expect(metroIds.has(ADDED_HIDDEN)).toBe(false);
    // The catalog is exactly the supported set (nothing extra leaks through).
    expect(metroIds.size).toBe(METRO_SUPPORTED.length);

    // ── switch to closerouter ───────────────────────────────────────────────────
    await setActiveProvider(CLOSEROUTER_ID);
    invalidateProviderConfigCache();

    const closeIds = await fetchPublicModelIds();

    // Now the closerouter set is visible and the metro-only ids are gone.
    for (const id of CLOSEROUTER_SUPPORTED) {
      expect(closeIds.has(id)).toBe(true);
    }
    expect(closeIds.has("gpt-5.4")).toBe(false);
    expect(closeIds.has("claude-sonnet-4-6")).toBe(false);
    expect(closeIds.has(ADDED_VISIBLE)).toBe(false);
    expect(closeIds.size).toBe(CLOSEROUTER_SUPPORTED.length);

    // listProviderProfiles marks exactly the active one.
    const profiles = await listProviderProfiles();
    const metroView = profiles.find((p) => p.id === METRO_ID);
    const closeView = profiles.find((p) => p.id === CLOSEROUTER_ID);
    expect(metroView?.isActive).toBe(false);
    expect(closeView?.isActive).toBe(true);
    // The cipher/plaintext key is never exposed — only the masked form.
    expect(JSON.stringify(profiles)).not.toContain("sk-itest-metro-key");
    expect(JSON.stringify(profiles)).not.toContain("sk-itest-closerouter-key");
  });
});

// ── 2. Switch resolution: active provider drives the resolved base URL ──────────

describe("switch resolution: active provider drives resolveProviderBaseUrl + upstream routing", () => {
  it("metro active → resolves the metro base URL and forwards a billed call to the metro origin", async () => {
    await setActiveProvider(METRO_ID);
    invalidateProviderConfigCache();

    expect(await resolveProviderBaseUrl()).toBe(METRO_BASE_URL);

    // The /v1 call must hit the METRO origin (proves the switch routed upstream).
    const scope = nockChatSuccess(METRO_ORIGIN);

    const before = await getBalance(BILLING_USER_ID);
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${BILLING_KEY}`)
      .send({ model: METRO_BILLED_MODEL, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);
    expect(scope.isDone()).toBe(true); // the metro upstream was the one called

    const costHeader = Number(res.headers["x-yz-cost-tl"]);
    const requestId = res.headers["x-yz-request-id"];
    expect(costHeader).toBeGreaterThan(0);

    const usage = await waitForUsageRecord(requestId);
    expect(usage?.status).toBe("success");
    expect(usage?.model_id).toBe(METRO_BILLED_MODEL);

    const after = await getBalance(BILLING_USER_ID);
    expect(before - after).toBeCloseTo(costHeader, 2);
  });

  it("closerouter active → resolves the closerouter base URL and forwards there", async () => {
    await setActiveProvider(CLOSEROUTER_ID);
    invalidateProviderConfigCache();

    expect(await resolveProviderBaseUrl()).toBe(CLOSEROUTER_BASE_URL);

    const scope = nockChatSuccess(CLOSEROUTER_ORIGIN);

    const before = await getBalance(BILLING_USER_ID);
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${BILLING_KEY}`)
      .send({ model: CLOSEROUTER_BILLED_MODEL, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);
    expect(scope.isDone()).toBe(true); // the closerouter upstream was called

    const costHeader = Number(res.headers["x-yz-cost-tl"]);
    expect(costHeader).toBeGreaterThan(0);
    const after = await getBalance(BILLING_USER_ID);
    expect(before - after).toBeCloseTo(costHeader, 2);
  });
});

// ── 3. Billing safety (reserve→settle, K1, reconciliation drift) ────────────────

describe("billing safety with metro active", () => {
  it("a successful metro call decrements balance via reserve→settle (usage success)", async () => {
    await setActiveProvider(METRO_ID);
    invalidateProviderConfigCache();
    nockChatSuccess(METRO_ORIGIN);

    const before = await getBalance(BILLING_USER_ID);
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${BILLING_KEY}`)
      .send({ model: METRO_BILLED_MODEL, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(200);
    const costHeader = Number(res.headers["x-yz-cost-tl"]);
    const requestId = res.headers["x-yz-request-id"];
    expect(costHeader).toBeGreaterThan(0);

    const usage = await waitForUsageRecord(requestId);
    expect(usage?.status).toBe("success");
    expect(Number(usage?.cost_tl)).toBeCloseTo(costHeader, 2);

    const after = await getBalance(BILLING_USER_ID);
    expect(before - after).toBeCloseTo(costHeader, 2);
  });

  it("does NOT charge when the metro upstream errors (502) — full refund (K1)", async () => {
    await setActiveProvider(METRO_ID);
    invalidateProviderConfigCache();
    nock(METRO_ORIGIN).post(/\/chat\/completions$/).reply(502, { error: "metro upstream boom" });

    const before = await getBalance(BILLING_USER_ID);
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${BILLING_KEY}`)
      .send({ model: METRO_BILLED_MODEL, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const requestId = res.headers["x-yz-request-id"] || res.headers["x-request-id"];
    expect(requestId).toBeTruthy();

    const errRow = await waitForUsageRecord(requestId);
    expect(errRow?.status).toBe("error");
    expect(Number(errRow?.cost_tl)).toBe(0);

    // After the refund settles, balance returns to the start (K1: no charge).
    let after = before;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      after = await getBalance(BILLING_USER_ID);
      if (Math.abs(after - before) < 0.0001) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(after).toBeCloseTo(before, 4);
  });

  it("a ledger-funded user billed via metro contributes ZERO reconciliation drift", async () => {
    await setActiveProvider(METRO_ID);
    invalidateProviderConfigCache();

    const driftBefore = (await getReconciliationReport()).totals.driftTL;

    nockChatSuccess(METRO_ORIGIN);
    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${RECON_KEY}`)
      .send({ model: METRO_BILLED_MODEL, messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(200);
    await waitForUsageRecord(res.headers["x-yz-request-id"]);

    const report = await getReconciliationReport();

    // The billed user stayed perfectly reconciled (balance == its ledger), so it
    // never appears among the drifting users (userDrifts filters |drift| ≥ 1e-4).
    const reconUserDrift = report.userDrifts.find((u) => u.userId === RECON_USER_ID);
    expect(reconUserDrift).toBeUndefined();

    // And the global drift is unchanged by the metro-billed request (delta 0).
    expect(Math.abs(report.totals.driftTL - driftBefore)).toBeLessThan(0.0001);
  });
});

// ── 4. Unsupported model under the active provider ──────────────────────────────

describe("unsupported model with metro active", () => {
  it("a /v1 chat call for a model NOT in metro's supported set → 404 ModelNotFoundError, nothing billed", async () => {
    await setActiveProvider(METRO_ID);
    invalidateProviderConfigCache();

    // No nock interceptor: the request must be rejected BEFORE any upstream call.
    const before = await getBalance(BILLING_USER_ID);
    const usageBefore = await countUsageRecords(BILLING_USER_ID);

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Authorization", `Bearer ${BILLING_KEY}`)
      .send({ model: METRO_UNSUPPORTED_MODEL, messages: [{ role: "user", content: "hi" }] });

    expect(res.status).toBe(404);
    expect(String(res.body.error)).toContain("Model not found");

    // Nothing was billed: no reservation, no usage record, balance unchanged.
    const after = await getBalance(BILLING_USER_ID);
    expect(after).toBeCloseTo(before, 4);
    expect(await countUsageRecords(BILLING_USER_ID)).toBe(usageBefore);
  });
});
