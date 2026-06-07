import { eq } from "drizzle-orm";
import { MASTER_MODELS, type MasterModel } from "../../master-models.js";
import { db } from "../db/client.js";
import {
  apiKeyPolicies,
  apiKeys,
  modelOverrides,
  modelRuntimePolicies,
  plans,
  providerDurumlari,
  systemApiConfig,
  users,
} from "../db/schema.js";
import { env } from "../lib/env.js";

const IMPLEMENTED_PROVIDER_REGISTRY = {
  closerouter: { id: "closerouter", label: "CloseRouter", baseUrlLabel: "AI_PROVIDER_BASE_URL" },
} as const;

export type RuntimeApiConfig = {
  activeProviderId: string;
  defaultContextLimitTokens: number;
  defaultOutputReserveTokens: number;
  defaultPerKeyPerMinute: number;
  defaultPerUserPerMinute: number;
  defaultPerIpPerMinute: number;
  defaultRequestTimeoutMs: number;
  defaultStreamTimeoutMs: number;
  allowStreaming: boolean;
  allowResponsesEndpoint: boolean;
  allowMessagesEndpoint: boolean;
  allowChatEndpoint: boolean;
  enforceModelAllowlist: boolean;
  defaultMaxTokensPerRequest: number;
  defaultTemperatureMin: number;
  defaultTemperatureMax: number;
  defaultTopPMin: number;
  defaultTopPMax: number;
  insufficientBalanceBlockEnabled: boolean;
  streamMissingUsageFallbackEnabled: boolean;
  upstream402PassThroughEnabled: boolean;
  maintenanceModeForApi: boolean;
  maintenanceMessage: string;
  modelsMaintenanceActive: boolean;
  strictCanonicalModelIds: boolean;
  updatedAt: string | null;
};

export const DEFAULT_API_SETTINGS: Omit<RuntimeApiConfig, "updatedAt"> = {
  activeProviderId: "closerouter",
  defaultContextLimitTokens: 1_000_000,
  defaultOutputReserveTokens: 4_096,
  defaultPerKeyPerMinute: env.RATE_LIMIT_PER_KEY_PER_MIN,
  defaultPerUserPerMinute: 120,
  defaultPerIpPerMinute: 240,
  defaultRequestTimeoutMs: 180_000,
  defaultStreamTimeoutMs: 180_000,
  allowStreaming: true,
  allowResponsesEndpoint: true,
  allowMessagesEndpoint: true,
  allowChatEndpoint: true,
  enforceModelAllowlist: false,
  defaultMaxTokensPerRequest: 4_096,
  defaultTemperatureMin: 0,
  defaultTemperatureMax: 2,
  defaultTopPMin: 0,
  defaultTopPMax: 1,
  insufficientBalanceBlockEnabled: true,
  streamMissingUsageFallbackEnabled: true,
  upstream402PassThroughEnabled: true,
  maintenanceModeForApi: false,
  maintenanceMessage: "API geçici olarak bakım modunda.",
  modelsMaintenanceActive: false,
  strictCanonicalModelIds: true,
};

export type ApiKeyPolicySnapshot = {
  apiKeyId: string;
  perKeyPerMinute: number | null;
  maxContextTokens: number | null;
  maxOutputTokens: number | null;
  allowedModels: string[];
  dailySpendLimitTL: number | null;
  monthlySpendLimitTL: number | null;
  allowStreaming: boolean | null;
  updatedAt: string | null;
};

export type ModelRuntimePolicySnapshot = {
  modelId: string;
  enabled: boolean;
  contextOverrideTokens: number | null;
  maxOutputTokens: number | null;
  allowStreaming: boolean | null;
  updatedAt: string | null;
};

