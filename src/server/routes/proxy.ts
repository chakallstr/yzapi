import { Router, Request, Response, NextFunction } from "express";
import { aiProviderApiKey } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { AppError, BadRequestError, InsufficientBalanceError, ModelDisabledError, ModelNotFoundError, RateLimitError } from "../lib/errors.js";
import { canonicalizeModelId, type MasterModel } from "../../master-models.js";
import { checkRateLimit } from "../services/rate-limit-service.js";
import { reserveUsageBudget, settleReservedUsage } from "../services/billing-service.js";
import {
  checkPackageCoverage,
  tryReservePackageSlot,
  releasePackageSlot,
  recordPackageUsage,
  consumeTpmOrDeny,
  hasActivePackageForModel,
} from "../services/entitlement-service.js";
import { chargeImage } from "../services/image-billing-service.js";
import { withImageSlot } from "../services/image-queue.js";
import { resolveActiveCatalogModel } from "../services/added-model-service.js";
import { getActiveProviderAdapter } from "../services/provider-adapter.js";
import { resolveProviderForModel, resolveProviderChainForModel } from "../services/provider-config-service.js";
import { forwardWithFailover } from "../services/provider-failover.js";
import { packageOverrideChain } from "../services/package-provider-override.js";
import { db } from "../db/client.js";
import { modelOverrides, systemConfig, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { buildRequestGuard, resolveBilledPromptTokens, type RequestGuardResult } from "../services/request-guard-service.js";
import { performWebSearch, clampSearchNum, WEB_SEARCH_DEFAULT_NUM } from "../services/web-search-service.js";
import {
  extractLatestUserText,
  shouldSearch,
  buildSearchQuery,
  buildAugmentedMessages,
  type WebSearchMode,
} from "../services/web-search-augment.js";
import { chargeWebSearch } from "../services/web-search-billing-service.js";
import { responsesRequestToChat, chatCompletionToResponses } from "../services/responses-translation.js";
import {
  getApiKeyPolicy,
  getModelRuntimePolicy,
  getRuntimeApiConfig,
  getUserModelAllowlist,
  type ApiKeyPolicySnapshot,
  type ModelRuntimePolicySnapshot,
  type RuntimeApiConfig,
} from "../services/api-settings-service.js";

const router = Router();

// Guard: requires upstream provider API key
function requireProxy(req: Request, res: Response, next: NextFunction): void {
  if (!aiProviderApiKey()) {
    res.status(503).json({ error: "proxy not configured" });
    return;
  }
  next();
}

// Forward upstream error bodies back to the client, preserving status code
function forwardUpstreamError(err: unknown, res: Response, runtimeConfig: RuntimeApiConfig): boolean {
  const e = err as Error & { status?: number; body?: unknown };
  if (e.status) {
    if (e.status === 402) {
      if (!runtimeConfig.upstream402PassThroughEnabled) {
        res.status(503).json({
          error: "Upstream sağlayıcı şu an bakiye reddi veriyor. Lütfen daha sonra tekrar deneyin.",
          code: "upstream_temporarily_unavailable",
        });
        return true;
      }
      res.status(402).json({
        error: "Platform balance exhausted (AI provider upstream)",
        code: "upstream_insufficient_balance",
        upstream: e.body,
      });
    } else {
      res.status(e.status).json(e.body ?? { error: e.message });
    }
    return true;
  }
  return false;
}

function endpointEnabledFor(runtimeConfig: RuntimeApiConfig, endpoint: string): boolean {
  if (endpoint === "chat") return runtimeConfig.allowChatEndpoint;
  if (endpoint === "messages") return runtimeConfig.allowMessagesEndpoint;
  if (endpoint === "responses") return runtimeConfig.allowResponsesEndpoint;
  return true;
}

function endpointSupportsStreaming(model: MasterModel, endpoint: string): boolean {
  const detail = (model.endpointDetails ?? []).find((row) => row.type === endpoint);
  return detail?.supportsStreaming ?? endpoint !== "responses";
}

function computeEffectiveContextLimit(
  masterModel: MasterModel,
  runtimeConfig: RuntimeApiConfig,
  apiKeyPolicy: ApiKeyPolicySnapshot | null,
  runtimePolicy: ModelRuntimePolicySnapshot | null,
): number {
  const candidates = [
    runtimeConfig.defaultContextLimitTokens,
    apiKeyPolicy?.maxContextTokens ?? null,
    runtimePolicy?.contextOverrideTokens ?? null,
    masterModel.contextTokens ?? null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  return Math.min(...candidates);
}

function computeEffectiveMaxOutputTokens(
  masterModel: MasterModel,
  runtimeConfig: RuntimeApiConfig,
  apiKeyPolicy: ApiKeyPolicySnapshot | null,
  runtimePolicy: ModelRuntimePolicySnapshot | null,
): number {
  const candidates = [
    runtimeConfig.defaultMaxTokensPerRequest,
    apiKeyPolicy?.maxOutputTokens ?? null,
    runtimePolicy?.maxOutputTokens ?? null,
    masterModel.maxOutputTokens ?? null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  return Math.min(...candidates);
}

function computeEffectiveOutputReserve(
  runtimeConfig: RuntimeApiConfig,
  effectiveMaxOutputTokens: number,
): number {
  return Math.min(runtimeConfig.defaultOutputReserveTokens, effectiveMaxOutputTokens);
}

async function resolveEnabledModel(
  modelId: string | undefined,
  endpoint: string,
): Promise<{ masterModel: MasterModel; runtimePolicy: ModelRuntimePolicySnapshot | null }> {
  const canonicalModelId = canonicalizeModelId(modelId);
  const masterModel = await resolveActiveCatalogModel(canonicalModelId ?? modelId ?? "");
  if (!masterModel) {
    throw new ModelNotFoundError(modelId ?? "(none)");
  }
  if (!masterModel.endpoints.includes(endpoint)) {
    throw new BadRequestError(`Model ${masterModel.id} does not support ${endpoint}`);
  }

  const overrideRows = await db
    .select({ enabled: modelOverrides.enabled })
    .from(modelOverrides)
    .where(eq(modelOverrides.modelId, masterModel.id))
    .limit(1);

  if (overrideRows[0]?.enabled === false) {
    throw new ModelDisabledError(masterModel.id);
  }

  const runtimePolicy = await getModelRuntimePolicy(masterModel.id);
  if (runtimePolicy?.enabled === false) {
    throw new ModelDisabledError(masterModel.id);
  }

  return { masterModel, runtimePolicy };
}

async function enforceRequestGuards(opts: {
  userId: string;
  apiKeyId: string;
  ipAddress?: string;
  modelId: string | undefined;
  endpoint: string;
  body: Record<string, unknown>;
}): Promise<{
  masterModel: MasterModel;
  runtimePolicy: ModelRuntimePolicySnapshot | null;
  runtimeConfig: RuntimeApiConfig;
  apiKeyPolicy: ApiKeyPolicySnapshot | null;
}> {
  const [{ masterModel, runtimePolicy }, runtimeConfig, apiKeyPolicy] = await Promise.all([
    resolveEnabledModel(opts.modelId, opts.endpoint),
    getRuntimeApiConfig(),
    getApiKeyPolicy(opts.apiKeyId),
  ]);

  const rl = await checkRateLimit(opts.apiKeyId, opts.userId, opts.ipAddress);
  if (!rl.allowed) {
    throw new RateLimitError("Rate limit exceeded", rl.retryAfter);
  }

  if (runtimeConfig.enforceModelAllowlist) {
    const allowedModels = (apiKeyPolicy?.allowedModels?.length ? apiKeyPolicy.allowedModels : await getUserModelAllowlist(opts.userId))
      .map((entry) => canonicalizeModelId(entry) ?? entry);
    if (allowedModels.length && !allowedModels.includes(masterModel.id)) {
      throw new BadRequestError(`Bu model bu anahtar veya plan için izinli değil: ${masterModel.id}`);
    }
  }

  const balRows = await db
    .select({ bakiye: users.bakiyeTL })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  const balance = Number(balRows[0]?.bakiye ?? 0);
  // Faz 1: aktif bir paket bu modeli kapsıyorsa bakiye=0 olsa bile isteği engelleme
  // (kota dalı bakiyeye dokunmadan karşılar). Kesin rezerv handler'da atomik yapılır.
  const packageCovers = await checkPackageCoverage(opts.userId, masterModel.id);
  if (runtimeConfig.insufficientBalanceBlockEnabled && balance <= 0 && !packageCovers) {
    throw new InsufficientBalanceError("Insufficient balance to process request");
  }

  return { masterModel, runtimePolicy, runtimeConfig, apiKeyPolicy };
}

function setBillingHeaders(res: Response, costTL: number, remainingTL: number, requestId: string): void {
  res.setHeader("X-YZ-Cost-TL", costTL.toFixed(4));
  res.setHeader("X-YZ-Remaining-TL", remainingTL.toFixed(2));
  res.setHeader("X-YZ-Request-Id", requestId);
}

async function getUserBalanceSnapshot(userId: string): Promise<{ remainingTL: number; remainingUSD: number; kur: number }> {
  const [balanceRows, configRows] = await Promise.all([
    db
      .select({ bakiye: users.bakiyeTL })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ kur: systemConfig.kur })
      .from(systemConfig)
      .where(eq(systemConfig.id, 1))
      .limit(1),
  ]);

  const remainingTL = Number(balanceRows[0]?.bakiye ?? 0);
  const kur = Number(configRows[0]?.kur ?? 0);
  const remainingUSD = kur > 0 ? remainingTL / kur : 0;

  return { remainingTL, remainingUSD, kur };
}

function setExtendedBillingHeaders(
  res: Response,
  costTL: number,
  remainingTL: number,
  remainingUSD: number,
  requestId: string,
): void {
  setBillingHeaders(res, costTL, remainingTL, requestId);
  res.setHeader("X-YZ-Remaining-USD", remainingUSD.toFixed(4));
}

/**
 * Faz 1 paket dalı: istek bir paket entitlement'ından karşılanıyorsa (billedViaPackage)
 * bakiye reserve/settle YAPILMAZ — sadece kota usage'ı yazılır (costTL=0), hatada slot iade.
 * Aksi halde mevcut PAYG settleReservedUsage (DOKUNULMAZ) aynen çağrılır.
 */
async function settleBilling(opts: {
  billedViaPackage: boolean;
  entitlementId?: string;
  userId: string;
  apiKeyId: string;
  model: MasterModel;
  usage: { promptTokens: number; completionTokens: number };
  requestId: string;
  upstreamRequestId?: string;
  rawUsageJson?: unknown;
  responseMs: number;
  status: "success" | "error" | "stream_missing_usage";
  errorCode?: string;
  profileId?: string;
}): Promise<{ costTL: number; remainingTL: number }> {
  if (opts.billedViaPackage) {
    const isError = opts.status === "error";
    if (isError && opts.entitlementId) {
      await releasePackageSlot(opts.entitlementId);
    }
    if (opts.entitlementId) {
      await recordPackageUsage({
        userId: opts.userId,
        apiKeyId: opts.apiKeyId,
        modelId: opts.model.id,
        entitlementId: opts.entitlementId,
        inputUsage: opts.usage.promptTokens,
        outputUsage: opts.usage.completionTokens,
        responseMs: opts.responseMs,
        status: isError ? "error" : "success",
        requestId: opts.requestId,
        upstreamRequestId: opts.upstreamRequestId,
        errorCode: isError ? opts.errorCode : undefined,
      });
    }
    const snap = await getUserBalanceSnapshot(opts.userId);
    return { costTL: 0, remainingTL: snap.remainingTL };
  }
  return await settleReservedUsage({
    userId: opts.userId,
    apiKeyId: opts.apiKeyId,
    model: opts.model,
    usage: opts.usage,
    requestId: opts.requestId,
    upstreamRequestId: opts.upstreamRequestId,
    rawUsageJson: opts.rawUsageJson,
    responseMs: opts.responseMs,
    status: opts.status,
    errorCode: opts.errorCode,
    profileId: opts.profileId,
  });
}

function upstreamErrorCode(err: unknown): string {
  const e = err as Error & { status?: number };
  return e.status ? `upstream_${e.status}` : "upstream_error";
}

// chat/completions gövdesinden web_search opsiyonunu çözer. Kabul edilen biçimler:
//   web_search: true                      → { enabled:true, mode:"auto", num:default }
//   web_search: { enabled, mode, num }     → alanlar (mode auto|always|off)
//   (yok / false)                          → { enabled:false }
// Bu alan upstream'e GÖNDERİLMEZ (çağıran strip eder).
function parseWebSearchOption(body: Record<string, unknown>): { enabled: boolean; mode: WebSearchMode; num: number } {
  const raw = body.web_search;
  if (raw === true) return { enabled: true, mode: "auto", num: WEB_SEARCH_DEFAULT_NUM };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const enabled = o.enabled !== false; // {mode:...} verildiyse varsayılan açık
    const mode: WebSearchMode = o.mode === "always" ? "always" : o.mode === "off" ? "off" : "auto";
    return { enabled, mode, num: clampSearchNum(o.num ?? WEB_SEARCH_DEFAULT_NUM) };
  }
  return { enabled: false, mode: "off", num: WEB_SEARCH_DEFAULT_NUM };
}

