import { createHmac, timingSafeEqual, randomInt } from "crypto";
import { env } from "../lib/env.js";

export interface ShopierCheckoutFields {
  API_key: string;
  website_index: number;
  platform_order_id: string;
  product_name: string;
  product_type: number;
  buyer_name: string;
  buyer_surname: string;
  buyer_email: string;
  buyer_account_age: number;
  buyer_id_nr: string;
  buyer_phone: string;
  billing_address: string;
  billing_city: string;
  billing_country: string;
  billing_postcode: string;
  shipping_address: string;
  shipping_city: string;
  shipping_country: string;
  shipping_postcode: string;
  total_order_value: number;
  currency: number;
  platform: number;
  is_in_frame: number;
  current_language: string;
  modul_version: string;
  random_nr: number;
  signature: string;
}

export interface ShopierCheckoutResult {
  actionUrl: string;
  fields: Record<string, string>;
}

export interface ShopierCallbackVerifyResult {
  valid: boolean;
  platformOrderId?: string;
  status?: string;
  paidTL?: number;
  currency?: string;
}

const SHOPIER_ACTION_URL = "https://www.shopier.com/ShowProduct/api_pay4.php";

function generateOutgoingSignature(
  secret: string,
  randomNr: number,
  orderId: string,
  amount: number,
  currency: number,
): string {
  const data = `${randomNr}${orderId}${amount}${currency}`;
  return createHmac("sha256", secret).update(data).digest("base64");
}

export interface BuildCheckoutOpts {
  userId: string;
  paymentId: string;  // our payments.id → used as platform_order_id
  miktarTL: number;
  email: string;
  adSoyad: string;
}

export function buildCheckoutForm(opts: BuildCheckoutOpts): ShopierCheckoutResult {
  const apiKey = env.SHOPIER_API_KEY!;
  const apiSecret = env.SHOPIER_API_SECRET!;
  const randomNr = randomInt(100000, 999999);
  const currency = 0; // TRY

  const parts = opts.adSoyad.trim().split(" ");
  const buyerName = parts[0] ?? "Kullanici";
  const buyerSurname = parts.slice(1).join(" ") || "—";

  const signature = generateOutgoingSignature(apiSecret, randomNr, opts.paymentId, opts.miktarTL, currency);

  const fields: ShopierCheckoutFields = {
    API_key: apiKey,
    website_index: 1,
    platform_order_id: opts.paymentId,
    product_name: `Bakiye Yukleme — ${opts.miktarTL} TL`,
    product_type: 1,
    buyer_name: buyerName,
    buyer_surname: buyerSurname,
    buyer_email: opts.email,
    buyer_account_age: 0,
    buyer_id_nr: opts.userId,
    buyer_phone: "05551234567",
    billing_address: "Türkiye",
    billing_city: "Istanbul",
    billing_country: "Türkiye",
    billing_postcode: "34000",
    shipping_address: "Türkiye",
    shipping_city: "Istanbul",
    shipping_country: "Türkiye",
    shipping_postcode: "34000",
    total_order_value: opts.miktarTL,
    currency,
    platform: 0,
    is_in_frame: 0,
    current_language: "tr",
    modul_version: "1.0.0",
    random_nr: randomNr,
    signature,
  };

  const stringFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    stringFields[k] = String(v);
  }

  return { actionUrl: SHOPIER_ACTION_URL, fields: stringFields };
}

export function verifyCallback(body: Record<string, string>): ShopierCallbackVerifyResult {
  const secret = env.SHOPIER_API_SECRET;
  if (!secret) return { valid: false };

  const { random_nr, platform_order_id, signature, status, total_order_value, currency } = body;
  if (!random_nr || !platform_order_id || !signature) return { valid: false };

  let paidTL: number | undefined;
  const hasAmountFields = total_order_value !== undefined && currency !== undefined;
  if (hasAmountFields) {
    paidTL = Number(total_order_value);
    if (!Number.isFinite(paidTL) || paidTL <= 0) return { valid: false };
  }

  const data = hasAmountFields
    ? `${random_nr}${platform_order_id}${total_order_value}${currency}`
    : `${random_nr}${platform_order_id}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    const valid = a.length === b.length && timingSafeEqual(a, b);
    return {
      valid,
      platformOrderId: platform_order_id,
      status,
      paidTL,
      currency,
    };
  } catch {
    return { valid: false };
  }
}
