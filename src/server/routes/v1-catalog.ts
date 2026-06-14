import { Router } from "express";
import { MASTER_MODELS, type MasterModel } from "../../master-models.js";
import { computePrice, type ComputedPrice } from "../../pricing.js";
import { db } from "../db/client.js";
import { modelOverrides, modelRuntimePolicies } from "../db/schema.js";
import { buildPricingConfig } from "../services/pricing-service.js";
import { getActiveCatalogModels } from "../services/added-model-service.js";

type V1ModelPricing = {
  unit: ComputedPrice["unit"];
  input?: {
    usd: string;
    tl: string;
  };
  output?: {
    usd: string;
    tl: string;
  };
  per_resolution?: Record<string, {
    usd: string;
    tl: string;
  }>;
};

export interface V1CatalogEntry {
  model: MasterModel;
  computed?: ComputedPrice;
  enabled: boolean;
}

// Roo Code / Cline / Codex gibi OpenAI-uyumlu istemcilere /v1/models'te gösterilen
// KISA, küratörlü liste. Amaç: müşteri kurulumda güvenilir bir modele düşsün.
// Çıkarılanlar (gpt-5.4-mini/-nano, o4-mini) hâlâ id ile çağrılabilir — sadece
// listelenmez (o4-mini reasoning gecikmesi "donmuş" görünüyordu; mini/nano kalabalıktı).
export const V1_CLIENT_MODEL_IDS = [
  "claude-opus-4.8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "gpt-5.5",
  "gpt-5.4",
] as const;

export function filterV1ClientCatalogEntries(entries: V1CatalogEntry[]): V1CatalogEntry[] {
  const byId = new Map(entries.filter((entry) => entry.enabled).map((entry) => [entry.model.id, entry]));
  return V1_CLIENT_MODEL_IDS.flatMap((modelId) => {
    const entry = byId.get(modelId);
    return entry ? [entry] : [];
  });
}

// Claude Code "gateway model discovery" picker'ı, /v1/models'taki id Claude Code'un
// BUILT-IN model tablosuyla BİREBİR (string) eşleşirse o modeli "From gateway" listesinden
// ELER (dedup: zaten yerleşik olanı tekrar listeleme). claude-opus-4-7/-4-6 ve sonnet-4-6
// DASH formu Claude Code 2.1.x built-in tablosunda VAR → eleniyorlardı; yalnız claude-opus-4.8
// (NOKTA form, built-in'de yok) hayatta kalıyordu. Çözüm: bu üç modeli istemciye NOKTA form id
// ile sun → built-in tabloyla eşleşmez → dedup'tan geçer → picker'da görünür. NOKTA form zaten
// geçerli alias (master-models aliases) → /v1/messages tarafında canonicalizeModelId DASH'e
// çevirir, dolayısıyla routing/billing/model_overrides AYNEN korunur (yalnız wire-name sunumu;
// dash gönderen mevcut istemciler de çalışmaya devam eder, dash hâlâ kabul edilen girdi).
const CLIENT_FACING_DOT_ID: Record<string, string> = {
  "claude-opus-4-7": "claude-opus-4.7",
  "claude-opus-4-6": "claude-opus-4.6",
  "claude-sonnet-4-6": "claude-sonnet-4.6",
};

export function clientFacingModelId(masterId: string): string {
  return CLIENT_FACING_DOT_ID[masterId] ?? masterId;
}

