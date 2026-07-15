/**
 * Paket-bazlı upstream override (Faz: GPT 5.5/5.4 paketleri).
 *
 * Paketin `provider_base_url` + `provider_api_key_cipher` alanları İKİSİ DE doluysa
 * o paket kapsamında (entitlement slotu rezerve edilmiş) istekler bu endpoint'e gider —
 * failover YOK (tek sağlayıcı zinciri). Alanlardan biri boş/NULL ya da key çözülemiyorsa
 * `null` döner ve istek normal per-model routing ile devam eder (istek ASLA kırılmaz).
 *
 * Doldurma admin panelden (POST /api/admin/packages/:id/provider) deploy gerektirmeden
 * yapılır; key provider_profiles ile aynı AES-256-GCM cipher'ıyla saklanır ve asla
 * düz metin geri dönmez.
 */
import { dbSql } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { encryptApiKey, decryptApiKey } from "./api-key-service.js";
import type { ProviderChain } from "./provider-config-service.js";

export interface PackageProviderSlot {
  packageId?: string;
  providerBaseUrl?: string | null;
  providerApiKeyCipher?: string | null;
}

/** Dolu + çözülebilir override → tek-sağlayıcılı zincir; aksi halde null (normal routing). */
export function packageOverrideChain(slot: PackageProviderSlot): ProviderChain | null {
  const baseUrl = (slot.providerBaseUrl ?? "").trim();
  const cipher = (slot.providerApiKeyCipher ?? "").trim();
  if (!baseUrl || !cipher) return null;
  const apiKey = decryptApiKey(cipher);
  if (!apiKey) return null; // çözülemeyen key → isteği kırma, normal routing'e düş
  return {
    primary: {
      profileId: `pkg:${slot.packageId ?? "unknown"}`,
      baseUrl,
      apiKey,
      modelMap: {}, // canonical model id verbatim gönderilir (closerouter deseni)
      source: { baseUrl: "db", apiKey: "db" },
    },
    fallback: null,
  };
}

export interface EntitlementProviderSlot {
  entitlementId?: string;
  cfApiSlug?: string | null;
  cfRcKeyCipher?: string | null;
}

/**
 * CodeFast slug → modelMap (yzapi-canonical → CF-wire id).
 * Yalnız yzapi id'si CF'nin beklediğinden FARKLI olan slug'lar için gerekir.
 * claude-api: yzapi tire/nokta + tarihli formlar → CF nokta formu (CF supported_models
 * canlı doğrulandı: claude-fable-5/opus-4.8/4.7/4.6, sonnet-4.6/4.5, haiku-4.5).
 * Diğer slug'lar (codex/glm/grok/…): yzapi id'si == CF wire (verbatim) → map gerekmez.
 * NOT: claude-api listesi CF'nin DESTEKLEDİĞİ modellerle SINIRLIDIR (CF katalog sınırı —
 * fable-5/opus-4.8/4.7/4.6, sonnet-4.6/4.5, haiku-4.5). opus-4.5/4.1/sonnet-4 gibi eski
 * modeller CF'de YOK → bilerek haritada değil; CF paketinin allowed_models'ına da konmamalı
 * (seed disiplini). Eksik sanıp ekleme.
 */
const CF_SLUG_MODEL_MAPS: Record<string, Record<string, string>> = {
  "claude-api": {
    "claude-opus-4.8": "claude-opus-4.8",
    "claude-opus-4-8": "claude-opus-4.8",
    "claude-opus-4.7": "claude-opus-4.7",
    "claude-opus-4-7": "claude-opus-4.7",
    "claude-opus-4.6": "claude-opus-4.6",
    "claude-opus-4-6": "claude-opus-4.6",
    "claude-sonnet-4.6": "claude-sonnet-4.6",
    "claude-sonnet-4-6": "claude-sonnet-4.6",
    "claude-sonnet-4.5": "claude-sonnet-4.5",
    "claude-sonnet-4-5-20250929": "claude-sonnet-4.5",
    "claude-haiku-4.5": "claude-haiku-4.5",
    "claude-haiku-4-5-20251001": "claude-haiku-4.5",
    "claude-fable-5": "claude-fable-5",
  },
};

export function cfModelMapForSlug(slug: string): Record<string, string> {
  return CF_SLUG_MODEL_MAPS[slug] ?? {};
}

/**
 * CodeFast müşteri-başına override zinciri: entitlement'ın cf_rc_live_ keyi + slug'ı
 * doluysa istek `<base>/proxy/<slug>` ucuna gider (örn /proxy/claude-api/v1/messages),
 * `Authorization: Bearer cf_rc_live_…` ile. Slug/key boş ya da key çözülemiyorsa null
 * (paket-override'a / normal routing'e düşülür). Tek sağlayıcı — failover YOK.
 * modelMap slug'a göre yzapi-canonical → CF-wire çevirir (claude tire↔nokta).
 */
