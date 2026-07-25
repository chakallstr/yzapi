// CF (CodeFast) çarpanı — ADMIN/İÇ GÖRÜNÜM İÇİN (müşteri görmez, billing/gate ETKİLENMEZ).
//
// Neden: CF her isteği MODELE göre farklı ÜNİTE sayar. Bizim istek sayacımız (1 istek=1) ile
// CF'nin ünite sayısı tutmuyordu → admin panel CF'den farklı sayı gösteriyor, müşteri kafası
// karışıyordu. Bu çarpan, admin görünümünde istek sayısını CF-ünitesine çevirip "CF'deki gibi"
// aynı sayıya ulaşmak için kullanılır. SALT-GÖSTERİM (canlı hesaplanır, hiçbir yere yazılmaz).
//
// Çarpan MODEL bazlıdır (api_slug DEĞİL — codex-api paketi hem gpt-5.4 hem gpt-5.5 servis eder,
// CF her modeli farklı sayar; tek slug-çarpanı yanlış olurdu):
//   gpt-5.5 → 1.5 ünite/istek
//   gpt-5.4 → 1.0 ünite/istek
//   diğer/bilinmeyen → 1.0 (çevrim no-op)
// Kaynak: Ufuk kararı (2026-06-24) + cf_usage_ledger.cost_units gözlemi (codex-api %91.8'i 1.5).
// CF fiyatı değişirse buradan ayarlanır.
export const CF_MODEL_UNIT_MULTIPLIERS: Record<string, number> = {
  "gpt-5.5": 1.5,
  "gpt-5.4": 1.0,
};

export const DEFAULT_CF_UNIT_MULTIPLIER = 1.0;

/** model id → CF ünite çarpanı (bilinmeyen/boş → 1.0, yani çevrim no-op). */
export function cfModelUnitMultiplier(modelId: string | null | undefined): number {
  if (!modelId) return DEFAULT_CF_UNIT_MULTIPLIER;
  return CF_MODEL_UNIT_MULTIPLIERS[modelId] ?? DEFAULT_CF_UNIT_MULTIPLIER;
}

/** Model-bazlı istek dağılımını CF-ünite toplamına çevirir: Σ count[model] × çarpan[model].
 *  CF'nin gösterdiği sayıya ulaşmak için (per-model gerçek maliyet). Geçersiz girdi → 0. Never throws. */
export function requestsToCfUnits(
  modelCounts: Array<{ modelId: string | null; count: number }> | null | undefined,
): number {
  if (!Array.isArray(modelCounts)) return 0;
  let total = 0;
  for (const m of modelCounts) {
    const c = Number(m?.count);
    if (!Number.isFinite(c) || c <= 0) continue;
    total += c * cfModelUnitMultiplier(m?.modelId);
  }
  return Math.round(total * 100) / 100;
}
