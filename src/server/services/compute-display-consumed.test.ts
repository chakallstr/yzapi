import { describe, it, expect } from "vitest";
import { computeDisplayConsumed } from "./entitlement-service.js";

// Panel "kullanılan" hesabı: CF paketinde CF mirror bayatlasa bile gerçek başarılı istek sayısıyla hizalanır.
describe("computeDisplayConsumed", () => {
  it("non-CF package (cfUnitsOrdered=0) → returns requests_today (eski davranış korunur)", () => {
    expect(computeDisplayConsumed(50, 0, null, 30, 0)).toBe(30);
    expect(computeDisplayConsumed(50, 0, null, 50, 999)).toBe(50); // başarı sayısı CF dışına etki etmez
  });

  it("CF mirror FRESH, düşük kullanım → CF-bazlı tüketim (CF otoritesi)", () => {
    // ordered=200, cf_remaining=50 → cfConsumed=150; başarı=30 → max(150,30)=150
    expect(computeDisplayConsumed(200, 200, 50, 0, 30)).toBe(150);
  });

  it("CF mirror STALE/donuk (cf_remaining=ordered → cfConsumed=0) → başarı sayısı kullanılır (BUG FIX)", () => {
    // 234 başarı, mirror donuk → 0 yerine min(120,234)=120 göster
    expect(computeDisplayConsumed(120, 120, 120, 0, 234)).toBe(120);
  });

  it("CF mirror NULL (hiç kurulmadı) → başarı sayısı kullanılır, limite kırpılır", () => {
    expect(computeDisplayConsumed(100, 100, null, 0, 106)).toBe(100);
    expect(computeDisplayConsumed(100, 100, null, 0, 40)).toBe(40);
  });

  it("CF gerçekten kullanılmamış (0 başarı, mirror NULL) → 0 (yanlış 'dolu kullanıldı' göstermez)", () => {
    expect(computeDisplayConsumed(100, 100, null, 0, 0)).toBe(0);
  });

  it("CF mirror tüketimi başarı sayısından FAZLA → CF'ye güven (max)", () => {
    // cf_remaining=50 → cfConsumed=150 > başarı 30 → 150
    expect(computeDisplayConsumed(200, 200, 50, 0, 30)).toBe(150);
  });

  it("asla limiti aşmaz (clamp)", () => {
    expect(computeDisplayConsumed(120, 120, 0, 0, 9999)).toBe(120);
  });
});