function providerSlug(model: MasterModel): string {
  return model.providerSlug ?? model.provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stringPrice(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.toFixed(8);
}

function serializePricePoint(point: { usd: number; tl: number } | undefined) {
  if (!point) return undefined;
  return {
    usd: stringPrice(point.usd)!,
    tl: stringPrice(point.tl)!,
  };
}

function buildPricing(computed: ComputedPrice | undefined): V1ModelPricing | null {
  if (!computed) return null;
  const perResolution = computed.perResolution
    ? Object.fromEntries(
        Object.entries(computed.perResolution).flatMap(([resolution, point]) => {
          const serialized = serializePricePoint(point);
          return serialized ? [[resolution, serialized]] : [];
        })
      )
    : undefined;

  return {
    unit: computed.unit,
    input: serializePricePoint(computed.input),
    output: serializePricePoint(computed.output),
    per_resolution: perResolution && Object.keys(perResolution).length > 0 ? perResolution : undefined,
  };
}

async function buildCatalogEntries(): Promise<V1CatalogEntry[]> {
  const cfg = await buildPricingConfig();
  const [mergedModels, overrides, runtimePolicies] = await Promise.all([
    getActiveCatalogModels(),
    db.select().from(modelOverrides),
    db.select().from(modelRuntimePolicies),
  ]);
  const overrideMap = new Map(overrides.map((override) => [override.modelId, override]));
  const runtimeMap = new Map(runtimePolicies.map((policy) => [policy.modelId, policy]));

  return mergedModels.map((model) => {
    const override = overrideMap.get(model.id);
    const runtime = runtimeMap.get(model.id);
    const patched = { ...model };
    if (override) {
      if (model.type === "Metin") {
        if (override.inputUsdOverride !== null) patched.customerInputUsd = Number(override.inputUsdOverride);
        if (override.outputUsdOverride !== null) patched.customerOutputUsd = Number(override.outputUsdOverride);
      } else if (model.type === "Görsel") {
        if (override.inputUsdOverride !== null) patched.providerImageInputUsd = Number(override.inputUsdOverride);
        if (override.outputUsdOverride !== null) patched.providerImageOutputUsd = Number(override.outputUsdOverride);
      }
    }
    if (runtime?.contextOverrideTokens && runtime.contextOverrideTokens > 0) {
      patched.contextTokens = runtime.contextOverrideTokens;
    }
    if (runtime?.maxOutputTokens && runtime.maxOutputTokens > 0) {
      patched.maxOutputTokens = runtime.maxOutputTokens;
    }
    return {
      model: patched,
      computed: computePrice(patched, cfg),
      enabled: (override ? override.enabled !== false : true) && (runtime ? runtime.enabled !== false : true),
    };
  });
}

function defaultCatalogEntries(): V1CatalogEntry[] {
  return MASTER_MODELS.map((model) => ({
    model,
    enabled: true,
  }));
}

export function buildV1ModelsResponse(entries: V1CatalogEntry[] = defaultCatalogEntries()) {
  const enabledEntries = entries.filter((entry) => entry.enabled);

  return {
    object: "list" as const,
    data: enabledEntries.map(({ model, computed }) => ({
      id: clientFacingModelId(model.id),
      object: "model" as const,
      name: model.name,
      // Claude Code "gateway model discovery" picker'ı etiket için display_name'i
      // kullanır; yoksa ham id gösterir. name ile aynı (provider sızıntısı yok).
      display_name: model.name,
      owned_by: providerSlug(model),
      provider: {
        name: model.provider,
        slug: providerSlug(model),
      },
      enabled: true,
      context_length: model.contextTokens ?? null,
      max_output_tokens: model.maxOutputTokens ?? null,
      pricing: buildPricing(computed),
      endpoints: model.endpoints,
      endpoint_details: (model.endpointDetails ?? []).map((endpoint) => ({
        type: endpoint.type,
        supports_streaming: endpoint.supportsStreaming,
        supported_parameters: endpoint.supportedParameters,
      })),
      supported_parameters: model.supportedParameters ?? [],
      architecture: {
        input_modalities: model.inputModalities ?? [],
        output_modalities: model.outputModalities ?? [],
      },
    })),
  };
}

export function buildV1ModelCountResponse(entries: V1CatalogEntry[] = defaultCatalogEntries()) {
  return {
    count: entries.filter((entry) => entry.enabled).length,
  };
}

export function buildV1ProvidersResponse(entries: V1CatalogEntry[] = defaultCatalogEntries()) {
  const bySlug = new Map<string, { id: string; name: string; model_count: number; endpoints: Set<string> }>();

  for (const { model, enabled } of entries) {
    if (!enabled) continue;
    const slug = providerSlug(model);
    const entry = bySlug.get(slug) ?? {
      id: slug,
      name: model.provider,
      model_count: 0,
      endpoints: new Set<string>(),
    };
    entry.model_count += 1;
    for (const endpoint of model.endpoints) {
      entry.endpoints.add(endpoint);
    }
    bySlug.set(slug, entry);
  }

  return {
    object: "list" as const,
    data: [...bySlug.values()]
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        model_count: provider.model_count,
        endpoints: [...provider.endpoints].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function createV1CatalogRouter(loadEntries: () => Promise<V1CatalogEntry[]> = buildCatalogEntries) {
  const router = Router();

  router.get("/models", async (_req, res, next) => {
    try {
      res.json(buildV1ModelsResponse(filterV1ClientCatalogEntries(await loadEntries())));
    } catch (e) {
      next(e);
    }
  });

  router.get("/models/count", async (_req, res, next) => {
    try {
      res.json(buildV1ModelCountResponse(filterV1ClientCatalogEntries(await loadEntries())));
    } catch (e) {
      next(e);
    }
  });

  router.get("/providers", async (_req, res, next) => {
    try {
      res.json(buildV1ProvidersResponse(filterV1ClientCatalogEntries(await loadEntries())));
    } catch (e) {
      next(e);
    }
  });

  return router;
}

const router = createV1CatalogRouter();

export default router;
