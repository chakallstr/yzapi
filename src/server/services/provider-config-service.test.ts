// Property-based tests for provider-config-service (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P1, P2, P3, P5, P16, P17.
// DB-backed resolvers/saves are exercised against the in-memory fake of
// `system_api_config` (thin repository seam, see design "Testing Strategy") so
// these run without Postgres at ≥100 iterations each. Real DB paths are covered
// by Task 9 itest.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";

// ── Seam: in-memory fake of db/client.js ──────────────────────────────────────
vi.mock("../db/client.js", async () => {
  const { fakeDb, fakeDbSql } = await import("./__fakes__/fake-db.js");
  return { db: fakeDb, dbSql: fakeDbSql };
});

// Silence the structured logger during the many save iterations.
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { providerProfiles, systemApiConfig } from "../db/schema.js";
import { aiProviderBaseUrl, aiProviderApiKey } from "../lib/env.js";
import { encryptApiKey, decryptApiKey } from "./api-key-service.js";
import { BadRequestError } from "../lib/errors.js";
import {
  maskProviderApiKey,
  resolveProviderBaseUrl,
  resolveProviderApiKey,
  saveProviderConfig,
  getProviderConfigAdminView,
  invalidateProviderConfigCache,
  isValidProviderBaseUrl,
  resolveProviderChainForModel,
  resolveSupportedModelIds,
} from "./provider-config-service.js";
import { resetFakeDb, seedTable, getTableRows } from "./__fakes__/fake-db.js";

const MASK_MARKER = "sk-****";

// A baseline single-row system_api_config record with the provider columns null.
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

beforeEach(() => {
  resetFakeDb();
  invalidateProviderConfigCache();
});