async function handleTextJsonEndpoint(
  req: Request,
  res: Response,
  next: NextFunction,
  endpoint: "responses" | "messages"
): Promise<void> {
  const { model } = req.body as { model?: string };
  const userId = req.user!.id;
  const apiKeyId = req.apiKey!.id;
  const requestId = (req as any).id as string;
  const start = Date.now();
  let masterModel: MasterModel | undefined;
  let guard: RequestGuardResult | undefined;
  let runtimeConfig: RuntimeApiConfig | undefined;
  let billedViaPackage = false;
  let entitlementId: string | undefined;

  try {
    const enforcement = await enforceRequestGuards({
      userId,
      apiKeyId,
      ipAddress: req.ip,
      modelId: model,
      endpoint,
      body: req.body as Record<string, unknown>,
    });
    masterModel = enforcement.masterModel;
    runtimeConfig = enforcement.runtimeConfig;
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }
    const effectiveMaxOutputTokens = computeEffectiveMaxOutputTokens(
      enforcement.masterModel,
      enforcement.runtimeConfig,
      enforcement.apiKeyPolicy,
      enforcement.runtimePolicy,
    );
    guard = buildRequestGuard({
      endpoint,
      model: {
        maxOutputTokens: effectiveMaxOutputTokens,
        supportsStreaming: endpointSupportsStreaming(enforcement.masterModel, endpoint),
      },
      body: req.body as Record<string, unknown>,
      endpointEnabled: endpointEnabledFor(enforcement.runtimeConfig, endpoint),
      contextLimitTokens: computeEffectiveContextLimit(
        enforcement.masterModel,
        enforcement.runtimeConfig,
        enforcement.apiKeyPolicy,
        enforcement.runtimePolicy,
      ),
      outputReserveTokens: computeEffectiveOutputReserve(enforcement.runtimeConfig, effectiveMaxOutputTokens),
      maxTokensPerRequest: effectiveMaxOutputTokens,
      allowStreaming: enforcement.runtimeConfig.allowStreaming && (enforcement.apiKeyPolicy?.allowStreaming ?? true) !== false && (enforcement.runtimePolicy?.allowStreaming ?? true) !== false,
      temperatureMin: enforcement.runtimeConfig.defaultTemperatureMin,
      temperatureMax: enforcement.runtimeConfig.defaultTemperatureMax,
      topPMin: enforcement.runtimeConfig.defaultTopPMin,
      topPMax: enforcement.runtimeConfig.defaultTopPMax,
    });
    // Faz 1 paket kota dalı (reserve'den ÖNCE): istek bir paket entitlement'ının
    // kapsadığı modeldeyse ve günlük kota varsa atomik slot rezerve edilir ve bakiye
    // reserve'i ATLANIR. Aksi halde mevcut PAYG reserveUsageBudget (DOKUNULMAZ) çalışır.
    const pkgSlot = await tryReservePackageSlot(userId, masterModel.id);
    billedViaPackage = pkgSlot.covered;
    entitlementId = pkgSlot.entitlementId;
    if (billedViaPackage && pkgSlot.maxContextTokens && guard.contextTokens > pkgSlot.maxContextTokens) {
      await releasePackageSlot(pkgSlot.entitlementId!);
      billedViaPackage = false; entitlementId = undefined;
      throw new AppError(400, `Bağlam çok büyük (tahmini ${guard.contextTokens.toLocaleString("tr-TR")} token; bu paketin limiti ${pkgSlot.maxContextTokens.toLocaleString("tr-TR")} token). Lütfen bağlamınızı kısaltın.`);
    }
    if (billedViaPackage && pkgSlot.tpmLimit && pkgSlot.packageId) {
      if (!consumeTpmOrDeny(userId, pkgSlot.packageId, guard.contextTokens, pkgSlot.tpmLimit)) {
        await releasePackageSlot(pkgSlot.entitlementId!);
        billedViaPackage = false; entitlementId = undefined;
        throw new RateLimitError(`Token/dakika limiti aşıldı (${pkgSlot.tpmLimit.toLocaleString("tr-TR")} token/dk). Lütfen bir dakika bekleyin.`);
      }
    }
    if (!billedViaPackage) {
      if (await hasActivePackageForModel(userId, masterModel.id)) {
        throw new AppError(402, "Günlük istek limitiniz doldu. Yeni paket alın ya da kredinizden kullanın.");
      }
      await reserveUsageBudget({
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: guard.reservedCompletionTokens },
        requestId,
      });
    }
    const providerBody = {
      ...guard.guardedBody,
      model: runtimeConfig.strictCanonicalModelIds ? masterModel.id : String(model || masterModel.id),
      user: userId,
    };
    // Per-model upstream routing: the model decides which provider profile serves
    // it (Claude → wellflow, GPT/Gemini/o-series + opus-4.8 → popusk); falls back to
    // the active provider when the model is pinned to no enabled profile.
    let chain = await resolveProviderChainForModel(masterModel.id);
    // Paket-bazlı upstream override: paketin endpoint+key alanları DOLUYSA istek oraya
    // gider (failover yok); boş/çözülemezken normal routing — davranış değişmez.
    if (billedViaPackage) {
      const pkgChain = packageOverrideChain(pkgSlot);
      if (pkgChain) chain = pkgChain;
    }
    if (chain.primary.profileId === "rika") (providerBody as Record<string, unknown>).customerId = userId;
    const activeProviderAdapter = await getActiveProviderAdapter();
    const failover = await forwardWithFailover(chain, {}, (ctx, attempt) =>
      endpoint === "responses"
        ? activeProviderAdapter.forwardResponses(providerBody, ctx, attempt)
        : activeProviderAdapter.forwardMessages(providerBody, ctx, attempt));
    const { raw, usage } = failover.result;
    const responseMs = Date.now() - start;

    // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında devreye girer.
    // Sağlayıcı geçerli raporlarsa (normalize > eşik) char/4 ile şişirilmez (Claude Code
    // büyük-JSON fazla-faturalama düzeltmesi). Bkz resolveBilledPromptTokens.
    const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);

    const { costTL, remainingTL } = await settleBilling({
      billedViaPackage,
      entitlementId,
      userId,
      apiKeyId,
      model: masterModel,
      usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
      requestId,
      rawUsageJson: usage,
      responseMs,
      status: "success",
      profileId: failover.servedBy ?? undefined,
    });

    const { remainingUSD } = await getUserBalanceSnapshot(userId);
    setExtendedBillingHeaders(res, costTL, remainingTL, remainingUSD, requestId);
    res.json(raw);
  } catch (err) {
    if (err instanceof InsufficientBalanceError || err instanceof RateLimitError || err instanceof ModelNotFoundError || err instanceof ModelDisabledError || err instanceof BadRequestError) {
      return next(err);
    }
    if (masterModel && guard) {
      const responseMs = Date.now() - start;
      settleBilling({
        billedViaPackage,
        entitlementId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: 0 },
        requestId,
        rawUsageJson: { promptTokens: guard.contextTokens, completionTokens: 0 },
        errorCode: upstreamErrorCode(err),
        responseMs,
        status: "error",
      })
        .catch((e2) => logger.error({ err: e2 }, "error usage record failed"));
    }
    if (runtimeConfig && forwardUpstreamError(err, res, runtimeConfig)) return;
    return next(err);
  }
}

