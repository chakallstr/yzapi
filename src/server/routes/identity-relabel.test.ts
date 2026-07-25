import { describe, it, expect } from "vitest";
import { applyIdentityRelabel, IDENTITY_OVERRIDE_MODELS, shouldDegradeNativeResponsesForContext } from "./proxy.js";
import type { ProviderChain } from "../services/provider-config-service.js";

// ProviderChain için minimal test sabiti — ProviderContext'in required alanlarını karşılar.
const baseCtx = {
  profileId: "test-primary",
  baseUrl: "https://upstream.example/v1",
  apiKey: "key_test",
  modelMap: {},
  source: { baseUrl: "model_profile" as const, apiKey: "model_profile" as const },
};
const fallbackCtx = {
  profileId: "test-fallback",
  baseUrl: "https://fallback.example/v1",
  apiKey: "key_fb",
  modelMap: {},
  source: { baseUrl: "model_profile" as const, apiKey: "model_profile" as const },
};
const chain = (withFallback = true): ProviderChain => ({
  primary: { ...baseCtx },
  fallback: withFallback ? { ...fallbackCtx } : null,
});

describe("applyIdentityRelabel — IDENTITY_OVERRIDE_MODELS", () => {
  it("claude-sonnet-4-6 → 'Claude Sonnet 4.6' label mapped", () => {
    expect(IDENTITY_OVERRIDE_MODELS["claude-sonnet-4-6"]).toBe("Claude Sonnet 4.6");
  });

  it("claude-opus-4-6 → 'Claude Sonnet 4.6' label mapped (relabel)", () => {
    expect(IDENTITY_OVERRIDE_MODELS["claude-opus-4-6"]).toBe("Claude Sonnet 4.6");
  });

  it("claude-opus-4-7 → 'Claude Sonnet 4.6' label mapped (relabel)", () => {
    expect(IDENTITY_OVERRIDE_MODELS["claude-opus-4-7"]).toBe("Claude Sonnet 4.6");
  });

  it("claude-haiku-4-5-20251001 → 'Claude Sonnet 4.6' label mapped (relabel)", () => {
    expect(IDENTITY_OVERRIDE_MODELS["claude-haiku-4-5-20251001"]).toBe("Claude Sonnet 4.6");
  });
});

describe("applyIdentityRelabel — primary + fallback relabel", () => {
  it("Opus isteği: primary ctx'e relabelResponseTo set edilir", () => {
    const out = applyIdentityRelabel(chain(), "claude-opus-4-6");
    expect(out.primary.relabelResponseTo).toBe("Claude Sonnet 4.6");
  });

  it("identity relabel source'unu primary ctx'e yazar", () => {
    const out = applyIdentityRelabel(chain(), "claude-opus-4-6");
    expect(out.primary.relabelSource).toBe("identity");
  });

  it("Opus isteği: fallback ctx'e de relabelResponseTo set edilir (failover koruması)", () => {
    const out = applyIdentityRelabel(chain(), "claude-opus-4-6");
    expect(out.fallback?.relabelResponseTo).toBe("Claude Sonnet 4.6");
  });

  it("identity relabel source'unu fallback ctx'e de yazar", () => {
    const out = applyIdentityRelabel(chain(), "claude-opus-4-6");
    expect(out.fallback?.relabelSource).toBe("identity");
  });

  it("Haiku isteği: hem primary hem fallback ctx'e relabel set edilir", () => {
    const out = applyIdentityRelabel(chain(), "claude-haiku-4-5-20251001");
    expect(out.primary.relabelResponseTo).toBe("Claude Sonnet 4.6");
    expect(out.fallback?.relabelResponseTo).toBe("Claude Sonnet 4.6");
  });

  it("Opus 4.7 isteği: hem primary hem fallback ctx'e relabel set edilir", () => {
    const out = applyIdentityRelabel(chain(), "claude-opus-4-7");
    expect(out.primary.relabelResponseTo).toBe("Claude Sonnet 4.6");
    expect(out.fallback?.relabelResponseTo).toBe("Claude Sonnet 4.6");
  });

  it("Sonnet 4.6 isteği: hem primary hem fallback ctx'e relabel set edilir", () => {
    const out = applyIdentityRelabel(chain(), "claude-sonnet-4-6");
    expect(out.primary.relabelResponseTo).toBe("Claude Sonnet 4.6");
    expect(out.fallback?.relabelResponseTo).toBe("Claude Sonnet 4.6");
  });

  it("override edilmeyen model: relabel uygulanmaz (no-op)", () => {
    const out = applyIdentityRelabel(chain(), "gpt-4o");
    expect(out.primary.relabelResponseTo).toBeUndefined();
    expect(out.fallback?.relabelResponseTo).toBeUndefined();
  });

  it("fallback null ise: sadece primary'ye relabel set edilir", () => {
    const out = applyIdentityRelabel(chain(false), "claude-opus-4-6");
    expect(out.primary.relabelResponseTo).toBe("Claude Sonnet 4.6");
    expect(out.fallback).toBeNull();
  });

  it("primary'de mevcut relabelResponseTo varsa (spark/codex): DOKUNMA", () => {
    const sparkChain: ProviderChain = {
      primary: { ...baseCtx, relabelResponseTo: "GPT-5.4", relabelSource: "spark" },
      fallback: { ...fallbackCtx, relabelResponseTo: "GPT-5.4", relabelSource: "spark" },
    };
    const out = applyIdentityRelabel(sparkChain, "claude-opus-4-6");
    expect(out.primary.relabelResponseTo).toBe("GPT-5.4");
    expect(out.fallback?.relabelResponseTo).toBe("GPT-5.4");
    expect(out.primary.relabelSource).toBe("spark");
    expect(out.fallback?.relabelSource).toBe("spark");
  });

  it("sadece primary'de spark relabel varsa: fallback'e identity relabel set et", () => {
    const mixedChain: ProviderChain = {
      primary: { ...baseCtx, relabelResponseTo: "GPT-5.4" },
      fallback: { ...fallbackCtx },
    };
    const out = applyIdentityRelabel(mixedChain, "claude-opus-4-6");
    expect(out.primary.relabelResponseTo).toBe("GPT-5.4");
    expect(out.fallback?.relabelResponseTo).toBe("Claude Sonnet 4.6");
  });
});

