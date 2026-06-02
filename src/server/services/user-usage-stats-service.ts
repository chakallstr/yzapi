import { and, eq, gte } from "drizzle-orm";
import { MASTER_MODELS, canonicalizeModelId } from "../../master-models.js";
import { db, dbSql } from "../db/client.js";
import { usageRecords } from "../db/schema.js";
import { getMergedCatalogModels } from "./added-model-service.js";
import { resolveTokenSplit } from "./usage-breakdown.js";

// Tek-kullanıcıya scope'lu kullanım istatistikleri. admin-traffic-service deseninin
// müşteri-cephesi, yalın aynası: overview + zaman serisi + top modeller. Tüm
// hesap bellekte (tek kullanıcının pencere-içi satırları) yapılır → PURE compute
// fonksiyonu test edilebilir. DOKUNULMAZ: yalnız SELECT + gösterim; billing yok.

export type UsageStatsWindow = "hour" | "day" | "week" | "month";

type ModelMetaEntry = { label: string; provider: string };
type CatalogModelMeta = { id: string; name: string; provider: string };

const WINDOW_MS: Record<UsageStatsWindow, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

// Bucket sayıları: hour=12 (5dk), day=24 (1s), week=7 (1g), month=30 (1g).
const BUCKET_MS: Record<UsageStatsWindow, number> = {
  hour: 5 * 60 * 1000,
  day: 60 * 60 * 1000,
  week: 24 * 60 * 60 * 1000,
  month: 24 * 60 * 60 * 1000,
};

// Etiketler Europe/Istanbul ile gösterilir (admin-traffic ile aynı). Yalnız
// GÖSTERİM; bucket sınırları epoch-ms üzerinden, gruplama mantığına dokunmaz.
const DISPLAY_TIME_ZONE = "Europe/Istanbul";

const MODEL_META = new Map<string, ModelMetaEntry>(
  MASTER_MODELS.map((m) => [m.id, { label: m.name, provider: m.provider }]),
);

function buildModelMeta(catalog?: CatalogModelMeta[]): Map<string, ModelMetaEntry> {
  if (!catalog?.length) return MODEL_META;
  const merged = new Map(MODEL_META);
  for (const m of catalog) {
    if (!merged.has(m.id)) merged.set(m.id, { label: m.name, provider: m.provider });
  }
  return merged;
}

function modelInfo(modelId: string, meta: Map<string, ModelMetaEntry>) {
  const canonical = canonicalizeModelId(modelId) ?? modelId;
  return meta.get(canonical) ?? { label: canonical, provider: "unknown" };
}

function bucketLabel(date: Date, window: UsageStatsWindow): string {
  if (window === "hour" || window === "day") {
    return date.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIME_ZONE });
  }
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", timeZone: DISPLAY_TIME_ZONE });
}

function toDateOrNull(v: Date | string | null | undefined): Date | null {
  if (v instanceof Date) return v;
  return v ? new Date(v) : null;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}
function round6(n: number): number {
  return Number(n.toFixed(6));
}

// Takvim ayının başlangıcını (TZ-yerel 00:00) UTC instant olarak döner.
// Ofset, AY-BAŞI anında ölçülür (now'da değil) → DST'li zone'larda da ay-sınırında
// doğru kalır (now ile ay-başı arasında DST geçişi olsa bile kaymaz). Istanbul
// sabit +3 olduğundan pratikte fark etmez, ama footgun'u kökten kaldırır.
export function startOfMonthInTz(now: Date, tz: string): Date {
  const head = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(head.find((p) => p.type === "year")?.value || 0);
  const mo = Number(head.find((p) => p.type === "month")?.value || 0);
  // Ayın 1'i 00:00'ı önce UTC gibi varsay, sonra o anın TZ'deki gerçek ofsetiyle düzelt.
  const guess = Date.UTC(y, mo - 1, 1, 0, 0, 0);
  const wall = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(wall.find((p) => p.type === t)?.value || 0);
  const localAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  const offsetMs = localAsUtc - guess;
  return new Date(guess - offsetMs);
}

export type UsageStatsRow = Pick<
  typeof usageRecords.$inferSelect,
  "timestamp" | "modelId" | "status" | "inputUsage" | "outputUsage" | "costTL" | "costUsd" | "rawUsageJson"