// POST /v1/chat/completions
router.post("/chat/completions", requireProxy, async (req: Request, res: Response, next: NextFunction) => {
  const { model, stream } = req.body as { model?: string; stream?: boolean };
  const userId = req.user!.id;
  const apiKeyId = req.apiKey!.id;
  const requestId = (req as any).id as string;

  const start = Date.now();
  const isStream = stream === true;
  let masterModel: MasterModel | undefined;
  let guard: RequestGuardResult | undefined;
  let runtimeConfig: RuntimeApiConfig | undefined;
  let billedViaPackage = false;
  let entitlementId: string | undefined;
  let webSearchPerformed = false;
  let webSearchResultCount = 0;

  try {
    const enforcement = await enforceRequestGuards({
      userId,
      apiKeyId,
      ipAddress: req.ip,
      modelId: model,
      endpoint: "chat",
      body: req.body as Record<string, unknown>,
    });
    masterModel = enforcement.masterModel;
    runtimeConfig = enforcement.runtimeConfig;
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }

    // ── Web Search auto-augment ───────────────────────────────────────────────
    // web_search:true (mode:auto) → "güncel" soru sezilirse arka planda arama yapılır,
    // sonuçlar prompt'a enjekte edilir (artan input token normal faturalanır) + arama
    // başına sabit $0.001 izole ücret (billing reserve/settle'a DOKUNMAZ). web_search
    // alanı upstream'e GÖNDERİLMEZ (her durumda strip edilir).
    const wsOption = parseWebSearchOption(req.body as Record<string, unknown>);
    if ("web_search" in (req.body as Record<string, unknown>)) {
      delete (req.body as Record<string, unknown>).web_search;
    }
    if (wsOption.enabled && !isStream) {
      const userText = extractLatestUserText((req.body as { messages?: unknown }).messages);
      if (shouldSearch(userText, wsOption.mode)) {
        const wsQuery = buildSearchQuery(userText);
        const { results } = await performWebSearch(wsQuery, wsOption.num);
        if (results.length > 0) {
          (req.body as Record<string, unknown>).messages = buildAugmentedMessages(
            (req.body as { messages?: unknown[] }).messages ?? [],
            results,
            wsQuery,
            new Date(),
          );
          webSearchPerformed = true;
          webSearchResultCount = results.length;
        }
      }
    }

    const effectiveMaxOutputTokens = computeEffectiveMaxOutputTokens(
      enforcement.masterModel,
      enforcement.runtimeConfig,
      enforcement.apiKeyPolicy,
      enforcement.runtimePolicy,
    );
    guard = buildRequestGuard({
      endpoint: "chat",
      model: {
        maxOutputTokens: effectiveMaxOutputTokens,
        supportsStreaming: endpointSupportsStreaming(enforcement.masterModel, "chat"),
      },
      body: req.body as Record<string, unknown>,
      endpointEnabled: endpointEnabledFor(enforcement.runtimeConfig, "chat"),
      contextLimitTokens: computeEffectiveContextLimit(
        enforcement.masterModel,
        enforcement.runtimeConfig,
        enforcement.apiKeyPolicy,
        enforcement.runtimePolicy,
      ),
      outputReserveTokens: computeEffectiveOutputReserve(enforcement.runtimeConfig, effectiveMaxOutputTokens),
      maxTokensPerRequest: effectiveMaxOutputTokens,
      allowStreaming: enforcement.runtimeConfig.allowStreaming && (enforcement.apiKeyPolicy?.allowStreaming ?? true) !== false && (enforcement.runtimePolicy?.allowStreaming ?? true) !== false,
      temperatureMin: enforcement.runtimeConfig.defaultTemperatureMin,
      temperatureMax: enforcement.runtimeConfig.defaultTemperatureMax,
      topPMin: enforcement.runtimeConfig.defaultTopPMin,
      topPMax: enforcement.runtimeConfig.defaultTopPMax,
    });
    // Faz 1 paket kota dalı (reserve'den ÖNCE): istek bir paket entitlement'ının
    // kapsadığı modeldeyse ve günlük kota varsa atomik slot rezerve edilir ve bakiye
    // reserve'i ATLANIR. Aksi halde mevcut PAYG reserveUsageBudget (DOKUNULMAZ) çalışır.
    const pkgSlot = await tryReservePackageSlot(userId, masterModel.id);
    billedViaPackage = pkgSlot.covered;
    entitlementId = pkgSlot.entitlementId;
    if (billedViaPackage && pkgSlot.maxContextTokens && guard.contextTokens > pkgSlot.maxContextTokens) {
      await releasePackageSlot(pkgSlot.entitlementId!);
      billedViaPackage = false; entitlementId = undefined;
      throw new AppError(400, `Bağlam çok büyük (tahmini ${guard.contextTokens.toLocaleString("tr-TR")} token; bu paketin limiti ${pkgSlot.maxContextTokens.toLocaleString("tr-TR")} token). Lütfen bağlamınızı kısaltın.`);
    }
    if (billedViaPackage && pkgSlot.tpmLimit && pkgSlot.packageId) {
      if (!consumeTpmOrDeny(userId, pkgSlot.packageId, guard.contextTokens, pkgSlot.tpmLimit)) {
        await releasePackageSlot(pkgSlot.entitlementId!);
        billedViaPackage = false; entitlementId = undefined;
        throw new RateLimitError(`Token/dakika limiti aşıldı (${pkgSlot.tpmLimit.toLocaleString("tr-TR")} token/dk). Lütfen bir dakika bekleyin.`);
      }
    }
    if (!billedViaPackage) {
      if (await hasActivePackageForModel(userId, masterModel.id)) {
        throw new AppError(402, "Günlük istek limitiniz doldu. Yeni paket alın ya da kredinizden kullanın.");
      }
      await reserveUsageBudget({
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: guard.reservedCompletionTokens },
        requestId,
      });
    }
    const providerBody = {
      ...guard.guardedBody,
      model: runtimeConfig.strictCanonicalModelIds ? masterModel.id : String(model || masterModel.id),
      user: userId,
    };
    // Per-model upstream routing (see handleTextJsonEndpoint): model → provider + failover.
    let chain = await resolveProviderChainForModel(masterModel.id);
    // Paket-bazlı upstream override (bkz handleTextJsonEndpoint): doluysa tek-sağlayıcı zincir.
    if (billedViaPackage) {
      const pkgChain = packageOverrideChain(pkgSlot);
      if (pkgChain) chain = pkgChain;
    }
    if (chain.primary.profileId === "rika") (providerBody as Record<string, unknown>).customerId = userId;
    const activeProviderAdapter = await getActiveProviderAdapter();

    if (isStream) {
      res.setHeader("X-YZ-Request-Id", requestId);
      const { result: usage, servedBy: chatStreamProfileId } = await forwardWithFailover(chain, { res }, (ctx, attempt) =>
        activeProviderAdapter.forwardChatStream(providerBody as any, res, ctx, attempt));
      const responseMs = Date.now() - start;

      const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0;
      const streamStatus = hasUsage
        ? "success"
        : (runtimeConfig?.streamMissingUsageFallbackEnabled === false ? "error" : "stream_missing_usage");
      // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında devreye girer
      // (geçerli raporda char/4 ile şişirmez). Bkz resolveBilledPromptTokens.
      const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);
      await settleBilling({
        billedViaPackage,
        entitlementId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
        requestId,
        rawUsageJson: usage,
        errorCode: streamStatus === "stream_missing_usage" ? "stream_missing_usage" : undefined,
        responseMs,
        status: streamStatus,
        profileId: chatStreamProfileId ?? undefined,
      });
    } else {
      const { result: { raw, usage }, servedBy: chatProfileId } = await forwardWithFailover(chain, {}, (ctx, attempt) =>
        activeProviderAdapter.forwardChat(providerBody as any, ctx, attempt));
      const responseMs = Date.now() - start;

      // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında (ör. cache alanı /
      // prompt_tokens=2) devreye girip kendi sunucu-tarafı giriş sayımımızı (guard.contextTokens)
      // taban alır → EKSİK tahsil (zarar) engellenir. Sağlayıcı GEÇERLİ raporladığında (normalize
      // > eşik) char/4 ile ŞİŞİRİLMEZ → Claude Code büyük-JSON FAZLA-faturalaması engellenir.
      // Bkz resolveBilledPromptTokens. Faturalanan değer asla sağlayıcı normalize'ın altına düşmez.
      const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);

      const { costTL } = await settleBilling({
        billedViaPackage,
        entitlementId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
        requestId,
        rawUsageJson: usage,
        responseMs,
        status: "success",
        profileId: chatProfileId ?? undefined,
      });

      // Web-search auto-augment yapıldıysa: arama başına sabit $0.001 izole ücret
      // (billing reserve/settle'a DOKUNMAZ; kendi idempotent tahsil yolu, drift=0).
      if (webSearchPerformed) {
        try {
          await chargeWebSearch({
            userId,
            apiKeyId,
            webSearchRequestId: `ws_${requestId}`,
            resultCount: webSearchResultCount,
            responseMs,
            status: "success",
            source: "auto_augment",
          });
        } catch (e2) {
          // Ücret tahsili hizmeti BLOKLAMAZ (chat zaten teslim edildi). Sadece logla.
          logger.error({ err: e2 }, "[web-search] auto-augment fee charge failed");
        }
      }

      // Bakiye anlık görüntüsü web-search ücreti SONRASI alınır (header güncel kalsın).
      const { remainingTL: finalRemainingTL, remainingUSD } = await getUserBalanceSnapshot(userId);
      setExtendedBillingHeaders(res, costTL, finalRemainingTL, remainingUSD, requestId);
      res.json(raw);
    }
  } catch (err) {
    const e = err as Error & { status?: number; body?: unknown };

    if (err instanceof InsufficientBalanceError) {
      return next(err);
    }
    if (err instanceof RateLimitError) {
      return next(err);
    }
    if (err instanceof ModelNotFoundError || err instanceof ModelDisabledError || err instanceof BadRequestError) {
      return next(err);
    }

    if (masterModel && guard) {
      const responseMs = Date.now() - start;
      settleBilling({
        billedViaPackage,
        entitlementId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: 0 },
        requestId,
        rawUsageJson: { promptTokens: guard.contextTokens, completionTokens: 0 },
        errorCode: upstreamErrorCode(err),
        responseMs,
        status: "error",
      })
        .catch((e2) => logger.error({ err: e2 }, "error usage record failed"));
    }

    if (runtimeConfig && forwardUpstreamError(err, res, runtimeConfig)) return;
    return next(err);
  }
});

