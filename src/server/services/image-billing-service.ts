import { eq } from "drizzle-orm";
import { db, dbSql } from "../db/client.js";
import { users, usageRecords } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { InsufficientBalanceError } from "../lib/errors.js";
import { buildPricingConfig, computePrice } from "./pricing-service.js";
import type { MasterModel } from "../../master-models.js";

export const IMAGE_USAGE_TYPE = "image";

export interface ImageChargeResult {
  costUsd: number;
  costTL: number;
  remainingTL: number;
  alreadyCharged: boolean;
}

function round4(v: number): number { return Math.round(v * 10000) / 10000; }
function round8(v: number): number { return Math.round(v * 1e8) / 1e8; }

async function findExistingImageCharge(requestId: string): Promise<ImageChargeResult | null> {
  const rows = await db
    .select({ costUsd: usageRecords.costUsd, costTL: usageRecords.costTL, remainingTL: usageRecords.remainingTL })
    .from(usageRecords)
    .where(eq(usageRecords.requestId, requestId))
    .limit(1);
  if (!rows.length) return null;
  return {
    costUsd: Number(rows[0].costUsd),
    costTL: Number(rows[0].costTL),
    remainingTL: Number(rows[0].remainingTL ?? 0),
    alreadyCharged: true,
  };
}

/**
 * Görsel üretimi için SABİT per-image ücret (web-search billing deseninin ikizi).
 * Fiyat = computeImagePrice(model) × imageCount (imageCarpan + sell-kur uygulanmış).
 * Başarıda atomik tahsil; hata/0-görsel → cost-0 usage satırı (K1 paritesi).
 * Idempotent: usage_records.request_id + transactions.idempotency_key (usage_<reqId>) UNIQUE.
 * billing-service token mantığına DOKUNMAZ.
 */
export async function chargeImage(opts: {
  userId: string;
  apiKeyId: string;
  model: MasterModel;
  imageRequestId: string;
  imageCount: number;
  responseMs: number;
  status: "success" | "no_charge";
}): Promise<ImageChargeResult> {
  const existing = await findExistingImageCharge(opts.imageRequestId);
  if (existing) return existing;

  const cfg = await buildPricingConfig();
  const computed = computePrice(opts.model, cfg);
  const perImageUsd = computed.input?.usd ?? 0;
  const perImageTL = computed.input?.tl ?? 0;
  const count = Math.max(1, Number(opts.imageCount) || 1);
  const costUsd = opts.status === "success" ? round8(perImageUsd * count) : 0;
  const costTL = opts.status === "success" ? round4(perImageTL * count) : 0;
  const rawUsage = { imageCount: count, perImageUsd, model: opts.model.id };

  // Ücretsiz kayıt (cost=0): bakiye/tx YAZMA, yalnız usage_record.
  if (costTL <= 0) {
    const balRows = await db.select({ bakiye: users.bakiyeTL }).from(users).where(eq(users.id, opts.userId)).limit(1);
    const remainingTL = Number(balRows[0]?.bakiye ?? 0);
    await db.insert(usageRecords).values({
      userId: opts.userId,
      apiKeyId: opts.apiKeyId,
      modelId: opts.model.id,
      type: IMAGE_USAGE_TYPE,
      inputUsage: 0,
      outputUsage: count,
      costUsd: "0",
      costTL: "0",
      remainingTL: remainingTL.toFixed(4),
      requestId: opts.imageRequestId,
      rawUsageJson: rawUsage as never,
      responseMs: opts.responseMs,
      status: "success",
    }).catch((e) => logger.error({ err: e }, "[image-billing] no_charge usage insert failed"));
    return { costUsd: 0, costTL: 0, remainingTL, alreadyCharged: false };
  }

  const costTLStr = costTL.toFixed(4);
  const costUsdStr = costUsd.toFixed(8);
  let remainingTL = 0;
  const rows = await dbSql.begin(async (txSql) => {
    const updated = await txSql<{ bakiye_tl: string; email: string }[]>`
      UPDATE users
      SET bakiye_tl = bakiye_tl - ${costTLStr}::numeric,
          toplam_harcama_tl = toplam_harcama_tl + ${costTLStr}::numeric,
          toplam_istek = toplam_istek + 1,
          son_aktivite = now()
      WHERE id = ${opts.userId}::uuid
        AND bakiye_tl >= ${costTLStr}::numeric
      RETURNING bakiye_tl, email
    `;
    if (!updated.length) return updated;

    remainingTL = Number(updated[0].bakiye_tl);
    const previousBalance = remainingTL + costTL;

    await txSql`
      INSERT INTO transactions (
        user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, idempotency_key
      ) VALUES (
        ${opts.userId}::uuid, ${updated[0].email}, 'kullanim', ${`-${costTLStr}`}::numeric,
        ${previousBalance.toFixed(4)}::numeric, ${remainingTL.toFixed(4)}::numeric,
        ${"görsel üretimi"}, ${`usage_${opts.imageRequestId}`}
      )
    `;

    await txSql`
      INSERT INTO usage_records (
        user_id, api_key_id, model_id, type, input_usage, output_usage, units_usage,
        cost_usd, cost_tl, remaining_tl, request_id, raw_usage_json, response_ms, status
      ) VALUES (
        ${opts.userId}::uuid, ${opts.apiKeyId}::uuid, ${opts.model.id}, ${IMAGE_USAGE_TYPE},
        ${0}, ${count}, ${String(count)}::numeric,
        ${costUsdStr}::numeric, ${costTLStr}::numeric, ${remainingTL.toFixed(4)}::numeric,
        ${opts.imageRequestId}, ${JSON.stringify(rawUsage)}::jsonb, ${opts.responseMs}, ${"success"}
      )
    `;
    return updated;
  });

  if (!rows.length) {
    throw new InsufficientBalanceError("Insufficient balance for image generation");
  }

  logger.info({ userId: opts.userId, costTL, remainingTL, model: opts.model.id }, "image charged");
  return { costUsd, costTL, remainingTL, alreadyCharged: false };
}
