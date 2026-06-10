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
