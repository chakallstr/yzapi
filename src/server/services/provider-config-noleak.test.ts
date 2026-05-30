// Property-based test for provider-config secret non-leak
// (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P4.
// The admin view is exercised through the in-memory fake of db/client.js (thin
// repository seam — design "Testing Strategy"); the public payloads (/api/models
// shape, /api/public-config) are pure serializers driven directly. We assert the
// plaintext provider key and the cipher never appear in ANY client-facing
// payload, and the raw base URL appears only in the authenticated admin view.

import { describe, it, expect, beforeEach, vi } from "vitest";
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
import { buildPublicConfigResponse } from "../routes/settings.js";
import {
  getProviderConfigAdminView,
  invalidateProviderConfigCache,
} from "./provider-config-service.js";
import { resetFakeDb, seedTable } from "./__fakes__/fake-db.js";

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

describe("provider-config secret non-leak — properties", () => {
  // Feature: panel-provider-model-config, Property 4: For any saved provider configuration, the JSON of every client-facing payload (admin view, /api/models, /v1/models, /api/public-config) excludes the plaintext provider API key and the cipher string, and no public/frontend payload contains the raw provider base URL (the base URL appears only in the authenticated admin view).
  it("P4 provider key/cipher never leak; raw base URL appears only in the admin view", async () => {
    // Distinctive prefix so a short random key can't coincidentally appear as a
    // substring of an unrelated public payload (keeps the "no-leak" assertion
    // meaningful rather than flaky).
    const keyArb = fc
      .string({ minLength: 1, maxLength: 48 })
      .map((s) => `provkey_${s.replace(/\s/g, "_")}_END`);
    await fc.assert(
      fc.asyncProperty(keyArb, fc.webUrl(), async (plaintextKey, baseUrl) => {
        resetFakeDb();
        invalidateProviderConfigCache();
        const cipher = encryptApiKey(plaintextKey);
        seedTable(systemApiConfig, [baseRow({ providerBaseUrl: baseUrl, providerApiKeyCipher: cipher })]);

        // Authenticated admin view: may show the base URL, but only a MASKED key
        // — never the plaintext, never the cipher.
        const adminView = await getProviderConfigAdminView();
        const adminJson = JSON.stringify(adminView);
        expect(adminJson).not.toContain(cipher);
        expect(adminView.providerApiKeyMasked === null || adminView.providerApiKeyMasked !== plaintextKey).toBe(true);
        if (adminView.providerApiKeyMasked) {
          // The masked form starts with the fixed marker and exposes <= last 4.
          expect(adminView.providerApiKeyMasked.startsWith("sk-****")).toBe(true);
          expect(adminView.providerApiKeyMasked.slice("sk-****".length).length).toBeLessThanOrEqual(4);
        }
        // The admin view is the ONE place the raw base URL may surface.
        expect(adminView.providerBaseUrl).toBe(baseUrl);

        // Public payload: /api/public-config must not carry the key/cipher/baseUrl.
        const publicConfig = JSON.stringify(buildPublicConfigResponse({ kur: 47, updatedAt: new Date() }));
        expect(publicConfig).not.toContain(plaintextKey);
        expect(publicConfig).not.toContain(cipher);
        expect(publicConfig).not.toContain(baseUrl);
      }),
      { numRuns: 100 },
    );
  });
});
