import { Router, Request, Response, NextFunction } from "express";
import { aiProviderApiKey } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { AppError, BadRequestError, InsufficientBalanceError, ModelDisabledError, ModelNotFoundError, RateLimitError } from "../lib/errors.js";
import { canonicalizeModelId, type MasterModel } from "../../master-models.js";
import { checkRateLimit } from "../services/rate-limit-service.js";
import { reserveUsageBudget, settleReservedUsage } from "../services/billing-service.js";
import { resolveActiveCatalogModel } from "../services/added-model-service.js";
import { getActiveProviderAdapter } from "../services/provider-adapter.js";
import { db } from "../db/client.js";
import { modelOverrides, systemConfig, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { buildRequestGuard, resolveBilledPromptTokens, type RequestGuardResult } from "../services/request-guard-service.js";
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
  if (runtimeConfig.insufficientBalanceBlockEnabled && balance <= 0) {
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

function upstreamErrorCode(err: unknown): string {
  const e = err as Error & { status?: number };
  return e.status ? `upstream_${e.status}` : "upstream_error";
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
    await reserveUsageBudget({
      userId,
      apiKeyId,
      model: masterModel,
      usage: { promptTokens: guard.contextTokens, completionTokens: guard.reservedCompletionTokens },
      requestId,
    });
    const providerBody = {
      ...guard.guardedBody,
      model: runtimeConfig.strictCanonicalModelIds ? masterModel.id : String(model || masterModel.id),
    };
    const activeProviderAdapter = await getActiveProviderAdapter();
    const forwarder = endpoint === "responses"
      ? activeProviderAdapter.forwardResponses.bind(activeProviderAdapter)
      : activeProviderAdapter.forwardMessages.bind(activeProviderAdapter);

    const { raw, usage } = await forwarder(providerBody);
    const responseMs = Date.now() - start;

    // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında devreye girer.
    // Sağlayıcı geçerli raporlarsa (normalize > eşik) char/4 ile şişirilmez (Claude Code
    // büyük-JSON fazla-faturalama düzeltmesi). Bkz resolveBilledPromptTokens.
    const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);

    const { costTL, remainingTL } = await settleReservedUsage({
      userId,
      apiKeyId,
      model: masterModel,
      usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
      requestId,
      rawUsageJson: usage,
      responseMs,
      status: "success",
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
      settleReservedUsage({
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
    await reserveUsageBudget({
      userId,
      apiKeyId,
      model: masterModel,
      usage: { promptTokens: guard.contextTokens, completionTokens: guard.reservedCompletionTokens },
      requestId,
    });
    const providerBody = {
      ...guard.guardedBody,
      model: runtimeConfig.strictCanonicalModelIds ? masterModel.id : String(model || masterModel.id),
    };
    const activeProviderAdapter = await getActiveProviderAdapter();

    if (isStream) {
      res.setHeader("X-YZ-Request-Id", requestId);
      const usage = await activeProviderAdapter.forwardChatStream(providerBody as any, res);
      const responseMs = Date.now() - start;

      const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0;
      const streamStatus = hasUsage
        ? "success"
        : (runtimeConfig?.streamMissingUsageFallbackEnabled === false ? "error" : "stream_missing_usage");
      // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında devreye girer
      // (geçerli raporda char/4 ile şişirmez). Bkz resolveBilledPromptTokens.
      const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);
      await settleReservedUsage({
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
        requestId,
        rawUsageJson: usage,
        errorCode: streamStatus === "stream_missing_usage" ? "stream_missing_usage" : undefined,
        responseMs,
        status: streamStatus,
      });
    } else {
      const { raw, usage } = await activeProviderAdapter.forwardChat(providerBody as any);
      const responseMs = Date.now() - start;

      // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında (ör. cache alanı /
      // prompt_tokens=2) devreye girip kendi sunucu-tarafı giriş sayımımızı (guard.contextTokens)
      // taban alır → EKSİK tahsil (zarar) engellenir. Sağlayıcı GEÇERLİ raporladığında (normalize
      // > eşik) char/4 ile ŞİŞİRİLMEZ → Claude Code büyük-JSON FAZLA-faturalaması engellenir.
      // Bkz resolveBilledPromptTokens. Faturalanan değer asla sağlayıcı normalize'ın altına düşmez.
      const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);

      const { costTL, remainingTL } = await settleReservedUsage({
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens },
        requestId,
        rawUsageJson: usage,
        responseMs,
        status: "success",
      });

      const { remainingUSD } = await getUserBalanceSnapshot(userId);
      setExtendedBillingHeaders(res, costTL, remainingTL, remainingUSD, requestId);
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
      settleReservedUsage({
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

// POST /v1/responses
router.post("/responses", requireProxy, (req: Request, res: Response, next: NextFunction) => {
  void handleTextJsonEndpoint(req, res, next, "responses");
});

// POST /v1/messages
router.post("/messages", requireProxy, (req: Request, res: Response, next: NextFunction) => {
  void handleTextJsonEndpoint(req, res, next, "messages");
});

// POST /v1/images/generations
router.post("/images/generations", requireProxy, (_req: Request, res: Response) => {
  res.status(501).json({ error: "Image generation is disabled during provider migration.", code: "media_disabled" });
});

// POST /v1/images/edits
router.post("/images/edits", requireProxy, (_req: Request, res: Response) => {
  res.status(501).json({ error: "Image editing is disabled during provider migration.", code: "media_disabled" });
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
