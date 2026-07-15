/**
 * Custom Package Builder — fiyat motoru (saf logic, DB'siz).
 *
 * Fiyat = geliş × hacim-kademeli marj. Geliş = cf_unit_cost_tl (TL/birim/gün; lifetime'da TL/birim)
 * × limit × gün. Marj limit büyüdükçe düşer (hacim indirimi). NVIDIA gibi maliyet-0 ürünlerde
 * marj yerine sabit birim-satış (birimSatisOverrideTl) kullanılır.
 *
 * ⚠️ Bu modülün ÇIKTISI yalnız final TL fiyattır — geliş/marj/maliyet ASLA frontend'e dönmez
 * (provider-leak kuralı). Route katmanı yalnız `fiyatTL` serialize eder.
 */

export type BirimTipi = "istek" | "kredi" | "lifetime" | "sabit";

/**
 * Builder sabit oran: 139 TL / 500 istek çıpasından türetilen 2.5×.
 * Hacim indirimi YOK — büyük/küçük her limitde aynı birim fiyat.
 */
export const BUILDER_MARKUP = 2.5;

/** Pazarlanabilir yuvarlama: <200 → 10'a, <2000 → 25'e, ≥2000 → 50'ye. */
export function roundClean(tl: number): number {
  if (tl <= 0) return 0;
  const step = tl < 200 ? 10 : tl < 2000 ? 25 : 50;
  return Math.round(tl / step) * step;
}

/**
 * Builder limit adım kuralı: min 600; 50'nin katı.
 * Geçerliyse null, değilse hata mesajı döner. (Lifetime/sabit dahil tüm builder ürünleri.)
 */
export function limitStepError(limit: number): string | null {
  if (!Number.isInteger(limit) || limit < 600) return "Limit en az 600 olmalı";
  if (limit % 50 !== 0) return "Limit 50'nin katı olmalı (600, 650, 700, ...)";
  return null;
}

export interface CustomPriceInput {
  unitCostTl: number;          // cf_unit_cost_tl
  limit: number;               // günlük limit (lifetime'da toplam bakiye limiti)
  days: number;                // süre (lifetime'da yok sayılır)
  birimTipi: BirimTipi;
  birimSatisOverrideTl?: number | null;  // maliyet-0 ürünler (sabit): birim-satış
}

/** Custom paket fiyatı (TL). Yalnız final fiyat döner — geliş/marj sızdırılmaz. */
export function computeCustomPrice(input: CustomPriceInput): { fiyatTL: number } {
  const { unitCostTl, limit, days, birimTipi, birimSatisOverrideTl } = input;

  if (birimTipi === "sabit") {
    // Maliyet 0 (ör. NVIDIA): sabit birim-satış × limit × gün, marj yok.
    const override = birimSatisOverrideTl ?? 0;
    return { fiyatTL: roundClean(override * limit * days) };
  }

  // Geliş: lifetime'da gün çarpanı yok.
  const gelis = birimTipi === "lifetime"
    ? unitCostTl * limit
    : unitCostTl * limit * days;

  return { fiyatTL: roundClean(gelis * BUILDER_MARKUP) };
}
