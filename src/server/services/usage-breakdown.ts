// Müşteri kullanım geçmişi için GÜVENLİ token kırılımı yardımcıları.
// raw_usage_json'dan YALNIZ sayısal token alanlarını okur; ham JSON'u (sağlayıcı
// adı / base_url / maliyet / çarpan içerebilir) ASLA dışarı vermez. Böylece
// upstream sızıntı riski sıfır kalır (DOKUNULMAZ: upstream no-leak).
//
// DOKUNULMAZ: Faturalama bu yardımcıları KULLANMAZ — yalnız gösterim kırılımı.
// Billing input_usage'ı zaten cache'i içerir (closerouter normalize); buradaki
// hesaplar money-flow'a dokunmaz.

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

// Anthropic şeması: cache_read_input_tokens / cache_creation_input_tokens.
// OpenAI şeması: prompt_tokens_details.cached_tokens (cache-read alt kümesi).
export function extractUsageBreakdown(raw: unknown): {
  cacheReadTokens: number;
  cacheCreateTokens: number;
} {
  if (!raw || typeof raw !== "object") {
    return { cacheReadTokens: 0, cacheCreateTokens: 0 };
  }
  const u = raw as Record<string, unknown>;
  const details = (u.prompt_tokens_details ?? null) as Record<string, unknown> | null;
  const cacheReadTokens =
    toNum(u.cache_read_input_tokens) ||
    toNum(details && typeof details === "object" ? details.cached_tokens : 0);
  const cacheCreateTokens = toNum(u.cache_creation_input_tokens);
  return { cacheReadTokens, cacheCreateTokens };
}

// GÖSTERİM DEĞİŞMEZİ: cache kalemleri faturalanan girişin ALT KÜMESİDİR; üç
// kırılım (base + cacheRead + cacheCreate) her zaman inputUsage'a toplanmalı.
// Bozuk upstream verisinde (cache > inputUsage) bu kırılmasın diye cache'i
// girişe clamp'ler ve base'i clamp'li değerlerden türetiriz. Sağlıklı veride
// (cache <= giriş) clamp no-op'tur. Frontend recordTokens ile birebir aynı mantık.
export function resolveTokenSplit(
  inputUsage: number,
  raw: unknown,
): { baseInputTokens: number; cacheReadTokens: number; cacheCreateTokens: number } {
  const input = toNum(inputUsage);
  const { cacheReadTokens: rawRead, cacheCreateTokens: rawCreate } = extractUsageBreakdown(raw);
  const cacheReadTokens = Math.max(0, Math.min(rawRead, input));
  const cacheCreateTokens = Math.max(0, Math.min(rawCreate, input - cacheReadTokens));
  const baseInputTokens = Math.max(0, input - cacheReadTokens - cacheCreateTokens);
  return { baseInputTokens, cacheReadTokens, cacheCreateTokens };
}
