import { describe, expect, it } from "vitest";
import { normalizeProviderUsage, extractTokenUsageForTest } from "./closerouter-service.js";

// Giriş token normalleştirme matematiğinin %100 doğruluğunu kilitleyen testler.
// Para alanı: cache token'ları faturalanmalı, OpenAI'de çift sayım olmamalı,
// sağlayıcı eksik raporlarsa floor (proxy max(guard)) devreye girer.
describe("normalizeProviderUsage — giriş token matematiği", () => {
  it("OpenAI: prompt_tokens girişin tamamıdır, cached_tokens EKLENMEZ (çift sayma yok)", () => {
    const r = normalizeProviderUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 800 },
    });
    expect(r.promptTokens).toBe(1000); // 1000, 1800 DEĞİL
    expect(r.completionTokens).toBe(200);
  });

  it("Anthropic: gerçek giriş = input + cache_read + cache_create", () => {
    const r = normalizeProviderUsage({
      input_tokens: 2,
      cache_read_input_tokens: 67394,
      output_tokens: 85,
    });
    expect(r.promptTokens).toBe(67396); // 2 + 67394
    expect(r.completionTokens).toBe(85);
  });

  it("Anthropic: cache_creation dahil", () => {
    const r = normalizeProviderUsage({
      input_tokens: 2,
      cache_read_input_tokens: 50000,
      cache_creation_input_tokens: 17000,
      output_tokens: 100,
    });
    expect(r.promptTokens).toBe(67002); // 2 + 50000 + 17000
    expect(r.completionTokens).toBe(100);
  });

  it("Karışık (hibrit proxy): prompt_tokens varsa OpenAI semantiği — cache EKLENMEZ (çift sayma yok)", () => {
    // prompt_tokens raporlanmışsa OpenAI kuralı geçerli: cache zaten dahildir.
    // Burada prompt_tokens=2 düşük/bozuk olsa bile normalize katmanı çift saymaz;
    // bu bozuk-düşük değeri PROXY FLOOR'u (max(guard.contextTokens)) yakalar (KN-B).
    const r = normalizeProviderUsage({
      prompt_tokens: 2,
      cache_read_input_tokens: 30000,
      completion_tokens: 50,
    });
    expect(r.promptTokens).toBe(2); // OpenAI semantiği: prompt_tokens taban, cache eklenmez
  });

  it("Temiz OpenAI (cache yok): geriye uyum bozulmaz", () => {
    const r = normalizeProviderUsage({ prompt_tokens: 60, completion_tokens: 15 });
    expect(r.promptTokens).toBe(60);
    expect(r.completionTokens).toBe(15);
  });

  it("Temiz Anthropic (cache yok): input_tokens kullanılır", () => {
    const r = normalizeProviderUsage({ input_tokens: 100, output_tokens: 25 });
    expect(r.promptTokens).toBe(100);
    expect(r.completionTokens).toBe(25);
  });

  it("usage boş/yok: 0 döner (fallback tahmini estimateUsageFromPayload devralır)", () => {
    expect(normalizeProviderUsage(undefined)).toEqual({ promptTokens: 0, completionTokens: 0 });
    expect(normalizeProviderUsage({})).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it("negatif/geçersiz değerler 0 sayılır (kötü veri güvenliği)", () => {
    const r = normalizeProviderUsage({ input_tokens: -5, cache_read_input_tokens: NaN, output_tokens: "x" as never });
    expect(r.promptTokens).toBe(0);
    expect(r.completionTokens).toBe(0);
  });

  it("GERÇEK WellFlow vakası: 126889 char prompt, input=2 cache_read=67394 → 67396 faturalanır", () => {
    // Bu, canlıda tespit edilen kaçağın birebir senaryosu.
    const r = normalizeProviderUsage({ input_tokens: 2, cache_read_input_tokens: 67394, output_tokens: 85 });
    expect(r.promptTokens).toBe(67396);
    expect(r.promptTokens).toBeGreaterThan(1000); // asla 2 değil
  });
});

// Denetim izi: extractTokenUsage sağlayıcının HAM usage'ını providerRaw'da saklamalı
// (billing'i ETKİLEMEDEN). Bu, gelecekte "sağlayıcı ne raporladı" sorusunu kanıtla
// cevaplamak için. normalizeProviderUsage pür kalır; providerRaw yalnız sarmalayıcıda.
describe("extractTokenUsage — providerRaw denetim izi", () => {
  it("Anthropic cache alanlarını HAM olarak providerRaw'da saklar (billing değeri ayrı)", () => {
    const raw = { input_tokens: 2, cache_read_input_tokens: 67394, output_tokens: 85 };
    const r = extractTokenUsageForTest({ usage: raw });
    // Faturalanan değer cache dahil normalize edilmiş (67396)
    expect(r.promptTokens).toBe(67396);
    // HAM usage aynen saklanmış (denetim için cache alanları görünür)
    expect(r.providerRaw).toEqual(raw);
    expect((r.providerRaw as Record<string, number>).cache_read_input_tokens).toBe(67394);
  });

  it("OpenAI usage'ını HAM olarak saklar (cached_tokens detayı dahil)", () => {
    const raw = { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 800 } };
    const r = extractTokenUsageForTest({ usage: raw });
    expect(r.promptTokens).toBe(1000); // billing: çift saymaz
    expect(r.providerRaw).toEqual(raw); // denetim: ham detay korunur
  });

  it("usage yoksa providerRaw set EDİLMEZ (gürültü yok)", () => {
    const r = extractTokenUsageForTest({});
    expect(r.providerRaw).toBeUndefined();
    expect(r.promptTokens).toBe(0);
  });
});
