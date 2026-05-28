import { db, dbSql } from "../db/client.js";
import { users, transactions, usageRecords } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { InsufficientBalanceError } from "../lib/errors.js";
import { buildPricingConfig, applyOverride, computePrice } from "./pricing-service.js";
import type { MasterModel } from "../../master-models.js";
import {
  buildUsageTokenMetrics,
  isTokenWalletEnforced,
  isTokenWalletEnabled,
  TOKEN_WALLET_BILLING_BASIS,
} from "./token-wallet-service.js";

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
  const rawCostTL = computeCost(model, usage, pricingCfg, "tl");
  const rawCostUsd = computeCost(model, usage, pricingCfg, "usd");
  const costTL = round4(rawCostTL);
  const costUsd = round8(rawCostUsd);
  const pricingSnapshot = buildPricingSnapshot(model, pricingCfg);
  const inputUsage = usage.promptTokens ?? usage.imageCount ?? Math.round((usage.videoSeconds ?? 0) * 1000);
  const outputUsage = usage.completionTokens ?? 0;
  const recordType = model.type === "Metin" ? "text" : model.type === "Görsel" ? "image" : "video";
  const tokenMetrics = buildUsageTokenMetrics({
    model,
    usage,
    price: pricingCfg,
    costUsd,
  });

  return {
    costTL,
    costUsd,
    pricingSnapshot,
    inputUsage,
    outputUsage,
    recordType,
    rawUsageJson: rawUsageJson ?? usage,
    tokenMetrics,
  };
}

