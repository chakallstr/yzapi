import { createHash, createHmac, timingSafeEqual } from "crypto";
import { env } from "../lib/env.js";
import { roundUpUsdAmount } from "./payment-pricing.js";

const DEFAULT_CRYPTO_PAY_BASE_URL = "https://pay.crypt.bot";
const DEFAULT_INVOICE_EXPIRES_SEC = 60 * 60;

export interface CryptoPayInvoicePayload {
  invoice_id: number;
  hash?: string;
  currency_type?: "crypto" | "fiat";
  asset?: string;
  fiat?: string;
  amount?: string;
  paid_asset?: string;
  paid_amount?: string;
  status: "active" | "paid" | "expired";
  payload?: string;
  bot_invoice_url?: string;
  mini_app_invoice_url?: string;
  web_app_invoice_url?: string;
  pay_url?: string;
}

export interface CreatedCryptoPayInvoice {
  invoiceId: string;
  status: string;
  payUrl: string;
  raw: CryptoPayInvoicePayload;
}

export class CryptoPayError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = "CryptoPayError";
  }
}

function cryptoPayBaseUrl(): string {
  return (env.CRYPTO_PAY_API_BASE_URL || DEFAULT_CRYPTO_PAY_BASE_URL).replace(/\/+$/, "");
}

function token(): string {
  if (!env.CRYPTO_PAY_API_TOKEN) throw new CryptoPayError("Crypto Pay API token is not configured");
  return env.CRYPTO_PAY_API_TOKEN;
}

function acceptedAssets(): string | undefined {
  const raw = env.CRYPTO_PAY_ACCEPTED_ASSETS?.trim();
  return raw || undefined;
}

function signatureFromHeaders(headers: Record<string, unknown>): string | undefined {
  const direct = headers["crypto-pay-api-signature"] ?? headers["Crypto-Pay-API-Signature"];
  if (Array.isArray(direct)) return direct[0] ? String(direct[0]) : undefined;
  return direct === undefined ? undefined : String(direct);
}

export function verifyCryptoPayWebhook(rawBody: string | Buffer, headers: Record<string, unknown>): boolean {
  const received = signatureFromHeaders(headers);
  if (!received || !env.CRYPTO_PAY_API_TOKEN) return false;

  const secret = createHash("sha256").update(env.CRYPTO_PAY_API_TOKEN).digest();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function getPaidCryptoPayInvoice(update: unknown): CryptoPayInvoicePayload | null {
  if (!update || typeof update !== "object") return null;
  const record = update as Record<string, unknown>;
  if (record.update_type !== "invoice_paid") return null;
  const payload = record.payload;
  if (!payload || typeof payload !== "object") return null;
  const invoice = payload as CryptoPayInvoicePayload;
  return invoice.status === "paid" ? invoice : null;
}

export async function createCryptoPayInvoice(opts: {
  paymentId: string;
  amountUsd: number;
  description?: string;
  expiresInSec?: number;
  returnUrl?: string;
}): Promise<CreatedCryptoPayInvoice> {
  const amount = roundUpUsdAmount(opts.amountUsd).toFixed(2);
  const returnUrl = opts.returnUrl || env.CRYPTO_PAY_RETURN_URL || `${env.APP_BASE_URL}/?payment=telegram_crypto`;
  const body: Record<string, unknown> = {
    currency_type: "fiat",
    fiat: "USD",
    amount,
    payload: opts.paymentId,
    description: opts.description || "YapayZekaLab bakiye yukleme",
    allow_comments: false,
    allow_anonymous: false,
    expires_in: opts.expiresInSec ?? env.CRYPTO_PAY_INVOICE_EXPIRES_SEC ?? DEFAULT_INVOICE_EXPIRES_SEC,
    paid_btn_name: "callback",
    paid_btn_url: returnUrl,
  };

  const assets = acceptedAssets();
  if (assets) body.accepted_assets = assets;

  const res = await fetch(`${cryptoPayBaseUrl()}/api/createInvoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Crypto-Pay-API-Token": token(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as { ok: boolean; result?: CryptoPayInvoicePayload; error?: string };
  if (!data.ok || !data.result) throw new CryptoPayError(`Crypto Pay error: ${data.error ?? "unknown"}`, data);

  const payUrl = data.result.mini_app_invoice_url || data.result.bot_invoice_url || data.result.web_app_invoice_url || data.result.pay_url;
  if (!payUrl) throw new CryptoPayError("Crypto Pay invoice URL missing", data.result);

  return {
    invoiceId: String(data.result.invoice_id),
    status: data.result.status,
    payUrl,
    raw: data.result,
  };
}
