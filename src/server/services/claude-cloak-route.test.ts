import { describe, expect, it, vi } from "vitest";

import { AppError } from "../lib/errors.js";
import type { ProviderChain, ProviderContext } from "./provider-config-service.js";
import { forwardWithFailover } from "./provider-failover.js";
import {
  applyClaudeCloakRouteLock,
  isSonnet46ModelId,
  isVexlyProfileId,
} from "./claude-cloak-route.js";

function ctx(profileId: string): ProviderContext {
  return {
    profileId,
    baseUrl: `https://${profileId}.test/v1`,
    apiKey: "test-key",
    modelMap: {},
    source: { baseUrl: "model_profile", apiKey: "model_profile" },
  };
}

function vexlyCtx(profileId: "vexly-cli" | "vexly-api", overrides: Partial<ProviderContext> = {}): ProviderContext {
  return {
    profileId,
    baseUrl: profileId === "vexly-cli" ? "http://127.0.0.1:8328/cli/v1" : "http://127.0.0.1:8328/api/v1",
    apiKey: profileId === "vexly-cli" ? "tk_live_test-key" : "api_live_test-key",
    modelMap: { "claude-opus-4-6": "claude-opus-4-6" },
    source: { baseUrl: "model_profile", apiKey: "model_profile" },
    supportedModelIds: ["claude-opus-4-6"],
    fallbackProviderId: null,
    ...overrides,
  } as ProviderContext;
}

function chain(primary: string, fallback: string | null = "fallback"): ProviderChain {
  return {
    primary: ctx(primary),
    fallback: fallback ? ctx(fallback) : null,
  };
}

