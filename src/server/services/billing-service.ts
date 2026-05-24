import { db, dbSql } from "../db/client.js";
import { users, transactions, usageRecords } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { InsufficientBalanceError } from "../lib/errors.js";
import { buildPricingConfig, applyOverride, computePrice } from "./pricing-service.js";
import type { MasterModel } from "../../master-models.js";

export interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
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
    return (prompt / 1_000_000) * input + (completion / 1_000_000) * output;
  }

  if (model.type === "Görsel") {
    const inputTL = pricingCfg.input?.[currency] ?? 0;
    const outputTL = pricingCfg.output?.[currency] ?? 0;
    const count = usage.imageCount ?? 1;
    return count * (inputTL + outputTL);
  }

  // Video
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
}): Promise<ChargeResult> {
  const { userId, apiKeyId, model, usage, responseMs, status, requestId, upstreamRequestId, rawUsageJson, errorCode } = opts;

  const existing = await findExistingCharge(requestId);
  if (existing) return existing;

  const pricingCfg = await buildPricingConfig();
  const patchedModel = await applyOverride(model);
  const computed = computePrice(patchedModel, pricingCfg);

  const rawCostTL = computeCost(patchedModel, usage, computed, "tl");
  const rawCostUsd = computeCost(patchedModel, usage, computed, "usd");
  const costTL = round4(rawCostTL);
  const costUsd = round8(rawCostUsd);
  const pricingSnapshot = buildPricingSnapshot(patchedModel, computed);

  // Derive usageRecord fields
  const inputUsage = usage.promptTokens ?? usage.imageCount ?? Math.round((usage.videoSeconds ?? 0) * 1000);
  const outputUsage = usage.completionTokens ?? 0;
  const recordType = model.type === "Metin" ? "text" : model.type === "Görsel" ? "image" : "video";

  if (status === "error" || costTL === 0) {
    // Insert usage record with cost=0, no balance deduction
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
      rawUsageJson: (rawUsageJson ?? usage) as any,
      pricingSnapshotJson: pricingSnapshot as any,
      errorCode: errorCode ?? (status === "stream_missing_usage" ? "stream_missing_usage" : undefined),
      responseMs,
      status,
    });
    return { costTL: 0, remainingTL };
  }

  // Atomic balance deduction
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
        status
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
        ${JSON.stringify(rawUsageJson ?? usage)}::jsonb,
        ${JSON.stringify(pricingSnapshot)}::jsonb,
        ${errorCode ?? null},
        ${responseMs},
        'success'
      )
    `;

    return txRows.length ? updated : [];
  });

  if (!rows.length) {
    // Insert error usage record and throw
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
      rawUsageJson: (rawUsageJson ?? usage) as any,
      pricingSnapshotJson: pricingSnapshot as any,
      errorCode: "insufficient_balance",
      responseMs,
      status: "error",
    }).catch((e) => logger.error({ err: e }, "usageRecord insert failed (balance error)"));

    throw new InsufficientBalanceError("Insufficient balance to complete this request");
  }

  logger.info({ userId, modelId: model.id, costTL, remainingTL }, "usage charged");
  return { costTL, remainingTL };
}
