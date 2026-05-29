import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * API + security contract e2e.
 * Validates the live HTTP surface, including the deploy-sync-hardening fixes:
 *  - dead Gemini-spending demo endpoints (/api/route-agent, /api/files/*, /api/logs)
 *    are fully removed (404 JSON), closing the unmetered-cost surface (K3 follow-up)
 *  - public read endpoints stay open (models, public-config, announcements)
 *  - /v1 proxy requires an API key (401 without it)
 *  - K2: server always returns an X-Request-Id header it generated
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:4567";

test.describe("public system endpoints", () => {
  test("GET /health returns ok with db check", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks?.db).toBe("ok");
  });

  test("GET /status returns ok and a positive model count", async ({ request }) => {
    const res = await request.get("/status");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(Number(body.modelCount)).toBeGreaterThan(0);
  });

  test("GET /api/models is public and returns a model array", async ({ request }) => {
    const res = await request.get("/api/models");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    // No upstream cost / multiplier should leak in the public payload
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("providerInputUsd");
    expect(raw).not.toContain("textCarpan");
  });

  test("GET /api/public-config is public and exposes kur", async ({ request }) => {
    const res = await request.get("/api/public-config");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Number(body.kur)).toBeGreaterThan(0);
  });

  test("GET /api/announcements/active is public", async ({ request }) => {
    const res = await request.get("/api/announcements/active");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

test.describe("security: dead Gemini demo endpoints removed (K3 follow-up)", () => {
  test("POST /api/route-agent is gone (404 JSON)", async ({ request }) => {
    const res = await request.post("/api/route-agent", { data: { prompt: "hello" } });
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"] || "").toContain("application/json");
  });

  test("GET /api/files is gone (404 JSON)", async ({ request }) => {
    const res = await request.get("/api/files");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"] || "").toContain("application/json");
  });

  test("POST /api/files/:id/analyze is gone (404 JSON)", async ({ request }) => {
    const res = await request.post("/api/files/sci-1/analyze", { data: {} });
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"] || "").toContain("application/json");
  });

  test("POST /api/settings without admin auth is rejected (401)", async ({ request }) => {
    const res = await request.post("/api/settings", { data: { fallbackModel: "x" } });
    expect(res.status()).toBe(401);
  });

  test("GET /api/settings stays public", async ({ request }) => {
    const res = await request.get("/api/settings");
    expect(res.status()).toBe(200);
  });
});

test.describe("security: /v1 proxy requires API key", () => {
  test("POST /v1/chat/completions without key returns 401", async ({ request }) => {
    const res = await request.post("/v1/chat/completions", {
      data: { model: "claude-sonnet-4-20250514", messages: [{ role: "user", content: "hi" }] },
    });
    expect(res.status()).toBe(401);
  });

  test("unknown /v1 route returns JSON 404 (not SPA HTML)", async ({ request }) => {
    const res = await request.get("/v1/__e2e_missing__");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"] || "").toContain("application/json");
  });

  test("unknown /api route returns JSON 404", async ({ request }) => {
    // The dead Gemini routers were mounted at "/api"; after removing them an
    // unknown /api path falls through to the JSON 404 catch-all (no SPA HTML).
    const res = await request.get("/api/__e2e_missing__");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"] || "").toContain("application/json");
  });
});

test.describe("security: server-generated request id (K2)", () => {
  test("server ignores client X-Request-Id and sets its own", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    const forged = "client-forged-id-123";
    const res = await ctx.get("/health", { headers: { "x-request-id": forged } });
    const returned = res.headers()["x-request-id"];
    expect(returned).toBeTruthy();
    expect(returned).not.toBe(forged);
    await ctx.dispose();
  });
});