describe("claude cloak route lock", () => {
  it("detects Sonnet 4.6 aliases and Vexly profile ids exactly", () => {
    expect(isSonnet46ModelId("claude-sonnet-4-6")).toBe(true);
    expect(isSonnet46ModelId("claude-sonnet-4.6")).toBe(true);
    expect(isSonnet46ModelId("claude-sonnet-4.6[1m]")).toBe(true);
    expect(isSonnet46ModelId("claude-sonnet-4-5-20250929")).toBe(false);
    expect(isVexlyProfileId("vexly-api")).toBe(true);
    expect(isVexlyProfileId("vexly-cli")).toBe(true);
    expect(isVexlyProfileId("vexly")).toBe(true);
    expect(isVexlyProfileId("my-vexly-api")).toBe(false);
  });

  it("locks non-Sonnet Claude messages to vexly-cli with no fallback", async () => {
    const resolveProfileById = vi.fn(async (id: string) => vexlyCtx(id as "vexly-cli" | "vexly-api"));

    const locked = await applyClaudeCloakRouteLock({
      endpoint: "messages",
      model: { id: "claude-opus-4-6", providerSlug: "anthropic" },
      chain: chain("wellflow", "closerouter"),
      resolveProfileById,
    });

    expect(resolveProfileById).toHaveBeenCalledWith("vexly-cli");
    expect(locked.primary.profileId).toBe("vexly-cli");
    expect(locked.fallback).toBeNull();
  });

  it("allows api_live credentials for the Vexly messages profile when that is the working Anthropic-native credential", async () => {
    const resolveProfileById = vi.fn(async () => vexlyCtx("vexly-cli", { apiKey: "api_live_working-messages-key" }));

    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model: { id: "claude-opus-4-6", providerSlug: "anthropic" },
      chain: chain("wellflow", "closerouter"),
      resolveProfileById,
    })).resolves.toMatchObject({ primary: { profileId: "vexly-cli" }, fallback: null });
  });

  it("runs only the locked Vexly context through failover", async () => {
    const directPrimary = ctx("wellflow");
    const directFallback = ctx("closerouter");
    const vexly = vexlyCtx("vexly-cli");
    const resolveProfileById = vi.fn(async () => vexly);
    const locked = await applyClaudeCloakRouteLock({
      endpoint: "messages",
      model: { id: "claude-opus-4-6", providerSlug: "anthropic" },
      chain: { primary: directPrimary, fallback: directFallback },
      resolveProfileById,
    });
    const seen: Array<string | null> = [];

    await forwardWithFailover(locked, {}, async (providerCtx) => {
      seen.push(providerCtx.profileId);
      return "ok";
    });

    expect(seen).toEqual(["vexly-cli"]);
    expect(seen).not.toContain("wellflow");
    expect(seen).not.toContain("closerouter");
  });

  it("locks non-Sonnet Claude chat and responses to vexly-api with no fallback", async () => {
    const resolveProfileById = vi.fn(async (id: string) => vexlyCtx(id as "vexly-cli" | "vexly-api"));

    await expect(applyClaudeCloakRouteLock({
      endpoint: "chat",
      model: { id: "claude-opus-4-6", providerSlug: "anthropic" },
      chain: chain("wellflow", "closerouter"),
      resolveProfileById,
    })).resolves.toMatchObject({ primary: { profileId: "vexly-api" }, fallback: null });

    await expect(applyClaudeCloakRouteLock({
      endpoint: "responses",
      model: { id: "claude-opus-4-6", providerSlug: "anthropic" },
      chain: chain("wellflow", "closerouter"),
      resolveProfileById,
    })).resolves.toMatchObject({ primary: { profileId: "vexly-api" }, fallback: null });
  });

  it("fails closed when exact Vexly profile invariants are wrong", async () => {
    const model = { id: "claude-opus-4-6", providerSlug: "anthropic" };

    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model,
      chain: chain("wellflow", null),
      resolveProfileById: async () => vexlyCtx("vexly-cli", { baseUrl: "https://vexly.cc/v1" }),
    })).rejects.toMatchObject({ statusCode: 503 });

    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model,
      chain: chain("wellflow", null),
      resolveProfileById: async () => vexlyCtx("vexly-cli", { apiKey: "sk_wrong-lane" }),
    })).rejects.toMatchObject({ statusCode: 503 });

    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model,
      chain: chain("wellflow", null),
      resolveProfileById: async () => vexlyCtx("vexly-cli", { fallbackProviderId: "closerouter" } as Partial<ProviderContext>),
    })).rejects.toMatchObject({ statusCode: 503 });

    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model,
      chain: chain("wellflow", null),
      resolveProfileById: async () => vexlyCtx("vexly-cli", { supportedModelIds: [] } as Partial<ProviderContext>),
    })).rejects.toMatchObject({ statusCode: 503 });
  });

  it("leaves Sonnet 4.6 on its existing non-Vexly chain", async () => {
    const resolveProfileById = vi.fn(async (id: string) => ctx(id));
    const original = chain("bedrock-sonnet", "cf-sonnet");

    const locked = await applyClaudeCloakRouteLock({
      endpoint: "messages",
      model: { id: "claude-sonnet-4.6", providerSlug: "anthropic" },
      chain: original,
      resolveProfileById,
    });

    expect(locked).toBe(original);
    expect(resolveProfileById).not.toHaveBeenCalled();
  });

  it("fails closed when Sonnet 4.6 would use any Vexly candidate", async () => {
    await expect(applyClaudeCloakRouteLock({
      endpoint: "chat",
      model: { id: "claude-sonnet-4-6", providerSlug: "anthropic" },
      chain: chain("vexly-api", null),
    })).rejects.toMatchObject({ statusCode: 503 });

    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model: { id: "claude-sonnet-4-6", providerSlug: "anthropic" },
      chain: chain("bedrock-sonnet", "vexly-cli"),
    })).rejects.toBeInstanceOf(AppError);

    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model: { id: "claude-sonnet-4-6", providerSlug: "anthropic" },
      chain: chain("vexly", null),
    })).rejects.toMatchObject({ statusCode: 503 });
  });

  it("fails closed when the required Vexly profile is missing or has no key", async () => {
    await expect(applyClaudeCloakRouteLock({
      endpoint: "messages",
      model: { id: "claude-opus-4-6", providerSlug: "anthropic" },
      chain: chain("wellflow", null),
      resolveProfileById: async () => null,
    })).rejects.toMatchObject({
      statusCode: 503,
      details: undefined,
    });
  });

  it("leaves non-Claude models unchanged", async () => {
    const resolveProfileById = vi.fn(async (id: string) => ctx(id));
    const original = chain("closerouter", "backup");

    const locked = await applyClaudeCloakRouteLock({
      endpoint: "chat",
      model: { id: "gpt-5.5", providerSlug: "openai" },
      chain: original,
      resolveProfileById,
    });

    expect(locked).toBe(original);
    expect(resolveProfileById).not.toHaveBeenCalled();
  });
});
