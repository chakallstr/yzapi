// Unit tests for resolveProviderChainForModel (failover chain resolution) against
// the in-memory fake-db seam — no Postgres. End-to-end proxy failover is covered by
// the itest. See docs/superpowers/specs/2026-06-05-provider-failover-design.md §3.2.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../db/client.js", async () => {
  const { fakeDb, fakeDbSql } = await import("./__fakes__/fake-db.js");
  return { db: fakeDb, dbSql: fakeDbSql };
});
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { systemApiConfig, providerProfiles } from "../db/schema.js";
import { encryptApiKey } from "./api-key-service.js";
import { resolveProviderChainForModel, invalidateProviderConfigCache } from "./provider-config-service.js";
import { resetFakeDb, seedTable } from "./__fakes__/fake-db.js";

function profile(over: Record<string, unknown>) {
  return {
    id: "x",
    label: "",
    baseUrl: "https://up.test/v1",
    apiKeyCipher: encryptApiKey("key"),
    enabled: true,
    supportedModelIds: [],
    modelMap: {},
    fallbackProviderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

const CONFIG = {
  id: 1,
  activeProviderId: "wellflow",
  providerBaseUrl: null,
  providerApiKeyCipher: null,
  providerApiKeyUpdatedAt: null,
  updatedAt: new Date(),
};

beforeEach(() => {
  resetFakeDb();
  invalidateProviderConfigCache();
  seedTable(systemApiConfig, [CONFIG]);
});

describe("resolveProviderChainForModel", () => {
  it("pinned primary + fallback set → returns both contexts", async () => {
    seedTable(providerProfiles, [
      profile({ id: "wellflow", supportedModelIds: ["claude-opus-4-6"], fallbackProviderId: "closerouter" }),
      profile({ id: "closerouter", supportedModelIds: ["claude-opus-4.8"], modelMap: { "claude-opus-4.8": "claude-opus-4-8" } }),
    ]);
    const { primary, fallback } = await resolveProviderChainForModel("claude-opus-4-6");
    expect(primary.profileId).toBe("wellflow");
    expect(fallback?.profileId).toBe("closerouter");
    // fallback carries its OWN modelMap for the wire remap (opus-4.8 dot→dash)
    expect(fallback?.modelMap).toMatchObject({ "claude-opus-4.8": "claude-opus-4-8" });
  });

  it("primary without fallbackProviderId → fallback null", async () => {
    seedTable(providerProfiles, [
      profile({ id: "wellflow", supportedModelIds: ["claude-opus-4-6"], fallbackProviderId: "closerouter" }),
      profile({ id: "closerouter", supportedModelIds: ["claude-opus-4.8"] }),
    ]);
    const { primary, fallback } = await resolveProviderChainForModel("claude-opus-4.8");
    expect(primary.profileId).toBe("closerouter");
    expect(fallback).toBeNull();
  });

  it("fallback target disabled → fallback null", async () => {
    seedTable(providerProfiles, [
      profile({ id: "wellflow", supportedModelIds: ["claude-opus-4-6"], fallbackProviderId: "closerouter" }),
      profile({ id: "closerouter", enabled: false, supportedModelIds: ["claude-opus-4.8"] }),
    ]);
    const { primary, fallback } = await resolveProviderChainForModel("claude-opus-4-6");
    expect(primary.profileId).toBe("wellflow");
    expect(fallback).toBeNull(); // disabled profile is not in readAllEnabledProfiles
  });

  it("fallback target with undecryptable/empty key → fallback null", async () => {
    seedTable(providerProfiles, [
      profile({ id: "wellflow", supportedModelIds: ["claude-opus-4-6"], fallbackProviderId: "closerouter" }),
      profile({ id: "closerouter", apiKeyCipher: null, supportedModelIds: ["claude-opus-4.8"] }),
    ]);
    const { fallback } = await resolveProviderChainForModel("claude-opus-4-6");
    expect(fallback).toBeNull();
  });

  it("fallback bypasses supportedModelIds pin (model need not be in fallback's set)", async () => {
    // closerouter does NOT list claude-opus-4-6 in supportedModelIds, yet it must be a
    // usable fallback for it (pin bypass) — otherwise adding it would hijack primary routing.
    seedTable(providerProfiles, [
      profile({ id: "wellflow", supportedModelIds: ["claude-opus-4-6"], fallbackProviderId: "closerouter" }),
      profile({ id: "closerouter", supportedModelIds: ["gpt-5"] }),
    ]);
    const { fallback } = await resolveProviderChainForModel("claude-opus-4-6");
    expect(fallback?.profileId).toBe("closerouter");
  });

  it("unpinned model → primary from active/env, fallback null", async () => {
    seedTable(providerProfiles, [
      profile({ id: "wellflow", supportedModelIds: ["claude-opus-4-6"], fallbackProviderId: "closerouter" }),
    ]);
    const { primary, fallback } = await resolveProviderChainForModel("totally-unpinned-model");
    expect(primary.profileId).toBeNull();
    expect(fallback).toBeNull();
  });
});