export async function reserveUsageBudget(opts: {
  userId: string;
  apiKeyId: string;
  model: MasterModel;
  usage: UsageInfo;
  requestId: string;
}): Promise<{ reservedTL: number; remainingTL: number; reservedTokens: number; remainingTokens?: number; alreadyReserved?: boolean }> {
  const existing = await findReservation(opts.requestId);
  if (existing) {
    return {
      reservedTL: Math.abs(Number(existing.miktarTL ?? 0)),
      remainingTL: Number(existing.sonrakiBakiye ?? 0),
      reservedTokens: 0,
      alreadyReserved: true,
    };
  }

  const pricingCfg = await buildPricingConfig();
  const patchedModel = await applyOverride(opts.model);
  const meta = buildUsageChargeMeta(patchedModel, opts.usage, computePrice(patchedModel, pricingCfg));
  const reserveTL = meta.costTL;
  const reserveTokens = isTokenWalletEnabled() ? meta.tokenMetrics.reservedTokens : 0;

  if (reserveTL <= 0) {
    const balanceRows = await db
      .select({
        bakiye: users.bakiyeTL,
        tokenBalance: users.tokenBalance,
        pendingReservedTokens: users.pendingReservedTokens,
      })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);
    const tokenBalance = Number(balanceRows[0]?.tokenBalance ?? 0);
    const pendingReservedTokens = Number(balanceRows[0]?.pendingReservedTokens ?? 0);
    return {
      reservedTL: 0,
      remainingTL: Number(balanceRows[0]?.bakiye ?? 0),
      reservedTokens: reserveTokens,
      remainingTokens: tokenBalance - pendingReservedTokens,
    };
  }

  const reserveStr = reserveTL.toFixed(4);
  const reserveTokensStr = String(reserveTokens);
  let remainingTL = 0;
  let remainingTokens: number | undefined;
  let previousBalance = 0;
  let userEmail = "";

  const rows = await dbSql.begin(async (txSql) => {
    const updated = isTokenWalletEnforced() && reserveTokens > 0
      ? await txSql<{ bakiye_tl: string; email: string; token_balance: string; pending_reserved_tokens: string }[]>`
          UPDATE users
          SET bakiye_tl = bakiye_tl - ${reserveStr}::numeric,
              pending_reserved_tokens = pending_reserved_tokens + ${reserveTokensStr}::numeric,
              son_aktivite = now()
          WHERE id = ${opts.userId}::uuid
            AND bakiye_tl >= ${reserveStr}::numeric
            AND (token_balance - pending_reserved_tokens) >= ${reserveTokensStr}::numeric
          RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
        `
      : await txSql<{ bakiye_tl: string; email: string; token_balance?: string; pending_reserved_tokens?: string }[]>`
          UPDATE users
          SET bakiye_tl = bakiye_tl - ${reserveStr}::numeric,
              son_aktivite = now()
          WHERE id = ${opts.userId}::uuid
            AND bakiye_tl >= ${reserveStr}::numeric
          RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
        `;

    if (!updated.length) return updated;

    remainingTL = Number(updated[0].bakiye_tl);
    remainingTokens = Number(updated[0].token_balance ?? 0) - Number(updated[0].pending_reserved_tokens ?? 0);
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

  return { reservedTL: reserveTL, remainingTL, reservedTokens: reserveTokens, remainingTokens };
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
  const actualCostTL = opts.status === "error" ? meta.costTL : meta.costTL;
  const actualCostUsd = meta.costUsd;
  const actualCostStr = actualCostTL.toFixed(4);
  const actualCostUsdStr = actualCostUsd.toFixed(8);
  const reservedTokens = isTokenWalletEnabled() ? meta.tokenMetrics.reservedTokens : 0;
  const actualBillableTokens = isTokenWalletEnabled() ? meta.tokenMetrics.settledTokens : 0;
  const reservedTokensStr = String(reservedTokens);
  const actualTokensStr = String(actualBillableTokens);

  let remainingTL = Number(reservation.sonrakiBakiye ?? 0);
  let remainingTokens: number | null = null;
  const errorCode = opts.errorCode ?? (opts.status === "stream_missing_usage" ? "stream_missing_usage" : undefined);

  const rows = await dbSql.begin(async (txSql) => {
    if (reservedTL > 0) {
      const refundRows = isTokenWalletEnforced() && reservedTokens > 0
        ? await txSql<{ bakiye_tl: string; email: string; token_balance: string; pending_reserved_tokens: string }[]>`
            UPDATE users
            SET bakiye_tl = bakiye_tl + ${reserveStr}::numeric,
                pending_reserved_tokens = GREATEST(pending_reserved_tokens - ${reservedTokensStr}::numeric, 0),
                son_aktivite = now()
            WHERE id = ${opts.userId}::uuid
            RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
          `
        : await txSql<{ bakiye_tl: string; email: string; token_balance?: string; pending_reserved_tokens?: string }[]>`
            UPDATE users
            SET bakiye_tl = bakiye_tl + ${reserveStr}::numeric,
                son_aktivite = now()
            WHERE id = ${opts.userId}::uuid
            RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
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
      remainingTokens = Number(refundRows[0].token_balance ?? 0) - Number(refundRows[0].pending_reserved_tokens ?? 0);
    }

    if (actualCostTL > 0) {
      const chargeRows = isTokenWalletEnforced() && actualBillableTokens > 0
        ? await txSql<{ bakiye_tl: string; email: string; token_balance: string; pending_reserved_tokens: string }[]>`
            UPDATE users
            SET bakiye_tl = bakiye_tl - ${actualCostStr}::numeric,
                token_balance = token_balance - ${actualTokensStr}::numeric,
                toplam_harcama_tl = toplam_harcama_tl + ${actualCostStr}::numeric,
                toplam_istek = toplam_istek + 1,
                son_aktivite = now()
            WHERE id = ${opts.userId}::uuid
              AND bakiye_tl >= ${actualCostStr}::numeric
              AND token_balance >= ${actualTokensStr}::numeric
            RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
          `
        : await txSql<{ bakiye_tl: string; email: string; token_balance?: string; pending_reserved_tokens?: string }[]>`
            UPDATE users
            SET bakiye_tl = bakiye_tl - ${actualCostStr}::numeric,
                toplam_harcama_tl = toplam_harcama_tl + ${actualCostStr}::numeric,
                toplam_istek = toplam_istek + 1,
                son_aktivite = now()
            WHERE id = ${opts.userId}::uuid
              AND bakiye_tl >= ${actualCostStr}::numeric
            RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
          `;

      if (!chargeRows.length) return chargeRows;

      const chargeAfter = Number(chargeRows[0].bakiye_tl);
      const chargeBefore = chargeAfter + actualCostTL;
      const chargeAfterTokens = Number(chargeRows[0].token_balance ?? 0);
      const chargeBeforeTokens = isTokenWalletEnforced() ? chargeAfterTokens + actualBillableTokens : chargeAfterTokens;

      await txSql`
        INSERT INTO transactions (
          user_id,
          user_email,
          tip,
          miktar_tl,
          token_amount,
          onceki_bakiye,
          sonraki_bakiye,
          onceki_token_balance,
          sonraki_token_balance,
          aciklama,
          idempotency_key,
          billing_basis
        ) VALUES (
          ${opts.userId}::uuid,
          ${chargeRows[0].email},
          'kullanim',
          ${`-${actualCostStr}`}::numeric,
          ${actualBillableTokens > 0 ? `-${actualTokensStr}` : null}::numeric,
          ${chargeBefore.toFixed(4)}::numeric,
          ${chargeAfter.toFixed(4)}::numeric,
          ${String(chargeBeforeTokens)}::numeric,
          ${String(chargeAfterTokens)}::numeric,
          ${`${opts.model.id} kullanimi`},
          ${`usage_final_${opts.requestId}`},
          ${actualBillableTokens > 0 ? TOKEN_WALLET_BILLING_BASIS : "tl_balance"}
        )
      `;

      remainingTL = chargeAfter;
      remainingTokens = chargeAfterTokens - Number(chargeRows[0].pending_reserved_tokens ?? 0);
    }

    await txSql`
      INSERT INTO usage_records (
        user_id,
        api_key_id,
        model_id,
        type,
        input_usage,
        output_usage,
        input_tokens,
        output_tokens,
        billable_tokens,
        reserved_tokens,
        settled_tokens,
        units_usage,
        cost_usd,
        cost_tl,
        remaining_tl,
        remaining_tokens,
        billing_basis,
        request_id,
        upstream_request_id,
        raw_usage_json,
        pricing_snapshot_json,
        error_code,
        response_ms,
        status
      ) VALUES (
        ${opts.userId}::uuid,
        ${opts.apiKeyId}::uuid,
        ${opts.model.id},
        ${meta.recordType},
        ${meta.inputUsage},
        ${meta.outputUsage},
        ${meta.tokenMetrics.inputTokens},
        ${meta.tokenMetrics.outputTokens},
        ${String(actualBillableTokens)}::numeric,
        ${String(reservedTokens)}::numeric,
        ${String(actualBillableTokens)}::numeric,
        ${String(opts.usage.videoSeconds ?? opts.usage.imageCount ?? 0)}::numeric,
        ${actualCostUsdStr}::numeric,
        ${actualCostStr}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${remainingTokens === null ? null : String(remainingTokens)}::numeric,
        ${actualBillableTokens > 0 ? TOKEN_WALLET_BILLING_BASIS : "tl_balance"},
        ${opts.requestId},
        ${opts.upstreamRequestId ?? null},
        ${JSON.stringify(meta.rawUsageJson)}::jsonb,
        ${JSON.stringify(meta.pricingSnapshot)}::jsonb,
        ${errorCode ?? null},
        ${opts.responseMs},
        ${opts.status === "error" && actualCostTL === 0 ? "error" : "success"}
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
}): Promise<ChargeResult> {
  const { userId, apiKeyId, model, usage, responseMs, status, requestId, upstreamRequestId, rawUsageJson, errorCode } = opts;

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
  const billableTokens = isTokenWalletEnabled() ? meta.tokenMetrics.billableTokens : 0;

  if (status === "error" || costTL === 0) {
    // Insert usage record with cost=0, no balance deduction
    const balanceRows = await db
      .select({
        bakiye: users.bakiyeTL,
        tokenBalance: users.tokenBalance,
        pendingReservedTokens: users.pendingReservedTokens,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const remainingTL = Number(balanceRows[0]?.bakiye ?? 0);
    const remainingTokens = Number(balanceRows[0]?.tokenBalance ?? 0) - Number(balanceRows[0]?.pendingReservedTokens ?? 0);
    await db.insert(usageRecords).values({
      userId,
      apiKeyId,
      modelId: model.id,
      type: recordType,
      inputUsage,
      outputUsage,
      inputTokens: meta.tokenMetrics.inputTokens,
      outputTokens: meta.tokenMetrics.outputTokens,
      billableTokens: "0",
      reservedTokens: "0",
      settledTokens: "0",
      costUsd: "0",
      costTL: "0",
      remainingTL: remainingTL.toFixed(4),
      remainingTokens: String(remainingTokens),
      billingBasis: billableTokens > 0 ? TOKEN_WALLET_BILLING_BASIS : "tl_balance",
      requestId,
      upstreamRequestId,
      rawUsageJson: meta.rawUsageJson as any,
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
  const billableTokensStr = String(billableTokens);
  let remainingTL = 0;
  let remainingTokens = 0;
  let previousBalance = 0;
  let previousTokens = 0;
  let userEmail = "";

  const rows = await dbSql.begin(async (txSql) => {
    const updated = isTokenWalletEnforced() && billableTokens > 0
      ? await txSql<{ bakiye_tl: string; email: string; token_balance: string; pending_reserved_tokens: string }[]>`
          UPDATE users
          SET
            bakiye_tl = bakiye_tl - ${costStr}::numeric,
            token_balance = token_balance - ${billableTokensStr}::numeric,
            toplam_harcama_tl = toplam_harcama_tl + ${costStr}::numeric,
            toplam_istek = toplam_istek + 1,
            son_aktivite = now()
          WHERE id = ${userId}::uuid
            AND bakiye_tl >= ${costStr}::numeric
            AND token_balance >= ${billableTokensStr}::numeric
          RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
        `
      : await txSql<{ bakiye_tl: string; email: string; token_balance?: string; pending_reserved_tokens?: string }[]>`
          UPDATE users
          SET
            bakiye_tl = bakiye_tl - ${costStr}::numeric,
            toplam_harcama_tl = toplam_harcama_tl + ${costStr}::numeric,
            toplam_istek = toplam_istek + 1,
            son_aktivite = now()
          WHERE id = ${userId}::uuid
            AND bakiye_tl >= ${costStr}::numeric
          RETURNING bakiye_tl, email, token_balance, pending_reserved_tokens
        `;

    if (!updated.length) return updated;

    remainingTL = Number(updated[0].bakiye_tl);
    previousBalance = remainingTL + costTL;
    remainingTokens = Number(updated[0].token_balance ?? 0) - Number(updated[0].pending_reserved_tokens ?? 0);
    previousTokens = isTokenWalletEnforced() ? remainingTokens + billableTokens : Number(updated[0].token_balance ?? 0);
    userEmail = updated[0].email;

    const txRows = await txSql<{ id: string }[]>`
      INSERT INTO transactions (
        user_id,
        user_email,
        tip,
        miktar_tl,
        token_amount,
        onceki_bakiye,
        sonraki_bakiye,
        onceki_token_balance,
        sonraki_token_balance,
        aciklama,
        idempotency_key,
        billing_basis
      ) VALUES (
        ${userId}::uuid,
        ${userEmail},
        'kullanim',
        ${`-${costStr}`}::numeric,
        ${billableTokens > 0 ? `-${billableTokensStr}` : null}::numeric,
        ${previousBalance.toFixed(4)}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${String(previousTokens)}::numeric,
        ${String(Number(updated[0].token_balance ?? 0))}::numeric,
        ${`${model.id} kullanimi`},
        ${requestId ? `usage_${requestId}` : null},
        ${billableTokens > 0 ? TOKEN_WALLET_BILLING_BASIS : "tl_balance"}
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
        input_tokens,
        output_tokens,
        billable_tokens,
        reserved_tokens,
        settled_tokens,
        units_usage,
        cost_usd,
        cost_tl,
        remaining_tl,
        remaining_tokens,
        billing_basis,
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
        ${meta.tokenMetrics.inputTokens},
        ${meta.tokenMetrics.outputTokens},
        ${billableTokensStr}::numeric,
        ${billableTokensStr}::numeric,
        ${billableTokensStr}::numeric,
        ${String(usage.videoSeconds ?? usage.imageCount ?? 0)}::numeric,
        ${costUsdStr}::numeric,
        ${costStr}::numeric,
        ${remainingTL.toFixed(4)}::numeric,
        ${String(remainingTokens)}::numeric,
        ${billableTokens > 0 ? TOKEN_WALLET_BILLING_BASIS : "tl_balance"},
        ${requestId ?? null},
        ${upstreamRequestId ?? null},
        ${JSON.stringify(meta.rawUsageJson)}::jsonb,
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
      rawUsageJson: meta.rawUsageJson as any,
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