// CF claude-api proxy'si isteğin gerçek Claude Code CLI'dan geldiğini doğrular:
// eksik User-Agent / x-app / anthropic-beta → 400 "Unsupported Claude Code version"
// veya "Invalid request". Bu header'ları CF claude-api slug'ı için zorunlu ekleriz.
// (cf-claude-proxy/8319'daki buildHeaders ile birebir — tek kaynak olarak buraya taşındı.)
const CF_CLAUDE_API_HEADERS: Record<string, string> = {
  "user-agent": "claude-cli/2.1.191 (external, sdk-cli)",
  "x-app": "cli",
  "anthropic-beta": "claude-code-20250219,interleaved-thinking-2025-05-14,thinking-token-count-2026-05-13,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advisor-tool-2026-03-01",
  "anthropic-dangerous-direct-browser-access": "true",
  "x-stainless-arch": "arm64",
  "x-stainless-lang": "js",
  "x-stainless-os": "MacOS",
  "x-stainless-package-version": "0.94.0",
  "x-stainless-retry-count": "0",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v22.0.0",
  "x-stainless-timeout": "600",
};

export function entitlementOverrideChain(slot: EntitlementProviderSlot, base: string): ProviderChain | null {
  const slug = (slot.cfApiSlug ?? "").trim();
  const cipher = (slot.cfRcKeyCipher ?? "").trim();
  if (!slug || !cipher) return null;
  const apiKey = decryptApiKey(cipher);
  if (!apiKey) return null;
  // CF reseller proxy ucu `/proxy/<slug>/v1/<endpoint>` bekler (örn /proxy/codex-api/v1/chat/completions);
  // upstream forward fn'leri (closerouter-service) baseUrl'e `/chat/completions` · `/responses` · `/messages`
  // ekler (BAŞTA /v1 YOK), normal provider base_url'lerinde /v1 zaten gömülü olduğu için. CF base'i
  // (reseller-api.codefast.app, /v1 YOK) için /v1'i burada eklemezsek CF 404 "Hata Oluştu" döner.
  const baseUrl = `${base.replace(/\/+$/, "")}/proxy/${slug}/v1`;
  return {
    primary: {
      profileId: `cf:${slot.entitlementId ?? "?"}`,
      baseUrl,
      apiKey,
      modelMap: cfModelMapForSlug(slug),
      source: { baseUrl: "db", apiKey: "db" },
      extraHeaders: slug === "claude-api" ? CF_CLAUDE_API_HEADERS : undefined,
    },
    fallback: null,
  };
}

export interface ProviderOverrideInput {
  /** "" veya null → temizle; dolu string → set. */
  providerBaseUrl?: string | null;
  /** undefined → dokunma; "" veya null → temizle; dolu string → şifrele + set. */
  providerApiKey?: string | null;
}

/** Admin: paketin upstream override alanlarını günceller. Var olmayan paket → false. */
export async function setPackageProviderOverride(
  packageId: string,
  input: ProviderOverrideInput,
): Promise<boolean> {
  const baseUrl =
    input.providerBaseUrl === undefined
      ? undefined
      : (input.providerBaseUrl ?? "").trim() || null;
  // upsertProviderProfile ile tutarlı: yalnız mutlak http(s) URL kabul edilir
  if (typeof baseUrl === "string") {
    let parsed: URL | null = null;
    try { parsed = new URL(baseUrl); } catch { parsed = null; }
    if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
      throw new AppError(400, "Geçersiz endpoint URL — mutlak http(s) URL girin (ör. https://api.ornek.com/v1)");
    }
  }
  const keyCipher =
    input.providerApiKey === undefined
      ? undefined
      : (input.providerApiKey ?? "").trim()
        ? encryptApiKey((input.providerApiKey as string).trim())
        : null;

  if (baseUrl === undefined && keyCipher === undefined) return true; // no-op

  const rows = await dbSql<{ id: string }[]>`
    UPDATE packages SET
      provider_base_url = CASE WHEN ${baseUrl !== undefined} THEN ${baseUrl ?? null} ELSE provider_base_url END,
      provider_api_key_cipher = CASE WHEN ${keyCipher !== undefined} THEN ${keyCipher ?? null} ELSE provider_api_key_cipher END,
      updated_at = now()
    WHERE id = ${packageId}
    RETURNING id
  `;
  return rows.length > 0;
}
