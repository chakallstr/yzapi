// Token-havuz oran tablosu — TEK KAYNAK. Hem satış fiyatlaması (package-purchase-service:
// poolPriceUsd) hem havuz-drain cache-read indirimi (entitlement-service: drainTokenPool)
// buradan okur. LEAF modül (başka modül import ETMEZ) → package-purchase ↔ entitlement
// circular-import'una girmeden iki taraf da güvenle kullanır.

/** Model id'yi form-bağımsız yap (nokta↔tire): `gpt-5.6-sol`/`claude-opus-4.8` ikizleri aynı anahtara düşer. */
export const normPoolId = (id: string): string => id.toLowerCase().replace(/\./g, "-");

/**
 * Havuz oran tablosu ($/M token, premium modele göre). Anahtarlar norm'lu.
 * Claude: Fable $0.60/M; Opus + Standart(sonnet) $0.50/M (Ufuk 2026-07-10: Opus 10M/1g = $5).
 * GPT   : 5.6 tier'ları $0.70/M; gpt-5.5 $0.50/M (Ufuk 2026-07-10).
 * Tabloda olmayan her premium model varsayılan $0.50/M.
 */
export const POOL_RATE_USD_PER_M: Record<string, number> = {
  "claude-fable-5": 0.6,
  "gpt-5-6-sol": 0.7,
  "gpt-5-6-terra": 0.7,
  "gpt-5-6-luna": 0.7,
};
export const POOL_DEFAULT_RATE_USD_PER_M = 0.5;

export function poolRateUsdPerM(premiumModelId: string | null | undefined): number {
  if (!premiumModelId) return POOL_DEFAULT_RATE_USD_PER_M;
  return POOL_RATE_USD_PER_M[normPoolId(premiumModelId)] ?? POOL_DEFAULT_RATE_USD_PER_M;
}

/** Cache-read düz fiyatı (USD/1M) — PAYG billing-service.ts CACHE_READ_USD_PER_M ile AYNI ($0.06). */
export const POOL_CACHE_READ_USD_PER_M = 0.06;

/**
 * Havuz cache-read tüketim ağırlığı. Premium token (weight 1.0) = poolRate $/M değerinde tüketir;
 * cache-read'i $0.06/M yapmak için ağırlık = 0.06 / poolRate:
 *   opus/standart $0.50/M → 0.12 · fable $0.60/M → 0.10 · gpt-5.6 $0.70/M → ~0.0857.
 * Servis edilen modelin premium/secondary weight'inden BAĞIMSIZDIR (cache cache'tir). poolRate<=0 → 0.
 */
export function poolCacheWeight(premiumModelId: string | null | undefined): number {
  const rate = poolRateUsdPerM(premiumModelId);
  if (!(rate > 0)) return 0;
  return Math.round((POOL_CACHE_READ_USD_PER_M / rate) * 1e6) / 1e6;
}

/**
 * Havuzdan düşülecek token miktarı (PÜR — DB'siz test edilebilir). tokensRaw = girdi+çıktı (ham).
 * Cache-read alt kümesi (girdinin parçası) ayrılıp cacheWeight ile, gerisi weight ile tüketilir.
 * cacheWeight verilmezse (undefined) → weight'e düşer = ESKİ davranış (tam fiyat), güvenli varsayılan:
 * bir çağrı yeri cacheWeight iletmeyi atlarsa cache BEDAVA olmaz, tam fiyattan tüketir.
 */
export function poolDrainAmount(
  tokensRaw: number,
  weight: number,
  cacheReadTokens = 0,
  cacheWeight?: number,
): number {
  const cw = cacheWeight == null ? weight : cacheWeight;
  const cache = Math.max(0, Math.min(cacheReadTokens, tokensRaw));
  const normal = tokensRaw - cache;
  return Math.max(0, Math.round((normal * weight + cache * cw) * 100) / 100);
}