function numberOrDefault(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAllowedModels(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function serializeRuntimeConfig(row?: typeof systemApiConfig.$inferSelect | null): RuntimeApiConfig {
  return {
    activeProviderId: row?.activeProviderId || DEFAULT_API_SETTINGS.activeProviderId,
    defaultContextLimitTokens: numberOrDefault(row?.defaultContextLimitTokens, DEFAULT_API_SETTINGS.defaultContextLimitTokens),
    defaultOutputReserveTokens: numberOrDefault(row?.defaultOutputReserveTokens, DEFAULT_API_SETTINGS.defaultOutputReserveTokens),
    defaultPerKeyPerMinute: numberOrDefault(row?.defaultPerKeyPerMinute, DEFAULT_API_SETTINGS.defaultPerKeyPerMinute),
    defaultPerUserPerMinute: numberOrDefault(row?.defaultPerUserPerMinute, DEFAULT_API_SETTINGS.defaultPerUserPerMinute),
    defaultPerIpPerMinute: numberOrDefault(row?.defaultPerIpPerMinute, DEFAULT_API_SETTINGS.defaultPerIpPerMinute),
    defaultRequestTimeoutMs: numberOrDefault(row?.defaultRequestTimeoutMs, DEFAULT_API_SETTINGS.defaultRequestTimeoutMs),
    defaultStreamTimeoutMs: numberOrDefault(row?.defaultStreamTimeoutMs, DEFAULT_API_SETTINGS.defaultStreamTimeoutMs),
    allowStreaming: row?.allowStreaming ?? DEFAULT_API_SETTINGS.allowStreaming,
    allowResponsesEndpoint: row?.allowResponsesEndpoint ?? DEFAULT_API_SETTINGS.allowResponsesEndpoint,
    allowMessagesEndpoint: row?.allowMessagesEndpoint ?? DEFAULT_API_SETTINGS.allowMessagesEndpoint,
    allowChatEndpoint: row?.allowChatEndpoint ?? DEFAULT_API_SETTINGS.allowChatEndpoint,
    enforceModelAllowlist: row?.enforceModelAllowlist ?? DEFAULT_API_SETTINGS.enforceModelAllowlist,
    defaultMaxTokensPerRequest: numberOrDefault(row?.defaultMaxTokensPerRequest, DEFAULT_API_SETTINGS.defaultMaxTokensPerRequest),
    defaultTemperatureMin: numberOrDefault(row?.defaultTemperatureMin, DEFAULT_API_SETTINGS.defaultTemperatureMin),
    defaultTemperatureMax: numberOrDefault(row?.defaultTemperatureMax, DEFAULT_API_SETTINGS.defaultTemperatureMax),
    defaultTopPMin: numberOrDefault(row?.defaultTopPMin, DEFAULT_API_SETTINGS.defaultTopPMin),
    defaultTopPMax: numberOrDefault(row?.defaultTopPMax, DEFAULT_API_SETTINGS.defaultTopPMax),
    insufficientBalanceBlockEnabled: row?.insufficientBalanceBlockEnabled ?? DEFAULT_API_SETTINGS.insufficientBalanceBlockEnabled,
    streamMissingUsageFallbackEnabled: row?.streamMissingUsageFallbackEnabled ?? DEFAULT_API_SETTINGS.streamMissingUsageFallbackEnabled,
    upstream402PassThroughEnabled: row?.upstream402PassThroughEnabled ?? DEFAULT_API_SETTINGS.upstream402PassThroughEnabled,
    maintenanceModeForApi: row?.maintenanceModeForApi ?? DEFAULT_API_SETTINGS.maintenanceModeForApi,
    maintenanceMessage: row?.maintenanceMessage || DEFAULT_API_SETTINGS.maintenanceMessage,
    modelsMaintenanceActive: row?.modelsMaintenanceActive ?? DEFAULT_API_SETTINGS.modelsMaintenanceActive,
    strictCanonicalModelIds: row?.strictCanonicalModelIds ?? DEFAULT_API_SETTINGS.strictCanonicalModelIds,
    updatedAt: row?.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
  };
}

function serializeApiKeyPolicyRow(row?: typeof apiKeyPolicies.$inferSelect | null): ApiKeyPolicySnapshot | null {
  if (!row) return null;
  return {
    apiKeyId: row.apiKeyId,
    perKeyPerMinute: row.perKeyPerMinute ?? null,
    maxContextTokens: row.maxContextTokens ?? null,
    maxOutputTokens: row.maxOutputTokens ?? null,
    allowedModels: normalizeAllowedModels(row.allowedModels),
    dailySpendLimitTL: nullableNumber(row.dailySpendLimitTL),
    monthlySpendLimitTL: nullableNumber(row.monthlySpendLimitTL),
    allowStreaming: row.allowStreaming ?? null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
  };
}

function serializeModelRuntimePolicyRow(row?: typeof modelRuntimePolicies.$inferSelect | null): ModelRuntimePolicySnapshot | null {
  if (!row) return null;
  return {
    modelId: row.modelId,
    enabled: row.enabled !== false,
    contextOverrideTokens: row.contextOverrideTokens ?? null,
    maxOutputTokens: row.maxOutputTokens ?? null,
    allowStreaming: row.allowStreaming ?? null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
  };
}

export async function getRuntimeApiConfig(): Promise<RuntimeApiConfig> {
  try {
    const rows = await db.select().from(systemApiConfig).where(eq(systemApiConfig.id, 1)).limit(1);
    return serializeRuntimeConfig(rows[0] ?? null);
  } catch {
    return {
      ...DEFAULT_API_SETTINGS,
      updatedAt: null,
    };
  }
}

export async function getApiKeyPolicy(apiKeyId: string): Promise<ApiKeyPolicySnapshot | null> {
  const rows = await db.select().from(apiKeyPolicies).where(eq(apiKeyPolicies.apiKeyId, apiKeyId)).limit(1);
  return serializeApiKeyPolicyRow(rows[0] ?? null);
}

export async function getModelRuntimePolicy(modelId: string): Promise<ModelRuntimePolicySnapshot | null> {
  const rows = await db.select().from(modelRuntimePolicies).where(eq(modelRuntimePolicies.modelId, modelId)).limit(1);
  return serializeModelRuntimePolicyRow(rows[0] ?? null);
}

export async function getUserModelAllowlist(userId: string): Promise<string[]> {
  const userRows = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRows.length) return [];
  const planRows = await db
    .select({ izinliModeller: plans.izinliModeller })
    .from(plans)
    .where(eq(plans.id, userRows[0].plan))
    .limit(1);
  return normalizeAllowedModels(planRows[0]?.izinliModeller);
}

export async function listAvailableProviders() {
  const statusRows = await db.select().from(providerDurumlari);
  const statusMap = new Map(statusRows.map((row) => [row.provider, row]));

  return Object.values(IMPLEMENTED_PROVIDER_REGISTRY).map((provider) => {
    const status = statusMap.get(provider.id);
    return {
      id: provider.id,
      label: provider.label,
      baseUrlLabel: provider.baseUrlLabel,
      implemented: true,
      durum: status?.durum ?? "aktif",
      gecikmeMs: status?.gecikmeMs ?? 0,
      sonKontrol: status?.sonKontrol instanceof Date ? status.sonKontrol.toISOString() : null,
      not: status?.not ?? "",
    };
  });
}

function endpointSupportsStreaming(model: MasterModel, endpoint: string): boolean {
  const detail = (model.endpointDetails ?? []).find((row) => row.type === endpoint);
  return detail?.supportsStreaming ?? (endpoint === "chat" || endpoint === "messages");
}

export async function listAdminApiSettingModels() {
  const [overrideRows, runtimeRows] = await Promise.all([
    db.select().from(modelOverrides),
    db.select().from(modelRuntimePolicies),
  ]);
  const overrideMap = new Map(overrideRows.map((row) => [row.modelId, row]));
  const runtimeMap = new Map(runtimeRows.map((row) => [row.modelId, row]));

  return MASTER_MODELS.map((model) => {
    const override = overrideMap.get(model.id);
    const runtime = runtimeMap.get(model.id);
    return {
      modelId: model.id,
      name: model.name,
      provider: model.provider,
      providerSlug: model.providerSlug ?? model.provider.toLowerCase(),
      contextTokens: model.contextTokens ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      pricingEnabled: override ? override.enabled !== false : true,
      runtimeEnabled: runtime ? runtime.enabled !== false : true,
      effectiveEnabled: (override ? override.enabled !== false : true) && (runtime ? runtime.enabled !== false : true),
      inputUsdOverride: nullableNumber(override?.inputUsdOverride),
      outputUsdOverride: nullableNumber(override?.outputUsdOverride),
      contextOverrideTokens: runtime?.contextOverrideTokens ?? null,
      runtimeMaxOutputTokens: runtime?.maxOutputTokens ?? null,
      allowStreaming: runtime?.allowStreaming ?? null,
      supportsStreaming: endpointSupportsStreaming(model, "chat"),
      updatedAt: runtime?.updatedAt instanceof Date
        ? runtime.updatedAt.toISOString()
        : override?.updatedAt instanceof Date
          ? override.updatedAt.toISOString()
          : null,
    };
  });
}

export async function getApiKeyPolicySnapshot(apiKeyId: string) {
  const [policy, keyRows] = await Promise.all([
    getApiKeyPolicy(apiKeyId),
    db.select().from(apiKeys).where(eq(apiKeys.id, apiKeyId)).limit(1),
  ]);
  const key = keyRows[0] ?? null;
  return {
    apiKey: key
      ? {
          id: key.id,
          userId: key.userId,
          ad: key.ad,
          maskedKey: key.maskedKey,
          aktif: key.aktif,
        }
      : null,
    policy,
  };
}

export async function getApiSettingsSnapshot() {
  const [runtimeConfig, providers, modelPolicies] = await Promise.all([
    getRuntimeApiConfig(),
    listAvailableProviders(),
    listAdminApiSettingModels(),
  ]);

  return {
    general: {
      activeProviderId: runtimeConfig.activeProviderId,
      allowStreaming: runtimeConfig.allowStreaming,
      allowChatEndpoint: runtimeConfig.allowChatEndpoint,
      allowResponsesEndpoint: runtimeConfig.allowResponsesEndpoint,
      allowMessagesEndpoint: runtimeConfig.allowMessagesEndpoint,
      defaultRequestTimeoutMs: runtimeConfig.defaultRequestTimeoutMs,
      defaultStreamTimeoutMs: runtimeConfig.defaultStreamTimeoutMs,
      maintenanceModeForApi: runtimeConfig.maintenanceModeForApi,
      maintenanceMessage: runtimeConfig.maintenanceMessage,
      modelsMaintenanceActive: runtimeConfig.modelsMaintenanceActive,
      updatedAt: runtimeConfig.updatedAt,
    },
    limits: {
      defaultContextLimitTokens: runtimeConfig.defaultContextLimitTokens,
      defaultOutputReserveTokens: runtimeConfig.defaultOutputReserveTokens,
      defaultMaxTokensPerRequest: runtimeConfig.defaultMaxTokensPerRequest,
      defaultPerKeyPerMinute: runtimeConfig.defaultPerKeyPerMinute,
      defaultPerUserPerMinute: runtimeConfig.defaultPerUserPerMinute,
      defaultPerIpPerMinute: runtimeConfig.defaultPerIpPerMinute,
      defaultTemperatureMin: runtimeConfig.defaultTemperatureMin,
      defaultTemperatureMax: runtimeConfig.defaultTemperatureMax,
      defaultTopPMin: runtimeConfig.defaultTopPMin,
      defaultTopPMax: runtimeConfig.defaultTopPMax,
    },
    behavior: {
      enforceModelAllowlist: runtimeConfig.enforceModelAllowlist,
      insufficientBalanceBlockEnabled: runtimeConfig.insufficientBalanceBlockEnabled,
      streamMissingUsageFallbackEnabled: runtimeConfig.streamMissingUsageFallbackEnabled,
      upstream402PassThroughEnabled: runtimeConfig.upstream402PassThroughEnabled,
      strictCanonicalModelIds: runtimeConfig.strictCanonicalModelIds,
    },
    providers,
    modelPolicies,
    defaultKeyPolicy: {
      perKeyPerMinute: runtimeConfig.defaultPerKeyPerMinute,
      maxContextTokens: runtimeConfig.defaultContextLimitTokens,
      maxOutputTokens: runtimeConfig.defaultMaxTokensPerRequest,
      allowedModels: [],
      dailySpendLimitTL: null,
      monthlySpendLimitTL: null,
      allowStreaming: runtimeConfig.allowStreaming,
    },
  };
}

export async function upsertSystemApiConfig(input: Partial<RuntimeApiConfig>) {
  const current = await getRuntimeApiConfig();
  const values: typeof systemApiConfig.$inferInsert = {
    id: 1,
    activeProviderId: String(input.activeProviderId || current.activeProviderId),
    defaultContextLimitTokens: Math.max(1, Math.floor(numberOrDefault(input.defaultContextLimitTokens, current.defaultContextLimitTokens))),
    defaultOutputReserveTokens: Math.max(1, Math.floor(numberOrDefault(input.defaultOutputReserveTokens, current.defaultOutputReserveTokens))),
    defaultPerKeyPerMinute: Math.max(1, Math.floor(numberOrDefault(input.defaultPerKeyPerMinute, current.defaultPerKeyPerMinute))),
    defaultPerUserPerMinute: Math.max(1, Math.floor(numberOrDefault(input.defaultPerUserPerMinute, current.defaultPerUserPerMinute))),
    defaultPerIpPerMinute: Math.max(1, Math.floor(numberOrDefault(input.defaultPerIpPerMinute, current.defaultPerIpPerMinute))),
    defaultRequestTimeoutMs: Math.max(1_000, Math.floor(numberOrDefault(input.defaultRequestTimeoutMs, current.defaultRequestTimeoutMs))),
    defaultStreamTimeoutMs: Math.max(1_000, Math.floor(numberOrDefault(input.defaultStreamTimeoutMs, current.defaultStreamTimeoutMs))),
    allowStreaming: input.allowStreaming ?? current.allowStreaming,
    allowResponsesEndpoint: input.allowResponsesEndpoint ?? current.allowResponsesEndpoint,
    allowMessagesEndpoint: input.allowMessagesEndpoint ?? current.allowMessagesEndpoint,
    allowChatEndpoint: input.allowChatEndpoint ?? current.allowChatEndpoint,
    enforceModelAllowlist: input.enforceModelAllowlist ?? current.enforceModelAllowlist,
    defaultMaxTokensPerRequest: Math.max(1, Math.floor(numberOrDefault(input.defaultMaxTokensPerRequest, current.defaultMaxTokensPerRequest))),
    defaultTemperatureMin: String(numberOrDefault(input.defaultTemperatureMin, current.defaultTemperatureMin)),
    defaultTemperatureMax: String(numberOrDefault(input.defaultTemperatureMax, current.defaultTemperatureMax)),
    defaultTopPMin: String(numberOrDefault(input.defaultTopPMin, current.defaultTopPMin)),
    defaultTopPMax: String(numberOrDefault(input.defaultTopPMax, current.defaultTopPMax)),
    insufficientBalanceBlockEnabled: input.insufficientBalanceBlockEnabled ?? current.insufficientBalanceBlockEnabled,
    streamMissingUsageFallbackEnabled: input.streamMissingUsageFallbackEnabled ?? current.streamMissingUsageFallbackEnabled,
    upstream402PassThroughEnabled: input.upstream402PassThroughEnabled ?? current.upstream402PassThroughEnabled,
    maintenanceModeForApi: input.maintenanceModeForApi ?? current.maintenanceModeForApi,
    maintenanceMessage: String(input.maintenanceMessage || current.maintenanceMessage),
    modelsMaintenanceActive: input.modelsMaintenanceActive ?? current.modelsMaintenanceActive,
    strictCanonicalModelIds: input.strictCanonicalModelIds ?? current.strictCanonicalModelIds,
    updatedAt: new Date(),
  };

  await db
    .insert(systemApiConfig)
    .values(values)
    .onConflictDoUpdate({ target: systemApiConfig.id, set: values });

  return getRuntimeApiConfig();
}

export async function upsertModelRuntimePolicy(
  modelId: string,
  input: {
    pricingEnabled?: boolean;
    inputUsdOverride?: number | null;
    outputUsdOverride?: number | null;
    runtimeEnabled?: boolean;
    contextOverrideTokens?: number | null;
    maxOutputTokens?: number | null;
    allowStreaming?: boolean | null;
  },
) {
  const now = new Date();
  const overrideValues = {
    modelId,
    enabled: input.pricingEnabled ?? true,
    inputUsdOverride: input.inputUsdOverride === null || input.inputUsdOverride === undefined ? null : String(input.inputUsdOverride),
    outputUsdOverride: input.outputUsdOverride === null || input.outputUsdOverride === undefined ? null : String(input.outputUsdOverride),
    notlar: "API yönetimi ekranından güncellendi",
    updatedAt: now,
  };
  await db
    .insert(modelOverrides)
    .values(overrideValues)
    .onConflictDoUpdate({ target: modelOverrides.modelId, set: overrideValues });

  const runtimeValues = {
    modelId,
    enabled: input.runtimeEnabled ?? true,
    contextOverrideTokens: input.contextOverrideTokens ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    allowStreaming: input.allowStreaming ?? null,
    updatedAt: now,
  };
  await db
    .insert(modelRuntimePolicies)
    .values(runtimeValues)
    .onConflictDoUpdate({ target: modelRuntimePolicies.modelId, set: runtimeValues });

  return getModelRuntimePolicy(modelId);
}

export async function upsertApiKeyPolicy(
  apiKeyId: string,
  input: {
    perKeyPerMinute?: number | null;
    maxContextTokens?: number | null;
    maxOutputTokens?: number | null;
    allowedModels?: string[] | string | null;
    dailySpendLimitTL?: number | null;
    monthlySpendLimitTL?: number | null;
    allowStreaming?: boolean | null;
  },
) {
  const values = {
    apiKeyId,
    perKeyPerMinute: input.perKeyPerMinute ?? null,
    maxContextTokens: input.maxContextTokens ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    allowedModels: normalizeAllowedModels(input.allowedModels),
    dailySpendLimitTL: input.dailySpendLimitTL === null || input.dailySpendLimitTL === undefined ? null : String(input.dailySpendLimitTL),
    monthlySpendLimitTL: input.monthlySpendLimitTL === null || input.monthlySpendLimitTL === undefined ? null : String(input.monthlySpendLimitTL),
    allowStreaming: input.allowStreaming ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(apiKeyPolicies)
    .values(values)
    .onConflictDoUpdate({ target: apiKeyPolicies.apiKeyId, set: values });

  return getApiKeyPolicy(apiKeyId);
}
