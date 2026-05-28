import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MASTER_MODELS, canonicalizeModelId } from "./master-models.js";
import { computePrice } from "./pricing.js";

const pricingCfg = {
  kur: 47,
  liveKur: 47,
  kurBuffer: 0,
  textBillingRatio: 0.9,
  textCarpan: 3,
  imageCarpan: 3,
  videoCarpan: 3,
};

describe("Claude Popusk migration contract", () => {
  it("keeps the active catalog text-only and aligned with Claude Popusk docs", () => {
    expect(MASTER_MODELS).toHaveLength(42);
    expect(MASTER_MODELS.every((model) => model.type === "Metin")).toBe(true);
    expect(MASTER_MODELS.every((model) => model.pricingUnit === "usd_per_million_tokens")).toBe(true);
    expect(MASTER_MODELS.map((model) => model.id)).toContain("claude-opus-4-7");
    expect(MASTER_MODELS.map((model) => model.id)).toContain("gpt-5.5");
    expect(MASTER_MODELS.map((model) => model.id)).toContain("gpt-5.4-mini");
    expect(MASTER_MODELS.map((model) => model.id)).toContain("gemini-3.1-pro-preview");
    expect(MASTER_MODELS.map((model) => model.id).join("\n")).not.toMatch(/dall-e|image|video|seedance|veo|kling|\//i);
  });

  it("maps legacy provider-prefixed ids to canonical Claude Popusk ids", () => {
    expect(canonicalizeModelId("anthropic/claude-opus-4.7")).toBe("claude-opus-4-7");
    expect(canonicalizeModelId("anthropic/claude-opus-4-7")).toBe("claude-opus-4-7");
    expect(canonicalizeModelId("openai/gpt-5.4-mini")).toBe("gpt-5.4-mini");
    expect(canonicalizeModelId("google/gemini-3.1-pro-preview")).toBe("gemini-3.1-pro-preview");
  });

  it("uses customer-facing text prices without exposing internal normalization", () => {
    const byId = new Map(MASTER_MODELS.map((model) => [model.id, model]));

    expect(computePrice(byId.get("claude-haiku-4-5-20251001")!, pricingCfg).input?.usd).toBeCloseTo(0.62, 6);
    expect(computePrice(byId.get("gpt-5.4")!, pricingCfg).input?.usd).toBeCloseTo(1.0, 6);
    expect(computePrice(byId.get("claude-opus-4-7")!, pricingCfg).input?.usd).toBeCloseTo(1.2, 6);
    expect(computePrice(byId.get("gpt-5.5")!, pricingCfg).input?.usd).toBeCloseTo(1.2, 6);
  });

  it("keeps frontend model ordering and prices in parity with the backend catalog", () => {
    const frontendSource = readFileSync("src/yapayzekalab/shared.jsx", "utf8");
    const displayOrderMatch = frontendSource.match(/const MODEL_DISPLAY_ORDER = \[([\s\S]*?)\];/);
    const frontendDisplayOrder = [...(displayOrderMatch?.[1] ?? "").matchAll(/'([^']+)'/g)].map((match) => match[1]);
    const frontendPrices = new Map(
      [...frontendSource.matchAll(/\{\s*id: '([^']+)'[\s\S]*?input: ([0-9.]+), output: ([0-9.]+)/g)].map((match) => [
        match[1],
        { input: Number(match[2]), output: Number(match[3]) },
      ]),
    );

    expect(frontendDisplayOrder).toEqual(MASTER_MODELS.map((model) => model.id));

    for (const model of MASTER_MODELS) {
      expect(frontendPrices.get(model.id)).toEqual({
        input: model.customerInputUsd,
        output: model.customerOutputUsd,
      });
    }
  });

  it("keeps upstream secrets and internal billing details out of public-facing sources", () => {
    const publicSource = [
      "src/yapayzekalab/shared.jsx",
      "src/yapayzekalab/tab-home.jsx",
      "src/yapayzekalab/tab-models.jsx",
      "src/server/routes/v1-catalog.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(publicSource).not.toContain("api.claude-popusk.shop");
    expect(publicSource).not.toMatch(/textBillingRatio|billingRatio|900k|900K|0\.9\s*token/i);
    expect(publicSource).not.toMatch(/providerInputUsd|providerOutputUsd/);
  });
});
