import { Router, Request, Response, NextFunction } from "express";
import { aiProviderApiKey, env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { AppError, BadRequestError, InsufficientBalanceError, ModelDisabledError, ModelNotFoundError, RateLimitError } from "../lib/errors.js";
import { QuotaExhaustedError, emitQuotaExhausted } from "../lib/quota-error.js";
import { emitContextTooLarge } from "../lib/context-error.js";
import { asLang } from "../middleware/request-lang.js";
import { canonicalizeModelId, modelRejectsSamplingParams, modelReasoningOutputFloor, type MasterModel } from "../../master-models.js";
import { checkRateLimit } from "../services/rate-limit-service.js";
import { reserveUsageBudget, settleReservedUsage } from "../services/billing-service.js";
import {
  checkPackageCoverage,
  tryReservePackageSlot,
  releasePackageSlot,
  recordPackageUsage,
  updateCfRemaining,
  consumeTpmOrDeny,
  hasActivePackageForModel,
  checkHourlyExceeded,
} from "../services/entitlement-service.js";
import { shouldCapOverServe } from "../services/cf-overserve-cap.js";
import { applySeatDecrement, reconcileToCf } from "../services/cf-counter-service.js";
import { chargeImage } from "../services/image-billing-service.js";
import { withImageSlot } from "../services/image-queue.js";
import { parseRequestedSize, resizeB64ToExact } from "../services/image-resize-service.js";
import { resolveActiveCatalogModel } from "../services/added-model-service.js";
import { getActiveProviderAdapter } from "../services/provider-adapter.js";
import { resolveProviderForModel, resolveProviderChainForModel, nativeResponsesCapable } from "../services/provider-config-service.js";
import type { ProviderContext, ProviderChain } from "../services/provider-config-service.js";
import { resolveLanesForModel, acquireLane, laneToContext, recordLaneBackoff, clearLaneBackoff, enqueueRequest, drainQueue, isLaneAvailable, type LaneInfo } from "../services/lane-scheduler.js";
import { forwardWithFailover } from "../services/provider-failover.js";
import { applyClaudeCloakRouteLock } from "../services/claude-cloak-route.js";
import { packageOverrideChain, entitlementOverrideChain, seatPrimaryPackageChain, cfFirstPackageChain, applyCodexSparkAlternation, applyGpt56SparkAlternation, requiresCfKeyReady } from "../services/package-provider-override.js";
import { topUpCfIfNeeded, topUpClaudeTokenOverride } from "../services/codefast-provisioning-service.js";
import { isClaudeOverrideModel, getClaudeCfOverrideSlot, buildClaudeCfChain, setClaudeOverrideRemaining } from "../services/claude-cf-override-service.js";
import { db } from "../db/client.js";
import { modelOverrides, systemConfig, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { buildRequestGuard, CONTEXT_GUARD_ESTIMATE_INFLATION, resolveBilledPromptTokens, type RequestGuardResult } from "../services/request-guard-service.js";
import { runRequestGuardrails } from "../services/request-inspection-service.js";
import { applyDefaultReasoningEffort } from "./apply-default-reasoning-effort.js";
import { performWebSearch, clampSearchNum, WEB_SEARCH_DEFAULT_NUM } from "../services/web-search-service.js";
import {
  extractLatestUserText,
  shouldSearch,
  buildSearchQuery,
  buildAugmentedMessages,
  type WebSearchMode,
} from "../services/web-search-augment.js";
import { chargeWebSearch } from "../services/web-search-billing-service.js";
import { responsesRequestToChat, chatCompletionToResponses, deriveToolKinds, summarizeToolContract, countResponseToolCalls, createResponsesStreamStats, isSuspiciousToolOutcome } from "../services/responses-translation.js";
import {
  getApiKeyPolicy,
  getModelRuntimePolicy,
  getRuntimeApiConfig,
  getUserModelAllowlist,
  type ApiKeyPolicySnapshot,
  type ModelRuntimePolicySnapshot,
  type RuntimeApiConfig,
} from "../services/api-settings-service.js";
import { acquireProxyConcurrencyGate, extractProxySessionId } from "../services/concurrent-session-gate.js";

const router = Router();

// Guard: requires upstream provider API key
function requireProxy(req: Request, res: Response, next: NextFunction): void {
  if (!aiProviderApiKey()) {
    res.status(503).json({ error: "proxy not configured" });
    return;
  }
  const apiKeyId = req.apiKey?.id;
  if (!apiKeyId) {
    next();
    return;
  }

  acquireProxyConcurrencyGate({
    apiKeyId,
    sessionId: extractProxySessionId(req.body, req.headers),
  })
    .then((gate) => {
      if (!gate.allowed) {
        if (gate.retryAfterSec) res.setHeader("Retry-After", String(gate.retryAfterSec));
        res.status(429).json({
          error: gate.reason === "max_concurrent_sessions"
            ? "Aynı anda en fazla 2 aktif session açabilirsiniz."
            : "Aynı API anahtarıyla aynı anda en fazla 10 istek çalıştırabilirsiniz.",
          code: gate.reason,
          activeRequests: gate.activeRequests,
          activeSessions: gate.activeSessions,
        });
        return;
      }
      const release = gate.release;
      if (release) {
        res.once("finish", release);
        res.once("close", release);
      }
      next();
    })
    .catch(next);
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

// GPT-5 mini fiilen sub-codex koltuğuna gpt-5.4 wire model olarak map'lenir (bkz
// provider_profiles.sub-codex.model_map) — backend kendi kimliğini "gpt-5.4" diye
// açıklayabilir. ctx.relabelResponseTo codex-spark alternasyonunun kullandığı MEVCUT mekanizma:
// closerouter-service.ts'teki applyAlternationIdentity her forward* fonksiyonunda (chat/anthropic/
// responses — native raw + streaming dahil) bunu okuyup kimlik talimatını doğru gövde alanına
// (messages[0]/system/instructions) otomatik enjekte eder. Biz burada yalnız SET ediyoruz —
// spark zaten kendi relabelResponseTo'sunu set ettiyse (gpt-5.5/5.4 spark bacağı) ONA DOKUNMA.
export const IDENTITY_OVERRIDE_MODELS: Record<string, string> = {
  "gpt-5-mini": "GPT-5 mini",
  "gpt-5-mini-2025-08-07": "GPT-5 mini",
  // Opus 4.6/4.7 ve Haiku 4.5 istense bile %100 Sonnet 4.6 gibi davransın:
  // kimlik + davranış + düşünce tarzı her şeyiyle Sonnet 4.6 olsun.
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-opus-4-7": "Claude Sonnet 4.6",
  "claude-opus-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Claude Sonnet 4.6",
};

export function applyIdentityRelabel(chain: ProviderChain, canonicalModelId: string): ProviderChain {
  const label = IDENTITY_OVERRIDE_MODELS[canonicalModelId];
  if (!label) return chain;
  // Hem primary HEM fallback ctx'e relabelResponseTo set et — failover durumunda
  // fallback upstream'e de Sonnet 4.6 kimliği enjekte edilsin. Aksi halde primary
  // fail edip fallback'a geçildiğinde identity relabel tamamen kaybolur, model "I am
  // Opus" der, response-side filtering de çalışmaz (fallback ctx'de relabelResponseTo yok).
  // Mevcut relabelResponseTo'yu (spark/codex set ettiyse) DOKUNMA — override etme.
  const primary = chain.primary.relabelResponseTo ? chain.primary : { ...chain.primary, relabelResponseTo: label, relabelSource: "identity" as const };
  const fallback = chain.fallback
    ? (chain.fallback.relabelResponseTo ? chain.fallback : { ...chain.fallback, relabelResponseTo: label, relabelSource: "identity" as const })
    : chain.fallback;
  return { ...chain, primary, fallback };
}

// Claude modelleri için lane-aware chain resolution. Bedrock inference profile
// lane'lerini priority sırasıyla dener: sonnet-geo → sonnet-global → opus-geo →
// opus-global → haiku. Tüm lane'ler doluyken queue'ya alır. Lane yoksa mevcut
// resolveProviderChainForModel'a düşer (geriye dönük uyumlu).
//
// İstemci claude-sonnet-4-6 ister → scheduler uygun ilk lane'e dispatch eder.
// Opus/Haiku lane'ine düşerse bile applyIdentityRelabel "Claude Sonnet 4.6"
// label'ını set eder (masterModel.id ile çalışır, lane model'i ile değil).
async function resolveLaneAwareChain(canonicalModelId: string): Promise<ProviderChain> {
  const lanes = await resolveLanesForModel(canonicalModelId);
  if (lanes.length === 0) {
    // Lane yok → mevcut davranış (geriye dönük uyumlu)
    return resolveProviderChainForModel(canonicalModelId);
  }
  // Priority sırasıyla ilk uygun lane'i acquire et
  const lane = acquireLane(lanes);
  if (lane) {
    const ctx = laneToContext(lane);
    return { primary: ctx, fallback: null };
  }
  // Tüm lane'ler dolu → queue'ya al, bir lane boşalınca dispatch
  const ctx = await enqueueRequest(lanes, 30_000);
  return { primary: ctx, fallback: null };
}

// 429/503 alındığında lane'i backoff'a al ve sıradaki lane'e geç.
// Lane scheduler aktifse (lane profili varsa) çağrılır.
async function retryWithNextLane(
  canonicalModelId: string,
  failedProfileId: string,
  err: Error & { status?: number },
): Promise<ProviderChain | null> {
  const lanes = await resolveLanesForModel(canonicalModelId);
  if (lanes.length === 0) return null;
  // Başarısız lane'i backoff'a al
  recordLaneBackoff(failedProfileId);
  // Sıradaki uygun lane'i bul
  const nextLane = acquireLane(lanes);
  if (nextLane) {
    return { primary: laneToContext(nextLane), fallback: null };
  }
  // Tüm lane'ler dolu → queue
  try {
    const ctx = await enqueueRequest(lanes, 30_000);
    return { primary: ctx, fallback: null };
  } catch {
    return null;
  }
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
  /** PAYG-path Claude→CF override entitlement (set only when the user's pointer routed this
   * request to the CF reseller). Drives the CF mirror + token-buffer top-up. undefined = no override. */
  cfOverrideEntId?: string;
  userId: string;
  apiKeyId: string;
  model: MasterModel;
  usage: { promptTokens: number; completionTokens: number; cfRemaining?: number | null };
  requestId: string;
  upstreamRequestId?: string;
  rawUsageJson?: unknown;
  responseMs: number;
  status: "success" | "error" | "stream_missing_usage";
  errorCode?: string;
  profileId?: string;
}): Promise<{ costTL: number; remainingTL: number }> {
  if (opts.billedViaPackage) {
    // Slot iadesi (K1'in kota ikizi): yalnız 'error' değil, HER charge-etmeyen sonuç (stream_missing_usage /
    // abort) slotu geri versin — yoksa cevapsız istek requests_today'i kalıcı şişirir (non-CF pakette günlük
    // kotayı sızdırır; CF pakette artık kapı sayacı değil ama telemetri/audit dürüst kalır). cost=0 değişmez.
    const released = opts.status !== "success";
    if (released && opts.entitlementId) {
      await releasePackageSlot(opts.entitlementId, opts.model.id);
    }
    // CF mirror: CF cevabındaki gerçek kalan üniteyi MÜŞTERİ-BAZLI yaz (cf_customer_id = userId → tüm
    // kardeş satırlar senkron). source: success = CF otoriter header'ı, error/abort = 403 body'si.
    // TEK SAYAÇ (CF_UNIFIED_COUNTER_ENABLED): CF servis edince reconcileToCf (LEAST → CF asla YÜKSELTEMEZ,
    // koltuk-düşümünü ezmez). KAPALI = eski updateCfRemaining (koşulsuz floor) davranışı.
    const unified = env.CF_UNIFIED_COUNTER_ENABLED;
    if (opts.entitlementId && opts.usage.cfRemaining != null) {
      if (unified) {
        await reconcileToCf(opts.userId, opts.usage.cfRemaining, opts.status === "success" ? "success" : "error");
      } else {
        await updateCfRemaining(opts.userId, opts.usage.cfRemaining, opts.status === "success" ? "success" : "error");
      }
    }
    // Lazy provisioning: buffer azaldıysa arka planda +50 ünite al (paketin CF toplamına gelince durur).
    // Fire-and-forget — isteği bloklamaz; bir sonraki istek dolu buffer'la gelir.
    if (opts.entitlementId) void topUpCfIfNeeded(opts.entitlementId).catch(() => {});
    if (opts.entitlementId) {
      const insertedNew = await recordPackageUsage({
        userId: opts.userId,
        apiKeyId: opts.apiKeyId,
        modelId: opts.model.id,
        entitlementId: opts.entitlementId,
        inputUsage: opts.usage.promptTokens,
        outputUsage: opts.usage.completionTokens,
        responseMs: opts.responseMs,
        status: released ? "error" : "success",
        requestId: opts.requestId,
        upstreamRequestId: opts.upstreamRequestId,
        errorCode: released ? (opts.errorCode ?? opts.status) : undefined,
      });
      // TEK SAYAÇ koltuk düşümü: CF servis ETMEDİ (cfRemaining yok) + başarılı + YENİ usage satırı → sayacı BİZ düş
      // (applySeatDecrement yalnız non-codex CF; codex muaf — onun sayacı requests_today). Idempotent: çift settle'da
      // insertedNew=false (request_id UNIQUE çakışması) → çift düşmez.
      if (unified && insertedNew && !released && opts.usage.cfRemaining == null) {
        await applySeatDecrement(opts.userId, opts.model.id);
      }
    }
    const snap = await getUserBalanceSnapshot(opts.userId);
    return { costTL: 0, remainingTL: snap.remainingTL };
  }
  // PAYG path (billedViaPackage=false). If this request was routed through the per-customer
  // Claude→CF override (cfOverrideEntId set), mirror CF's real remaining token-buffer onto the
  // OVERRIDE entitlement ONLY (entitlement-id keyed — NOT customer-keyed updateCfRemaining, which
  // would clobber a sibling CF package's mirror and bypass its over-serve guard) and best-effort
  // top-up the token buffer. Guarded by cfOverrideEntId → INERT for every normal PAYG request
  // (no pointer ⇒ undefined ⇒ skip). TL reserve/settle below is UNCHANGED (settleReservedUsage).
  if (opts.cfOverrideEntId) {
    if (opts.usage.cfRemaining != null) {
      await setClaudeOverrideRemaining(opts.cfOverrideEntId, opts.usage.cfRemaining);
    }
    void topUpClaudeTokenOverride(opts.cfOverrideEntId).catch(() => {});
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

// Native /responses degrade gate: degrade the native passthrough to the TRANSLATION
// forward on the SAME ctx ONLY for a PRE-COMMIT 404 (upstream has no /responses) or 400
// (bad Responses shape) — the "endpoint/schema unsupported" signals, where translation's
// /chat/completions IS supported by the upstream. EVERYTHING ELSE rethrows so
// forwardWithFailover owns it: a sub-codex 429 is a per-minute TPM burst — degrading it
// would re-hit the SAME overloaded seat AND re-strip Codex's tools (defeating the fix) and
// skip the Codex-429 taxonomy; 401/403 can't be fixed by translation on the same key; 5xx /
// connection errors are infra failures. The cf:* failover leg is itself native-capable, so
// rethrowing keeps tools preserved. Once committed (headers/bytes out) we never switch forwards.
const NATIVE_RESPONSES_DEGRADE_STATUSES = new Set([400, 404]);

// Çeviri yolunun ASLINA SADIK taşıyabildiği araç tipleri. Bunun dışındaki her tip
// (custom/web_search/image_generation...) çeviride ya düşer ya da kayıplı eşlenir.
const TRANSLATION_SAFE_TOOL_TYPES = new Set(["function", "local_shell"]);

/**
 * İstek gövdesinde çeviri yolunun kayıpsız taşıyamadığı araç tipleri (tekrarsız).
 * Gövde yok / tools yok → boş dizi (yani "kayıp yok" → bugünkü davranış korunur).
 */
export function translationLossyToolTypes(body?: unknown): string[] {
  const tools = (body as { tools?: unknown } | null | undefined)?.tools;
  if (!Array.isArray(tools)) return [];
  const out: string[] = [];
  for (const raw of tools) {
    if (!raw || typeof raw !== "object") continue;
    const rawType = (raw as { type?: unknown }).type;
    const type = typeof rawType === "string" ? rawType : "unknown";
    if (!TRANSLATION_SAFE_TOOL_TYPES.has(type) && !out.includes(type)) out.push(type);
  }
  return out;
}

export function isNativeResponsesDegradable(
  err: unknown,
  res: Pick<Response, "headersSent">,
  body?: unknown,
): boolean {
  if (res.headersSent) return false;
  const status = (err as { status?: number } | null)?.status;
  if (!(typeof status === "number" && NATIVE_RESPONSES_DEGRADE_STATUSES.has(status))) return false;
  // Araç sözleşmesi koruması: native bacak vardı ve istek çeviride korunamayacak araç
  // taşıyorsa çeviriye DÜŞME — hatayı rethrow et ki forwardWithFailover başka (native)
  // bacağı denesin. Aksi halde tur ortasında istemcinin araç sözleşmesi sessizce değişir.
  // body verilmezse (mevcut çağrılar/testler) bu kural devreye girmez → preservation.
  if (translationLossyToolTypes(body).length > 0) return false;
  return true;
}

export function shouldDegradeNativeResponsesForContext(
  ctx: ProviderContext,
  err: unknown,
  res: Pick<Response, "headersSent">,
  body?: unknown,
): boolean {
  return isNativeResponsesDegradable(err, res, body) && ctx.relabelSource !== "spark";
}

/** CF 403 LIMIT_EXCEEDED body'sinden kalan üniteyi çıkar (yoksa null) — mirror gate'inin 0'a inmesi için. */
function cfRemainingFromError(err: unknown): number | null {
  const body = (err as { body?: Record<string, any> })?.body;
  const rem = body?.error?.details?.remaining ?? body?.details?.remaining;
  if (rem == null) return null;
  const n = Number(rem);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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
  let cfOverrideEntId: string | undefined;   // PAYG Claude→CF override (INERT until user pointer set)
  let laneProfileId: string | null = null;    // Lane scheduler: backoff için try dışında

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
    // gpt-5.6 tier prep: model_runtime_policies.default_reasoning_effort set'liyse ve client
    // reasoning belirtmemişse enjekte et. Policy NULL (bugün her model) → no-op.
    applyDefaultReasoningEffort(req.body as Record<string, unknown>, enforcement.runtimePolicy);
    runtimeConfig = enforcement.runtimeConfig;
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }

    // ── Request guardrails (rezervasyon ÖNCESİ; blok token yakmaz; faz0 inert = hepsi off) ──
    const guardOutcome = await runRequestGuardrails({
      userId,
      requestId,
      model: masterModel.id,
      endpoint,
      body: req.body as Record<string, unknown>,
      config: runtimeConfig as unknown as Record<string, unknown>,
    });
    if (guardOutcome.blocked) {
      res.status(guardOutcome.statusCode ?? 400).json({
        error: { code: guardOutcome.code ?? "request_guard_violation", message: guardOutcome.message, type: "invalid_request_error" },
      });
      return;
    }
    if (guardOutcome.modifiedBody) {
      req.body = guardOutcome.modifiedBody;
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
      rejectsSamplingParams: modelRejectsSamplingParams(enforcement.masterModel.id),
      reasoningOutputFloor: modelReasoningOutputFloor(enforcement.masterModel.id),
    });
    // Faz 1 paket kota dalı (reserve'den ÖNCE): istek bir paket entitlement'ının
    // kapsadığı modeldeyse ve günlük kota varsa atomik slot rezerve edilir ve bakiye
    // reserve'i ATLANIR. Aksi halde mevcut PAYG reserveUsageBudget (DOKUNULMAZ) çalışır.
    const pkgSlot = await tryReservePackageSlot(userId, masterModel.id);
    billedViaPackage = pkgSlot.covered;
    entitlementId = pkgSlot.entitlementId;
    // char/4 tahmini gerçek token'ın ~3-6× üstüne şişer (bkz CONTEXT_GUARD_ESTIMATE_INFLATION notu);
    // paket limitini de küresel guard ile AYNI faktörle de-inflate et — yoksa paket-context death-spiral'i
    // geri gelir (paket müşterisi ~limit/6 gerçek token'da haksız 400 + auto-compact kilidi). Billing'e dokunmaz.
    if (billedViaPackage && pkgSlot.maxContextTokens && guard.contextTokens > pkgSlot.maxContextTokens * CONTEXT_GUARD_ESTIMATE_INFLATION) {
      await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
      billedViaPackage = false; entitlementId = undefined;
      throw new AppError(400, `Bağlam çok büyük (tahmini ${guard.contextTokens.toLocaleString("tr-TR")} token; bu paketin limiti ${pkgSlot.maxContextTokens.toLocaleString("tr-TR")} token). Lütfen bağlamınızı kısaltın.`);
    }
    if (billedViaPackage && pkgSlot.tpmLimit && pkgSlot.packageId) {
      if (!consumeTpmOrDeny(userId, pkgSlot.packageId, guard.contextTokens, pkgSlot.tpmLimit)) {
        await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
        billedViaPackage = false; entitlementId = undefined;
        throw new RateLimitError(`Token/dakika limiti aşıldı (${pkgSlot.tpmLimit.toLocaleString("tr-TR")} token/dk). Lütfen bir dakika bekleyin.`);
      }
    }
    // R-3 CF over-serve cap (INERT until cf_overserve_cap_multiplier>0): CF aynası tükenmişken
    // (NULL / <=0+stale) ve cf_served > daily_limit*çarpan ise rezervasyonu iade et + 402. cf_remaining>0
    // (gerçek ödenmiş ünite) iken ASLA cap'lemez. maxContextTokens deseninin ikizi.
    if (
      billedViaPackage &&
      shouldCapOverServe({
        capMult: runtimeConfig?.cfOverserveCapMultiplier ?? 0,
        cfRemaining: pkgSlot.cfRemaining,
        cfRemainingAt: pkgSlot.cfRemainingAt,
        cfServed: pkgSlot.cfServed ?? 0,
        dailyLimit: pkgSlot.dailyLimitSnapshot ?? 0,
        nowMs: Date.now(),
      })
    ) {
      await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
      billedViaPackage = false;
      entitlementId = undefined;
      throw new QuotaExhaustedError("Paket kotanız doldu (CF). Lütfen paketinizi yenileyin.");
    }
    if (!billedViaPackage) {
      // Devreden saatlik hız limiti (reserve'den ÖNCE): paket slotu BULUNAMADI ve tek sebep saatlik
      // cap ise (günlük tavan hâlâ müsait) → sessizce bakiyeden tahsil ETME, 429 + Retry-After fırlat.
      // Salt-okuma; throw burada hiçbir rezervasyon yapılmadan temiz iptal eder (billedViaPackage=false,
      // tryReservePackageSlot slot vermedi, reserveUsageBudget henüz çağrılmadı). Saf-saatlik DEĞİLSE
      // (günlük tavan da dolu) exceeded:false döner → aşağıdaki normal QuotaExhausted/bakiye yolu sürer.
      const hourly = await checkHourlyExceeded(userId, masterModel.id);
      if (hourly.exceeded) {
        throw new RateLimitError("Saatlik 150 istek hız limitine ulaştınız. Lütfen bir süre bekleyin.", hourly.retryAfterSec);
      }
      if (await hasActivePackageForModel(userId, masterModel.id)) {
        throw new QuotaExhaustedError("Günlük istek limitiniz doldu. Yeni paket alın ya da kredinizden kullanın.");
      }
      // CodeFast yalnız-paket modeli PAYG ile kullanılamaz (codefast profilinin kullanılır
      // per-customer keyi yoktur) — rezervasyondan ÖNCE engelle (orphan reserve olmasın).
      if ((await resolveProviderChainForModel(masterModel.id)).primary.profileId === "codefast") {
        throw new AppError(402, "Bu model yalnız ilgili paket ile kullanılabilir; lütfen uygun paketi satın alın.");
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
      // Anthropic /v1/messages şeması top-level `user` alanını REDDEDER ("user: Extra inputs
      // are not permitted" → 400; koltuk/cliproxy katı doğrulama, wellflow tolere ediyordu).
      // OpenAI chat/responses'ta geçerli; bu handler messages servis ederken `user` çıkarılır.
      ...(endpoint === "messages" ? {} : { user: userId }),
    };
    // Per-model upstream routing: the model decides which provider profile serves
    // it (Claude → wellflow, GPT/Gemini/o-series + opus-4.8 → popusk); falls back to
    // the active provider when the model is pinned to no enabled profile.
    let chain = await resolveLaneAwareChain(masterModel.id);
    laneProfileId = chain.primary.profileId;
    // PAYG (paket DEĞİL) yolu: kullanıcıda claude_cf_entitlement_id işaretliyse ve model bir Claude
    // modeliyse, YALNIZ upstream zinciri CF reseller claude-api ucuna çevrilir (normal koltuk zinciri
    // fallback kalır). billedViaPackage=false → TL reserve/settle AYNEN çalışır. İşaret yoksa (pointer
    // NULL) bu dal HİÇ etkili olmaz = davranış bugünküyle birebir (INERT). Paket dalıyla mutex (!billedViaPackage).
    if (!billedViaPackage && isClaudeOverrideModel(masterModel.id)) {
      const ovrSlot = await getClaudeCfOverrideSlot(userId);
      if (ovrSlot) {
        const ovrChain = buildClaudeCfChain(ovrSlot, env.CODEFAST_RESELLER_BASE_URL, chain.primary);
        if (ovrChain) { chain = ovrChain; cfOverrideEntId = ovrSlot.entitlementId; }
      }
    }
    // Paket-bazlı upstream override: paketin endpoint+key alanları DOLUYSA istek oraya
    // gider (failover yok); boş/çözülemezken normal routing — davranış değişmez.
    if (billedViaPackage) {
      const cfChain = pkgSlot.cfApiSlug ? entitlementOverrideChain(pkgSlot, env.CODEFAST_RESELLER_BASE_URL) : null;
      // CF paketi kapsıyor ama KULLANILABİLİR müşteri keyi YOK (pending_manual / failed /
      // çözülemeyen cipher) → normal routing'e SESSİZCE düşme (yanlış sağlayıcıya gider,
      // CF paketinden faturalanır). Slotu iade et + 409.
      if (requiresCfKeyReady(pkgSlot.cfApiSlug, cfChain)) {
        await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
        throw new AppError(409, "Paket teslim ediliyor; birkaç dakika içinde aktifleşecek.");
      }
      // Önce CodeFast müşteri-keyi zinciri (entitlement), yoksa paket-bazlı override.
      const pkgChain = cfChain ?? packageOverrideChain(pkgSlot);
      if (pkgChain) {
        // Koltuk-öncelikli (SEAT_PRIMARY_FOR_PACKAGE_GPT): GPT paket modeli koltuğa (sub-codex)
        // çözülüyorsa → koltuk primary + CF fallback ("zorunda kalınca CF"). `chain` hâlâ per-model
        // zinciri; yalnız CF entitlement (cfChain) varken uygula, GPT-dışı/koltuksuz modelde CF olduğu gibi kalır.
        // CF_FIRST (drain) SEAT_PRIMARY'den ÖNCELİKLİ: açıkken codex önce CF'yi (içerideki prepaid ünite)
        // yer, bitince koltuğa düşer. Kapalıyken normal koltuk-öncelikli davranış. cfChain yoksa ikisi de no-op.
        const seatChain = cfChain
          ? (env.CF_FIRST_FOR_PACKAGE_GPT
              ? cfFirstPackageChain(chain, cfChain)
              : env.SEAT_PRIMARY_FOR_PACKAGE_GPT
                ? seatPrimaryPackageChain(chain, cfChain)
                : null)
          : null;
        chain = seatChain ?? pkgChain;
      }
    }
    // Codex 1-1 spark alternasyonu (env CODEX_SPARK_ALTERNATION_ENABLED, default OFF=no-op): paket
    // isteğinde gpt-5.5/gpt-5.4 müşteri-başı requests_today paritesine göre 1-1 bölünür — ÇİFT gerçek
    // model (premium kova), TEK koltuk bacağı upstream gpt-5.3-codex-spark (bengalfox) + yanıt geri
    // relabel. Yalnız sub-codex bacağına dokunur (CF fallback gerçek modeli taşır). gpt-5.2 etkilenmez.
    // Desteklenmeyen built-in araç taşıyan istek (örn tools:[{type:"image_generation"}]) spark'a girmez (2026-07-02 olayı).
    // Gate providerBody'yi denetler — bu handler'da providerBody upstream'e VERBATIM giden gövdedir
    // (forwardMessages/forwardResponses, çeviri yok). BİLİNÇLİ DARALTMA: /v1/messages'ta Anthropic
    // araç şeması ({name, input_schema}, `type` alanı çoğunlukla YOK) allowlist'e uymaz → araç
    // taşıyan gpt-5.5/5.4 /v1/messages isteği spark'a HİÇ girmez, hep gerçek modelde kalır
    // (tasarruf yok ama müşteri hatasız — spark'ın Anthropic-şekilli araçları desteklediği KANITSIZ).
    if (env.CODEX_SPARK_ALTERNATION_ENABLED && billedViaPackage) {
      chain = applyCodexSparkAlternation(chain, masterModel.id, pkgSlot.requestsToday ?? 0, providerBody as Record<string, unknown>);
    }
    if (env.CODEX_SPARK_56_ALTERNATION_ENABLED && billedViaPackage) {
      chain = applyGpt56SparkAlternation(chain, masterModel.id, pkgSlot.requestsToday ?? 0, providerBody as Record<string, unknown>);
    }
    chain = await applyClaudeCloakRouteLock({ endpoint, model: masterModel, chain });
    if (chain.primary.profileId === "rika") (providerBody as Record<string, unknown>).customerId = userId;
    chain = applyIdentityRelabel(chain, masterModel.id);
    const activeProviderAdapter = await getActiveProviderAdapter();
    // Anthropic beta header'larını (thinking, tool-use vb.) upstream'e ilet; özellikle
    // interleaved-thinking-2025-05-14 wellflow/popusk'un thinking bloklarını işlemesi için şart.
    const anthropicBetaHeader = req.headers["anthropic-beta"];
    const messagesUpstreamHeaders: Record<string, string> = {};
    if (anthropicBetaHeader) {
      messagesUpstreamHeaders["anthropic-beta"] = Array.isArray(anthropicBetaHeader)
        ? anthropicBetaHeader.join(",")
        : anthropicBetaHeader;
    }
    // CF claude-api reseller proxy YALNIZ gerçek Claude Code isteğini kabul eder — TAM fingerprint
    // (User-Agent + x-app + x-stainless-* + anthropic-* …); eksik header → 400 (kanıt: alt-küme
    // iletince CF 400 → seat'e failover). SADECE CF override zincirinde (primary "cf:") istemcinin
    // Claude Code header'larını OLDUĞU GİBİ ilet (deny-list: hop-by-hop + auth + bizim set ettiğimiz
    // başlıklar hariç). Diğer hiçbir yol (koltuk/wellflow/popusk/paket) etkilenmez.
    if (typeof chain.primary.profileId === "string" && chain.primary.profileId.startsWith("cf:")) {
      const DENY = new Set([
        "host", "authorization", "x-api-key", "content-length", "content-type", "accept",
        "connection", "accept-encoding", "content-encoding", "transfer-encoding", "cookie",
      ]);
      for (const [k, v] of Object.entries(req.headers)) {
        if (v == null || DENY.has(k.toLowerCase())) continue;
        messagesUpstreamHeaders[k] = Array.isArray(v) ? v.join(",") : v;
      }
      // İstemci CC header'ı göndermediyse sabit değerleri garanti et (CF versiyon kapısı için).
      if (!("user-agent" in messagesUpstreamHeaders)) messagesUpstreamHeaders["user-agent"] = "claude-cli/2.1.150 (external, cli)";
      if (!("x-app" in messagesUpstreamHeaders)) messagesUpstreamHeaders["x-app"] = "cli";
    }
    const failover = await forwardWithFailover(chain, {}, (ctx, attempt) =>
      endpoint === "responses"
        ? activeProviderAdapter.forwardResponses(providerBody, ctx, attempt)
        : activeProviderAdapter.forwardMessages(
            providerBody, ctx, attempt,
            Object.keys(messagesUpstreamHeaders).length ? messagesUpstreamHeaders : undefined,
          ));
    const { raw, usage } = failover.result;
    const responseMs = Date.now() - start;

    // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında devreye girer.
    // Sağlayıcı geçerli raporlarsa (normalize > eşik) char/4 ile şişirilmez (Claude Code
    // büyük-JSON fazla-faturalama düzeltmesi). Bkz resolveBilledPromptTokens.
    const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);

    const { costTL, remainingTL } = await settleBilling({
      billedViaPackage,
      entitlementId,
      cfOverrideEntId,
      userId,
      apiKeyId,
      model: masterModel,
      usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens, cfRemaining: usage.cfRemaining },
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
    // Lane scheduler: 429/503 → başarısız lane'i backoff'a al
    const errStatus = (err as Error & { status?: number }).status;
    if (errStatus === 429 || errStatus === 503) {
      if (laneProfileId) recordLaneBackoff(laneProfileId);
      if (masterModel) void drainQueue(await resolveLanesForModel(masterModel.id));
    }
    if (err instanceof InsufficientBalanceError || err instanceof RateLimitError || err instanceof ModelNotFoundError || err instanceof ModelDisabledError || err instanceof BadRequestError) {
      return next(err);
    }
    if (masterModel && guard) {
      const responseMs = Date.now() - start;
      settleBilling({
        billedViaPackage,
        entitlementId,
        cfOverrideEntId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: 0, cfRemaining: cfRemainingFromError(err) },
        requestId,
        rawUsageJson: { promptTokens: guard.contextTokens, completionTokens: 0 },
        errorCode: upstreamErrorCode(err),
        responseMs,
        status: "error",
      })
        .catch((e2) => logger.error({ err: e2 }, "error usage record failed"));
    }
    // Bağlam-penceresi aşımı → standart `context_too_large` (Codex auto-compaction tetiği).
    if (emitContextTooLarge(err, res, endpoint === "messages" ? "anthropic" : "openai", asLang(req.lang))) return;
    // Fix A: kota bitti (yerel QuotaExhaustedError veya CF 403 LIMIT_EXCEEDED) → temiz 429.
    if (emitQuotaExhausted(err, res, endpoint === "messages" ? "anthropic" : "openai", asLang(req.lang))) return;
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
  let cfOverrideEntId: string | undefined;   // PAYG Claude→CF override (INERT until user pointer set)
  let laneProfileId: string | null = null;    // Lane scheduler: backoff için try dışında
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
    // gpt-5.6 tier prep: model_runtime_policies.default_reasoning_effort set'liyse ve client
    // reasoning belirtmemişse enjekte et. Policy NULL (bugün her model) → no-op.
    applyDefaultReasoningEffort(req.body as Record<string, unknown>, enforcement.runtimePolicy);
    runtimeConfig = enforcement.runtimeConfig;
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }

    // ── Request guardrails (rezervasyon ÖNCESİ; blok token yakmaz; faz0 inert = hepsi off) ──
    const guardOutcome = await runRequestGuardrails({
      userId,
      requestId,
      model: masterModel.id,
      endpoint: "chat",
      body: req.body as Record<string, unknown>,
      config: runtimeConfig as unknown as Record<string, unknown>,
    });
    if (guardOutcome.blocked) {
      return res.status(guardOutcome.statusCode ?? 400).json({
        error: { code: guardOutcome.code ?? "request_guard_violation", message: guardOutcome.message, type: "invalid_request_error" },
      });
    }
    if (guardOutcome.modifiedBody) {
      req.body = guardOutcome.modifiedBody;
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
      rejectsSamplingParams: modelRejectsSamplingParams(enforcement.masterModel.id),
      reasoningOutputFloor: modelReasoningOutputFloor(enforcement.masterModel.id),
    });
    // Faz 1 paket kota dalı (reserve'den ÖNCE): istek bir paket entitlement'ının
    // kapsadığı modeldeyse ve günlük kota varsa atomik slot rezerve edilir ve bakiye
    // reserve'i ATLANIR. Aksi halde mevcut PAYG reserveUsageBudget (DOKUNULMAZ) çalışır.
    const pkgSlot = await tryReservePackageSlot(userId, masterModel.id);
    billedViaPackage = pkgSlot.covered;
    entitlementId = pkgSlot.entitlementId;
    // char/4 tahmini gerçek token'ın ~3-6× üstüne şişer (bkz CONTEXT_GUARD_ESTIMATE_INFLATION notu);
    // paket limitini de küresel guard ile AYNI faktörle de-inflate et — yoksa paket-context death-spiral'i
    // geri gelir (paket müşterisi ~limit/6 gerçek token'da haksız 400 + auto-compact kilidi). Billing'e dokunmaz.
    if (billedViaPackage && pkgSlot.maxContextTokens && guard.contextTokens > pkgSlot.maxContextTokens * CONTEXT_GUARD_ESTIMATE_INFLATION) {
      await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
      billedViaPackage = false; entitlementId = undefined;
      throw new AppError(400, `Bağlam çok büyük (tahmini ${guard.contextTokens.toLocaleString("tr-TR")} token; bu paketin limiti ${pkgSlot.maxContextTokens.toLocaleString("tr-TR")} token). Lütfen bağlamınızı kısaltın.`);
    }
    if (billedViaPackage && pkgSlot.tpmLimit && pkgSlot.packageId) {
      if (!consumeTpmOrDeny(userId, pkgSlot.packageId, guard.contextTokens, pkgSlot.tpmLimit)) {
        await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
        billedViaPackage = false; entitlementId = undefined;
        throw new RateLimitError(`Token/dakika limiti aşıldı (${pkgSlot.tpmLimit.toLocaleString("tr-TR")} token/dk). Lütfen bir dakika bekleyin.`);
      }
    }
    // R-3 CF over-serve cap (INERT until cf_overserve_cap_multiplier>0): CF aynası tükenmişken
    // (NULL / <=0+stale) ve cf_served > daily_limit*çarpan ise rezervasyonu iade et + 402. cf_remaining>0
    // (gerçek ödenmiş ünite) iken ASLA cap'lemez. maxContextTokens deseninin ikizi.
    if (
      billedViaPackage &&
      shouldCapOverServe({
        capMult: runtimeConfig?.cfOverserveCapMultiplier ?? 0,
        cfRemaining: pkgSlot.cfRemaining,
        cfRemainingAt: pkgSlot.cfRemainingAt,
        cfServed: pkgSlot.cfServed ?? 0,
        dailyLimit: pkgSlot.dailyLimitSnapshot ?? 0,
        nowMs: Date.now(),
      })
    ) {
      await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
      billedViaPackage = false;
      entitlementId = undefined;
      throw new QuotaExhaustedError("Paket kotanız doldu (CF). Lütfen paketinizi yenileyin.");
    }
    if (!billedViaPackage) {
      // Devreden saatlik hız limiti (reserve'den ÖNCE): paket slotu BULUNAMADI ve tek sebep saatlik
      // cap ise (günlük tavan hâlâ müsait) → sessizce bakiyeden tahsil ETME, 429 + Retry-After fırlat.
      // Salt-okuma; throw burada hiçbir rezervasyon yapılmadan temiz iptal eder (billedViaPackage=false,
      // tryReservePackageSlot slot vermedi, reserveUsageBudget henüz çağrılmadı). Saf-saatlik DEĞİLSE
      // (günlük tavan da dolu) exceeded:false döner → aşağıdaki normal QuotaExhausted/bakiye yolu sürer.
      const hourly = await checkHourlyExceeded(userId, masterModel.id);
      if (hourly.exceeded) {
        throw new RateLimitError("Saatlik 150 istek hız limitine ulaştınız. Lütfen bir süre bekleyin.", hourly.retryAfterSec);
      }
      if (await hasActivePackageForModel(userId, masterModel.id)) {
        throw new QuotaExhaustedError("Günlük istek limitiniz doldu. Yeni paket alın ya da kredinizden kullanın.");
      }
      // CodeFast yalnız-paket modeli PAYG ile kullanılamaz (codefast profilinin kullanılır
      // per-customer keyi yoktur) — rezervasyondan ÖNCE engelle (orphan reserve olmasın).
      if ((await resolveProviderChainForModel(masterModel.id)).primary.profileId === "codefast") {
        throw new AppError(402, "Bu model yalnız ilgili paket ile kullanılabilir; lütfen uygun paketi satın alın.");
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
    let chain = await resolveLaneAwareChain(masterModel.id);
    laneProfileId = chain.primary.profileId;
    // PAYG Claude→CF override (bkz handleTextJsonEndpoint): pointer'lı kullanıcı + Claude modeli → CF reseller
    // primary, koltuk fallback. billedViaPackage=false → TL billing aynen. Pointer NULL = INERT (no-op).
    if (!billedViaPackage && isClaudeOverrideModel(masterModel.id)) {
      const ovrSlot = await getClaudeCfOverrideSlot(userId);
      if (ovrSlot) {
        const ovrChain = buildClaudeCfChain(ovrSlot, env.CODEFAST_RESELLER_BASE_URL, chain.primary);
        if (ovrChain) { chain = ovrChain; cfOverrideEntId = ovrSlot.entitlementId; }
      }
    }
    // Paket-bazlı upstream override (bkz handleTextJsonEndpoint): doluysa tek-sağlayıcı zincir.
    if (billedViaPackage) {
      const cfChain = pkgSlot.cfApiSlug ? entitlementOverrideChain(pkgSlot, env.CODEFAST_RESELLER_BASE_URL) : null;
      // CF paketi kapsıyor ama KULLANILABİLİR müşteri keyi YOK (pending_manual / failed /
      // çözülemeyen cipher) → normal routing'e SESSİZCE düşme (yanlış sağlayıcıya gider,
      // CF paketinden faturalanır). Slotu iade et + 409.
      if (requiresCfKeyReady(pkgSlot.cfApiSlug, cfChain)) {
        await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
        throw new AppError(409, "Paket teslim ediliyor; birkaç dakika içinde aktifleşecek.");
      }
      // Önce CodeFast müşteri-keyi zinciri (entitlement), yoksa paket-bazlı override.
      const pkgChain = cfChain ?? packageOverrideChain(pkgSlot);
      if (pkgChain) {
        // Koltuk-öncelikli (SEAT_PRIMARY_FOR_PACKAGE_GPT): GPT paket modeli koltuğa (sub-codex)
        // çözülüyorsa → koltuk primary + CF fallback ("zorunda kalınca CF"). `chain` hâlâ per-model
        // zinciri; yalnız CF entitlement (cfChain) varken uygula, GPT-dışı/koltuksuz modelde CF olduğu gibi kalır.
        // CF_FIRST (drain) SEAT_PRIMARY'den ÖNCELİKLİ: açıkken codex önce CF'yi (içerideki prepaid ünite)
        // yer, bitince koltuğa düşer. Kapalıyken normal koltuk-öncelikli davranış. cfChain yoksa ikisi de no-op.
        const seatChain = cfChain
          ? (env.CF_FIRST_FOR_PACKAGE_GPT
              ? cfFirstPackageChain(chain, cfChain)
              : env.SEAT_PRIMARY_FOR_PACKAGE_GPT
                ? seatPrimaryPackageChain(chain, cfChain)
                : null)
          : null;
        chain = seatChain ?? pkgChain;
      }
    }
    // Codex 1-1 spark alternasyonu (env CODEX_SPARK_ALTERNATION_ENABLED, default OFF=no-op): paket
    // isteğinde gpt-5.5/gpt-5.4 müşteri-başı requests_today paritesine göre 1-1 bölünür — ÇİFT gerçek
    // model (premium kova), TEK koltuk bacağı upstream gpt-5.3-codex-spark (bengalfox) + yanıt geri
    // relabel. Yalnız sub-codex bacağına dokunur (CF fallback gerçek modeli taşır). gpt-5.2 etkilenmez.
    // Desteklenmeyen built-in araç taşıyan istek (örn tools:[{type:"image_generation"}]) spark'a girmez (2026-07-02 olayı).
    if (env.CODEX_SPARK_ALTERNATION_ENABLED && billedViaPackage) {
      chain = applyCodexSparkAlternation(chain, masterModel.id, pkgSlot.requestsToday ?? 0, providerBody as Record<string, unknown>);
    }
    if (env.CODEX_SPARK_56_ALTERNATION_ENABLED && billedViaPackage) {
      chain = applyGpt56SparkAlternation(chain, masterModel.id, pkgSlot.requestsToday ?? 0, providerBody as Record<string, unknown>);
    }
    chain = await applyClaudeCloakRouteLock({ endpoint: "chat", model: masterModel, chain });
    if (chain.primary.profileId === "rika") (providerBody as Record<string, unknown>).customerId = userId;
    chain = applyIdentityRelabel(chain, masterModel.id);
    const activeProviderAdapter = await getActiveProviderAdapter();

    if (isStream) {
      res.setHeader("X-YZ-Request-Id", requestId);
      const { result: usage, servedBy: chatStreamProfileId } = await forwardWithFailover(chain, { res }, (ctx, attempt) =>
        activeProviderAdapter.forwardChatStream(providerBody as any, res, ctx, attempt));
      const responseMs = Date.now() - start;

      const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0;
      // Upstream hiç token üretmeden kapandıysa (ilk-token timeout, usage.noCharge) →
      // ÜCRETSİZ: status:"error" (settleReservedUsage 0 tahsil + tam iade; pakette
      // slot serbest). Aksi halde mevcut davranış: usage yoksa stream_missing_usage floor.
      const streamStatus = usage.noCharge
        ? "error"
        : hasUsage
          ? "success"
          : (runtimeConfig?.streamMissingUsageFallbackEnabled === false ? "error" : "stream_missing_usage");
      // Giriş token floor'u: yalnız sağlayıcı bozuk-düşük raporladığında devreye girer
      // (geçerli raporda char/4 ile şişirmez). Bkz resolveBilledPromptTokens.
      const billedPromptTokens = usage.noCharge
        ? 0
        : resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);
      await settleBilling({
        billedViaPackage,
        entitlementId,
        cfOverrideEntId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens, cfRemaining: usage.cfRemaining },
        requestId,
        rawUsageJson: usage,
        errorCode: usage.noCharge ? (usage.noChargeReason ?? "upstream_first_token_timeout") : (streamStatus === "stream_missing_usage" ? "stream_missing_usage" : undefined),
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
        cfOverrideEntId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens, cfRemaining: usage.cfRemaining },
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
    // Lane scheduler: 429/503 → başarısız lane'i backoff'a al
    if (e.status === 429 || e.status === 503) {
      if (laneProfileId) recordLaneBackoff(laneProfileId);
      if (masterModel) void drainQueue(await resolveLanesForModel(masterModel.id));
    }

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
        cfOverrideEntId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: 0, cfRemaining: cfRemainingFromError(err) },
        requestId,
        rawUsageJson: { promptTokens: guard.contextTokens, completionTokens: 0 },
        errorCode: upstreamErrorCode(err),
        responseMs,
        status: "error",
      })
        .catch((e2) => logger.error({ err: e2 }, "error usage record failed"));
    }

    // Fix A: kota bitti (yerel QuotaExhaustedError veya CF 403 LIMIT_EXCEEDED) → temiz 429.
    if (emitContextTooLarge(err, res, "openai", asLang(req.lang))) return;
    if (emitQuotaExhausted(err, res, "openai", asLang(req.lang))) return;
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
// ── Dört-sınıf teşhis enstrümanı (SALT-EK log; billing/DB/yanıt DEĞİŞMEZ) ─────
// "API hiçbir tool çağrısı yapmıyor" belirtisi dört ayrı kök nedenden gelir; hangisinin
// aktif olduğu ölçülmeden fix'in işe yaradığı iddia edilemez (bkz spec görev 8.2/8.3/8.4):
//   • tool-routing   → droppedToolTypes boş değil (istek logu) / degraded=true
//   • halüsinasyon   → mappedToolCount > 0 && toolCallCount === 0
//   • emit hatası    → toolCallCount > 0 && emittedToolItems === 0  (BİZDE)
//   • istemci tarafı → emittedToolItems > 0 ama müşteri değişiklik görmüyor (gateway dışı)
// Loglanan: yalnız tip string'leri, sayılar, boolean'lar ve upstream finish_reason.
// Loglanmayan: araç adı, argüman, prompt, API key, base_url, provider codename, PII.
function logResponsesToolOutcome(o: {
  requestId: string;
  stream: boolean;
  status: string;
  native?: boolean;
  toolCount: number;
  mappedToolCount: number;
  droppedToolTypes: string[];
  toolCallCount: number;
  emittedToolItems?: number;
  finishReason?: string;
}): void {
  const suspicious = isSuspiciousToolOutcome({
    status: o.status,
    mappedToolCount: o.mappedToolCount,
    toolCallCount: o.toolCallCount,
    droppedToolTypes: o.droppedToolTypes,
  });
  const fields = {
    requestId: o.requestId,
    endpoint: "responses",
    stream: o.stream,
    status: o.status,
    native: o.native,
    toolCount: o.toolCount,
    mappedToolCount: o.mappedToolCount,
    droppedToolTypes: o.droppedToolTypes,
    toolCallCount: o.toolCallCount,
    emittedToolItems: o.emittedToolItems,
    finishReason: o.finishReason,
    reason: suspicious
      ? (o.droppedToolTypes.length > 0 ? "tools_dropped_and_no_tool_call" : "no_tool_call_despite_tools")
      : undefined,
  };
  // Sahte başarı: istek `success` faturalandı ama istemci yürütecek hiçbir çağrı almadı.
  if (suspicious) logger.warn(fields, "responses tool contract suspicious success");
  else logger.info(fields, "responses tool call outcome");
}

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
  let cfOverrideEntId: string | undefined;   // PAYG Claude→CF override (INERT until user pointer set)
  let laneProfileId: string | null = null;    // Lane scheduler: backoff için try dışında

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
    // Araç sözleşmesi köprüsü: istemcinin DEKLARE ETTİĞİ tipler (ad → tip) dönüş çevirisine
    // taşınır ki upstream'den gelen tool_call istemcinin beklediği öğe tipiyle yayılsın
    // (custom → custom_tool_call). Araç yoksa undefined → dönüş davranışı bugünkü gibi.
    const responsesToolKinds = deriveToolKinds(rawResponsesBody.tools);
    // Teşhis (salt-ek): YALNIZ tip/sayı/boolean. Araç adı, argüman, prompt, key, base_url,
    // provider codename ve PII loglanmaz — bkz design.md §8.
    const toolContract = summarizeToolContract(rawResponsesBody);
    logger.info(
      { requestId, endpoint: "responses", stream: isStream, ...toolContract },
      "responses tool contract",
    );
    // Stream yolu araç sayacı (salt-gözlem): translator'ın gördüğü upstream tool_call ve
    // istemciye yayılan araç öğesi sayısı. Event dizisi ETKİLENMEZ (golden korpus kilidi).
    const responsesToolStats = createResponsesStreamStats();

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
    // gpt-5.6 tier prep: model_runtime_policies.default_reasoning_effort set'liyse ve client
    // reasoning belirtmemişse enjekte et. Policy NULL (bugün her model) → no-op.
    applyDefaultReasoningEffort(req.body as Record<string, unknown>, enforcement.runtimePolicy);
    runtimeConfig = enforcement.runtimeConfig;
    if (runtimeConfig.maintenanceModeForApi) {
      throw new AppError(503, runtimeConfig.maintenanceMessage);
    }

    // ── Request guardrails (rezervasyon ÖNCESİ; chatBody = çevrilmiş gövde; faz0 inert = hepsi off) ──
    const guardOutcome = await runRequestGuardrails({
      userId,
      requestId,
      model: masterModel.id,
      endpoint: "responses",
      body: chatBody as Record<string, unknown>,
      config: runtimeConfig as unknown as Record<string, unknown>,
    });
    if (guardOutcome.blocked) {
      res.status(guardOutcome.statusCode ?? 400).json({
        error: { code: guardOutcome.code ?? "request_guard_violation", message: guardOutcome.message, type: "invalid_request_error" },
      });
      return;
    }
    if (guardOutcome.modifiedBody) {
      Object.assign(chatBody as Record<string, unknown>, guardOutcome.modifiedBody);
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
      rejectsSamplingParams: modelRejectsSamplingParams(enforcement.masterModel.id),
      reasoningOutputFloor: modelReasoningOutputFloor(enforcement.masterModel.id),
    });

    // Faz 1 paket kota dalı (reserve'den ÖNCE): istek bir paket entitlement'ının
    // kapsadığı modeldeyse ve günlük kota varsa atomik slot rezerve edilir ve bakiye
    // reserve'i ATLANIR. Aksi halde mevcut PAYG reserveUsageBudget (DOKUNULMAZ) çalışır.
    const pkgSlot = await tryReservePackageSlot(userId, masterModel.id);
    billedViaPackage = pkgSlot.covered;
    entitlementId = pkgSlot.entitlementId;
    // char/4 tahmini gerçek token'ın ~3-6× üstüne şişer (bkz CONTEXT_GUARD_ESTIMATE_INFLATION notu);
    // paket limitini de küresel guard ile AYNI faktörle de-inflate et — yoksa paket-context death-spiral'i
    // geri gelir (paket müşterisi ~limit/6 gerçek token'da haksız 400 + auto-compact kilidi). Billing'e dokunmaz.
    if (billedViaPackage && pkgSlot.maxContextTokens && guard.contextTokens > pkgSlot.maxContextTokens * CONTEXT_GUARD_ESTIMATE_INFLATION) {
      await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
      billedViaPackage = false; entitlementId = undefined;
      throw new AppError(400, `Bağlam çok büyük (tahmini ${guard.contextTokens.toLocaleString("tr-TR")} token; bu paketin limiti ${pkgSlot.maxContextTokens.toLocaleString("tr-TR")} token). Lütfen bağlamınızı kısaltın.`);
    }
    if (billedViaPackage && pkgSlot.tpmLimit && pkgSlot.packageId) {
      if (!consumeTpmOrDeny(userId, pkgSlot.packageId, guard.contextTokens, pkgSlot.tpmLimit)) {
        await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
        billedViaPackage = false; entitlementId = undefined;
        throw new RateLimitError(`Token/dakika limiti aşıldı (${pkgSlot.tpmLimit.toLocaleString("tr-TR")} token/dk). Lütfen bir dakika bekleyin.`);
      }
    }
    // R-3 CF over-serve cap (INERT until cf_overserve_cap_multiplier>0): CF aynası tükenmişken
    // (NULL / <=0+stale) ve cf_served > daily_limit*çarpan ise rezervasyonu iade et + 402. cf_remaining>0
    // (gerçek ödenmiş ünite) iken ASLA cap'lemez. maxContextTokens deseninin ikizi.
    if (
      billedViaPackage &&
      shouldCapOverServe({
        capMult: runtimeConfig?.cfOverserveCapMultiplier ?? 0,
        cfRemaining: pkgSlot.cfRemaining,
        cfRemainingAt: pkgSlot.cfRemainingAt,
        cfServed: pkgSlot.cfServed ?? 0,
        dailyLimit: pkgSlot.dailyLimitSnapshot ?? 0,
        nowMs: Date.now(),
      })
    ) {
      await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
      billedViaPackage = false;
      entitlementId = undefined;
      throw new QuotaExhaustedError("Paket kotanız doldu (CF). Lütfen paketinizi yenileyin.");
    }
    if (!billedViaPackage) {
      // Devreden saatlik hız limiti (reserve'den ÖNCE): paket slotu BULUNAMADI ve tek sebep saatlik
      // cap ise (günlük tavan hâlâ müsait) → sessizce bakiyeden tahsil ETME, 429 + Retry-After fırlat.
      // Salt-okuma; throw burada hiçbir rezervasyon yapılmadan temiz iptal eder (billedViaPackage=false,
      // tryReservePackageSlot slot vermedi, reserveUsageBudget henüz çağrılmadı). Saf-saatlik DEĞİLSE
      // (günlük tavan da dolu) exceeded:false döner → aşağıdaki normal QuotaExhausted/bakiye yolu sürer.
      const hourly = await checkHourlyExceeded(userId, masterModel.id);
      if (hourly.exceeded) {
        throw new RateLimitError("Saatlik 150 istek hız limitine ulaştınız. Lütfen bir süre bekleyin.", hourly.retryAfterSec);
      }
      if (await hasActivePackageForModel(userId, masterModel.id)) {
        throw new QuotaExhaustedError("Günlük istek limitiniz doldu. Yeni paket alın ya da kredinizden kullanın.");
      }
      // CodeFast yalnız-paket modeli PAYG ile kullanılamaz (codefast profilinin kullanılır
      // per-customer keyi yoktur) — rezervasyondan ÖNCE engelle (orphan reserve olmasın).
      if ((await resolveProviderChainForModel(masterModel.id)).primary.profileId === "codefast") {
        throw new AppError(402, "Bu model yalnız ilgili paket ile kullanılabilir; lütfen uygun paketi satın alın.");
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
    // Native /responses passthrough body (sub-codex / cf:*): the ORIGINAL Responses request
    // with ONLY the guard mutations applied — canonical/alias model (same normalization as
    // providerBody.model) + the guard's effective output cap. tools are UNTOUCHED so Codex's
    // local_shell / apply_patch / web_search survive (the translation path drops them). Used
    // only when nativeResponsesCapable(ctx); the translation path keeps using providerBody.
    // NOTE: this deliberately does NOT apply the request-guardrail modifiedBody mutations
    // (guardrails are faz0-inert/off today); if they're ever enabled to MUTATE bodies, mirror
    // that here for the native path (follow-up).
    const rawProviderBody: Record<string, unknown> = {
      ...rawResponsesBody,
      model: providerBody.model,
      max_output_tokens: guard.reservedCompletionTokens,
    };
    // Strip customerId — same as the translation path (STRIP_BEFORE_UPSTREAM, request-guard-service):
    // it's an internal routing hint that must NEVER be forwarded upstream. (No system-message
    // injection on the native path — native forwards verbatim, we just don't leak the id.)
    delete rawProviderBody.customerId;
    let chain = await resolveLaneAwareChain(masterModel.id);
    laneProfileId = chain.primary.profileId;
    // PAYG Claude→CF override (bkz handleTextJsonEndpoint): pointer'lı kullanıcı + Claude modeli → CF reseller
    // primary, koltuk fallback. billedViaPackage=false → TL billing aynen. Pointer NULL = INERT (no-op).
    if (!billedViaPackage && isClaudeOverrideModel(masterModel.id)) {
      const ovrSlot = await getClaudeCfOverrideSlot(userId);
      if (ovrSlot) {
        const ovrChain = buildClaudeCfChain(ovrSlot, env.CODEFAST_RESELLER_BASE_URL, chain.primary);
        if (ovrChain) { chain = ovrChain; cfOverrideEntId = ovrSlot.entitlementId; }
      }
    }
    // Paket-bazlı upstream override (bkz handleTextJsonEndpoint): doluysa tek-sağlayıcı zincir.
    if (billedViaPackage) {
      const cfChain = pkgSlot.cfApiSlug ? entitlementOverrideChain(pkgSlot, env.CODEFAST_RESELLER_BASE_URL) : null;
      // CF paketi kapsıyor ama KULLANILABİLİR müşteri keyi YOK (pending_manual / failed /
      // çözülemeyen cipher) → normal routing'e SESSİZCE düşme (yanlış sağlayıcıya gider,
      // CF paketinden faturalanır). Slotu iade et + 409.
      if (requiresCfKeyReady(pkgSlot.cfApiSlug, cfChain)) {
        await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
        throw new AppError(409, "Paket teslim ediliyor; birkaç dakika içinde aktifleşecek.");
      }
      // Önce CodeFast müşteri-keyi zinciri (entitlement), yoksa paket-bazlı override.
      const pkgChain = cfChain ?? packageOverrideChain(pkgSlot);
      if (pkgChain) {
        // Koltuk-öncelikli (SEAT_PRIMARY_FOR_PACKAGE_GPT): GPT paket modeli koltuğa (sub-codex)
        // çözülüyorsa → koltuk primary + CF fallback ("zorunda kalınca CF"). `chain` hâlâ per-model
        // zinciri; yalnız CF entitlement (cfChain) varken uygula, GPT-dışı/koltuksuz modelde CF olduğu gibi kalır.
        // CF_FIRST (drain) SEAT_PRIMARY'den ÖNCELİKLİ: açıkken codex önce CF'yi (içerideki prepaid ünite)
        // yer, bitince koltuğa düşer. Kapalıyken normal koltuk-öncelikli davranış. cfChain yoksa ikisi de no-op.
        const seatChain = cfChain
          ? (env.CF_FIRST_FOR_PACKAGE_GPT
              ? cfFirstPackageChain(chain, cfChain)
              : env.SEAT_PRIMARY_FOR_PACKAGE_GPT
                ? seatPrimaryPackageChain(chain, cfChain)
                : null)
          : null;
        chain = seatChain ?? pkgChain;
      }
    }
    // Codex 1-1 spark alternasyonu (env CODEX_SPARK_ALTERNATION_ENABLED, default OFF=no-op): paket
    // isteğinde gpt-5.5/gpt-5.4 müşteri-başı requests_today paritesine göre 1-1 bölünür — ÇİFT gerçek
    // model (premium kova), TEK koltuk bacağı upstream gpt-5.3-codex-spark (bengalfox) + yanıt geri
    // relabel. Yalnız sub-codex bacağına dokunur (CF fallback gerçek modeli taşır). gpt-5.2 etkilenmez.
    // Desteklenmeyen built-in araç taşıyan istek (örn tools:[{type:"image_generation"}]) spark'a girmez (2026-07-02 olayı).
    // ⚠️ Gate rawProviderBody'yi denetler (providerBody DEĞİL): spark bacağı sub-codex =
    // nativeResponsesCapable → upstream'e giden gövde rawProviderBody'dir (HAM Responses, tools
    // dokunulmamış). providerBody responsesRequestToChat çevirisidir — convertTools HER built-in
    // aracı {type:"function"} sarmalına çevirdiğinden gate orada yapısal no-op olurdu
    // (kilit: spark-tool-gate-wire.test.ts).
    if (env.CODEX_SPARK_ALTERNATION_ENABLED && billedViaPackage) {
      chain = applyCodexSparkAlternation(chain, masterModel.id, pkgSlot.requestsToday ?? 0, rawProviderBody);
    }
    if (env.CODEX_SPARK_56_ALTERNATION_ENABLED && billedViaPackage) {
      chain = applyGpt56SparkAlternation(chain, masterModel.id, pkgSlot.requestsToday ?? 0, rawProviderBody);
    }
    chain = await applyClaudeCloakRouteLock({ endpoint: "responses", model: masterModel, chain });
    if (chain.primary.profileId === "rika") (providerBody as Record<string, unknown>).customerId = userId;
    chain = applyIdentityRelabel(chain, masterModel.id);
    const activeProviderAdapter = await getActiveProviderAdapter();

    const responsesMeta = { id: requestId, model: masterModel!.id, createdAt, toolKinds: responsesToolKinds, stats: responsesToolStats };
    if (isStream) {
      res.setHeader("X-YZ-Request-Id", requestId);
      const { result: usage, servedBy: responsesStreamProfileId } = await forwardWithFailover(chain, { res }, async (ctx, attempt) => {
        // Native passthrough (sub-codex / cf:*): forward the RAW Responses body (tools preserved).
        if (nativeResponsesCapable(ctx)) {
          try {
            return await activeProviderAdapter.forwardResponsesStreamNative(rawProviderBody as any, res, ctx, responsesMeta, attempt);
          } catch (err) {
            // Native /responses unsupported by THIS upstream (pre-commit 4xx/404) → degrade to
            // the translation stream on the SAME ctx (no bytes out yet). 5xx/conn → rethrow so
            // forwardWithFailover picks the cross-provider fallback.
            // ⚠️ SPARK bacağı (ctx.relabelResponseTo string — YALNIZ applyCodexSparkAlternation
            // set eder) DEGRADE EDİLMEZ: çeviri yolu da AYNI ctx'in spark modelMap'iyle rename
            // eder → upstream YİNE 400, ama forwardResponsesStream bu sırada SSE başlıklarını
            // commit etmiş olur (post-commit) → chain-failover ölür → müşteri stream_zero_output
            // görür (2026-07-02 17:34 olay #3: "does not support image inputs", 6 hata/89 sn).
            // Rethrow → forwardWithFailover sub-codex GENİŞ taksonomisiyle (her non-2xx eligible,
            // provider-failover.ts) isteği GERÇEK koltuk bacağına (orijinal gövde, tam yetenek)
            // düşürür = gelecekteki HER bilinmeyen spark kısıtı için güvenlik ağı.
            const degraded = shouldDegradeNativeResponsesForContext(ctx, err, res, rawResponsesBody);
            logger.info(
              { requestId, stream: true, degraded, lossyToolTypes: translationLossyToolTypes(rawResponsesBody) },
              "responses native degrade",
            );
            if (degraded) {
              return await activeProviderAdapter.forwardResponsesStream(providerBody as any, res, ctx, responsesMeta, attempt);
            }
            throw err;
          }
        }
        // Non-native upstream → existing translation (chat SSE → Responses events) path.
        return activeProviderAdapter.forwardResponsesStream(providerBody as any, res, ctx, responsesMeta, attempt);
      });
      const responseMs = Date.now() - start;

      const hasUsage = usage.promptTokens > 0 || usage.completionTokens > 0;
      // İlk-token timeout (usage.noCharge) → ÜCRETSİZ: status:"error" (0 tahsil + iade /
      // pakette slot serbest). Aksi halde usage yoksa stream_missing_usage floor.
      const streamStatus = usage.noCharge
        ? "error"
        : hasUsage
          ? "success"
          : (runtimeConfig?.streamMissingUsageFallbackEnabled === false ? "error" : "stream_missing_usage");
      const billedPromptTokens = usage.noCharge
        ? 0
        : resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);
      await settleBilling({
        billedViaPackage,
        entitlementId,
        cfOverrideEntId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens, cfRemaining: usage.cfRemaining },
        requestId,
        rawUsageJson: usage,
        errorCode: usage.noCharge ? (usage.noChargeReason ?? "upstream_first_token_timeout") : (streamStatus === "stream_missing_usage" ? "stream_missing_usage" : undefined),
        responseMs,
        status: streamStatus,
        profileId: responsesStreamProfileId ?? undefined,
      });

      // Stream dalı araç telemetrisi (HANDOFF item F): sayaç settle'dan SONRA, para yoluna
      // dokunmadan yazılır. emittedToolItems === 0 iken toolCallCount > 0 → emit hatası BİZDE.
      logResponsesToolOutcome({
        requestId,
        stream: true,
        status: streamStatus,
        toolCount: toolContract.toolCount,
        mappedToolCount: toolContract.mappedToolCount,
        droppedToolTypes: toolContract.droppedToolTypes,
        toolCallCount: responsesToolStats.upstreamToolCalls,
        emittedToolItems: responsesToolStats.emittedToolItems,
        finishReason: usage.finishReason,
      });
    } else {
      const { result: { raw, usage, native }, servedBy: responsesProfileId } = await forwardWithFailover(chain, {}, async (ctx, attempt) => {
        // Native passthrough (sub-codex / cf:*): RAW Responses body → upstream /responses,
        // returns the native Responses JSON verbatim (tools preserved).
        if (nativeResponsesCapable(ctx)) {
          try {
            const r = await activeProviderAdapter.forwardResponses(rawProviderBody as any, ctx, attempt);
            return { raw: r.raw, usage: r.usage, native: true };
          } catch (err) {
            // Native /responses unsupported (pre-commit 4xx/404) → translation on the SAME ctx.
            const degraded = isNativeResponsesDegradable(err, res, rawResponsesBody);
            logger.info(
              { requestId, stream: false, degraded, lossyToolTypes: translationLossyToolTypes(rawResponsesBody) },
              "responses native degrade",
            );
            if (degraded) {
              const r = await activeProviderAdapter.forwardChat(providerBody as any, ctx, attempt);
              return { raw: r.raw, usage: r.usage, native: false };
            }
            throw err;
          }
        }
        // Non-native upstream → existing chat/completions translation path.
        const r = await activeProviderAdapter.forwardChat(providerBody as any, ctx, attempt);
        return { raw: r.raw, usage: r.usage, native: false };
      });
      const responseMs = Date.now() - start;

      const billedPromptTokens = resolveBilledPromptTokens(usage.promptTokens, guard.contextTokens);
      const { costTL, remainingTL } = await settleBilling({
        billedViaPackage,
        entitlementId,
        cfOverrideEntId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: billedPromptTokens, completionTokens: usage.completionTokens, cfRemaining: usage.cfRemaining },
        requestId,
        rawUsageJson: usage,
        responseMs,
        status: "success",
        profileId: responsesProfileId ?? undefined,
      });

      // ── Sessiz arıza dedektörü (salt-ek teşhis) ────────────────────────────
      // İstemci araç deklare ettiği hâlde upstream HİÇ araç çağrısı döndürmediyse
      // istek teknik olarak "success" olur ve faturalanır, ama istemci hiçbir şey
      // yürütemez (müşteri "hiçbir şey yapmıyor" der). Bu kombinasyonu görünür kılar;
      // faturalama/DB davranışı DEĞİŞMEZ. bkz spec görev 8.2/8.4.
      // Native bacakta araçlar HAM gövdeyle gittiği için upstream'e giden araç sayısı
      // deklare edilen sayıdır; çeviri yolunda yalnız eşlenenler gider (görev 8.2).
      logResponsesToolOutcome({
        requestId,
        stream: false,
        status: "success",
        native: native === true,
        toolCount: toolContract.toolCount,
        mappedToolCount: native === true ? toolContract.toolCount : toolContract.mappedToolCount,
        droppedToolTypes: native === true ? [] : toolContract.droppedToolTypes,
        toolCallCount: countResponseToolCalls(raw, native === true),
        finishReason: usage.finishReason,
      });

      const { remainingUSD } = await getUserBalanceSnapshot(userId);
      setExtendedBillingHeaders(res, costTL, remainingTL, remainingUSD, requestId);
      // Native passthrough returns the upstream's OWN Responses JSON verbatim; the translation
      // path returns a chat.completion that must be converted to the Responses shape.
      res.json(native ? raw : chatCompletionToResponses(raw, { id: requestId, model: masterModel.id, createdAt, toolKinds: responsesToolKinds }));
    }
  } catch (err) {
    // Lane scheduler: 429/503 → başarısız lane'i backoff'a al
    const errStatus = (err as Error & { status?: number }).status;
    if (errStatus === 429 || errStatus === 503) {
      if (laneProfileId) recordLaneBackoff(laneProfileId);
      if (masterModel) void drainQueue(await resolveLanesForModel(masterModel.id));
    }
    if (err instanceof InsufficientBalanceError || err instanceof RateLimitError || err instanceof ModelNotFoundError || err instanceof ModelDisabledError || err instanceof BadRequestError) {
      return next(err);
    }
    if (masterModel && guard) {
      const responseMs = Date.now() - start;
      settleBilling({
        billedViaPackage,
        entitlementId,
        cfOverrideEntId,
        userId,
        apiKeyId,
        model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: 0, cfRemaining: cfRemainingFromError(err) },
        requestId,
        rawUsageJson: { promptTokens: guard.contextTokens, completionTokens: 0 },
        errorCode: upstreamErrorCode(err),
        responseMs,
        status: "error",
      })
        .catch((e2) => logger.error({ err: e2 }, "error usage record failed (responses)"));
    }
    // Fix A: kota bitti → temiz 429 (responses=openai dialect). Stream başladıysa
    // emitQuotaExhausted headersSent'i görüp false döner (statü değişemez).
    if (emitContextTooLarge(err, res, "openai", asLang(req.lang))) return;
    if (emitQuotaExhausted(err, res, "openai", asLang(req.lang))) return;
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
  let billedViaPackage = false;
  let imageEntitlementId: string | undefined;

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

    // ── PAKET KAPSAMI (görsel) — chat text-uçlarıyla AYNI desen ───────────────
    // Görsel, CF reseller'ın görsel-proxy'sinden (örn /proxy/gpt-image-2-api/v1/images/generations)
    // müşterinin provision edilmiş cf_rc_ keyiyle servis edilir. Müşteri bir görsel paketi sahibiyse
    // (cf_api_slug dolu entitlement) istek KOTADAN düşer (cost=0), BAKİYEDEN değil. Kapsamıyorsa PAYG.
    const pkgSlot = await tryReservePackageSlot(userId, masterModel.id);
    billedViaPackage = pkgSlot.covered;
    let providerCtx: ProviderContext;
    if (billedViaPackage) {
      const cfChain = pkgSlot.cfApiSlug ? entitlementOverrideChain(pkgSlot, env.CODEFAST_RESELLER_BASE_URL) : null;
      if (cfChain) {
        imageEntitlementId = pkgSlot.entitlementId;
        providerCtx = cfChain.primary;
      } else {
        // Paket kapsıyor ama CF rota çözülemedi (key henüz hazır değil / cf_api_slug yok) → slotu iade + 409.
        // PAYG'a DÜŞME: çalışan PAYG görsel upstream'i YOK (codefast /images 404), müşteriyi sessiz ücretlendirme/404'leme.
        await releasePackageSlot(pkgSlot.entitlementId!, masterModel.id);
        billedViaPackage = false;
        throw new AppError(409, "Görsel paketi hazırlanıyor; birkaç dakika içinde aktifleşecek, sonra tekrar dene.");
      }
    } else {
      // Görsel üretimi PAKET gerektirir — çalışan PAYG görsel upstream'i YOK (codefast /images → 404).
      // No-package isteğini upstream'e gönderip [object Object]/404 üretmek yerine net "paket gerekli" döndür (402 → panel CTA).
      throw new InsufficientBalanceError("Görsel üretmek için bir görsel paketine ihtiyacın var. Görsel paketlerinden birini alıp tekrar dene.");
    }

    const adapter = await getActiveProviderAdapter();
    const providerBody = { ...(req.body as Record<string, unknown>), model: masterModel.id };

    // Global eşzamanlılık kapısı (kuyruk) + upstream forward — ZAMAN-BÜTÇELİ retry.
    // Görsel gen YAVAŞ (60-120s) + ara sıra geçici "upstream returned an error". Naif 3× retry yavaş upstream'de
    // KATLANIP nginx 300s'i aşıyor → 504 (kanıtlı müşteri hatası). Çözüm: per-attempt timeout 230s (forwardImage'a
    // geçer, maxAttempts=1 ile bağlantı-retry compounding kapalı) + yalnız HIZLI (<20s) geçici hatada 1 kez daha
    // dene → toplam < ~260s (nginx 300s altında, 504 yok). BAŞARISIZ deneme kota/CF TÜKETMEZ (resize/charge sadece
    // başarıda) ⇒ retry para-güvenli. 4xx (geçersiz boyut/içerik) tekrarlanmaz.
    const IMG_ATTEMPT_MS = 230_000;
    const imgT0 = Date.now();
    let raw: unknown;
    let imageCount = 0;
    let imgCfRemaining: number | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const out = await withImageSlot(() => adapter.forwardImage(endpoint, providerBody, providerCtx, IMG_ATTEMPT_MS));
        raw = out.raw; imageCount = out.imageCount; imgCfRemaining = out.cfRemaining ?? null;
        break;
      } catch (e) {
        const st = (e as { status?: number })?.status;
        const bodyMsg = (() => {
          const b = (e as { body?: unknown })?.body;
          return (typeof b === "object" && b ? JSON.stringify(b) : String((e as Error)?.message ?? "")).toLowerCase();
        })();
        const transient = st == null || st >= 500 || st === 429 ||
          /upstream returned an error|temporar|timeout|try again|too many|overload/i.test(bodyMsg);
        const elapsed = Date.now() - imgT0;
        // yalnız HIZLI başarısızlıkta 1 kez daha dene (yavaş/timeout'ta retry = 504 riski)
        if (attempt >= 2 || !transient || elapsed > 20_000) throw e;
        logger.warn({ attempt, status: st, elapsedMs: elapsed }, "image upstream transient (fast) — retrying once");
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    const responseMs = Date.now() - start;

    // gpt-image istenen TAM pikseli üretmez (kendi çözünürlüğünü seçer; örn 1920x1080 istenir → 1672x941 döner).
    // Müşterinin "Özel" alanına girdiği KESİN boyutu vermek için çıkan görseli arka planda ffmpeg ile
    // istenen W×H'ye resize et (cover+crop, bozulmasız). Hata → orijinal (asla kırma; resize fn never-throw).
    const wantSize = parseRequestedSize((req.body as { size?: unknown })?.size);
    if (wantSize && raw && typeof raw === "object") {
      const dataArr = (raw as { data?: Array<{ b64_json?: string }> }).data;
      if (Array.isArray(dataArr)) {
        for (let i = 0; i < dataArr.length; i++) {
          const item = dataArr[i];
          if (item?.b64_json) {
            const rz = await resizeB64ToExact(item.b64_json, wantSize.w, wantSize.h, `${requestId}-${i}`);
            item.b64_json = rz.b64;
          }
        }
      }
    }

    if (billedViaPackage && imageEntitlementId) {
      // Kota-bazlı: paradan düşmez, kotadan düşer (slot zaten rezerve edildi). cost=0.
      await recordPackageUsage({
        userId, apiKeyId, modelId: masterModel.id, entitlementId: imageEntitlementId,
        inputUsage: 0, outputUsage: imageCount, responseMs, status: "success", requestId,
      });
      // CF AYNASI (donuk-sayaç kök-fix): görsel yanıtı `x-codefast-remaining` döndürür (KANITLI: gen başına
      // azalır). Müşteri-bazlı cf_remaining'e yaz → panel "kalan" + gate CF gerçeğiyle SENKRON (eskiden donuktu).
      // source='success' = CF otoriter değerini koşulsuz yaz. Görsel non-seat/non-codex → updateCfRemaining yeterli.
      if (imgCfRemaining != null) {
        await updateCfRemaining(userId, imgCfRemaining, "success").catch((e4) => logger.error({ err: e4 }, "image cf mirror update failed"));
      }
      // Lazy provisioning: CF buffer azaldıysa arka planda +ünite al (fire-and-forget; isteği bloklamaz).
      void topUpCfIfNeeded(imageEntitlementId).catch(() => {});
      const snap = await getUserBalanceSnapshot(userId);
      setExtendedBillingHeaders(res, 0, snap.remainingTL, snap.remainingUSD, requestId);
    } else {
      const charge = await chargeImage({
        userId, apiKeyId, model: masterModel, imageRequestId: `img_${requestId}`,
        imageCount, responseMs, status: imageCount > 0 ? "success" : "no_charge",
      });
      const { remainingUSD } = await getUserBalanceSnapshot(userId);
      setExtendedBillingHeaders(res, charge.costTL, charge.remainingTL, remainingUSD, requestId);
    }
    res.json(raw);
  } catch (err) {
    // Paket dalı: rezerve edilmiş slotu iade et (K1'in kota ikizi; servis verilmedi → kota geri).
    if (billedViaPackage && imageEntitlementId) {
      await releasePackageSlot(imageEntitlementId).catch((e3) => logger.error({ err: e3 }, "image package slot release failed"));
    }
    if (
      err instanceof InsufficientBalanceError ||
      err instanceof RateLimitError ||
      err instanceof ModelNotFoundError ||
      err instanceof ModelDisabledError ||
      err instanceof BadRequestError
    ) {
      return next(err);
    }
    // PAYG upstream hatası → ÜCRET KESME (no_charge usage kaydı). Paket dalında slot zaten iade edildi (cost=0).
    if (masterModel && !billedViaPackage) {
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
