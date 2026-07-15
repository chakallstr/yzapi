import { db, dbSql } from "../db/client.js";
import { users, transactions, usageRecords } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { InsufficientBalanceError } from "../lib/errors.js";
import { buildPricingConfig, applyOverride, computePrice } from "./pricing-service.js";
import { resolveTokenSplit } from "./usage-breakdown.js";
import type { MasterModel } from "../../master-models.js";

export interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  cacheReadTokens?: number;
  imageCount?: number;
  videoSeconds?: number;
  videoResolution?: "480p" | "720p" | "1080p" | "default";
}

export interface ChargeResult {
  costTL: number;
  remainingTL: number;
  alreadyCharged?: boolean;
}

type ChargeStatus = "success" | "error" | "stream_missing_usage";
const TOKEN_PRICE_UNIT = 1e6;

// Cache-read (prompt-cache hit) tokens are billed at a FLAT rate instead of the
// model's full input price. Anthropic/OpenAI charge cache reads at a fraction of
// base input, so charging them at 1.0× overbilled customers on large cached
// prompts. This flat rate applies to the cache-read subset only; cache-creation
// (write) tokens stay folded into base input at the model's input price.
const CACHE_READ_USD_PER_M = 0.06;

// Convert the flat USD/1M cache-read rate into the requested currency. For TL we
// reuse THIS model's own USD→TL conversion (input.tl / input.usd = kur*carpan),
// so cache-read margin tracks the same FX + markup as base input. If the model
// has no USD input price (free/seat model), cache reads are not charged.
function cacheReadRate(
  pricingCfg: ReturnType<typeof computePrice>,
  currency: "tl" | "usd",
): number {
  if (currency === "usd") return CACHE_READ_USD_PER_M;
  const inUsd = pricingCfg.input?.usd ?? 0;
  const inTl = pricingCfg.input?.tl ?? 0;
  if (inUsd > 0 && inTl > 0) return CACHE_READ_USD_PER_M * (inTl / inUsd);
  return 0;
}

