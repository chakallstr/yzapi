import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";

/** Dodo anahtarı tanımlı mı? (yoksa uçlar 503) */
export function dodoConfigured(): boolean {
  return !!env.DODO_API_KEY;
}

function dodoBase(): string {
  return (env.DODO_API_BASE || "https://live.dodopayments.com").replace(/\/+$/, "");
}

export interface DodoInitResult {
  url: string;
  id: string;
}

/**
 * Dodo'da bir ödeme başlat (payment link). Anahtar yoksa 503.
 * ⚠️ Create-payment isteğinin tam şeması, anahtarlar + Dodo docs ile bağlanırken teyit edilecek
 * (gated: dodoConfigured false iken çağrılmaz, canlı risk yok).
 */
export async function initDodoPayment(opts: {
  paymentId: string;
  amountUsd: number;
  customerEmail?: string;
  returnUrl?: string;
}): Promise<DodoInitResult> {
  if (!dodoConfigured()) throw new AppError(503, "Dodo ödeme yöntemi şu an kullanılamıyor.");
  const res = await fetch(`${dodoBase()}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DODO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_link: true,
      amount: Math.round(opts.amountUsd * 100),
      currency: "USD",
      return_url: opts.returnUrl || env.DODO_RETURN_URL,
      metadata: { paymentId: opts.paymentId },
      customer: opts.customerEmail ? { email: opts.customerEmail } : undefined,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, text: text.slice(0, 500) }, "[dodo] init failed");
    throw new AppError(502, "Dodo ödeme başlatılamadı.");
  }
  const data = (await res.json()) as {
    payment_link?: string;
    url?: string;
    payment_id?: string;
    id?: string;
  };
  const url = data.payment_link || data.url;
  const id = data.payment_id || data.id || "";
  if (!url) throw new AppError(502, "Dodo ödeme linki alınamadı.");
  return { url, id };
}

export interface DodoWebhookVerifyResult {
  valid: boolean;
}

/**
 * standard-webhooks (Dodo) imza doğrulama (el-yazımı; projede webhook-imza kütüphanesi yok):
 * HMAC-SHA256( `${id}.${timestamp}.${rawBody}` ), secret base64 (whsec_ ön-eki atılır),
 * header `webhook-signature` boşlukla ayrık "v1,<b64sig>" girdileri. timingSafeEqual sabit-zaman.
 */
export function verifyDodoWebhook(
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: string,
): DodoWebhookVerifyResult {
  const secret = env.DODO_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return { valid: false };
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const candidates = headers.signature
    .split(" ")
    .map((p) => (p.includes(",") ? p.split(",")[1] : p))
    .filter(Boolean);
  for (const cand of candidates) {
    const a = Buffer.from(expected);
    const b = Buffer.from(cand);
    if (a.length === b.length && timingSafeEqual(a, b)) return { valid: true };
  }
  return { valid: false };
}
