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


// ════════════════════════════════════════════════════════════════════════════
// Shopier OSB (Sipariş Bildirimi / notificationaccess.php) — sabit-link otomatik
// kredilendirme (Paket 3). Bu, checkout-form callback'ten (verifyCallback) AYRI ve
// FARKLI bir imza şemasıdır:
//   hash = HMAC-SHA256(key = SHOPIER_OSB_PASSWORD, data = base64payload + SHOPIER_OSB_USERNAME).hex
// payload = base64(JSON) → { email, orderid, currency, price, productid, istest, ... }
// Kaynak: Shopier resmi NodeJS örneği (notificationaccess.php).
// ════════════════════════════════════════════════════════════════════════════

export interface OsbPayload {
  email?: string;
  orderid?: string;
  currency?: string;
  price?: string;
  productid?: string;
  buyername?: string;
  buyersurname?: string;
  productcount?: unknown;
  istest?: unknown;
  [k: string]: unknown;
}

export interface OsbVerifyResult {
  valid: boolean;
  reason?: string;
  payload?: OsbPayload;
}

/**
 * Shopier OSB gövdesi kaynaklar arası FARKLI biçimlerde gelebilir (gerçek express
 * body-parser ile doğrulandı):
 *  - named:           { res, hash }
 *  - positional-obj:  { 0:{value}, 1:{value} }        (extended:true)
 *  - bracket-literal: { "0[value]":..., "1[value]":...} (extended:false)
 *  - array:           [ {value}, {value} ]
 * Hepsini { encoded, hash } biçimine normalize eder.
 */
export function normalizeOsbBody(body: unknown): { encoded: string; hash: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, any>;

  if (Array.isArray(body)) {
    if (typeof body[0]?.value === "string" && typeof body[1]?.value === "string") {
      return { encoded: String(body[0].value), hash: String(body[1].value) };
    }
    return null;
  }
  if (typeof b.res === "string" && typeof b.hash === "string") {
    return { encoded: b.res, hash: b.hash };
  }
  if (b[0] && b[1] && typeof b[0].value === "string" && typeof b[1].value === "string") {
    return { encoded: b[0].value, hash: b[1].value };
  }
  if (typeof b["0[value]"] === "string" && typeof b["1[value]"] === "string") {
    return { encoded: b["0[value]"], hash: b["1[value]"] };
  }
  return null;
}

/**
 * OSB test siparişi tespiti — KORUMACIL (Z3). Yalnız "0" / "false" / boş / yok =
 * gerçek sipariş kabul edilir. Diğer her şey (1, true, "1", "true", "yes", ...) TEST
 * sayılır → kredi YOK. Böylece Shopier test bildirimleri asla gerçek bakiye yüklemez.
 */
export function isOsbTestOrder(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  return !(s === "0" || s === "false" || s === "");
}

/**
 * OSB bildirimini doğrula. Başarılıysa çözülmüş payload'ı döndürür.
 * timing-safe karşılaştırma + uzunluk guard (throw yok).
 */
export function verifyOsbNotification(body: unknown): OsbVerifyResult {
  const username = env.SHOPIER_OSB_USERNAME;
  const password = env.SHOPIER_OSB_PASSWORD;
  if (!username || !password) return { valid: false, reason: "osb_not_configured" };

  const norm = normalizeOsbBody(body);
  if (!norm) return { valid: false, reason: "missing_fields" };

  const expected = createHmac("sha256", password).update(norm.encoded + username).digest("hex");
  let ok = false;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(norm.hash, "utf8");
    ok = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    ok = false;
  }
  if (!ok) return { valid: false, reason: "bad_signature" };

  let payload: OsbPayload;
  try {
    payload = JSON.parse(Buffer.from(norm.encoded, "base64").toString("utf8"));
  } catch {
    return { valid: false, reason: "bad_payload" };
  }
  if (!payload || typeof payload !== "object") return { valid: false, reason: "bad_payload" };

  return { valid: true, payload };
}

export interface OsbProduct {
  priceTL: number;
  creditTL: number;
  /**
   * Opsiyonel (B2): set'liyse bu productId TL bakiye yüklemek yerine bir PAKET
   * (entitlement) verir. Yoksa (varsayılan/canlı durum) eski bakiye yolu — INERT.
   */
  packageId?: string;
}

let _osbProductMapCache: Record<string, OsbProduct> | null | undefined;

/**
 * Sabit-link ürün eşlemesi: Shopier productId → { priceTL (panel sabit-link fiyatı),
 * creditTL (yüklenecek bakiye, KDV dahil) }. Env `SHOPIER_OSB_PRODUCT_MAP` JSON'undan
 * okunur, savunmacı parse + cache. Hatalı JSON → boş map (kredi vermez, güvenli taraf).
 */
export function getOsbProductMap(): Record<string, OsbProduct> {
  if (_osbProductMapCache !== undefined) return _osbProductMapCache ?? {};
  const raw = env.SHOPIER_OSB_PRODUCT_MAP?.trim();
  if (!raw) {
    _osbProductMapCache = null;
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const map: Record<string, OsbProduct> = {};
    for (const [pid, val] of Object.entries(parsed)) {
      const v = val as Record<string, unknown>;
      const priceTL = Number(v.priceTL);
      const creditTL = Number(v.creditTL);
      if (Number.isFinite(priceTL) && priceTL > 0 && Number.isFinite(creditTL) && creditTL > 0) {
        // B2: opsiyonel packageId — yalnız non-boş string kabul edilir (savunmacı;
        // boş/sayı/yanlış tip → undefined = eski bakiye yolu, INERT geriye-uyum).
        const packageId = typeof v.packageId === "string" && v.packageId.trim()
          ? v.packageId.trim()
          : undefined;
        map[String(pid)] = packageId ? { priceTL, creditTL, packageId } : { priceTL, creditTL };
      }
    }
    _osbProductMapCache = map;
    return map;
  } catch {
    _osbProductMapCache = null;
    return {};
  }
}

/** Test yardımcısı — env değişince cache sıfırlanır. */
export function resetOsbProductMapCache(): void {
  _osbProductMapCache = undefined;
}

export function resolveOsbProduct(productId: unknown): OsbProduct | null {
  const map = getOsbProductMap();
  return map[String(productId ?? "")] ?? null;
}