function computeCost(
  model: MasterModel,
  usage: UsageInfo,
  pricingCfg: ReturnType<typeof computePrice>,
  currency: "tl" | "usd"
): number {
  if (model.type === "Metin") {
    const input = pricingCfg.input?.[currency] ?? 0;
    const output = pricingCfg.output?.[currency] ?? 0;
    const prompt = usage.promptTokens ?? 0;
    const completion = usage.completionTokens ?? 0;
    // promptTokens already INCLUDES cache-read tokens (closerouter normalize).
    // Carve cache-read out and bill it at the flat rate; the rest at input price.
    const cacheRead = Math.max(0, Math.min(usage.cacheReadTokens ?? 0, prompt));
    const baseInput = prompt - cacheRead;
    return (
      (baseInput / TOKEN_PRICE_UNIT) * input +
      (cacheRead / TOKEN_PRICE_UNIT) * cacheReadRate(pricingCfg, currency) +
      (completion / TOKEN_PRICE_UNIT) * output
    );
  }

  if (model.type === "Görsel") {
    const inputTL = pricingCfg.input?.[currency] ?? 0;
    const outputTL = pricingCfg.output?.[currency] ?? 0;
    const count = usage.imageCount ?? 1;
    return count * (inputTL + outputTL);
  }

  const res = usage.videoResolution ?? "default";
  const rateTL = pricingCfg.perResolution?.[res]?.[currency] ?? pricingCfg.perResolution?.default?.[currency] ?? 0;
  return (usage.videoSeconds ?? 0) * rateTL;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round8(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}

function buildPricingSnapshot(model: MasterModel, pricingCfg: ReturnType<typeof computePrice>) {
  return {
    modelId: model.id,
    modelType: model.type,
    computed: pricingCfg,
    capturedAt: new Date().toISOString(),
  };
}

async function findExistingCharge(requestId?: string): Promise<ChargeResult | null> {
  if (!requestId) return null;

  const rows = await db
    .select({
      costTL: usageRecords.costTL,
      remainingTL: usageRecords.remainingTL,
      status: usageRecords.status,
    })
    .from(usageRecords)
    .where(eq(usageRecords.requestId, requestId))
    .limit(1);

  if (!rows.length) return null;

  return {
    costTL: Number(rows[0].costTL ?? 0),
    remainingTL: Number(rows[0].remainingTL ?? 0),
    alreadyCharged: rows[0].status === "success",
  };
}

async function findReservation(requestId?: string) {
  if (!requestId) return null;

  const rows = await db
    .select({
      miktarTL: transactions.miktarTL,
      sonrakiBakiye: transactions.sonrakiBakiye,
    })
    .from(transactions)
    .where(eq(transactions.idempotencyKey, `usage_reserve_${requestId}`))
    .limit(1);

  return rows[0] ?? null;
}

function buildUsageChargeMeta(
  model: MasterModel,
  usage: UsageInfo,
  pricingCfg: ReturnType<typeof computePrice>,
  rawUsageJson?: unknown,
) {
  // Carve the cache-read subset out of the billed prompt so computeCost can
  // price it at the flat cache rate. Only text models expose a cache breakdown;
  // at reserve time (no rawUsageJson) this is 0 → full input rate reserve (safe,
  // refunded/re-settled at settle). resolveTokenSplit clamps cache <= prompt.
  //
  // LIVE SHAPE: proxy passes the normalized ChatUsage object as rawUsageJson,
  // whose provider cache fields (cache_read_input_tokens / prompt_tokens_details
  // .cached_tokens) live under `.providerRaw` — the top level only has
  // promptTokens/completionTokens. Unwrap providerRaw so the split sees the real
  // cache tokens; fall back to the object itself (unit tests + any path that
  // passes raw upstream JSON directly).
  const rawForSplit = (() => {
    if (rawUsageJson && typeof rawUsageJson === "object") {
      const pr = (rawUsageJson as { providerRaw?: unknown }).providerRaw;
      if (pr != null) return pr;
    }
    return rawUsageJson ?? usage;
  })();
  const cacheReadTokens =
    model.type === "Metin"
      ? resolveTokenSplit(usage.promptTokens ?? 0, rawForSplit).cacheReadTokens
      : 0;
  const usageForCost: UsageInfo = { ...usage, cacheReadTokens };
  const rawCostTL = computeCost(model, usageForCost, pricingCfg, "tl");
  const rawCostUsd = computeCost(model, usageForCost, pricingCfg, "usd");
  const costTL = round4(rawCostTL);
  const costUsd = round8(rawCostUsd);
  const pricingSnapshot = buildPricingSnapshot(model, pricingCfg);
  const inputUsage = usage.promptTokens ?? usage.imageCount ?? Math.round((usage.videoSeconds ?? 0) * 1000);
  const outputUsage = usage.completionTokens ?? 0;
  const recordType = model.type === "Metin" ? "text" : model.type === "Görsel" ? "image" : "video";

  return {
    costTL,
    costUsd,
    pricingSnapshot,
    inputUsage,
    outputUsage,
    recordType,
    rawUsageJson: rawUsageJson ?? usage,
  };
}

export async function reserveUsageBudget(opts: {
  userId: string;
  apiKeyId: string;
  model: MasterModel;
  usage: UsageInfo;
  requestId: string;
}): Promise<{ reservedTL: number; remainingTL: number; alreadyReserved?: boolean }> {
  const existing = await findReservation(opts.requestId);
  if (existing) {
    return {
      reservedTL: Math.abs(Number(existing.miktarTL ?? 0)),
      remainingTL: Number(existing.sonrakiBakiye ?? 0),
      alreadyReserved: true,
    };
  }

  const pricingCfg = await buildPricingConfig();
  const patchedModel = await applyOverride(opts.model);
  const meta = buildUsageChargeMeta(patchedModel, opts.usage, computePrice(patchedModel, pricingCfg));
  const reserveTL = meta.costTL;

  if (reserveTL <= 0) {
    const balanceRows = await db.select({ bakiye: users.bakiyeTL }).from(users).where(eq(users.id, opts.userId)).limit(1);
    return { reservedTL: 0, remainingTL: Number(balanceRows[0]?.bakiye ?? 0) };
  }

  const reserveStr = reserveTL.toFixed(4);
  let remainingTL = 0;
  let previousBalance = 0;
  let userEmail = "";

  const rows = await dbSql.begin(async (txSql) => {
    const updated = await txSql<{ bakiye_tl: string; email: string }[]>`
      UPDATE users
      SET bakiye_tl = bakiye_tl - ${reserveStr}::numeric,
          son_aktivite = now()
      WHERE id = ${opts.userId}::uuid
        AND bakiye_tl >= ${reserveStr}::numeric
      RETURNING bakiye_tl, email
    `;

    if (!updated.length) return updated;

    remainingTL = Number(updated[0].bakiye_tl);
    previousBalance = remainingTL + reserveTL;
    userEmail = updated[0].email;

    const txRows = await txSql<{ id: string }[]>`
      INSERT INTO transactions (
        user_id,
        user_email,
        tip,
        miktar_tl,
        onceki_bakiye,
        sonraki_bakiye,
        aciklama,
        idempotency_key
      ) VALUES (
        ${opts.userId}::uuid,
        ${userEmail},
        'kullanim_rezervasyon',
        ${`-${reserveStr}`}::numeric,
        ${previousBalance.toFixed(4)}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${`${opts.model.id} kullanım rezervasyonu`},
        ${`usage_reserve_${opts.requestId}`}
      )
      RETURNING id
    `;

    return txRows.length ? updated : [];
  });

  if (!rows.length) {
    throw new InsufficientBalanceError("Insufficient balance to reserve this request");
  }

  return { reservedTL: reserveTL, remainingTL };
}

export async function settleReservedUsage(opts: {
  userId: string;
  apiKeyId: string;
  model: MasterModel;
  usage: UsageInfo;
  responseMs: number;
  status: ChargeStatus;
  requestId: string;
  upstreamRequestId?: string;
  rawUsageJson?: unknown;
  errorCode?: string;
  profileId?: string;
}): Promise<ChargeResult> {
  const existing = await findExistingCharge(opts.requestId);
  if (existing) return existing;

  const reservation = await findReservation(opts.requestId);
  if (!reservation) {
    return chargeUsage(opts);
  }

  const pricingCfg = await buildPricingConfig();
  const patchedModel = await applyOverride(opts.model);
  const computed = computePrice(patchedModel, pricingCfg);
  const meta = buildUsageChargeMeta(patchedModel, opts.usage, computed, opts.rawUsageJson);
  const reservedTL = Math.abs(Number(reservation.miktarTL ?? 0));
  const reserveStr = reservedTL.toFixed(4);
  const actualCostTL = opts.status === "error" ? 0 : meta.costTL;
  const actualCostUsd = opts.status === "error" ? 0 : meta.costUsd;
  const actualCostStr = actualCostTL.toFixed(4);
  const actualCostUsdStr = actualCostUsd.toFixed(8);

  let remainingTL = Number(reservation.sonrakiBakiye ?? 0);
  const errorCode = opts.errorCode ?? (opts.status === "stream_missing_usage" ? "stream_missing_usage" : undefined);

  const rows = await dbSql.begin(async (txSql) => {
    if (reservedTL > 0) {
      const refundRows = await txSql<{ bakiye_tl: string; email: string }[]>`
        UPDATE users
        SET bakiye_tl = bakiye_tl + ${reserveStr}::numeric,
            son_aktivite = now()
        WHERE id = ${opts.userId}::uuid
        RETURNING bakiye_tl, email
      `;

      if (!refundRows.length) return refundRows;

      const refundAfter = Number(refundRows[0].bakiye_tl);
      const refundBefore = refundAfter - reservedTL;

      await txSql`
        INSERT INTO transactions (
          user_id,
          user_email,
          tip,
          miktar_tl,
          onceki_bakiye,
          sonraki_bakiye,
          aciklama,
          idempotency_key
        ) VALUES (
          ${opts.userId}::uuid,
          ${refundRows[0].email},
          'iade',
          ${reserveStr}::numeric,
          ${refundBefore.toFixed(4)}::numeric,
          ${refundAfter.toFixed(4)}::numeric,
          ${`${opts.model.id} rezervasyon iadesi`},
          ${`usage_release_${opts.requestId}`}
        )
      `;

      remainingTL = refundAfter;
    }

    if (actualCostTL > 0) {
      // Service was already delivered upstream, so the final charge must NOT be
      // blocked by a balance guard. The reservation already verified balance at
      // reserve time; if the real cost exceeded the reservation (overage), we
      // still record the true charge (balance may dip slightly negative) instead
      // of committing the refund and dropping the charge + usage record (Y2).
      const chargeRows = await txSql<{ bakiye_tl: string; email: string }[]>`
        UPDATE users
        SET bakiye_tl = bakiye_tl - ${actualCostStr}::numeric,
            toplam_harcama_tl = toplam_harcama_tl + ${actualCostStr}::numeric,
            toplam_istek = toplam_istek + 1,
            son_aktivite = now()
        WHERE id = ${opts.userId}::uuid
        RETURNING bakiye_tl, email
      `;

      if (!chargeRows.length) return chargeRows; // user row missing — abort settle

      const chargeAfter = Number(chargeRows[0].bakiye_tl);
      const chargeBefore = chargeAfter + actualCostTL;

      await txSql`
        INSERT INTO transactions (
          user_id,
          user_email,
          tip,
          miktar_tl,
          onceki_bakiye,
          sonraki_bakiye,
          aciklama,
          idempotency_key
        ) VALUES (
          ${opts.userId}::uuid,
          ${chargeRows[0].email},
          'kullanim',
          ${`-${actualCostStr}`}::numeric,
          ${chargeBefore.toFixed(4)}::numeric,
          ${chargeAfter.toFixed(4)}::numeric,
          ${`${opts.model.id} kullanimi`},
          ${`usage_final_${opts.requestId}`}
        )
      `;

      remainingTL = chargeAfter;
    }

    await txSql`
      INSERT INTO usage_records (
        user_id,
        api_key_id,
        model_id,
        type,
        input_usage,
        output_usage,
        units_usage,
        cost_usd,
        cost_tl,
        remaining_tl,
        request_id,
        upstream_request_id,
        raw_usage_json,
        pricing_snapshot_json,
        error_code,
        response_ms,
        status,
        provider_profile_id
      ) VALUES (
        ${opts.userId}::uuid,
        ${opts.apiKeyId}::uuid,
        ${opts.model.id},
        ${meta.recordType},
        ${meta.inputUsage},
        ${meta.outputUsage},
        ${String(opts.usage.videoSeconds ?? opts.usage.imageCount ?? 0)}::numeric,
        ${actualCostUsdStr}::numeric,
        ${actualCostStr}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${opts.requestId},
        ${opts.upstreamRequestId ?? null},
        ${JSON.stringify(meta.rawUsageJson)}::jsonb,
        ${JSON.stringify(meta.pricingSnapshot)}::jsonb,
        ${errorCode ?? null},
        ${opts.responseMs},
        ${opts.status === "error" ? "error" : "success"},
        ${opts.profileId ?? null}
      )
    `;

    return [{ bakiye_tl: remainingTL.toFixed(4) }];
  });

  if (!rows.length) {
    throw new InsufficientBalanceError("Insufficient balance to settle this request");
  }

  logger.info({ userId: opts.userId, modelId: opts.model.id, costTL: actualCostTL, remainingTL }, "reserved usage settled");
  return { costTL: actualCostTL, remainingTL };
}

export async function chargeUsage(opts: {
  userId: string;
  apiKeyId: string;
  model: MasterModel;
  usage: UsageInfo;
  responseMs: number;
  status: ChargeStatus;
  requestId?: string;
  upstreamRequestId?: string;
  rawUsageJson?: unknown;
  errorCode?: string;
  profileId?: string;
}): Promise<ChargeResult> {
  const { userId, apiKeyId, model, usage, responseMs, status, requestId, upstreamRequestId, rawUsageJson, errorCode, profileId } = opts;

  const existing = await findExistingCharge(requestId);
  if (existing) return existing;

  const pricingCfg = await buildPricingConfig();
  const patchedModel = await applyOverride(model);
  const meta = buildUsageChargeMeta(patchedModel, usage, computePrice(patchedModel, pricingCfg), rawUsageJson);
  const costTL = meta.costTL;
  const costUsd = meta.costUsd;
  const pricingSnapshot = meta.pricingSnapshot;
  const inputUsage = meta.inputUsage;
  const outputUsage = meta.outputUsage;
  const recordType = meta.recordType;

  if (status === "error" || costTL === 0) {
    const balanceRows = await db.select({ bakiye: users.bakiyeTL }).from(users).where(eq(users.id, userId)).limit(1);
    const remainingTL = Number(balanceRows[0]?.bakiye ?? 0);
    await db.insert(usageRecords).values({
      userId,
      apiKeyId,
      modelId: model.id,
      type: recordType,
      inputUsage,
      outputUsage,
      costUsd: "0",
      costTL: "0",
      remainingTL: remainingTL.toFixed(4),
      requestId,
      upstreamRequestId,
      rawUsageJson: meta.rawUsageJson as any,
      pricingSnapshotJson: pricingSnapshot as any,
      errorCode: errorCode ?? (status === "stream_missing_usage" ? "stream_missing_usage" : undefined),
      responseMs,
      status,
      providerProfileId: profileId,
    });
    return { costTL: 0, remainingTL };
  }

  const costStr = costTL.toFixed(4);
  const costUsdStr = costUsd.toFixed(8);
  let remainingTL = 0;
  let previousBalance = 0;
  let userEmail = "";

  const rows = await dbSql.begin(async (txSql) => {
    const updated = await txSql<{ bakiye_tl: string; email: string }[]>`
      UPDATE users
      SET
        bakiye_tl = bakiye_tl - ${costStr}::numeric,
        toplam_harcama_tl = toplam_harcama_tl + ${costStr}::numeric,
        toplam_istek = toplam_istek + 1,
        son_aktivite = now()
      WHERE id = ${userId}::uuid
        AND bakiye_tl >= ${costStr}::numeric
      RETURNING bakiye_tl, email
    `;

    if (!updated.length) return updated;

    remainingTL = Number(updated[0].bakiye_tl);
    previousBalance = remainingTL + costTL;
    userEmail = updated[0].email;

    const txRows = await txSql<{ id: string }[]>`
      INSERT INTO transactions (
        user_id,
        user_email,
        tip,
        miktar_tl,
        onceki_bakiye,
        sonraki_bakiye,
        aciklama,
        idempotency_key
      ) VALUES (
        ${userId}::uuid,
        ${userEmail},
        'kullanim',
        ${`-${costStr}`}::numeric,
        ${previousBalance.toFixed(4)}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${`${model.id} kullanimi`},
        ${requestId ? `usage_${requestId}` : null}
      )
      RETURNING id
    `;

    await txSql`
      INSERT INTO usage_records (
        user_id,
        api_key_id,
        model_id,
        type,
        input_usage,
        output_usage,
        units_usage,
        cost_usd,
        cost_tl,
        remaining_tl,
        request_id,
        upstream_request_id,
        raw_usage_json,
        pricing_snapshot_json,
        error_code,
        response_ms,
        status,
        provider_profile_id
      ) VALUES (
        ${userId}::uuid,
        ${apiKeyId}::uuid,
        ${model.id},
        ${recordType},
        ${inputUsage},
        ${outputUsage},
        ${String(usage.videoSeconds ?? usage.imageCount ?? 0)}::numeric,
        ${costUsdStr}::numeric,
        ${costStr}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${requestId ?? null},
        ${upstreamRequestId ?? null},
        ${JSON.stringify(meta.rawUsageJson)}::jsonb,
        ${JSON.stringify(pricingSnapshot)}::jsonb,
        ${errorCode ?? null},
        ${responseMs},
        'success',
        ${profileId ?? null}
      )
    `;

    return txRows.length ? updated : [];
  });

  if (!rows.length) {
    await db.insert(usageRecords).values({
      userId,
      apiKeyId,
      modelId: model.id,
      type: recordType,
      inputUsage,
      outputUsage,
      costUsd: "0",
      costTL: "0",
      requestId,
      upstreamRequestId,
      rawUsageJson: meta.rawUsageJson as any,
      pricingSnapshotJson: pricingSnapshot as any,
      errorCode: "insufficient_balance",
      responseMs,
      status: "error",
      providerProfileId: profileId,
    }).catch((e) => logger.error({ err: e }, "usageRecord insert failed (balance error)"));

    throw new InsufficientBalanceError("Insufficient balance to complete this request");
  }

  logger.info({ userId, modelId: model.id, costTL, remainingTL }, "usage charged");
  return { costTL, remainingTL };
}
