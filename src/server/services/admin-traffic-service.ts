import { desc, gte } from "drizzle-orm";
import { MASTER_MODELS, canonicalizeModelId } from "../../master-models.js";
import { db } from "../db/client.js";
import { apiKeys, transactions, usageRecords, users } from "../db/schema.js";
import { getMergedCatalogModels } from "./added-model-service.js";

type ModelMetaEntry = { label: string; provider: string; providerSlug: string };
// Minimal catalog shape used to extend the model-meta lookup with added_models
// (e.g. claude-opus-4.8) so traffic labels resolve instead of showing
// "Bilinmiyor". Yalnız GÖSTERİM etiketini etkiler; aggregate/billing dokunulmaz.
type CatalogModelMeta = { id: string; name: string; provider: string; providerSlug?: string };

export type TrafficWindow = "24h" | "7d" | "30d";

const WINDOW_MS: Record<TrafficWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const BUCKET_MS: Record<TrafficWindow, number> = {
  "24h": 60 * 60 * 1000,
  "7d": 24 * 60 * 60 * 1000,
  "30d": 24 * 60 * 60 * 1000,
};

const MODEL_META = new Map<string, ModelMetaEntry>(
  MASTER_MODELS.map((model) => [model.id, { label: model.name, provider: model.provider, providerSlug: model.providerSlug ?? model.provider.toLowerCase() }]),
);

// Birleşik model-meta haritası: MASTER_MODELS tabanı + (varsa) added_models
// katmanı. catalogModels verilmezse yalnız MASTER_MODELS kullanılır (mevcut
// davranış korunur; testler değişmez).
function buildModelMeta(catalogModels?: CatalogModelMeta[]): Map<string, ModelMetaEntry> {
  if (!catalogModels?.length) return MODEL_META;
  const merged = new Map(MODEL_META);
  for (const model of catalogModels) {
    if (merged.has(model.id)) continue;
    merged.set(model.id, {
      label: model.name,
      provider: model.provider,
      providerSlug: model.providerSlug ?? model.provider.toLowerCase(),
    });
  }
  return merged;
}

function toDate(value: Date | string | null | undefined) {
  if (value instanceof Date) return value;
  return value ? new Date(value) : null;
}

function toIso(value: Date | string | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function toUserCode(userId: string | null | undefined) {
  return userId ? `u-${String(userId).replace(/-/g, "").slice(0, 8)}` : null;
}

function getWindowStart(window: TrafficWindow, now: Date) {
  return new Date(now.getTime() - WINDOW_MS[window]);
}

// Bucket etiketleri Türkiye saatiyle (Europe/Istanbul) gösterilir. Sunucu UTC
// çalıştığı için timeZone belirtilmezse etiketler TR'den 3 saat geri çıkardı.
// NOT: yalnız GÖSTERİM etiketini etkiler; bucket sınırları/gruplama epoch-ms
// üzerinden yapılır, billing/gruplama mantığına dokunmaz.
const DISPLAY_TIME_ZONE = "Europe/Istanbul";

function bucketLabel(date: Date, window: TrafficWindow) {
  if (window === "24h") {
    return date.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIME_ZONE });
  }
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", timeZone: DISPLAY_TIME_ZONE });
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function modelInfo(modelId: string, metaMap: Map<string, ModelMetaEntry> = MODEL_META) {
  const canonical = canonicalizeModelId(modelId) ?? modelId;
  return metaMap.get(canonical) ?? { label: canonical, provider: "unknown", providerSlug: "unknown" };
}

// Provider profil ID'si doğrudan bilindiğinde model-tabanlı çıkarıma gerek kalmaz.
const PROFILE_DISPLAY: Record<string, { name: string; slug: string }> = {
  rika: { name: "Rika", slug: "rika" },
};

function effectiveProviderInfo(
  modelId: string,
  profileId: string | null | undefined,
  metaMap: Map<string, ModelMetaEntry>,
): { provider: string; providerSlug: string } {
  if (profileId && PROFILE_DISPLAY[profileId]) {
    const entry = PROFILE_DISPLAY[profileId];
    return { provider: entry.name, providerSlug: entry.slug };
  }
  const info = modelInfo(modelId, metaMap);
  return { provider: info.provider, providerSlug: info.providerSlug };
}

