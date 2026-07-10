import type { ActiveEntitlement } from "./entitlement-service.js";

// GET /v1/usage müşteri-görünür kota yükü (API-key authlı; requests_today ile AYNI hesap).
export interface UsagePayload {
  object: "usage";
  /** Aktif paketlerdeki bugün kalan istek toplamı (paneldeki "kalan" ile AYNI hesap). */
  remaining_requests_today: number;
  daily_limit_total: number;
  used_today: number;
  packages: Array<{
    name: string;
    category: string;
    daily_limit: number;
    used_today: number;
    remaining_today: number;
    expires_at: string;
  }>;
  balance: { tl: string; usd: string };
}

/**
 * `listUserEntitlements` sonucunu API'ye dönülecek müşteri-görünür yüke çevirir.
 * SIZINTI-GUARD: yalnız ad/kategori/limit/kalan/tarih; sağlayıcı adı, CF slug/cf_remaining
 * içi, entitlement/paket id'si, allowedModels, maliyet/çarpan ASLA dahil edilmez.
 * (`cfRemaining` alanı bilinçli olarak dışarıda bırakılır — müşteriye "kalan istek"
 * zaten `remaining_today` olarak gösterilir.)
 */
export function buildUsagePayload(
  entitlements: ActiveEntitlement[],
  balance: { remainingTL: number; remainingUSD: number },
): UsagePayload {
  const packages = entitlements.map((e) => ({
    name: e.paketAdi,
    category: e.kategori,
    daily_limit: e.gunlukLimit,
    used_today: e.kullanilanBugun,
    remaining_today: e.kalanBugun,
    expires_at: e.expiresAt,
  }));
  return {
    object: "usage",
    remaining_requests_today: packages.reduce((s, p) => s + p.remaining_today, 0),
    daily_limit_total: packages.reduce((s, p) => s + p.daily_limit, 0),
    used_today: packages.reduce((s, p) => s + p.used_today, 0),
    packages,
    balance: { tl: balance.remainingTL.toFixed(2), usd: balance.remainingUSD.toFixed(4) },
  };
}
