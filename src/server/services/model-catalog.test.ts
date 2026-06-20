import { describe, expect, it } from "vitest";
import { MASTER_MODELS, canonicalizeModelId, modelRejectsSamplingParams } from "../../master-models.js";

describe("modelRejectsSamplingParams — Opus 4.7+/Fable reject temperature/top_p/top_k", () => {
  it("returns true for the rejecting family in both dash and dot forms", () => {
    for (const id of [
      "claude-opus-4-8", "claude-opus-4.8",
      "claude-opus-4-7", "claude-opus-4.7",
      "claude-fable-5", "claude-mythos-5",
    ]) {
      expect(modelRejectsSamplingParams(id)).toBe(true);
    }
  });

  it("returns false for models that still accept sampling params", () => {
    for (const id of [
      "claude-opus-4-6", "claude-opus-4.6",
      "claude-sonnet-4-6", "claude-sonnet-4.6",
      "claude-opus-4-5-20251101", "claude-haiku-4-5",
      "gpt-5.5", "gpt-5.4-mini", undefined as unknown as string,
    ]) {
      expect(modelRejectsSamplingParams(id)).toBe(false);
    }
  });
});

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

  it("accepts Claude Code / Anthropic-SDK dotted model ids (ANTHROPIC_MODEL) as aliases", () => {
    // Claude Code & opencode send the unprefixed dotted form (ANTHROPIC_MODEL),
    // e.g. claude-sonnet-4.6. These must canonicalize to our tire-form catalog id
    // so /v1/messages + /v1/chat/completions resolve them (otherwise 404).
    expect(canonicalizeModelId("claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
    expect(canonicalizeModelId("claude-opus-4.7")).toBe("claude-opus-4-7");
    expect(canonicalizeModelId("claude-opus-4.6")).toBe("claude-opus-4-6");
    // gpt/gemini families already use the dotted form as their canonical id.
    expect(canonicalizeModelId("gpt-5.4")).toBe("gpt-5.4");
    expect(canonicalizeModelId("gemini-3.1-pro-preview")).toBe("gemini-3.1-pro-preview");
  });

  it("strips Claude Code 1M-context [..] suffix before resolving (claude-sonnet-4-6[1m] → claude-sonnet-4-6)", () => {
    // Claude Code, bir modeli 1M context'li gördüğünde wire-name'e "[1m]" ekler
    // (claude-code Issue #25022). Kanonik katalog ID'leri bu eki taşımaz → eki
    // ayıkla, sonra alias çöz. Aksi halde /v1/chat/completions + /v1/messages 404.
    expect(canonicalizeModelId("claude-sonnet-4-6[1m]")).toBe("claude-sonnet-4-6");
    expect(canonicalizeModelId("claude-opus-4-7[1m]")).toBe("claude-opus-4-7");
    // Nokta-form + suffix birlikte: önce ayıkla, sonra dotted-alias çöz.
    expect(canonicalizeModelId("claude-sonnet-4.6[1m]")).toBe("claude-sonnet-4-6");
    // Eklentisiz ID hiç değişmez (tam geriye-uyumlu).
    expect(canonicalizeModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(canonicalizeModelId("gpt-5.4")).toBe("gpt-5.4");
  });

  it("bridges added-model dash form to dotted catalog id (claude-opus-4-8[1m] → claude-opus-4.8)", () => {
    // opus 4.8 added_models katmanında NOKTA formuyla kayıtlı (alias yok). Claude
    // Code TİRE + [1m] gönderir. Strip + dash→dot köprüsü kanonik nokta-id'ye
    // çözmeli; aksi halde upstream'e tire gider ve 404 olur (canlı doğrulandı:
    // claude-opus-4.8=200, claude-opus-4-8=404).
    expect(canonicalizeModelId("claude-opus-4-8[1m]")).toBe("claude-opus-4.8");
    expect(canonicalizeModelId("claude-opus-4-8")).toBe("claude-opus-4.8");
    // Zaten nokta-form gelirse aynen kalır.
    expect(canonicalizeModelId("claude-opus-4.8")).toBe("claude-opus-4.8");
  });

  it("uses the approved customer-facing price tiers", () => {
    const byId = new Map(MASTER_MODELS.map((model) => [model.id, model]));

    expect(byId.get("claude-haiku-4-5-20251001")?.customerInputUsd).toBe(0.70);
    expect(byId.get("claude-opus-4-7")?.customerInputUsd).toBe(1.25);
    expect(byId.get("claude-opus-4-6")?.customerInputUsd).toBe(1.05);
    expect(byId.get("claude-sonnet-4-6")?.customerInputUsd).toBe(0.78);
    expect(byId.get("gemini-3-flash-preview")?.customerInputUsd).toBe(0.58);
    expect(byId.get("gemini-3-pro-preview")?.customerInputUsd).toBe(0.58);
    expect(byId.get("gemini-3.1-pro-preview")?.customerInputUsd).toBe(0.71);
    expect(byId.get("gemini-3.1-pro-preview-customtools")?.customerInputUsd).toBe(0.71);
    expect(byId.get("o3-mini")?.customerInputUsd).toBe(0.57);
    expect(byId.get("o4-mini")?.customerInputUsd).toBe(0.6);
    expect(byId.get("o3")?.customerInputUsd).toBe(0.63);
    expect(byId.get("gpt-5-nano")?.customerInputUsd).toBe(0.52);
    expect(byId.get("gpt-5-mini")?.customerInputUsd).toBe(0.53);
    expect(byId.get("gpt-5-chat-latest")?.customerInputUsd).toBe(0.54);
    expect(byId.get("gpt-5-search-api")?.customerInputUsd).toBe(0.55);
    expect(byId.get("gpt-5")?.customerInputUsd).toBe(0.58);
    expect(byId.get("gpt-5.1")?.customerInputUsd).toBe(0.6);
    expect(byId.get("gpt-5.2")?.customerInputUsd).toBe(0.63);
    expect(byId.get("gpt-5.3-chat-latest")?.customerInputUsd).toBe(0.67);
    expect(byId.get("gpt-5.4")?.customerInputUsd).toBe(0.83);
    expect(byId.get("gpt-5.4-mini")?.customerInputUsd).toBe(0.75);
    expect(byId.get("gpt-5.4-nano")?.customerInputUsd).toBe(0.71);
    expect(byId.get("gpt-5.5")?.customerInputUsd).toBe(0.96);
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