// GET /v1/balance
router.get("/balance", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runtimeConfig = await getRuntimeApiConfig();
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }
    const snapshot = await getUserBalanceSnapshot(req.user!.id);
    res.json({
      object: "balance",
      balance: {
        tl: snapshot.remainingTL.toFixed(2),
        usd: snapshot.remainingUSD.toFixed(4),
      },
      currency: {
        primary: "USD",
        settlement: "TRY",
        kur: snapshot.kur > 0 ? snapshot.kur.toFixed(6) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── /v1/responses — OpenAI Responses API (Codex CLI) ─────────────────────────
// Codex CLI (>=0.99) yalnız Responses API konuşur; upstream sağlayıcılar yalnız
// /chat/completions sunar (/responses → 404). Bu handler gelen Responses isteğini
// chat/completions'a çevirir, AYNI billing/guard/routing yolundan geçirir (endpoint
// "chat" olarak çözülür → "model does not support responses" 400'ü ortadan kalkar),
// chat yanıtını (stream veya non-stream) Codex'in beklediği Responses formatına çevirir.
// Para yolu (reserve/settle/resolveBilledPromptTokens) chat handler ile BİREBİR aynıdır.
async function handleResponsesEndpoint(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isStream = (req.body as { stream?: boolean }).stream === true;
  const userId = req.user!.id;
  const apiKeyId = req.apiKey!.id;
  const requestId = (req as any).id as string;
  const start = Date.now();
  const createdAt = Math.floor(start / 1000);

  let masterModel: MasterModel | undefined;
  let guard: RequestGuardResult | undefined;
  let runtimeConfig: RuntimeApiConfig | undefined;
  let billedViaPackage = false;
  let entitlementId: string | undefined;

  if (!(req.body as Record<string, unknown>).model) {
    res.status(400).json({ error: { message: "model field is required", type: "invalid_request_error" } });
    return;
  }

  try {
    // 1) Responses isteğini chat/completions şemasına çevir (model slug alias dahil).
    const rawResponsesBody = req.body as Record<string, unknown>;
    const customerId = typeof rawResponsesBody.customerId === "string" && rawResponsesBody.customerId.trim()
      ? rawResponsesBody.customerId.trim()
      : null;
    const chatBody = responsesRequestToChat(rawResponsesBody);

    // customerId varsa messages'ın başına (veya mevcut system mesajına) enjekte et.
    if (customerId) {
      const msgs = chatBody.messages as Array<Record<string, unknown>>;
      const sysIdx = msgs.findIndex((m) => m.role === "system");
      if (sysIdx >= 0) {
        msgs[sysIdx] = { ...msgs[sysIdx], content: `Customer ID: ${customerId}\n\n${msgs[sysIdx].content ?? ""}` };
      } else {
        msgs.unshift({ role: "system", content: `Customer ID: ${customerId}` });
      }
    }

    // 2) Guard/billing pipeline'ı endpoint "chat" ile çalıştır (model çözümlemesi chat
    //    uçlarını kullanır; allowResponsesEndpoint toggle'ı buildRequestGuard'a verilir).
    const enforcement = await enforceRequestGuards({
      userId,
      apiKeyId,
      ipAddress: req.ip,
      modelId: chatBody.model as string | undefined,
      endpoint: "chat",
      body: chatBody as Record<string, unknown>,
    });
    masterModel = enforcement.masterModel;
    runtimeConfig = enforcement.runtimeConfig;
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }

    const effectiveMaxOutputTokens = computeEffectiveMaxOutputTokens(
      enforcement.masterModel,
      enforcement.runtimeConfig,
      enforcement.apiKeyPolicy,
      enforcement.runtimePolicy,
    );
    guard = buildRequestGuard({
      endpoint: "chat",
      model: {
        maxOutputTokens: effectiveMaxOutputTokens,
        supportsStreaming: true,
      },
      body: chatBody as Record<string, unknown>,
      // allowResponsesEndpoint admin toggle'ı burada uygulanır (kapalıysa guard reddeder).
      endpointEnabled: endpointEnabledFor(enforcement.runtimeConfig, "responses"),
      contextLimitTokens: computeEffectiveContextLimit(
        enforcement.masterModel,
        enforcement.runtimeConfig,
        enforcement.apiKeyPolicy,
        enforcement.runtimePolicy,
      ),
      outputReserveTokens: computeEffectiveOutputReserve(enforcement.runtimeConfig, effectiveMaxOutputTokens),
      maxTokensPerRequest: effectiveMaxOutputTokens,
      allowStreaming: enforcement.runtimeConfig.allowStreaming && (enforcement.apiKeyPolicy?.allowStreaming ?? true) !== false && (enforcement.runtimePolicy?.allowStreaming ?? true) !== false,
      temperatureMin: enforcement.runtimeConfig.defaultTemperatureMin,
      temperatureMax: enforcement.runtimeConfig.defaultTemperatureMax,
      topPMin: enforcement.runtimeConfig.defaultTopPMin,
      topPMax: enforcement.runtimeConfig.defaultTopPMax,
    });

    // Faz 1 paket kota dalı (reserve'den ÖNCE): istek bir paket entitlement'ının
    // kapsadığı modeldeyse ve günlük kota varsa atomik slot rezerve edilir ve bakiye
    // reserve'i ATLANIR. Aksi halde mevcut PAYG reserveUsageBudget (DOKUNULMAZ) çalışır.
    const pkgSlot = await tryReservePackageSlot(userId, masterModel.id);
    billedViaPackage = pkgSlot.covered;
    entitlementId = pkgSlot.entitlementId;
    if (billedViaPackage && pkgSlot.maxContextTokens && guard.contextTokens > pkgSlot.maxContextTokens) {
      await releasePackageSlot(pkgSlot.entitlementId!);
      billedViaPackage = false; entitlementId = undefined;
      throw new AppError(400, `Bağlam çok büyük (tahmini ${guard.contextTokens.toLocaleString("tr-TR")} token; bu paketin limiti ${pkgSlot.maxContextTokens.toLocaleString("tr-TR")} token). Lütfen bağlamınızı kısaltın.`);
    }
    if (billedViaPackage && pkgSlot.tpmLimit && pkgSlot.packageId) {
      if (!consumeTpmOrDeny(userId, pkgSlot.packageId, guard.contextTokens, pkgSlot.tpmLimit)) {
        await releasePackageSlot(pkgSlot.entitlementId!);
        billedViaPackage = false; entitlementId = undefined;
        throw new RateLimitError(`Token/dakika limiti aşıldı (${pkgSlot.tpmLimit.toLocaleString("tr-TR")} token/dk). Lütfen bir dakika bekleyin.`);
      }
    }
    if (!billedViaPackage) {
      if (await hasActivePackageForModel(userId, masterModel.id)) {
        throw new AppError(402, "Günlük istek limitiniz doldu. Yeni paket alın ya da kredinizden kullanın.");
      }
      await reserveUsageBudget({
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: guard.reservedCompletionTokens },
        requestId,
      });
    }

    const providerBody = {
      ...guard.guardedBody,
      model: runtimeConfig.strictCanonicalModelIds ? masterModel.id : String(chatBody.model || masterModel.id),
      user: userId,
    };
    let chain = await resolveProviderChainForModel(masterModel.id);
    // Paket-bazlı upstream override (bkz handleTextJsonEndpoint): doluysa tek-sağlayıcı zincir.
    if (billedViaPackage) {
      const pkgChain = packageOverrideChain(pkgSlot);
      if (pkgChain) chain = pkgChain;
    }
    if (chain.primary.profileId === "rika") (providerBody as Record<string, unknown>).customerId = userId;
    const activeProviderAdapter = await getActiveProviderAdapter();

    if (isStream) {
      res.setHeader("X-YZ-Request-Id", requestId);
      const { result: usage, servedBy: responsesStreamProfileId } = await forwardWithFailover(chain, { res }, (ctx, attempt) =>
        activeProviderAdapter.forwardResponsesStream(
          providerBody as any,
          res,
          ctx,
          { id: requestId, model: masterModel!.id, createdAt },
          attempt,
        ));
      const responseMs = Date.now() - start;

      const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0;
      const streamStatus = hasUsage
        ? "success"
        : (runtimeConfig?.streamMissingUsageFallbackEnabled === false ? "error" : "stream_missing_usage");
      const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);
      await settleBilling({
        billedViaPackage,
        entitlementId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
        requestId,
        rawUsageJson: usage,
        errorCode: streamStatus === "stream_missing_usage" ? "stream_missing_usage" : undefined,
        responseMs,
        status: streamStatus,
        profileId: responsesStreamProfileId ?? undefined,
      });
    } else {
      const { result: { raw, usage }, servedBy: responsesProfileId } = await forwardWithFailover(chain, {}, (ctx, attempt) =>
        activeProviderAdapter.forwardChat(providerBody as any, ctx, attempt));
      const responseMs = Date.now() - start;

      const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);
      const { costTL, remainingTL } = await settleBilling({
        billedViaPackage,
        entitlementId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
        requestId,
        rawUsageJson: usage,
        responseMs,
        status: "success",
        profileId: responsesProfileId ?? undefined,
      });

      const { remainingUSD } = await getUserBalanceSnapshot(userId);
      setExtendedBillingHeaders(res, costTL, remainingTL, remainingUSD, requestId);
      res.json(chatCompletionToResponses(raw, { id: requestId, model: masterModel.id, createdAt }));
    }
  } catch (err) {
    if (err instanceof InsufficientBalanceError || err instanceof RateLimitError || err instanceof ModelNotFoundError || err instanceof ModelDisabledError || err instanceof BadRequestError) {
      return next(err);
    }
    if (masterModel && guard) {
      const responseMs = Date.now() - start;
      settleBilling({
        billedViaPackage,
        entitlementId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: 0 },
        requestId,
        rawUsageJson: { promptTokens: guard.contextTokens, completionTokens: 0 },
        errorCode: upstreamErrorCode(err),
        responseMs,
        status: "error",
      })
        .catch((e2) => logger.error({ err: e2 }, "error usage record failed (responses)"));
    }
    // Stream başladıysa header'lar gönderilmiştir; forwardUpstreamError yalnız header
    // gönderilmemişse JSON yazabilir (aksi halde stream zaten kapanır).
    if (runtimeConfig && !res.headersSent && forwardUpstreamError(err, res, runtimeConfig)) return;
    return next(err);
  }
}

