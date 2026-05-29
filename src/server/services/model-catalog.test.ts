import { describe, expect, it } from "vitest";
import { MASTER_MODELS, canonicalizeModelId } from "../../master-models.js";

describe("MASTER_MODELS — Claude Popusk text catalog", () => {
  it("contains only customer-facing text models", () => {
    expect(MASTER_MODELS).toHaveLength(42);
    expect(MASTER_MODELS.every((model) => model.type === "Metin")).toBe(true);
    expect(MASTER_MODELS.every((model) => model.pricingUnit === "usd_per_million_tokens")).toBe(true);
    expect(MASTER_MODELS.every((model) => model.inputModalities?.includes("text"))).toBe(true);
    expect(MASTER_MODELS.every((model) => model.outputModalities?.includes("text"))).toBe(true);
    expect(MASTER_MODELS.every((model) => model.endpoints.includes("chat"))).toBe(true);
  });

  it("keeps canonical public ids unprefixed while accepting legacy aliases", () => {
    expect(MASTER_MODELS.map((model) => model.id).join("\n")).not.toMatch(/\//);
    expect(canonicalizeModelId("anthropic/claude-opus-4.7")).toBe("claude-opus-4-7");
    expect(canonicalizeModelId("openai/gpt-5.4-mini")).toBe("gpt-5.4-mini");
    expect(canonicalizeModelId("google/gemini-3.1-pro-preview")).toBe("gemini-3.1-pro-preview");
  });

  it("uses the approved customer-facing price tiers", () => {
    const byId = new Map(MASTER_MODELS.map((model) => [model.id, model]));

    expect(byId.get("claude-haiku-4-5-20251001")?.customerInputUsd).toBe(0.62);
    expect(byId.get("gemini-3-flash-preview")?.customerInputUsd).toBe(0.69);
    expect(byId.get("gemini-3-pro-preview")?.customerInputUsd).toBe(0.69);
    expect(byId.get("gemini-3.1-pro-preview")?.customerInputUsd).toBe(0.85);
    expect(byId.get("gemini-3.1-pro-preview-customtools")?.customerInputUsd).toBe(0.85);
    expect(byId.get("o3-mini")?.customerInputUsd).toBe(0.68);
    expect(byId.get("o4-mini")?.customerInputUsd).toBe(0.72);
    expect(byId.get("o3")?.customerInputUsd).toBe(0.75);
    expect(byId.get("gpt-5-nano")?.customerInputUsd).toBe(0.62);
    expect(byId.get("gpt-5-mini")?.customerInputUsd).toBe(0.64);
    expect(byId.get("gpt-5-chat-latest")?.customerInputUsd).toBe(0.65);
    expect(byId.get("gpt-5-search-api")?.customerInputUsd).toBe(0.66);
    expect(byId.get("gpt-5")?.customerInputUsd).toBe(0.69);
    expect(byId.get("gpt-5.1")?.customerInputUsd).toBe(0.72);
    expect(byId.get("gpt-5.2")?.customerInputUsd).toBe(0.75);
    expect(byId.get("gpt-5.3-chat-latest")?.customerInputUsd).toBe(0.8);
    expect(byId.get("gpt-5.4")?.customerInputUsd).toBe(1);
    expect(byId.get("gpt-5.4-mini")?.customerInputUsd).toBe(0.9);
    expect(byId.get("gpt-5.4-nano")?.customerInputUsd).toBe(0.85);
    expect(byId.get("claude-opus-4-7")?.customerInputUsd).toBe(1.2);
    expect(byId.get("gpt-5.5")?.customerInputUsd).toBe(1.15);
  });

  it("orders the public catalog by cheapest tier first, then older/cheaper model families", () => {
    expect(MASTER_MODELS.map((model) => model.id)).toEqual([
      "claude-sonnet-4-20250514",
      "claude-opus-4-1-20250805",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
      "claude-opus-4-5-20251101",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "gemini-3-flash-preview",
      "gemini-3-pro-preview",
      "gemini-3.1-pro-preview",
      "gemini-3.1-pro-preview-customtools",
      "o3-mini-2025-01-31",
      "o3-mini",
      "o3-2025-04-16",
      "o3",
      "o4-mini-2025-04-16",
      "o4-mini",
      "gpt-5-2025-08-07",
      "gpt-5",
      "gpt-5-mini-2025-08-07",
      "gpt-5-mini",
      "gpt-5-nano-2025-08-07",
      "gpt-5-nano",
      "gpt-5-search-api-2025-10-14",
      "gpt-5-search-api",
      "gpt-5-chat-latest",
      "gpt-5.1-2025-11-13",
      "gpt-5.1",
      "gpt-5.1-chat-latest",
      "gpt-5.2-2025-12-11",
      "gpt-5.2",
      "gpt-5.2-chat-latest",
      "gpt-5.3-chat-latest",
      "gpt-5.4-2026-03-05",
      "gpt-5.4",
      "gpt-5.4-mini-2026-03-17",
      "gpt-5.4-mini",
      "gpt-5.4-nano-2026-03-17",
      "gpt-5.4-nano",
      "claude-opus-4-7",
      "gpt-5.5",
      "gpt-5.5-2026-04-23",
    ]);

    expect(MASTER_MODELS.at(-1)?.id).toBe("gpt-5.5-2026-04-23");
  });

  it("does not keep active image or video models in the public catalog", () => {
    const serializedIds = MASTER_MODELS.map((model) => `${model.id} ${model.name} ${model.type}`).join("\n");

    expect(serializedIds).not.toMatch(/dall|imagen|seedance|veo|kling|image|video|görsel/i);
  });
});
