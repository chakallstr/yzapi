import { describe, expect, it } from "vitest";
import { CATALOG_PRICES, CATALOG_TIERS, computeCatalogDiff } from "./catalog-pricing.js";

describe("catalog-pricing", () => {
  it("maps Anthropic Opus 4.7/4.6 to official Fast-mode $30/$150", () => {
    expect(CATALOG_PRICES["claude-opus-4-7"]).toEqual({ in: 30, out: 150 });
    expect(CATALOG_PRICES["claude-opus-4-6"]).toEqual({ in: 30, out: 150 });
  });

  it("maps OpenAI GPT-5.5 to official $5/$30 and GPT-5 base to $1.25/$10", () => {
    expect(CATALOG_PRICES["gpt-5.5"]).toEqual({ in: 5, out: 30 });
    expect(CATALOG_PRICES["gpt-5.4"]).toEqual({ in: 2.5, out: 15 });
    expect(CATALOG_PRICES["gpt-5"]).toEqual({ in: 1.25, out: 10 });
  });

  it("maps Google Gemini Pro to $2/$12 and Flash to $0.50/$3", () => {
    expect(CATALOG_PRICES["gemini-3-pro-preview"]).toEqual({ in: 2, out: 12 });
    expect(CATALOG_PRICES["gemini-3-flash-preview"]).toEqual({ in: 0.5, out: 3 });
  });

  it("no duplicate ids across tiers", () => {
    const all = CATALOG_TIERS.flatMap((t) => t.ids);
    expect(new Set(all).size).toBe(all.length);
  });

  it("computes a positive discount when we are cheaper (opus, Fast mode catalog)", () => {
    // catalog total 180 (30+150 Fast mode), our flat 1.25/1.25 = 2.5 -> ~99%
    const diff = computeCatalogDiff({ id: "claude-opus-4-7", input: 1.25, output: 1.25 });
    expect(diff).not.toBeNull();
    expect(diff!.pct).toBe(99);
    expect(diff!.catIn).toBe(30);
    expect(diff!.catOut).toBe(150);
    expect(diff!.ourTotal).toBe(2.5);
  });

  it("returns null when WE are not cheaper (gpt-5-nano: catalog $0.45 < our flat)", () => {
    // nano catalog total 0.45; our flat 0.52/0.52 = 1.04 -> we're pricier -> hide
    expect(computeCatalogDiff({ id: "gpt-5-nano", input: 0.52, output: 0.52 })).toBeNull();
  });

  it("returns null for a model with no catalog entry", () => {
    expect(computeCatalogDiff({ id: "some-unknown-model-xyz", input: 1.1, output: 1.1 })).toBeNull();
  });

  it("returns null for non-finite / missing prices", () => {
    expect(computeCatalogDiff({ id: "claude-opus-4-7", input: NaN, output: 1 })).toBeNull();
    expect(computeCatalogDiff(null)).toBeNull();
    expect(computeCatalogDiff(undefined)).toBeNull();
  });

  it("equal totals are not shown (must be strictly cheaper)", () => {
    // craft a model whose total equals catalog total -> null
    expect(computeCatalogDiff({ id: "claude-haiku-4-5-20251001", input: 3, output: 3 })).toBeNull(); // 6 == 1+5
  });
});