describe("shouldDegradeNativeResponsesForContext", () => {
  const degradableErr = { status: 404 };
  const uncommittedRes = { headersSent: false };

  it("normal identity relabel native responses degrade'ini engellemez", () => {
    const out = applyIdentityRelabel(chain(), "claude-opus-4-6");
    expect(shouldDegradeNativeResponsesForContext(out.primary, degradableErr, uncommittedRes)).toBe(true);
  });

  it("spark relabel native responses degrade'ini engeller", () => {
    const sparkCtx = { ...baseCtx, relabelResponseTo: "GPT-5.4", relabelSource: "spark" as const };
    expect(shouldDegradeNativeResponsesForContext(sparkCtx, degradableErr, uncommittedRes)).toBe(false);
  });

  it("headers commit edildiyse degrade etmez", () => {
    const out = applyIdentityRelabel(chain(), "claude-opus-4-6");
    expect(shouldDegradeNativeResponsesForContext(out.primary, degradableErr, { headersSent: true })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CE5 — native degrade kapısı araç sözleşmesini kırpmamalı
// Spec: .kiro/specs/responses-tool-contract-fix/ (bugfix.md CE5, design.md §9)
// Bu blok fix'ten ÖNCE kırmızıdır.
// ─────────────────────────────────────────────────────────────────────────────
describe("shouldDegradeNativeResponsesForContext — araç sözleşmesi kapısı (CE5)", () => {
  const degradableErr = { status: 404 };
  const badRequestErr = { status: 400 };
  const uncommittedRes = { headersSent: false };

  it("CE5: custom araç taşıyan istekte degrade edilmez (rethrow → failover)", () => {
    const body = { model: "gpt-5.5", input: "x", tools: [{ type: "custom", name: "apply_patch" }] };
    expect(shouldDegradeNativeResponsesForContext(baseCtx, badRequestErr, uncommittedRes, body)).toBe(false);
  });

  it("CE5b: built-in araç (web_search) taşıyan istekte degrade edilmez", () => {
    const body = { model: "gpt-5.5", input: "x", tools: [{ type: "web_search" }] };
    expect(shouldDegradeNativeResponsesForContext(baseCtx, degradableErr, uncommittedRes, body)).toBe(false);
  });

  it("CE5c: yalnız function/local_shell araçlı istekte degrade edilir (kayıpsız çeviri)", () => {
    const body = {
      model: "gpt-5.5",
      input: "x",
      tools: [{ type: "function", name: "shell", parameters: { type: "object" } }, { type: "local_shell" }],
    };
    expect(shouldDegradeNativeResponsesForContext(baseCtx, degradableErr, uncommittedRes, body)).toBe(true);
  });

  it("CE5d: araçsız istekte degrade edilir", () => {
    expect(shouldDegradeNativeResponsesForContext(baseCtx, degradableErr, uncommittedRes, { model: "gpt-5.5", input: "x" })).toBe(true);
  });

  it("CE5e: gövde verilmezse bugünkü davranış korunur (preservation)", () => {
    expect(shouldDegradeNativeResponsesForContext(baseCtx, degradableErr, uncommittedRes)).toBe(true);
  });

  it("CE5f: kayıplı araç olsa bile spark ve headersSent kuralları önce gelir", () => {
    const body = { model: "gpt-5.5", input: "x", tools: [{ type: "custom", name: "apply_patch" }] };
    const sparkCtx = { ...baseCtx, relabelResponseTo: "GPT-5.4", relabelSource: "spark" as const };
    expect(shouldDegradeNativeResponsesForContext(sparkCtx, degradableErr, uncommittedRes, body)).toBe(false);
    expect(shouldDegradeNativeResponsesForContext(baseCtx, degradableErr, { headersSent: true }, body)).toBe(false);
    // Degrade edilemez statü (429) + kayıpsız araç → yine false
    expect(shouldDegradeNativeResponsesForContext(baseCtx, { status: 429 }, uncommittedRes, { model: "gpt-5.5" })).toBe(false);
  });
});
