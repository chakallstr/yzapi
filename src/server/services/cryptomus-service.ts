import { createHash } from "crypto";
import { env } from "../lib/env.js";
import { db } from "../db/client.js";
import { systemConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";

const BASE_URL = "https://api.cryptomus.com/v1";

function computeSign(body: Record<string, unknown>, apiKey: string): string {
  const json = JSON.stringify(body);
  const b64 = Buffer.from(json).toString("base64");
  return createHash("md5").update(b64 + apiKey).digest("hex");
}

export interface CryptomusInvoice {
  uuid: string;
  order_id: string;
  amount: string;
  currency: string;
  url: string;
  status: string;
  address?: string;
}

export interface CreateInvoiceOpts {
  paymentId: string;   // our payments.id → used as order_id
  miktarTL: number;    // TL amount to convert to USD
}

export async function createInvoice(opts: CreateInvoiceOpts): Promise<CryptomusInvoice> {
  const merchantId = env.CRYPTOMUS_MERCHANT_ID!;
  const apiKey = env.CRYPTOMUS_API_KEY!;
  const baseUrl = env.APP_BASE_URL;

  // Load current sell rate to convert TL → USD
  const rows = await db.select({ kur: systemConfig.kur }).from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
  const kur = rows.length ? Number(rows[0].kur) : 47;
  const amountUsd = (opts.miktarTL / kur).toFixed(2);

  const callbackUrl = env.CRYPTOMUS_WEBHOOK_URL ?? `${baseUrl}/api/payments/crypto/webhook`;
  const returnUrl = env.CRYPTOMUS_RETURN_URL ?? `${baseUrl}/api/payments/crypto/callback`;

  const body: Record<string, unknown> = {
    amount: amountUsd,
    currency: "USD",
    order_id: opts.paymentId,
    network: "tron",
    to_currency: "USDT",
    url_callback: callbackUrl,
    url_success: returnUrl,
    lifetime: 3600,
  };

  const sign = computeSign(body, apiKey);

  const res = await fetch(`${BASE_URL}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "merchant": merchantId,
      "sign": sign,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as { state: number; result?: CryptomusInvoice; message?: string };
  if (data.state !== 0) throw new Error(`Cryptomus error: ${data.message}`);
  return data.result!;
}

export interface WebhookVerifyResult {
  valid: boolean;
  payload?: Record<string, unknown>;
}

export function verifyWebhook(rawBody: Record<string, unknown>): WebhookVerifyResult {
  const apiKey = env.CRYPTOMUS_API_KEY;
  if (!apiKey) return { valid: false };

  const receivedSign = rawBody.sign as string | undefined;
  if (!receivedSign) return { valid: false };

  const { sign: _removed, ...dataWithoutSign } = rawBody;
  void _removed;

  // CRITICAL: PHP escapes forward slashes by default; Node does not.
  const json = JSON.stringify(dataWithoutSign).replace(/\//g, "\\/");
  const b64 = Buffer.from(json).toString("base64");
  const hash = createHash("md5").update(b64 + apiKey).digest("hex");

  const valid = hash === receivedSign;
  return { valid, payload: dataWithoutSign };
}
