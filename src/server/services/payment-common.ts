import { db } from "../db/client.js";
import { users, transactions, payments } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { env } from "../lib/env.js";
import { writeAudit } from "./audit-service.js";
import { logger } from "../lib/logger.js";
import { paymentReceiptEmail } from "./email-service.js";

export interface KdvResult {
  gross: number;  // amount user enters / pays
  netTL: number;  // gross / (1 + KDV_RATE)
  kdvTL: number;  // gross - netTL
}

/** KDV-included model: gross is what user enters; KDV is already inside that amount. */
export function calcKdv(grossTL: number): KdvResult {
  const rate = env.KDV_RATE;
  const netTL = grossTL / (1 + rate);
  const kdvTL = grossTL - netTL;
  return {
    gross: grossTL,
    netTL: Math.round(netTL * 10000) / 10000,
    kdvTL: Math.round(kdvTL * 10000) / 10000,
  };
}

export interface CreditResult {
  success: boolean;
  txId?: string;
  alreadyCredited?: boolean;
}

/**
 * Idempotent balance credit.
 * - Checks if payment row already durum=basarili (by idempotencyKey or paymentId).
 * - If not, wraps balance increment + transaction insert in a DB transaction.
 * - Returns early (success=true, alreadyCredited=true) if already done.
 */
export async function creditUserBalance(
  userId: string,
  paymentId: string,
  miktarTL: number,
  metod: string,
  idempotencyKey: string,
  providerPayload?: unknown,
): Promise<CreditResult> {
  try {
    // Check idempotency: is this payment already credited?
    const existing = await db
      .select({ id: payments.id, durum: payments.durum, transactionId: payments.transactionId })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (existing.length && existing[0].durum === "basarili") {
      return { success: true, alreadyCredited: true, txId: existing[0].transactionId ?? undefined };
    }

    // Load user for balance snapshot
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userRows.length) throw new Error(`User ${userId} not found`);
    const user = userRows[0];

    const oncekiBakiye = Number(user.bakiyeTL);
    const sonrakiBakiye = oncekiBakiye + miktarTL;

    let txId: string | undefined;

    await db.transaction(async (tx) => {
      // Update user balance
      await tx
        .update(users)
        .set({ bakiyeTL: String(sonrakiBakiye), updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Insert transaction record (idempotency via payments.idempotencyKey unique constraint)
      const txInserted = await tx.insert(transactions).values({
        userId,
        userEmail: user.email,
        tip: "yukleme",
        miktarTL: String(miktarTL),
        oncekiBakiye: String(oncekiBakiye),
        sonrakiBakiye: String(sonrakiBakiye),
        aciklama: `Bakiye yükleme (${metod})`,
        metod,
        idempotencyKey: `pay_${idempotencyKey}`,
      }).returning({ id: transactions.id });

      txId = txInserted[0].id;

      // Mark payment as successful
      await tx.update(payments).set({
        durum: "basarili",
        tamamlanma: new Date(),
        transactionId: txId,
        providerPayload: (providerPayload ?? null) as any,
      }).where(eq(payments.id, paymentId));
    });

    await writeAudit(
      "payment_credited",
      userId,
      `${metod} +₺${miktarTL.toFixed(2)}, ${oncekiBakiye.toFixed(2)} → ${sonrakiBakiye.toFixed(2)}`,
    );

    logger.info({ userId, paymentId, miktarTL, metod }, "Balance credited");

    // Fire-and-forget receipt email — must NOT block payment flow
    const kdv = calcKdv(miktarTL);
    paymentReceiptEmail(
      { email: user.email, adSoyad: user.adSoyad },
      {
        miktarTL,
        kdvTL: kdv.kdvTL,
        netTL: kdv.netTL,
        metod,
        refKod: idempotencyKey,
        transactionId: txId,
      },
    ).catch((e: unknown) => logger.error({ err: e }, "[payment-common] receipt email failed"));

    return { success: true, txId };
  } catch (e: any) {
    logger.error({ err: e, userId, paymentId }, "creditUserBalance failed");
    return { success: false };
  }
}
