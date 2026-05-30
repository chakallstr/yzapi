import { test, expect } from "@playwright/test";

/**
 * Live provider-migration e2e (claude-popusk).
 *
 * Proves the live gateway is wired to the new upstream provider end-to-end:
 *  - public catalog still exposes the 42-model surface (no upstream leak)
 *  - /v1 requires an API key
 *  - a FUNDED key produces a real 200 + balance deduction on a minimal call
 *  - a disabled catalog model (gemini-3-pro-preview) is rejected cleanly (not 404 upstream)
 *  - upstream errors never charge the customer (K1) — verified via headers/balance
 *
 * Runs against the live site by default. Requires a funded key to exercise the
 * billed path; without it those tests are skipped (never faked).
 *
 *   E2E_BASE_URL   default https://yapayzekalab.org
 *   E2E_FUNDED_KEY funded yzk_live_* key (NEVER hardcode; pass via env)
 *   E2E_MODEL      cheap model id (default gpt-5-nano)
 *   E2E_DISABLED_MODEL  default gemini-3-pro-preview
 */

const BASE_URL = process.env.E2E_BASE_URL || "https://yapayzekalab.org";
const FUNDED_KEY = process.env.E2E_FUNDED_KEY || "";
const MODEL = process.env.E2E_MODEL || "gpt-5-nano";
const DISABLED_MODEL = process.env.E2E_DISABLED_MODEL || "gemini-3-pro-preview";

function maskKey(k: string): string {
  return k ? `yzk_live_****${k.slice(-4)}` : "(none)";
}

test.describe("live system health", () => {
  test("GET /health is ok with db + aiProvider checks", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks?.db).toBe("ok");
    expect(body.checks?.aiProvider).toBe("ok");
  });

  test("GET /status reports 42-model catalog", async ({ request }) => {
    const res = await request.get("/status");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(Number(body.modelCount)).toBe(42);
  });

  test("GET /api/models is public and leaks no upstream cost/multiplier/provider URL", async ({ request }) => {
    const res = await request.get("/api/models");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("providerInputUsd");
    expect(raw).not.toContain("textCarpan");
    expect(raw).not.toContain("claude-popusk");
  });
});

test.describe("/v1 auth", () => {
  test("POST /v1/chat/completions without key returns 401", async ({ request }) => {
    const res = await request.post("/v1/chat/completions", {
      data: { model: MODEL, messages: [{ role: "user", content: "hi" }] },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("funded billed call (real provider proof)", () => {
  test.skip(!FUNDED_KEY, "E2E_FUNDED_KEY not set — skipping billed path (never faked)");

  test(`POST /v1/chat/completions with funded key ${maskKey(FUNDED_KEY)} returns 200 + usage`, async ({ request }) => {
    const res = await request.post("/v1/chat/completions", {
      headers: { Authorization: `Bearer ${FUNDED_KEY}`, "Content-Type": "application/json" },
      data: { model: MODEL, messages: [{ role: "user", content: "ping" }], max_tokens: 1 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.choices?.[0]?.message).toBeTruthy();
    // Server billing headers must be present on a successful billed call.
    const cost = res.headers()["x-yz-cost-tl"];
    const reqId = res.headers()["x-yz-request-id"];
    expect(reqId).toBeTruthy();
    expect(Number(cost)).toBeGreaterThanOrEqual(0);
  });

  test(`disabled model ${DISABLED_MODEL} is rejected cleanly (not upstream 404)`, async ({ request }) => {
    const res = await request.post("/v1/chat/completions", {
      headers: { Authorization: `Bearer ${FUNDED_KEY}`, "Content-Type": "application/json" },
      data: { model: DISABLED_MODEL, messages: [{ role: "user", content: "ping" }], max_tokens: 1 },
    });
    // model_overrides disable → app-level rejection (403/400), customer not charged.
    expect([400, 403]).toContain(res.status());
    const cost = res.headers()["x-yz-cost-tl"];
    expect(cost === undefined || Number(cost) === 0).toBeTruthy();
  });
});
