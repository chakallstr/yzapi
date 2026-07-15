import { describe, it, expect } from "vitest";
import { BUILDER_MARKUP, roundClean, computeCustomPrice, limitStepError } from "./custom-package-pricing.js";

describe("limitStepError — adım kuralı (min600, 50'şer)", () => {
  it("geçerli değerler null döner", () => {
    expect(limitStepError(600)).toBeNull();
    expect(limitStepError(650)).toBeNull();
    expect(limitStepError(1000)).toBeNull();
    expect(limitStepError(2000)).toBeNull();
    expect(limitStepError(5000)).toBeNull();
  });
  it("600 altı reddedilir", () => {
    expect(limitStepError(50)).not.toBeNull();
    expect(limitStepError(500)).not.toBeNull();
    expect(limitStepError(599)).not.toBeNull();
    expect(limitStepError(0)).not.toBeNull();
  });
  it("50'nin katı değilse reddedilir", () => {
    expect(limitStepError(625)).not.toBeNull();
    expect(limitStepError(1001)).not.toBeNull();
    expect(limitStepError(601)).not.toBeNull();
  });
});

describe("BUILDER_MARKUP — sabit 2.5× (139 TL / 500 istek çıpası)", () => {
  it("sabit 2.5 döner", () => {
    expect(BUILDER_MARKUP).toBe(2.5);
  });
  it("Codex çıpası: 0.1112×500×1×2.5 = 139", () => {
    expect(roundClean(0.1112 * 500 * 1 * BUILDER_MARKUP)).toBe(140);
  });
});

describe("roundClean — pazarlama yuvarlaması", () => {
  it("<200 → 10'a", () => { expect(roundClean(8.6)).toBe(10); expect(roundClean(143)).toBe(140); });
  it("<2000 → 25'e", () => { expect(roundClean(1125)).toBe(1125); expect(roundClean(1810)).toBe(1800); });
  it("≥2000 → 50'ye", () => { expect(roundClean(2587.5)).toBe(2600); expect(roundClean(7038)).toBe(7050); });
});

describe("computeCustomPrice", () => {
  it("istek: geliş × hacim-marj (codex 500/30g)", () => {
    // geliş = 0.069×500×30 = 1035; marj(500)=2.5; 2587.5 → 2600
    expect(computeCustomPrice({ unitCostTl: 0.069, limit: 500, days: 30, birimTipi: "istek" }).fiyatTL).toBe(2600);
  });
  it("istek: 1000 limit sabit 2.5× (hacim indirimi yok)", () => {
    // 0.030×1000×30=900; 2.5×; 2250 → 2250
    expect(computeCustomPrice({ unitCostTl: 0.030, limit: 1000, days: 30, birimTipi: "istek" }).fiyatTL).toBe(2250);
  });
  it("lifetime: gün çarpanı YOK", () => {
    // 0.9×500=450; marj(500)=2.5; 1125
    expect(computeCustomPrice({ unitCostTl: 0.9, limit: 500, days: 30, birimTipi: "lifetime" }).fiyatTL).toBe(1125);
  });
  it("sabit (NVIDIA, maliyet 0): override × limit × gün, marj YOK", () => {
    // 0.025×1000×30 = 750
    expect(computeCustomPrice({ unitCostTl: 0, limit: 1000, days: 30, birimTipi: "sabit", birimSatisOverrideTl: 0.025 }).fiyatTL).toBe(750);
  });
  it("kredi (görsel): istek gibi hacim-marj", () => {
    // gpt-image-2: 0.45×80×30=1080; marj(80)=2.5; 2700
    expect(computeCustomPrice({ unitCostTl: 0.45, limit: 80, days: 30, birimTipi: "kredi" }).fiyatTL).toBe(2700);
  });
  it("küçük paket (geçerli min 600/1g codex)", () => {
    // 0.069×600×1=41.4; marj(600)=2.4; 99.36 → 100
    expect(computeCustomPrice({ unitCostTl: 0.069, limit: 600, days: 1, birimTipi: "istek" }).fiyatTL).toBe(100);
  });
  it("sabit'te override yoksa 0 (güvenli)", () => {
    expect(computeCustomPrice({ unitCostTl: 0, limit: 1000, days: 30, birimTipi: "sabit" }).fiyatTL).toBe(0);
  });
});
