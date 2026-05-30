// Property-based tests for testProviderConnection (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P12, P13.
// global fetch is mocked so the probe never hits the network; the
// system_api_config row is backed by the in-memory fake of db/client.js so the
// "pending config never persisted" invariant can be asserted without Postgres.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";

vi.mock("../db/client.js", async () => {
  const { fakeDb, fakeDbSql } = await import("./__fakes__/fake-db.js");
  return { db: fakeDb, dbSql: fakeDbSql };
});

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { systemApiConfig } from "../db/schema.js";
import { encryptApiKey } from "./api-key-service.js";
import {
  testProviderConnection,
  invalidateProviderConfigCache,
} from "./provider-config-service.js";
import { resetFakeDb, seedTable, getTableRows } from "./__fakes__/fake-db.js";

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    providerBaseUrl: null,
    providerApiKeyCipher: null,
    providerApiKeyUpdatedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  resetFakeDb();
  invalidateProviderConfigCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("testProviderConnection — properties", () => {
  // Feature: panel-provider-model-config, Property 12: For any upstream probe outcome — a success status, a non-success status, or a connection failure — testProviderConnection reports ok consistent with the outcome, includes the observed upstream HTTP status (or an error category when the connection failed) and a finite non-negative latency in milliseconds, and the serialized result never contains the provider API key.
  it("P12 reports observed status/latency consistently and never leaks the key", async () => {
    const SECRET_KEY = "sk-secret-provider-key-DO-NOT-LEAK-9999";

    const outcomeArb = fc.oneof(
      // 2xx success
      fc.record({ kind: fc.constant("ok" as const), status: fc.integer({ min: 200, max: 299 }) }),
      // non-2xx http error
      fc.record({
        kind: fc.constant("http" as const),
        status: fc.oneof(
          fc.integer({ min: 300, max: 399 }),
          fc.integer({ min: 400, max: 499 }),
          fc.integer({ min: 500, max: 599 }),
        ),
      }),
      // network failure (fetch throws)
      fc.record({
        kind: fc.constant("throw" as const),
        errName: fc.constantFrom("TypeError", "TimeoutError", "AbortError", "Error"),
      }),
    );

    await fc.assert(
      fc.asyncProperty(outcomeArb, fc.webUrl(), async (outcome, baseUrl) => {
        resetFakeDb();
        invalidateProviderConfigCache();
        seedTable(
          systemApiConfig,
          [baseRow({ providerBaseUrl: baseUrl, providerApiKeyCipher: encryptApiKey(SECRET_KEY) })],
        );

        globalThis.fetch = vi.fn(async () => {
          if (outcome.kind === "throw") {
            const err = new Error("boom");
            err.name = outcome.errName;
            throw err;
          }
          return { ok: outcome.status >= 200 && outcome.status < 300, status: outcome.status } as Response;
        }) as unknown as typeof fetch;

        const result = await testProviderConnection();

        // latency is a finite, non-negative number of ms.
        expect(Number.isFinite(result.latencyMs)).toBe(true);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);

        if (outcome.kind === "ok") {
          expect(result.ok).toBe(true);
          expect(result.upstreamStatus).toBe(outcome.status);
          expect(result.errorCategory).toBeUndefined();
        } else if (outcome.kind === "http") {
          expect(result.ok).toBe(false);
          expect(result.upstreamStatus).toBe(outcome.status);
          expect(result.errorCategory).toBe("http_error");
        } else {
          expect(result.ok).toBe(false);
          // connection failure → no observed status, an error category instead.
          expect(result.upstreamStatus).toBeNull();
          expect(result.errorCategory).toBeDefined();
        }

        // The serialized result NEVER contains the provider API key.
        expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 13: For any pending { providerBaseUrl, providerApiKey } supplied to the connection test, the probe is issued against the pending values and the system_api_config row is unchanged after the call (the pending config is never persisted).
  it("P13 pending config drives the probe but is never persisted", async () => {
    const storedKey = "sk-stored-saved-key-1234";
    const storedBaseUrl = "https://stored.example.com/v1";

    const pendingArb = fc.record({
      providerBaseUrl: fc.webUrl(),
      providerApiKey: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
    });

    await fc.assert(
      fc.asyncProperty(pendingArb, async (pending) => {
        resetFakeDb();
        invalidateProviderConfigCache();
        const storedCipher = encryptApiKey(storedKey);
        seedTable(
          systemApiConfig,
          [baseRow({ providerBaseUrl: storedBaseUrl, providerApiKeyCipher: storedCipher })],
        );

        let probedUrl = "";
        let probedAuth = "";
        globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          probedUrl = String(url);
          probedAuth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
          return { ok: true, status: 200 } as Response;
        }) as unknown as typeof fetch;

        await testProviderConnection(pending);

        // Probe used the PENDING base URL + key, not the saved one.
        expect(probedUrl.startsWith(pending.providerBaseUrl)).toBe(true);
        expect(probedAuth).toBe(`Bearer ${pending.providerApiKey}`);

        // The persisted row is untouched: pending config is never written.
        const row = getTableRows(systemApiConfig)[0];
        expect(row.providerBaseUrl).toBe(storedBaseUrl);
        expect(row.providerApiKeyCipher).toBe(storedCipher);
      }),
      { numRuns: 100 },
    );
  });
});