describe("provider-config-service — properties", () => {
  // Feature: panel-provider-model-config, Property 1: For any non-empty provider API key string, decrypting the cipher produced by encryptApiKey reproduces the original key exactly, and the stored cipher is never equal to the plaintext.
  it("P1 provider key encryption round-trips and the cipher differs from the plaintext", () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ minLength: 1 }), (key) => {
        const cipher = encryptApiKey(key);
        expect(cipher).not.toBe(key);
        expect(decryptApiKey(cipher)).toBe(key);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 2: For any provider API key, maskProviderApiKey returns a value that ends with at most the final 4 characters of the key behind a fixed leading marker, and never contains the interior characters of the key.
  it("P2 maskProviderApiKey reveals only the last 4 chars behind a fixed marker", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (key) => {
        const masked = maskProviderApiKey(key)!;
        expect(masked.startsWith(MASK_MARKER)).toBe(true);
        const revealed = masked.slice(MASK_MARKER.length);
        // Reveals at most the final 4 characters …
        expect(revealed.length).toBeLessThanOrEqual(4);
        // … and exactly the last 4 of the key (the interior is never exposed).
        expect(revealed).toBe(key.slice(-4));
      }),
      { numRuns: 100 },
    );
  });

  it("matches dash provider support to dotted canonical added-model ids", async () => {
    seedTable(providerProfiles, [
      {
        id: "wellflow",
        label: "Wellflow",
        baseUrl: "https://api.wellflow.test/v1",
        apiKeyCipher: encryptApiKey("sk-profile-test"),
        enabled: true,
        supportedModelIds: ["claude-opus-4-8"],
        modelMap: { "claude-opus-4.8": "claude-opus-4-8" },
        fallbackProviderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    expect(await resolveSupportedModelIds()).toEqual(
      expect.arrayContaining(["claude-opus-4-8", "claude-opus-4.8"]),
    );

    const chain = await resolveProviderChainForModel("claude-opus-4.8");

    expect(chain.primary.profileId).toBe("wellflow");
  });

  // Feature: panel-provider-model-config, Property 3: For any persisted system_api_config state, resolveProviderBaseUrl returns the persisted provider_base_url when non-empty otherwise the env base URL; likewise resolveProviderApiKey returns the decrypted cipher when present otherwise the env key.
  it("P3 resolution is database-first with environment fallback", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.fullUnicodeString({ minLength: 1 }), { nil: undefined }),
        async (dbBaseUrl, dbKey) => {
          resetFakeDb();
          invalidateProviderConfigCache();

          const providerBaseUrl = dbBaseUrl ?? null;
          const providerApiKeyCipher = dbKey !== undefined ? encryptApiKey(dbKey) : null;
          seedTable(systemApiConfig, [baseRow({ providerBaseUrl, providerApiKeyCipher })]);

          const expectedBaseUrl =
            typeof dbBaseUrl === "string" && dbBaseUrl.trim().length > 0 ? dbBaseUrl : aiProviderBaseUrl();
          const expectedKey = dbKey !== undefined ? dbKey : aiProviderApiKey();

          expect(await resolveProviderBaseUrl()).toBe(expectedBaseUrl);
          expect(await resolveProviderApiKey()).toBe(expectedKey);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 5: For any sequence of provider-config saves, a resolveProviderBaseUrl/resolveProviderApiKey call issued after a save returns the most recently saved effective values (cache invalidation prevents a stale read) without a process restart.
  it("P5 a saved config is visible to the next resolve (no stale cache)", async () => {
    const saveArb = fc.record({
      baseUrl: fc.webUrl(),
      key: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(saveArb, { minLength: 1, maxLength: 6 }), async (saves) => {
        resetFakeDb();
        invalidateProviderConfigCache();
        seedTable(systemApiConfig, [baseRow()]);

        for (const save of saves) {
          await saveProviderConfig({ providerBaseUrl: save.baseUrl, providerApiKey: save.key });
          expect(await resolveProviderBaseUrl()).toBe(save.baseUrl);
          expect(await resolveProviderApiKey()).toBe(save.key);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 16: For any provider API key encrypted under API_KEY_ENCRYPTION_SECRET_OLD, decryptApiKey with the rotation decryption order [primary, OLD] recovers the original key.
  it("P16 rotation-fallback decryption recovers keys written under the previous secret", () => {
    fc.assert(
      fc.property(
        fc.fullUnicodeString({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (key, primarySecret, oldSecret) => {
          fc.pre(primarySecret !== oldSecret);
          const cipher = encryptApiKey(key, oldSecret);
          // Primary alone cannot read a cipher written under the old secret …
          expect(decryptApiKey(cipher, [primarySecret])).toBeNull();
          // … but the rotation order [primary, OLD] recovers it.
          expect(decryptApiKey(cipher, [primarySecret, oldSecret])).toBe(key);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 17: For any string that is not an absolute http/https URL, saveProviderConfig rejects the base-URL change with HTTP 400 and leaves the persisted base URL unchanged; and for any empty-string provider API key, the save is rejected with HTTP 400 and the stored cipher is left unchanged.
  it("P17 invalid base URLs and empty keys are rejected without mutating stored state", async () => {
    const invalidUrlArb = fc
      .oneof(
        fc.constant(""),
        fc.constant("not a url"),
        fc.constant("ftp://example.com"),
        fc.constant("//example.com/path"),
        fc.constant("example.com"),
        fc.string(),
      )
      .filter((s) => !isValidProviderBaseUrl(s.trim()));

    await fc.assert(
      fc.asyncProperty(
        invalidUrlArb,
        fc.fullUnicodeString({ minLength: 1 }),
        fc.webUrl(),
        async (invalidUrl, storedKey, storedBaseUrl) => {
          resetFakeDb();
          invalidateProviderConfigCache();
          const storedCipher = encryptApiKey(storedKey);
          seedTable(
            systemApiConfig,
            [baseRow({ providerBaseUrl: storedBaseUrl, providerApiKeyCipher: storedCipher })],
          );

          // Invalid base URL → 400, stored base URL unchanged.
          await expect(saveProviderConfig({ providerBaseUrl: invalidUrl })).rejects.toBeInstanceOf(
            BadRequestError,
          );
          expect(getTableRows(systemApiConfig)[0].providerBaseUrl).toBe(storedBaseUrl);

          // Empty-string key → 400, stored cipher unchanged.
          await expect(saveProviderConfig({ providerApiKey: "" })).rejects.toBeInstanceOf(BadRequestError);
          expect(getTableRows(systemApiConfig)[0].providerApiKeyCipher).toBe(storedCipher);
        },
      ),
      { numRuns: 100 },
    );
  });
});