// POST /v1/responses
router.post("/responses", requireProxy, (req: Request, res: Response, next: NextFunction) => {
  void handleResponsesEndpoint(req, res, next);
});

// POST /v1/messages
router.post("/messages", requireProxy, (req: Request, res: Response, next: NextFunction) => {
  void handleTextJsonEndpoint(req, res, next, "messages");
});

// POST /v1/web-search — standalone güncel web araması (sabit ücret $0.001/arama).
// apiKeyAuth + requireWhatsappVerified arkasında. Billing reserve/settle'a DOKUNMAZ;
// izole sabit-ücret tahsili (web-search-billing-service). Upstream maliyeti $0.
router.post("/web-search", requireProxy, async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user!.id;
  const apiKeyId = req.apiKey!.id;
  const requestId = (req as any).id as string;
  const start = Date.now();
  try {
    const runtimeConfig = await getRuntimeApiConfig();
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }

    const { query, num } = req.body as { query?: unknown; num?: unknown };
    const q = typeof query === "string" ? query.trim() : "";
    if (!q) {
      throw new BadRequestError("query alanı zorunludur (string).");
    }

    // Rate limit (chat ile aynı kova).
    const rl = await checkRateLimit(apiKeyId, userId, req.ip);
    if (!rl.allowed) {
      throw new RateLimitError("Rate limit exceeded", rl.retryAfter);
    }

    // Bakiye guard: ücretli (sabit) işlem → reserve mantığı gibi önce balance>0.
    const balRows = await db.select({ bakiye: users.bakiyeTL }).from(users).where(eq(users.id, userId)).limit(1);
    const balance = Number(balRows[0]?.bakiye ?? 0);
    if (runtimeConfig.insufficientBalanceBlockEnabled && balance <= 0) {
      throw new InsufficientBalanceError("Insufficient balance to process web search");
    }

    const searchNum = clampSearchNum(num ?? WEB_SEARCH_DEFAULT_NUM);
    const { results } = await performWebSearch(q, searchNum);
    const responseMs = Date.now() - start;

    // Sonuç bulunduysa ücret kes; bulunmadıysa (upstream boş/hata) ÜCRET KESME (no_charge).
    const charge = await chargeWebSearch({
      userId,
      apiKeyId,
      webSearchRequestId: `ws_${requestId}`,
      resultCount: results.length,
      responseMs,
      status: results.length > 0 ? "success" : "no_charge",
      source: "standalone",
    });

    const { remainingUSD } = await getUserBalanceSnapshot(userId);
    setExtendedBillingHeaders(res, charge.costTL, charge.remainingTL, remainingUSD, requestId);
    res.json({
      object: "web_search",
      query: q,
      results,
      cost: { tl: charge.costTL.toFixed(4), usd: charge.costUsd.toFixed(8) },
    });
  } catch (err) {
    if (
      err instanceof InsufficientBalanceError ||
      err instanceof RateLimitError ||
      err instanceof BadRequestError ||
      err instanceof AppError
    ) {
      return next(err);
    }
    logger.error({ err }, "[web-search] standalone endpoint error");
    return next(err);
  }
});