>;

// PURE — DB'ye dokunmaz, test edilebilir. usageRows pencere içi (start..now) satırlar.
export function computeUserUsageStats(input: {
  usageRows: UsageStatsRow[];
  window: UsageStatsWindow;
  now: Date;
  catalogModels?: CatalogModelMeta[];
}) {
  const { window, now } = input;
  const start = new Date(now.getTime() - WINDOW_MS[window]);
  const bucketMs = BUCKET_MS[window];
  const meta = buildModelMeta(input.catalogModels);

  type Bucket = {
    bucketStart: string; label: string;
    requestCount: number; successCount: number; errorCount: number;
    inputTokens: number; outputTokens: number; cacheTokens: number; baseTokens: number;
    costTL: number; costUsd: number;
  };
  const buckets: Bucket[] = [];
  // Yarı-açık kovalar [start, now): son kova [now-bucketMs, now) süregelen dönemdir.
  // < now (≤ değil) → tam WINDOW/BUCKET sayısı (hour=12/day=24/week=7/month=30),
  // sonda 'şimdi'de başlayan boş bir kova üretilmez. now'daki satır son kovaya clamp'lenir.
  for (let ts = start.getTime(); ts < now.getTime(); ts += bucketMs) {
    const bs = new Date(ts);
    buckets.push({
      bucketStart: bs.toISOString(), label: bucketLabel(bs, window),
      requestCount: 0, successCount: 0, errorCount: 0,
      inputTokens: 0, outputTokens: 0, cacheTokens: 0, baseTokens: 0, costTL: 0, costUsd: 0,
    });
  }

  const overview = {
    window, requestCount: 0, successCount: 0, errorCount: 0,
    inputTokens: 0, outputTokens: 0, cacheTokens: 0, baseTokens: 0, totalTokens: 0,
    costTL: 0, costUsd: 0,
  };

  type ModelAgg = {
    id: string; name: string; provider: string;
    requestCount: number; successCount: number; errorCount: number;
    inputTokens: number; outputTokens: number; cacheTokens: number; costTL: number; costUsd: number;
  };
  const modelAgg = new Map<string, ModelAgg>();

  for (const row of input.usageRows) {
    const ts = toDateOrNull(row.timestamp);
    if (!ts || ts < start || ts > now) continue;
    const inputTokens = Number(row.inputUsage ?? 0);
    const outputTokens = Number(row.outputUsage ?? 0);
    const costTL = Number(row.costTL ?? 0);
    const costUsd = Number(row.costUsd ?? 0);
    const success = row.status === "success";
    const { baseInputTokens, cacheReadTokens, cacheCreateTokens } = resolveTokenSplit(inputTokens, row.rawUsageJson);
    const cache = cacheReadTokens + cacheCreateTokens;
    const modelId = canonicalizeModelId(row.modelId) ?? row.modelId;
    const info = modelInfo(modelId, meta);

    overview.requestCount += 1;
    overview.successCount += success ? 1 : 0;
    overview.errorCount += success ? 0 : 1;
    overview.inputTokens += inputTokens;
    overview.outputTokens += outputTokens;
    overview.cacheTokens += cache;
    overview.baseTokens += baseInputTokens;
    overview.costTL += costTL;
    overview.costUsd += costUsd;

    const idx = Math.min(Math.floor((ts.getTime() - start.getTime()) / bucketMs), buckets.length - 1);
    const b = buckets[Math.max(0, idx)];
    if (b) {
      b.requestCount += 1;
      b.successCount += success ? 1 : 0;
      b.errorCount += success ? 0 : 1;
      b.inputTokens += inputTokens;
      b.outputTokens += outputTokens;
      b.cacheTokens += cache;
      b.baseTokens += baseInputTokens;
      b.costTL += costTL;
      b.costUsd += costUsd;
    }

    const m = modelAgg.get(modelId) ?? {
      id: modelId, name: info.label, provider: info.provider,
      requestCount: 0, successCount: 0, errorCount: 0,
      inputTokens: 0, outputTokens: 0, cacheTokens: 0, costTL: 0, costUsd: 0,
    };
    m.requestCount += 1;
    m.successCount += success ? 1 : 0;
    m.errorCount += success ? 0 : 1;
    m.inputTokens += inputTokens;
    m.outputTokens += outputTokens;
    m.cacheTokens += cache;
    m.costTL += costTL;
    m.costUsd += costUsd;
    modelAgg.set(modelId, m);
  }

  overview.totalTokens = overview.inputTokens + overview.outputTokens;

  const timeseries = buckets.map((b) => ({
    bucketStart: b.bucketStart,
    label: b.label,
    requestCount: b.requestCount,
    successCount: b.successCount,
    errorCount: b.errorCount,
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    cacheTokens: b.cacheTokens,
    baseTokens: b.baseTokens,
    costTL: round2(b.costTL),
    costUsd: round6(b.costUsd),
  }));

  const totalReq = overview.requestCount || 1;
  const totalTok = overview.totalTokens || 1;
  const totalCost = overview.costTL || 1; // ham toplam (yuvarlamadan önce) — pay paydası
  const models = [...modelAgg.values()]
    .sort((a, b) => b.requestCount - a.requestCount || b.costTL - a.costTL)
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      requestCount: m.requestCount,
      successCount: m.successCount,
      errorCount: m.errorCount,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheTokens: m.cacheTokens,
      totalTokens: m.inputTokens + m.outputTokens,
      costTL: round2(m.costTL),
      costUsd: round6(m.costUsd),
      trafficSharePct: round2((m.requestCount / totalReq) * 100),
      tokenSharePct: round2(((m.inputTokens + m.outputTokens) / totalTok) * 100),
      costSharePct: round2((m.costTL / totalCost) * 100),
    }));

  return {
    overview: {
      ...overview,
      costTL: round2(overview.costTL),
      costUsd: round6(overview.costUsd),
      windowStart: start.toISOString(),
      generatedAt: now.toISOString(),
    },
    timeseries,
    models,
  };
}

