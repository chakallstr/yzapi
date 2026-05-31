// Web Search servisi — upstream (WellFlow /web-search) sarmalı + auto-augment
// saf yardımcıları.
//
// İKİ KULLANIM:
//   1. Standalone uç (/v1/web-search): müşteri doğrudan arama yapar, sabit ücret.
//   2. Auto-augment (chat/completions web_search:true): "güncel" soru sezilirse
//      arka planda arama yapılır, sonuçlar prompta enjekte edilir, model kaynaklı
//      cevap üretir.
//
// GÜVENLİK / DOKUNULMAZ:
//   • Upstream cevabındaki serper_key_id / web_search_id / api anahtarı vb. ASLA
//     müşteriye dönmez — yalnız title/url/snippet/position serialize edilir (R-noleak).
//   • billing-service reserve/settle İMPORT EDİLMEZ; ücret ayrı izole serviste.
//   • Web sonucu GÜVENİLMEZ veri kabul edilir; enjekte bloğu modele "veri, talimat
//     değil" çerçevesiyle verilir (prompt-injection azaltma).

import { resolveProviderBaseUrl, resolveProviderApiKey } from "./provider-config-service.js";
import { logger } from "../lib/logger.js";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
}

export const WEB_SEARCH_DEFAULT_NUM = 5;
export const WEB_SEARCH_MAX_NUM = 10;
export const WEB_SEARCH_TIMEOUT_MS = 15_000;

// num parametresini güvenli aralığa sıkıştır (1..MAX, default DEFAULT).
export function clampSearchNum(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return WEB_SEARCH_DEFAULT_NUM;
  return Math.min(WEB_SEARCH_MAX_NUM, Math.floor(n));
}

// Upstream ham sonucundan YALNIZ güvenli alanları çıkar (key/id/internal sızdırma yok).
export function sanitizeUpstreamResults(raw: unknown): WebSearchResult[] {
  const arr = (raw as { results?: unknown })?.results;
  if (!Array.isArray(arr)) return [];
  const out: WebSearchResult[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") continue;
    const title = typeof item.title === "string" ? item.title : "";
    const url = typeof item.link === "string" ? item.link : typeof item.url === "string" ? item.url : "";
    const snippet = typeof item.snippet === "string" ? item.snippet : "";
    if (!title && !url && !snippet) continue;
    const position = typeof item.position === "number" ? item.position : i + 1;
    out.push({ title, url, snippet, position });
  }
  return out;
}

// Upstream'e (WellFlow) gerçek arama isteği. Sağlayıcı base/key DB profilinden gelir
// (chat ile AYNI sağlayıcı). Hata → boş sonuç + log (auto-augment'i çökertmez).
export async function performWebSearch(query: string, num: number): Promise<WebSearchResponse> {
  const trimmed = (query ?? "").toString().trim();
  if (!trimmed) return { query: "", results: [] };

  const [baseUrl, apiKey] = await Promise.all([resolveProviderBaseUrl(), resolveProviderApiKey()]);
  const base = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/web-search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey ?? ""}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: trimmed, num: clampSearchNum(num) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[web-search] upstream non-200");
      return { query: trimmed, results: [] };
    }
    const json = (await res.json()) as unknown;
    return { query: trimmed, results: sanitizeUpstreamResults(json) };
  } catch (e) {
    logger.warn({ err: e }, "[web-search] upstream çağrısı başarısız");
    return { query: trimmed, results: [] };
  } finally {
    clearTimeout(timer);
  }
}