// Görsel üretim handler (Faz 4a). Token-guard'ı BYPASS eder (web-search gibi) —
// görsel istekleri token reserve/settle yoluna girmez; sabit per-image ücret (chargeImage).
// billing-service DOKUNULMAZ. Gerçek üretim upstream görsel desteğine bağlı.
async function handleImageEndpoint(
  req: Request,
  res: Response,
  next: NextFunction,
  endpoint: "generations" | "edits",
): Promise<void> {
  const userId = req.user!.id;
  const apiKeyId = req.apiKey!.id;
  const requestId = (req as any).id as string;
  const start = Date.now();
  const { model } = req.body as { model?: string };
  let masterModel: MasterModel | undefined;
  let runtimeConfig: RuntimeApiConfig | undefined;

  try {
    runtimeConfig = await getRuntimeApiConfig();
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }

    const resolved = await resolveEnabledModel(model, "images");
    masterModel = resolved.masterModel;
    if (masterModel.type !== "Görsel") {
      throw new BadRequestError(`Model görsel üretimi desteklemiyor: ${masterModel.id}`);
    }

    const rl = await checkRateLimit(apiKeyId, userId, req.ip);
    if (!rl.allowed) {
      throw new RateLimitError("Rate limit exceeded", rl.retryAfter);
    }

    const balRows = await db.select({ bakiye: users.bakiyeTL }).from(users).where(eq(users.id, userId)).limit(1);
    const balance = Number(balRows[0]?.bakiye ?? 0);
    if (runtimeConfig.insufficientBalanceBlockEnabled && balance <= 0) {
      throw new InsufficientBalanceError("Insufficient balance to process image request");
    }

    const providerCtx = await resolveProviderForModel(masterModel.id);
    const adapter = await getActiveProviderAdapter();
    const providerBody = { ...(req.body as Record<string, unknown>), model: masterModel.id };

    // Global eşzamanlılık kapısı (kuyruk) + upstream forward.
    const { raw, imageCount } = await withImageSlot(() => adapter.forwardImage(endpoint, providerBody, providerCtx));
    const responseMs = Date.now() - start;

    const charge = await chargeImage({
      userId,
      apiKeyId,
      model: masterModel,
      imageRequestId: `img_${requestId}`,
      imageCount,
      responseMs,
      status: imageCount > 0 ? "success" : "no_charge",
    });

    const { remainingUSD } = await getUserBalanceSnapshot(userId);
    setExtendedBillingHeaders(res, charge.costTL, charge.remainingTL, remainingUSD, requestId);
    res.json(raw);
  } catch (err) {
    if (
      err instanceof InsufficientBalanceError ||
      err instanceof RateLimitError ||
      err instanceof ModelNotFoundError ||
      err instanceof ModelDisabledError ||
      err instanceof BadRequestError
    ) {
      return next(err);
    }
    // Upstream hatası → ÜCRET KESME (no_charge usage kaydı), hatayı ilet.
    if (masterModel) {
      const responseMs = Date.now() - start;
      chargeImage({
        userId, apiKeyId, model: masterModel, imageRequestId: `img_${requestId}`,
        imageCount: 0, responseMs, status: "no_charge",
      }).catch((e2) => logger.error({ err: e2 }, "image error usage record failed"));
    }
    if (runtimeConfig && forwardUpstreamError(err, res, runtimeConfig)) return;
    return next(err);
  }
}

// POST /v1/images/generations
router.post("/images/generations", requireProxy, (req: Request, res: Response, next: NextFunction) => {
  void handleImageEndpoint(req, res, next, "generations");
});

// POST /v1/images/edits
router.post("/images/edits", requireProxy, (req: Request, res: Response, next: NextFunction) => {
  void handleImageEndpoint(req, res, next, "edits");
});

// POST /v1/videos/submit — stub (501)
router.post("/videos/submit", requireProxy, (_req: Request, res: Response) => {
  res.status(501).json({ error: "Video endpoints not yet implemented (Phase D)" });
});

// GET /v1/videos/tasks/:taskId — stub (501)
router.get("/videos/tasks/:taskId", requireProxy, (_req: Request, res: Response) => {
  res.status(501).json({ error: "Video endpoints not yet implemented (Phase D)" });
});

export default router;