function extractCachedTokens(rawUsageJson: unknown): number {
  if (!rawUsageJson || typeof rawUsageJson !== "object") return 0;
  const providerRaw = (rawUsageJson as Record<string, unknown>).providerRaw as Record<string, unknown> | undefined;
  if (!providerRaw) return 0;
  const details = providerRaw.prompt_tokens_details as Record<string, unknown> | undefined;
  if (!details) return 0;
  const ct = details.cached_tokens;
  return typeof ct === "number" ? ct : 0;
}

function buildTopModels(modelUsage: Map<string, number>, metaMap: Map<string, ModelMetaEntry>, limit = 3) {
  return [...modelUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([modelId, requestCount]) => ({
      modelId,
      label: modelInfo(modelId, metaMap).label,
      requestCount,
    }));
}

function buildTopProvider(providerUsage: Map<string, number>) {
  const top = [...providerUsage.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return { provider: top[0], requestCount: top[1] };
}

export function computeAdminTrafficAnalytics(
  input: {
    usageRows: Array<typeof usageRecords.$inferSelect>;
    transactionRows: Array<typeof transactions.$inferSelect>;
    userRows: Array<typeof users.$inferSelect>;
    apiKeyRows: Array<typeof apiKeys.$inferSelect>;
    window: TrafficWindow;
    now?: Date;
    catalogModels?: CatalogModelMeta[];
  },
) {
  const now = input.now ?? new Date();
  const start = getWindowStart(input.window, now);
  const bucketMs = BUCKET_MS[input.window];
  const metaMap = buildModelMeta(input.catalogModels);

  const userMap = new Map(input.userRows.map((row) => [row.id, row]));
  const apiKeyMap = new Map(input.apiKeyRows.map((row) => [row.id, row]));

  const buckets = [];
  for (let ts = start.getTime(); ts <= now.getTime(); ts += bucketMs) {
    const bucketStart = new Date(ts);
    buckets.push({
      bucketStart,
      bucketEnd: new Date(Math.min(ts + bucketMs, now.getTime())),
      label: bucketLabel(bucketStart, input.window),
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costTL: 0,
      costUsd: 0,
      responseMsTotal: 0,
      avgResponseMs: 0,
      uniqueUsersSet: new Set<string>(),
      uniqueUsers: 0,
      creditsTL: 0,
      debitsTL: 0,
    });
  }

  const usageRows = input.usageRows
    .filter((row) => {
      const ts = toDate(row.timestamp);
      return ts && ts >= start;
    })
    .sort((a, b) => (toDate(a.timestamp)?.getTime() ?? 0) - (toDate(b.timestamp)?.getTime() ?? 0));

  const txRows = input.transactionRows.filter((row) => {
    const ts = toDate(row.timestamp);
    return ts && ts >= start;
  });

  const overview = {
    window: input.window,
    generatedAt: now.toISOString(),
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCostTL: 0,
    totalCostUsd: 0,
    activeUserCount: 0,
    activeApiKeyCount: 0,
    averageResponseMs: 0,
    topModel: null as null | { modelId: string; label: string; requestCount: number },
    topProvider: null as null | { provider: string; requestCount: number },
    creditsTL: 0,
    debitsTL: 0,
  };

  const activeUsers = new Set<string>();
  const activeApiKeys = new Set<string>();
  const modelUsage = new Map<string, number>();
  const providerUsage = new Map<string, number>();

  const modelAgg = new Map<string, any>();
  const providerAgg = new Map<string, any>();
  const userAgg = new Map<string, any>();
  const apiKeyAgg = new Map<string, any>();

  for (const row of usageRows) {
    const timestamp = toDate(row.timestamp);
    if (!timestamp) continue;
    const costTL = Number(row.costTL ?? 0);
    const costUsd = Number(row.costUsd ?? 0);
    const inputTokens = row.inputUsage ?? 0;
    const outputTokens = row.outputUsage ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const success = row.status === "success";
    const modelId = canonicalizeModelId(row.modelId) ?? row.modelId;
    const info = modelInfo(modelId, metaMap);
    const providerInfoEff = effectiveProviderInfo(modelId, row.providerProfileId, metaMap);
    const providerKey = providerInfoEff.providerSlug;
    const cachedTokens = extractCachedTokens(row.rawUsageJson);

    overview.totalRequests += 1;
    overview.successfulRequests += success ? 1 : 0;
    overview.failedRequests += success ? 0 : 1;
    overview.totalInputTokens += inputTokens;
    overview.totalOutputTokens += outputTokens;
    overview.totalTokens += totalTokens;
    overview.totalCostTL += costTL;
    overview.totalCostUsd += costUsd;
    activeUsers.add(row.userId);
    if (row.apiKeyId) activeApiKeys.add(row.apiKeyId);
    modelUsage.set(modelId, (modelUsage.get(modelId) ?? 0) + 1);
    providerUsage.set(providerKey, (providerUsage.get(providerKey) ?? 0) + 1);

    const bucketIndex = Math.min(Math.floor((timestamp.getTime() - start.getTime()) / bucketMs), buckets.length - 1);
    const bucket = buckets[Math.max(0, bucketIndex)];
    bucket.requestCount += 1;
    bucket.successCount += success ? 1 : 0;
    bucket.errorCount += success ? 0 : 1;
    bucket.inputTokens += inputTokens;
    bucket.outputTokens += outputTokens;
    bucket.totalTokens += totalTokens;
    bucket.costTL += costTL;
    bucket.costUsd += costUsd;
    bucket.responseMsTotal += row.responseMs ?? 0;
    bucket.uniqueUsersSet.add(row.userId);

    const modelCurrent = modelAgg.get(modelId) ?? {
      id: modelId,
      name: info.label,
      provider: info.provider,
      providerSlug: info.providerSlug,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costTL: 0,
      costUsd: 0,
      responseMsTotal: 0,
      avgResponseMs: 0,
      uniqueUsersSet: new Set<string>(),
      uniqueUsers: 0,
      lastSeenAt: null as string | null,
      successRate: 0,
      trafficSharePct: 0,
      costSharePct: 0,
      tokenSharePct: 0,
    };
    modelCurrent.requestCount += 1;
    modelCurrent.successCount += success ? 1 : 0;
    modelCurrent.errorCount += success ? 0 : 1;
    modelCurrent.inputTokens += inputTokens;
    modelCurrent.outputTokens += outputTokens;
    modelCurrent.totalTokens += totalTokens;
    modelCurrent.costTL += costTL;
    modelCurrent.costUsd += costUsd;
    modelCurrent.responseMsTotal += row.responseMs ?? 0;
    modelCurrent.uniqueUsersSet.add(row.userId);
    modelCurrent.lastSeenAt = toIso(timestamp);
    modelAgg.set(modelId, modelCurrent);

    const providerCurrent = providerAgg.get(providerKey) ?? {
      id: providerKey,
      name: providerInfoEff.provider,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      costTL: 0,
      costUsd: 0,
      responseMsTotal: 0,
      avgResponseMs: 0,
      uniqueUsersSet: new Set<string>(),
      uniqueUsers: 0,
      lastSeenAt: null as string | null,
      successRate: 0,
    };
    providerCurrent.requestCount += 1;
    providerCurrent.successCount += success ? 1 : 0;
    providerCurrent.errorCount += success ? 0 : 1;
    providerCurrent.inputTokens += inputTokens;
    providerCurrent.outputTokens += outputTokens;
    providerCurrent.totalTokens += totalTokens;
    providerCurrent.cachedTokens += cachedTokens;
    providerCurrent.costTL += costTL;
    providerCurrent.costUsd += costUsd;
    providerCurrent.responseMsTotal += row.responseMs ?? 0;
    providerCurrent.uniqueUsersSet.add(row.userId);
    providerCurrent.lastSeenAt = toIso(timestamp);
    providerAgg.set(providerKey, providerCurrent);

    const user = userMap.get(row.userId);
    const userCurrent = userAgg.get(row.userId) ?? {
      userId: row.userId,
      userCode: toUserCode(row.userId),
      email: user?.email ?? "",
      adSoyad: user?.adSoyad ?? "",
      requestCount: 0,
      totalTokens: 0,
      totalCostTL: 0,
      totalCostUsd: 0,
      responseMsTotal: 0,
      avgResponseMs: 0,
      errorCount: 0,
      lastSeenAt: null as string | null,
      topModels: [] as Array<{ modelId: string; label: string; requestCount: number }>,
      topProvider: null as null | { provider: string; requestCount: number },
      modelUsage: new Map<string, number>(),
      providerUsage: new Map<string, number>(),
    };
    userCurrent.requestCount += 1;
    userCurrent.totalTokens += totalTokens;
    userCurrent.totalCostTL += costTL;
    userCurrent.totalCostUsd += costUsd;
    userCurrent.responseMsTotal += row.responseMs ?? 0;
    userCurrent.errorCount += success ? 0 : 1;
    userCurrent.lastSeenAt = toIso(timestamp);
    userCurrent.modelUsage.set(modelId, (userCurrent.modelUsage.get(modelId) ?? 0) + 1);
    userCurrent.providerUsage.set(providerKey, (userCurrent.providerUsage.get(providerKey) ?? 0) + 1);
    userAgg.set(row.userId, userCurrent);

    if (row.apiKeyId) {
      const key = apiKeyMap.get(row.apiKeyId);
      const keyCurrent = apiKeyAgg.get(row.apiKeyId) ?? {
        apiKeyId: row.apiKeyId,
        maskedKey: key?.maskedKey ?? "—",
        userId: row.userId,
        userCode: toUserCode(row.userId),
        email: user?.email ?? "",
        ad: key?.ad ?? "",
        requestCount: 0,
        totalTokens: 0,
        totalCostTL: 0,
        totalCostUsd: 0,
        responseMsTotal: 0,
        avgResponseMs: 0,
        errorCount: 0,
        errorRate: 0,
        lastSeenAt: null as string | null,
        topModels: [] as Array<{ modelId: string; label: string; requestCount: number }>,
        topProvider: null as null | { provider: string; requestCount: number },
        modelUsage: new Map<string, number>(),
        providerUsage: new Map<string, number>(),
      };
      keyCurrent.requestCount += 1;
      keyCurrent.totalTokens += totalTokens;
      keyCurrent.totalCostTL += costTL;
      keyCurrent.totalCostUsd += costUsd;
      keyCurrent.responseMsTotal += row.responseMs ?? 0;
      keyCurrent.errorCount += success ? 0 : 1;
      keyCurrent.lastSeenAt = toIso(timestamp);
      keyCurrent.modelUsage.set(modelId, (keyCurrent.modelUsage.get(modelId) ?? 0) + 1);
      keyCurrent.providerUsage.set(providerKey, (keyCurrent.providerUsage.get(providerKey) ?? 0) + 1);
      apiKeyAgg.set(row.apiKeyId, keyCurrent);
    }
  }

  for (const row of txRows) {
    const timestamp = toDate(row.timestamp);
    if (!timestamp) continue;
    const amount = Number(row.miktarTL ?? 0);
    if (amount >= 0) overview.creditsTL += amount;
    else overview.debitsTL += Math.abs(amount);
    const bucketIndex = Math.min(Math.floor((timestamp.getTime() - start.getTime()) / bucketMs), buckets.length - 1);
    const bucket = buckets[Math.max(0, bucketIndex)];
    if (amount >= 0) bucket.creditsTL += amount;
    else bucket.debitsTL += Math.abs(amount);
  }

  overview.activeUserCount = activeUsers.size;
  overview.activeApiKeyCount = activeApiKeys.size;
  overview.averageResponseMs = overview.totalRequests ? Math.round(usageRows.reduce((sum, row) => sum + (row.responseMs ?? 0), 0) / overview.totalRequests) : 0;

  const timeseries = buckets.map((bucket) => ({
    label: bucket.label,
    bucketStart: bucket.bucketStart.toISOString(),
    bucketEnd: bucket.bucketEnd.toISOString(),
    requestCount: bucket.requestCount,
    successCount: bucket.successCount,
    errorCount: bucket.errorCount,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    totalTokens: bucket.totalTokens,
    costTL: round2(bucket.costTL),
    costUsd: round2(bucket.costUsd),
    avgResponseMs: bucket.requestCount ? Math.round(bucket.responseMsTotal / bucket.requestCount) : 0,
    uniqueUsers: bucket.uniqueUsersSet.size,
    creditsTL: round2(bucket.creditsTL),
    debitsTL: round2(bucket.debitsTL),
  }));

  const models = [...modelAgg.values()]
    .map((row) => ({
      ...row,
      avgResponseMs: row.requestCount ? Math.round(row.responseMsTotal / row.requestCount) : 0,
      uniqueUsers: row.uniqueUsersSet.size,
      successRate: row.requestCount ? round2((row.successCount / row.requestCount) * 100) : 0,
      trafficSharePct: overview.totalRequests ? round2((row.requestCount / overview.totalRequests) * 100) : 0,
      costSharePct: overview.totalCostTL ? round2((row.costTL / overview.totalCostTL) * 100) : 0,
      tokenSharePct: overview.totalTokens ? round2((row.totalTokens / overview.totalTokens) * 100) : 0,
    }))
    .sort((a, b) => b.requestCount - a.requestCount || b.costTL - a.costTL)
    .map(({ uniqueUsersSet, responseMsTotal, ...row }) => row);

  const providers = [...providerAgg.values()]
    .map((row) => ({
      ...row,
      avgResponseMs: row.requestCount ? Math.round(row.responseMsTotal / row.requestCount) : 0,
      uniqueUsers: row.uniqueUsersSet.size,
      successRate: row.requestCount ? round2((row.successCount / row.requestCount) * 100) : 0,
      costTL: round2(row.costTL),
      costUsd: round2(row.costUsd),
    }))
    .sort((a, b) => b.requestCount - a.requestCount || b.costTL - a.costTL)
    .map(({ uniqueUsersSet, responseMsTotal, ...row }) => row);

  overview.topModel = models[0]
    ? {
        modelId: models[0].id,
        label: models[0].name,
        requestCount: models[0].requestCount,
      }
    : null;
  overview.topProvider = providers[0]
    ? {
        provider: providers[0].id,
        requestCount: providers[0].requestCount,
      }
    : null;

  const usersAgg = [...userAgg.values()]
    .map((row) => ({
      userId: row.userId,
      userCode: row.userCode,
      email: row.email,
      adSoyad: row.adSoyad,
      requestCount: row.requestCount,
      totalTokens: row.totalTokens,
      totalCostTL: round2(row.totalCostTL),
      totalCostUsd: round2(row.totalCostUsd),
      avgResponseMs: row.requestCount ? Math.round(row.responseMsTotal / row.requestCount) : 0,
      errorCount: row.errorCount,
      errorRate: row.requestCount ? round2((row.errorCount / row.requestCount) * 100) : 0,
      lastSeenAt: row.lastSeenAt,
      topModels: buildTopModels(row.modelUsage, metaMap),
      topProvider: buildTopProvider(row.providerUsage),
    }))
    .sort((a, b) => b.requestCount - a.requestCount || b.totalCostTL - a.totalCostTL);

  const apiKeysAgg = [...apiKeyAgg.values()]
    .map((row) => ({
      apiKeyId: row.apiKeyId,
      maskedKey: row.maskedKey,
      userId: row.userId,
      userCode: row.userCode,
      email: row.email,
      ad: row.ad,
      requestCount: row.requestCount,
      totalTokens: row.totalTokens,
      totalCostTL: round2(row.totalCostTL),
      totalCostUsd: round2(row.totalCostUsd),
      avgResponseMs: row.requestCount ? Math.round(row.responseMsTotal / row.requestCount) : 0,
      errorCount: row.errorCount,
      errorRate: row.requestCount ? round2((row.errorCount / row.requestCount) * 100) : 0,
      lastSeenAt: row.lastSeenAt,
      topModels: buildTopModels(row.modelUsage, metaMap),
      topProvider: buildTopProvider(row.providerUsage),
    }))
    .sort((a, b) => b.requestCount - a.requestCount || b.totalCostTL - a.totalCostTL);

  const rikaRequests = usageRows
    .filter((row) => row.providerProfileId === "rika")
    .slice()
    .sort((a, b) => (toDate(b.timestamp)?.getTime() ?? 0) - (toDate(a.timestamp)?.getTime() ?? 0))
    .slice(0, 200)
    .map((row) => {
      const user = userMap.get(row.userId);
      const key = row.apiKeyId ? apiKeyMap.get(row.apiKeyId) : null;
      const modelId = canonicalizeModelId(row.modelId) ?? row.modelId;
      const info = modelInfo(modelId, metaMap);
      return {
        id: row.id,
        requestId: row.requestId,
        userId: row.userId,
        userCode: toUserCode(row.userId),
        email: user?.email ?? "",
        maskedKey: key?.maskedKey ?? "—",
        modelId,
        modelName: info.label,
        inputTokens: row.inputUsage ?? 0,
        outputTokens: row.outputUsage ?? 0,
        cachedTokens: extractCachedTokens(row.rawUsageJson),
        costTL: Number(row.costTL ?? 0),
        status: row.status,
        responseMs: row.responseMs,
        timestamp: toIso(row.timestamp),
      };
    });

  const errorRows = usageRows
    .filter((row) => row.status !== "success")
    .slice()
    .sort((a, b) => (toDate(b.timestamp)?.getTime() ?? 0) - (toDate(a.timestamp)?.getTime() ?? 0));

  const errorCodes = new Map<string, number>();
  const errorModels = new Map<string, number>();
  const errorProviders = new Map<string, number>();

  for (const row of errorRows) {
    const modelId = canonicalizeModelId(row.modelId) ?? row.modelId;
    const info = modelInfo(modelId, metaMap);
    errorCodes.set(row.errorCode || row.status || "unknown", (errorCodes.get(row.errorCode || row.status || "unknown") ?? 0) + 1);
    errorModels.set(modelId, (errorModels.get(modelId) ?? 0) + 1);
    errorProviders.set(info.providerSlug, (errorProviders.get(info.providerSlug) ?? 0) + 1);
  }

  const averageBucketRequests = timeseries.length ? timeseries.reduce((sum, row) => sum + row.requestCount, 0) / timeseries.length : 0;
  const averageUserTokens = usersAgg.length ? usersAgg.reduce((sum, row) => sum + row.totalTokens, 0) / usersAgg.length : 0;
  const averageModelCost = models.length ? models.reduce((sum, row) => sum + row.costTL, 0) / models.length : 0;

  const errors = {
    failureRate: overview.totalRequests ? round2((overview.failedRequests / overview.totalRequests) * 100) : 0,
    recent: errorRows.slice(0, 50).map((row) => {
      const user = userMap.get(row.userId);
      const key = row.apiKeyId ? apiKeyMap.get(row.apiKeyId) : null;
      const modelId = canonicalizeModelId(row.modelId) ?? row.modelId;
      const info = modelInfo(modelId, metaMap);
      return {
        id: row.id,
        requestId: row.requestId,
        upstreamRequestId: row.upstreamRequestId,
        userId: row.userId,
        userCode: toUserCode(row.userId),
        email: user?.email ?? "",
        apiKeyId: row.apiKeyId,
        maskedKey: key?.maskedKey ?? "—",
        modelId,
        modelName: info.label,
        provider: info.providerSlug,
        errorCode: row.errorCode,
        status: row.status,
        responseMs: row.responseMs,
        costTL: Number(row.costTL ?? 0),
        timestamp: toIso(row.timestamp),
      };
    }),
    errorCodes: [...errorCodes.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    models: [...errorModels.entries()].map(([modelId, count]) => ({ modelId, label: modelInfo(modelId, metaMap).label, count })).sort((a, b) => b.count - a.count),
    providers: [...errorProviders.entries()].map(([provider, count]) => ({ provider, count })).sort((a, b) => b.count - a.count),
    anomalies: {
      requestSpikes: timeseries.filter((row) => row.requestCount >= Math.max(10, averageBucketRequests * 2)),
      userTokenSpikes: usersAgg.filter((row) => row.totalTokens >= Math.max(5000, averageUserTokens * 2)).slice(0, 10),
      apiKeyErrorSpikes: apiKeysAgg.filter((row) => row.errorCount >= 3 && row.errorRate >= 30).slice(0, 10),
      expensiveModelSpikes: models.filter((row) => row.costTL >= Math.max(10, averageModelCost * 2) && row.requestCount >= 3).slice(0, 10),
    },
  };

  return {
    overview: {
      ...overview,
      totalCostTL: round2(overview.totalCostTL),
      totalCostUsd: round2(overview.totalCostUsd),
      creditsTL: round2(overview.creditsTL),
      debitsTL: round2(overview.debitsTL),
    },
    timeseries,
    models,
    providers,
    users: usersAgg,
    apiKeys: apiKeysAgg,
    errors,
    rikaRequests,
  };
}

export async function getAdminTrafficAnalytics(window: TrafficWindow) {
  const now = new Date();
  const start = getWindowStart(window, now);

  const [usageRows, transactionRows, userRows, apiKeyRows, catalogModels] = await Promise.all([
    db.select().from(usageRecords).where(gte(usageRecords.timestamp, start)).orderBy(desc(usageRecords.timestamp)),
    db.select().from(transactions).where(gte(transactions.timestamp, start)).orderBy(desc(transactions.timestamp)),
    db.select().from(users),
    db.select().from(apiKeys),
    getMergedCatalogModels(),
  ]);

  return computeAdminTrafficAnalytics({
    usageRows,
    transactionRows,
    userRows,
    apiKeyRows,
    window,
    now,
    catalogModels,
  });
}
