import { describe, expect, it } from "vitest";
import { computeUserUsageStats, type UsageStatsRow } from "./user-usage-stats-service.js";

// Sabit "now" — bucket/pencere hesapları deterministik olsun.
const NOW = new Date("2026-06-02T12:00:00.000Z");

function row(o: Partial<{
  timestamp: Date; modelId: string; status: string;
  inputUsage: number; outputUsage: number; costTL: number; costUsd: number; rawUsageJson: unknown;
}> = {}): UsageStatsRow {
  return {
    timestamp: o.timestamp ?? NOW,
    modelId: o.modelId ?? "model-a",
    status: o.status ?? "success",
    inputUsage: o.inputUsage ?? 0,
    outputUsage: o.outputUsage ?? 0,
    costTL: String(o.costTL ?? 0),
    costUsd: String(o.costUsd ?? 0),
    rawUsageJson: o.rawUsageJson ?? null,
  } as UsageStatsRow;
}

describe("computeUserUsageStats — müşteri kullanım istatistikleri", () => {
  it("overview: istek/başarı/hata/token/maliyet doğru toplanır", () => {
    const s = computeUserUsageStats({
      now: NOW, window: "day",
      usageRows: [
        row({ inputUsage: 100, outputUsage: 50, costTL: 1, costUsd: 0.03, status: "success" }),
        row({ inputUsage: 200, outputUsage: 80, costTL: 2, costUsd: 0.06, status: "error" }),
      ],
    });
    expect(s.overview.requestCount).toBe(2);
    expect(s.overview.successCount).toBe(1);
    expect(s.overview.errorCount).toBe(1);
    expect(s.overview.inputTokens).toBe(300);
    expect(s.overview.outputTokens).toBe(130);
    expect(s.overview.totalTokens).toBe(430);
    expect(s.overview.costTL).toBe(3);
    expect(s.overview.costUsd).toBe(0.09);
  });

  it("DEĞİŞMEZ: base + cache == inputUsage (canlı vaka 44901 = 46 + 43038 + 1817)", () => {
    const s = computeUserUsageStats({
      now: NOW, window: "day",
      usageRows: [row({
        inputUsage: 44901,
        rawUsageJson: { input_tokens: 46, cache_read_input_tokens: 43038, cache_creation_input_tokens: 1817 },
      })],
    });
    expect(s.overview.cacheTokens).toBe(43038 + 1817);
    expect(s.overview.baseTokens).toBe(46);
    expect(s.overview.baseTokens + s.overview.cacheTokens).toBe(44901);
  });

  it("CLAMP: cache > inputUsage olsa bile base+cache == inputUsage (bozuk veri savunması)", () => {
    const s = computeUserUsageStats({
      now: NOW, window: "day",
      usageRows: [row({ inputUsage: 100, rawUsageJson: { cache_read_input_tokens: 9999 } })],
    });
    expect(s.overview.cacheTokens).toBe(100); // girişe clamp'lendi
    expect(s.overview.baseTokens).toBe(0);
    expect(s.overview.baseTokens + s.overview.cacheTokens).toBe(100);
  });

  it("top modeller: istek sayısına göre sıralı + trafik payı yüzdesi", () => {
    const s = computeUserUsageStats({
      now: NOW, window: "day",
      usageRows: [
        row({ modelId: "model-a" }), row({ modelId: "model-a" }), row({ modelId: "model-b" }),
      ],
    });
    expect(s.models.map((m) => m.id)).toEqual(["model-a", "model-b"]);
    expect(s.models[0].requestCount).toBe(2);
    expect(s.models[0].trafficSharePct).toBe(66.67);
    expect(s.models[1].trafficSharePct).toBe(33.33);
  });

  it("pencere dışı satır hariç tutulur (day = son 24s)", () => {
    const old = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    const s = computeUserUsageStats({
      now: NOW, window: "day",
      usageRows: [row({ timestamp: old, inputUsage: 999 }), row({ inputUsage: 1 })],
    });
    expect(s.overview.requestCount).toBe(1);
    expect(s.overview.inputTokens).toBe(1);
  });

  it("timeseries kova toplamları overview ile birebir tutar", () => {
    const s = computeUserUsageStats({
      now: NOW, window: "day",
      usageRows: [
        row({ inputUsage: 100, outputUsage: 50, costTL: 1 }),
        row({ timestamp: new Date(NOW.getTime() - 3 * 60 * 60 * 1000), inputUsage: 200, outputUsage: 20, costTL: 2 }),
      ],
    });
    const sumReq = s.timeseries.reduce((a, b) => a + b.requestCount, 0);
    const sumIn = s.timeseries.reduce((a, b) => a + b.inputTokens, 0);
    const sumTL = s.timeseries.reduce((a, b) => a + b.costTL, 0);
    expect(sumReq).toBe(s.overview.requestCount);
    expect(sumIn).toBe(s.overview.inputTokens);
    expect(sumTL).toBe(s.overview.costTL);
  });

  it("boş veri: NaN/Infinity üretmez, paylar güvenli", () => {
    const s = computeUserUsageStats({ now: NOW, window: "week", usageRows: [] });
    expect(s.overview.requestCount).toBe(0);
    expect(s.overview.totalTokens).toBe(0);
    expect(s.models).toEqual([]);
    expect(Number.isFinite(s.overview.costUsd)).toBe(true);
    expect(s.timeseries.length).toBeGreaterThan(0); // kovalar yine üretilir
  });
});
