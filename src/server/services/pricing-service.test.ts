import { describe, it, expect, vi, beforeEach } from "vitest";
import { computePrice, type PricingConfig } from "../../pricing.js";
import type { MasterModel } from "../../master-models.js";

const baseCfg: PricingConfig = {
  kur: 50,
  liveKur: 48,
  kurBuffer: 0.04,
  textBillingRatio: 0.9,
  textCarpan: 3.0,
  imageCarpan: 3.0,
  videoCarpan: 3.0,
};

function sellKur(cfg: PricingConfig): number {
  return cfg.liveKur * (1 + cfg.kurBuffer);
}

describe("computePrice — text model", () => {
  const model: MasterModel = {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    type: "Metin",
    context: "128K",
    endpoints: ["chat"],
    providerInputUsd: 5,   // per 1M tokens
    providerOutputUsd: 15,
  };

  it("applies textBillingRatio and textCarpan to input", () => {
    const result = computePrice(model, baseCfg);
    const expectedInputUsd = (5 / baseCfg.textBillingRatio) * baseCfg.textCarpan;
    expect(result.input?.usd).toBeCloseTo(expectedInputUsd, 6);
  });

  it("converts input to TL using sell kur", () => {
    const result = computePrice(model, baseCfg);
    const expectedInputUsd = (5 / baseCfg.textBillingRatio) * baseCfg.textCarpan;
    const expectedTL = expectedInputUsd * sellKur(baseCfg);
    expect(result.input?.tl).toBeCloseTo(expectedTL, 6);
  });

  it("TL changes with different kur buffer — billingRatio independent", () => {
    const cfg2 = { ...baseCfg, kurBuffer: 0.1 };
    const r1 = computePrice(model, baseCfg);
    const r2 = computePrice(model, cfg2);
    expect(r2.input!.tl).toBeGreaterThan(r1.input!.tl);
    // USD should be the same — kur doesn't affect USD
    expect(r2.input!.usd).toBeCloseTo(r1.input!.usd, 6);
  });

  it("textBillingRatio=1 yields base carpan pricing", () => {
    const cfg = { ...baseCfg, textBillingRatio: 1.0 };
    const result = computePrice(model, cfg);
    expect(result.input?.usd).toBeCloseTo(5 * cfg.textCarpan, 6);
  });

  it("returns unit '1M token'", () => {
    expect(computePrice(model, baseCfg).unit).toBe("1M token");
  });
});

describe("computePrice — image model", () => {
  const model: MasterModel = {
    id: "dall-e-3",
    name: "DALL-E 3",
    provider: "openai",
    type: "Görsel",
    context: "-",
    endpoints: ["images"],
    providerImageInputUsd: 0.04,
    providerImageOutputUsd: 0.08,
  };

  it("applies imageCarpan to input price", () => {
    const result = computePrice(model, baseCfg);
    const expectedUsd = model.providerImageInputUsd! * baseCfg.imageCarpan;
    expect(result.input?.usd).toBeCloseTo(expectedUsd, 6);
  });

  it("applies imageCarpan to output price", () => {
    const result = computePrice(model, baseCfg);
    const expectedUsd = model.providerImageOutputUsd! * baseCfg.imageCarpan;
    expect(result.output?.usd).toBeCloseTo(expectedUsd, 6);
  });

  it("textBillingRatio does NOT affect image pricing", () => {
    const cfg1 = { ...baseCfg, textBillingRatio: 0.5 };
    const cfg2 = { ...baseCfg, textBillingRatio: 1.0 };
    const r1 = computePrice(model, cfg1);
    const r2 = computePrice(model, cfg2);
    expect(r1.input?.usd).toBeCloseTo(r2.input!.usd, 6);
  });

  it("returns unit 'image'", () => {
    expect(computePrice(model, baseCfg).unit).toBe("image");
  });
});

describe("computePrice — video model", () => {
  const model: MasterModel = {
    id: "veo-2",
    name: "Veo 2",
    provider: "google",
    type: "Video",
    context: "-",
    endpoints: ["video"],
    providerPerSecond: {
      default: 0.01,
      "480p": 0.005,
      "720p": 0.01,
      "1080p": 0.02,
    },
  };

  it("computes TL per-resolution using videoCarpan and sellKur", () => {
    const result = computePrice(model, baseCfg);
    const expectedDefaultUsd = 0.01 * baseCfg.videoCarpan;
    expect(result.perResolution?.default?.usd).toBeCloseTo(expectedDefaultUsd, 6);
  });

  it("textBillingRatio does NOT affect video pricing", () => {
    const cfg1 = { ...baseCfg, textBillingRatio: 0.5 };
    const cfg2 = { ...baseCfg, textBillingRatio: 1.0 };
    const r1 = computePrice(model, cfg1);
    const r2 = computePrice(model, cfg2);
    expect(r1.perResolution?.["720p"]?.usd).toBeCloseTo(r2.perResolution?.["720p"]?.usd!, 6);
  });

  it("returns unit 'sec'", () => {
    expect(computePrice(model, baseCfg).unit).toBe("sec");
  });
});
