import { describe, it, expect } from "vitest";
import { volumeMarkup, roundClean, computeCustomPrice } from "./custom-package-pricing.js";

describe("volumeMarkup(L) — hacim-kademeli marj", () => {
  it("L ≤ 500 → 2.5", () => {
    expect(volumeMarkup(50)).toBe(2.5);
    expect(volumeMarkup(500)).toBe(2.5);
  });
  it("500–1000 lineer 2.5→2.0", () => {
    expect(volumeMarkup(750)).toBeCloseTo(2.25, 5);
    expect(volumeMarkup(1000)).toBe(2.0);
  });
  it("1000–2000 lineer 2.0→1.7", () => {
    expect(volumeMarkup(1500)).toBeCloseTo(1.85, 5);
    expect(volumeMarkup(2000)).toBeCloseTo(1.7, 5);
  });
  it("L > 2000 → düşer ama taban 1.5", () => {
    expect(volumeMarkup(3000)).toBeCloseTo(1.6, 5);
    expect(volumeMarkup(4000)).toBe(1.5);
    expect(volumeMarkup(10000)).toBe(1.5);
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
  it("istek: 1000 limit düşük marj (2.0×)", () => {
    // 0.030×1000×30=900; marj(1000)=2.0; 1800
    expect(computeCustomPrice({ unitCostTl: 0.030, limit: 1000, days: 30, birimTipi: "istek" }).fiyatTL).toBe(1800);
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
  it("küçük 1 günlük paket min fiyat", () => {
    // 0.069×50×1=3.45; marj 2.5; 8.6 → 10
    expect(computeCustomPrice({ unitCostTl: 0.069, limit: 50, days: 1, birimTipi: "istek" }).fiyatTL).toBe(10);
  });
  it("sabit'te override yoksa 0 (güvenli)", () => {
    expect(computeCustomPrice({ unitCostTl: 0, limit: 1000, days: 30, birimTipi: "sabit" }).fiyatTL).toBe(0);
  });
});