// DB'den okuyup compute eden sarmalayıcı + ay-başından-bugüne toplam (200-cap YOK).
export async function getUserUsageStats(
  userId: string,
  window: UsageStatsWindow,
  now: Date = new Date(),
) {
  const start = new Date(now.getTime() - WINDOW_MS[window]);

  const rows = await db
    .select({
      timestamp: usageRecords.timestamp,
      modelId: usageRecords.modelId,
      status: usageRecords.status,
      inputUsage: usageRecords.inputUsage,
      outputUsage: usageRecords.outputUsage,
      costTL: usageRecords.costTL,
      costUsd: usageRecords.costUsd,
      rawUsageJson: usageRecords.rawUsageJson,
    })
    .from(usageRecords)
    .where(and(eq(usageRecords.userId, userId), gte(usageRecords.timestamp, start)));

  let catalogModels: CatalogModelMeta[] | undefined;
  try {
    catalogModels = await getMergedCatalogModels();
  } catch {
    catalogModels = undefined;
  }

  const stats = computeUserUsageStats({ usageRows: rows, window, now, catalogModels });

  // Ay-başından-bugüne toplam: limit'siz SQL aggregate (dbSql), takvim ayı.
  const monthStart = startOfMonthInTz(now, DISPLAY_TIME_ZONE);
  const monthRows = await dbSql<{ tl: string; usd: string; cnt: string; tokens: string }[]>`
    SELECT COALESCE(SUM(cost_tl), 0)               AS tl,
           COALESCE(SUM(cost_usd), 0)              AS usd,
           COUNT(*)                                AS cnt,
           COALESCE(SUM(input_usage + output_usage), 0) AS tokens
    FROM usage_records
    WHERE user_id = ${userId}::uuid AND timestamp >= ${monthStart}
  `;
  const m = monthRows[0] ?? { tl: "0", usd: "0", cnt: "0", tokens: "0" };
  const monthToDate = {
    monthStart: monthStart.toISOString(),
    costTL: round2(Number(m.tl)),
    costUsd: round6(Number(m.usd)),
    requestCount: Number(m.cnt),
    totalTokens: Number(m.tokens),
  };

  return { ...stats, monthToDate };
}
