import { describe, expect, it } from "vitest";
import { extractUsageBreakdown } from "./user.js";

// Müşteri kullanım geçmişi için cache/context token kırılımının MATEMATİK
// doğruluğunu kilitler. Değişmez: base + cacheRead + cacheCreate = inputUsage,
// her bileşen ≥ 0. (DOKUNULMAZ: faturalama bu helper'ı KULLANMAZ; yalnız
// gösterim kırılımı — billing input_usage'ı zaten cache'i içerir.)

describe("extractUsageBreakdown — müşteri geçmişi cache kırılımı", () => {
  it("Anthropic şeması: cache_read + cache_creation ayıklar", () => {
    const r = extractUsageBreakdown({
      input_tokens: 46,
      cache_read_input_tokens: 43038,
      cache_creation_input_tokens: 1817,
      output_tokens: 221,
    });
    expect(r.cacheReadTokens).toBe(43038);
    expect(r.cacheCreateTokens).toBe(1817);
  });

  it("OpenAI şeması: prompt_tokens_details.cached_tokens cache-read sayılır", () => {
    const r = extractUsageBreakdown({
      prompt_tokens: 5000,
      prompt_tokens_details: { cached_tokens: 1200 },
      completion_tokens: 300,
    });
    expect(r.cacheReadTokens).toBe(1200);
    expect(r.cacheCreateTokens).toBe(0);
  });

  it("cache yoksa 0 döner", () => {
    expect(extractUsageBreakdown({ input_tokens: 100, output_tokens: 50 })).toEqual({
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
    });
  });

  it("bozuk/negatif/null veri güvenli 0'a düşer", () => {
    expect(extractUsageBreakdown(null)).toEqual({ cacheReadTokens: 0, cacheCreateTokens: 0 });
    expect(extractUsageBreakdown("garbage")).toEqual({ cacheReadTokens: 0, cacheCreateTokens: 0 });
    expect(extractUsageBreakdown({ cache_read_input_tokens: -5, cache_creation_input_tokens: NaN }))
      .toEqual({ cacheReadTokens: 0, cacheCreateTokens: 0 });
  });

  it("DEĞİŞMEZ: base = inputUsage − cacheRead − cacheCreate ≥ 0 ve toplam tutar (gerçek canlı vaka)", () => {
    // ussafak/Rootçu Han canlı kaydı: billed input = 44901 (46 + 43038 + 1817).
    const inputUsage = 44901;
    const raw = {
      input_tokens: 46,
      cache_read_input_tokens: 43038,
      cache_creation_input_tokens: 1817,
      output_tokens: 221,
    };
    const { cacheReadTokens, cacheCreateTokens } = extractUsageBreakdown(raw);
    const base = Math.max(0, inputUsage - cacheReadTokens - cacheCreateTokens);
    expect(base).toBe(46);
    // Toplam KORUNUR: base + cache_read + cache_create == billed input_usage.
    expect(base + cacheReadTokens + cacheCreateTokens).toBe(inputUsage);
    expect(base).toBeGreaterThanOrEqual(0);
  });

  it("DEĞİŞMEZ: cache > inputUsage olsa bile base negatife düşmez (clamp)", () => {
    // Tutarsız veri savunması: cache toplamı billed input'u aşarsa base 0'a sabitlenir.
    const inputUsage = 100;
    const { cacheReadTokens, cacheCreateTokens } = extractUsageBreakdown({
      cache_read_input_tokens: 9999,
    });
    const base = Math.max(0, inputUsage - cacheReadTokens - cacheCreateTokens);
    expect(base).toBe(0);
    expect(base).toBeGreaterThanOrEqual(0);
  });
});
