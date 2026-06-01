import { Router, Response } from "express";
import express from "express";
import { db } from "../db/client.js";
import { payments, pendingIbanPayments, systemConfig, users, transactions, shopierOsbDeadLetters } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { env } from "../lib/env.js";
import { userAuth } from "../middleware/user-auth.js";
import { requireWhatsappVerified } from "../middleware/whatsapp-verified.js";
import { adminAuth } from "../middleware/admin-auth.js";
import { calcKdv, creditUserBalance } from "../services/payment-common.js";
import { buildCheckoutForm, verifyCallback, verifyOsbNotification, isOsbTestOrder, resolveOsbProduct } from "../services/shopier-service.js";
import { createInvoice, verifyWebhook } from "../services/cryptomus-service.js";
import { writeAudit } from "../services/audit-service.js";
import { logger } from "../lib/logger.js";
import { isIbanConfigured, validatePaymentAmount } from "../services/payment-guards.js";
import { adminPaymentNotificationEmail } from "../services/email-service.js";
import { buildUsdTopupQuote } from "../services/payment-pricing.js";

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────
function generateReferansKodu(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "YZ-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getPaymentLimits() {
  const rows = await db
    .select({ minBakiyeTL: systemConfig.minBakiyeTL, maxBakiyeTL: systemConfig.maxBakiyeTL })
    .from(systemConfig)
    .where(eq(systemConfig.id, 1))
    .limit(1);

  return rows[0] ?? { minBakiyeTL: "250", maxBakiyeTL: "50000" };
}

async function getPaymentKur(): Promise<number> {
  const rows = await db
    .select({ kur: systemConfig.kur })
    .from(systemConfig)
    .where(eq(systemConfig.id, 1))
    .limit(1);

  return Number(rows[0]?.kur ?? 47.084289);
}

async function getManualPaymentSettings() {
  const rows = await db
    .select({
      paymentWhatsappNumber: systemConfig.paymentWhatsappNumber,
      cryptoWalletEnabled: systemConfig.cryptoWalletEnabled,
      cryptoWalletAsset: systemConfig.cryptoWalletAsset,
      cryptoWalletNetwork: systemConfig.cryptoWalletNetwork,
      cryptoWalletAddress: systemConfig.cryptoWalletAddress,
      cryptoWalletMemo: systemConfig.cryptoWalletMemo,
    })
    .from(systemConfig)
    .where(eq(systemConfig.id, 1))
    .limit(1);

  const cfg = rows[0];
  return {
    paymentWhatsappNumber: cfg?.paymentWhatsappNumber || env.PAYMENT_WHATSAPP_NUMBER || "",
    cryptoWalletEnabled: Boolean(cfg?.cryptoWalletEnabled ?? env.CRYPTO_WALLET_ENABLED),
    cryptoWalletAsset: cfg?.cryptoWalletAsset || env.CRYPTO_WALLET_ASSET || "USDT",
    cryptoWalletNetwork: cfg?.cryptoWalletNetwork || env.CRYPTO_WALLET_NETWORK || "TRC20",
    cryptoWalletAddress: cfg?.cryptoWalletAddress || env.CRYPTO_WALLET_ADDRESS || "",
    cryptoWalletMemo: cfg?.cryptoWalletMemo || env.CRYPTO_WALLET_MEMO || "",
  };
}

function normalizeWhatsappNumber(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

function buildPaymentNotification(opts: {
  method: string;
  reference: string;
  amountUsd: number;
  payableLabel: string;
  userEmail?: string;
  settings: Awaited<ReturnType<typeof getManualPaymentSettings>>;
}) {
  const whatsappNumber = normalizeWhatsappNumber(opts.settings.paymentWhatsappNumber);
  const whatsappMessage = [
    "YapayZekaLab ödeme bildirimi",
    `Yöntem: ${opts.method}`,
    `Referans: ${opts.reference}`,
    `Bakiye: $${opts.amountUsd.toFixed(2)}`,
    `Ödeme: ${opts.payableLabel}`,
    opts.userEmail ? `Hesap: ${opts.userEmail}` : null,
  ].filter(Boolean).join("\n");

  return {
    whatsappNumber,
    whatsappMessage,
    whatsappUrl: whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : null,
  };
}

async function buildQuoteFromRequest(body: Record<string, unknown>) {
  const kur = await getPaymentKur();
  const rawAmountUsd = body.amountUsd ?? (body.miktarTL !== undefined ? Number(body.miktarTL) / kur : undefined);
  const amountUsd = Number(rawAmountUsd);
  const quote = buildUsdTopupQuote(amountUsd, kur);
  const amountValidation = validatePaymentAmount(quote.payableTL, await getPaymentLimits());
  return { quote, amountValidation };
}

function safeCryptomusWebhookLog(body: Record<string, unknown>) {
  const { uuid, order_id, status, amount, currency, to_currency } = body as Record<string, unknown>;
  return { uuid, order_id, status, amount, currency, to_currency };
}

function safeShopierCallbackLog(body: Record<string, string>) {
  const { platform_order_id, payment_id, status, installment, istest } = body;
  return { platform_order_id, payment_id, status, installment, istest };
}

function safeProviderPayload(body: Record<string, unknown>) {
  const blocked = new Set(["signature", "sign", "API_key", "api_key", "token", "authorization", "cookie"]);
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !blocked.has(key.toLowerCase())),
  );
}

function serializePayment(p: typeof payments.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    metod: p.metod,
    miktarTL: Number(p.miktarTL),
    amountUsd: p.amountUsd === null ? null : Number(p.amountUsd),
    payableTL: p.payableTL === null ? null : Number(p.payableTL),
    creditTL: p.creditTL === null ? null : Number(p.creditTL),
    kurAtPayment: p.kurAtPayment === null ? null : Number(p.kurAtPayment),
    roundingTL: p.roundingTL === null ? null : Number(p.roundingTL),
    kdvTL: Number(p.kdvTL),
    netTL: Number(p.netTL),
    durum: p.durum,
    idempotencyKey: p.idempotencyKey,
    olusturma: p.olusturma instanceof Date ? p.olusturma.toISOString() : String(p.olusturma),
    tamamlanma: p.tamamlanma instanceof Date ? p.tamamlanma.toISOString() : (p.tamamlanma ?? null),
    transactionId: p.transactionId,
  };
}

function serializeIban(p: typeof pendingIbanPayments.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    miktarTL: Number(p.miktarTL),
    amountUsd: p.amountUsd === null ? null : Number(p.amountUsd),
    payableTL: p.payableTL === null ? null : Number(p.payableTL),
    creditTL: p.creditTL === null ? null : Number(p.creditTL),
    kurAtPayment: p.kurAtPayment === null ? null : Number(p.kurAtPayment),
    roundingTL: p.roundingTL === null ? null : Number(p.roundingTL),
    kdvTL: Number(p.kdvTL),
    referansKodu: p.referansKodu,
    durum: p.durum,
    olusturma: p.olusturma instanceof Date ? p.olusturma.toISOString() : String(p.olusturma),
    onay: p.onay instanceof Date ? p.onay.toISOString() : (p.onay ?? null),
    onaylayan: p.onaylayan,
    not: p.not,
  };
}

type ShopierResponseMode = "redirect" | "json";

function finishShopierResponse(
  res: Response,
  mode: ShopierResponseMode,
  ok: boolean,
  extra: Record<string, unknown> = {},
) {
  if (mode === "json") {
    res.status(ok ? 200 : 400).json({ ok, ...extra });
    return;
  }

  res.redirect(`${env.APP_BASE_URL}/?payment=${ok ? "success" : "fail"}`);
}

async function forwardShopierOsbFallback(body: Record<string, string>): Promise<boolean> {
  const fallbackUrl = env.SHOPIER_OSB_FALLBACK_URL?.trim();
  if (!fallbackUrl) return false;

  const payload = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    payload.set(key, String(value));
  }

  try {
    const response = await fetch(fallbackUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: payload,
    });

    if (!response.ok) {
      logger.warn({
        status: response.status,
        paymentId: body.platform_order_id,
      }, "Shopier OSB fallback failed");
    }

    return response.ok;
  } catch (err) {
    logger.error({
      err,
      paymentId: body.platform_order_id,
    }, "Shopier OSB fallback request failed");
    return false;
  }
}

async function handleShopierCallbackBody(
  body: Record<string, string>,
  res: Response,
  opts: { mode: ShopierResponseMode; allowFallback: boolean },
) {
  logger.info({ callback: safeShopierCallbackLog(body) }, "Shopier callback received");

  const result = verifyCallback(body);
  if (!result.valid) {
    if (opts.allowFallback && await forwardShopierOsbFallback(body)) {
      res.status(200).json({ ok: true, forwarded: true });
      return;
    }

    logger.warn({ callback: safeShopierCallbackLog(body) }, "Shopier callback signature invalid");
    adminPaymentNotificationEmail({
      title: "Shopier callback imza hatası",
      method: "shopier",
      reference: body.platform_order_id,
      status: "invalid_signature",
    }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
    finishShopierResponse(res, opts.mode, false);
    return;
  }

  if (result.status !== "success") {
    const paymentRowsForFailure = result.platformOrderId
      ? await db.select().from(payments).where(eq(payments.id, result.platformOrderId)).limit(1)
      : [];

    if (!paymentRowsForFailure.length && opts.allowFallback && await forwardShopierOsbFallback(body)) {
      res.status(200).json({ ok: true, forwarded: true });
      return;
    }

    if (paymentRowsForFailure.length && result.platformOrderId) {
      await db.update(payments)
        .set({ durum: "basarisiz", tamamlanma: new Date() })
        .where(eq(payments.id, result.platformOrderId));
    } else if (result.platformOrderId) {
      logger.warn({ paymentId: result.platformOrderId }, "Shopier callback: payment not found");
    }

    adminPaymentNotificationEmail({
      title: "Shopier ödeme başarısız",
      method: "shopier",
      reference: result.platformOrderId,
      status: result.status ?? "fail",
    }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
    finishShopierResponse(res, opts.mode, opts.mode === "json", { status: result.status ?? "fail" });
    return;
  }

  const paymentId = result.platformOrderId!;
  const paymentRows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!paymentRows.length) {
    if (opts.allowFallback && await forwardShopierOsbFallback(body)) {
      res.status(200).json({ ok: true, forwarded: true });
      return;
    }

    logger.warn({ paymentId }, "Shopier callback: payment not found");
    finishShopierResponse(res, opts.mode, false, { error: "payment_not_found" });
    return;
  }

  const payment = paymentRows[0];
  if (result.currency !== undefined && result.currency !== "0") {
    logger.warn({
      paymentId,
      currency: result.currency,
    }, "Shopier callback currency mismatch");
    adminPaymentNotificationEmail({
      title: "Shopier ödeme para birimi uyuşmadı",
      method: "shopier",
      reference: paymentId,
      status: "currency_mismatch",
    }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
    finishShopierResponse(res, opts.mode, false, { error: "currency_mismatch" });
    return;
  }

  const expectedPaidTL = Number(payment.payableTL ?? payment.miktarTL);
  if (result.paidTL !== undefined && Math.abs(result.paidTL - expectedPaidTL) > 0.01) {
    logger.warn({
      paymentId,
      paidTL: result.paidTL,
      expectedPaidTL,
    }, "Shopier callback amount mismatch");
    adminPaymentNotificationEmail({
      title: "Shopier ödeme tutarı uyuşmadı",
      method: "shopier",
      reference: paymentId,
      status: "amount_mismatch",
      payableTL: expectedPaidTL,
    }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
    finishShopierResponse(res, opts.mode, false, { error: "amount_mismatch" });
    return;
  }

  const creditTL = Number(payment.creditTL ?? payment.miktarTL);
  const credit = await creditUserBalance(
    payment.userId,
    paymentId,
    creditTL,
    "shopier",
    paymentId,
    safeProviderPayload(body),
    {
      paidTL: Number(payment.payableTL ?? payment.miktarTL),
      amountUsd: payment.amountUsd === null ? undefined : Number(payment.amountUsd),
      kurAtPayment: payment.kurAtPayment === null ? undefined : Number(payment.kurAtPayment),
      roundingTL: payment.roundingTL === null ? undefined : Number(payment.roundingTL),
    },
  );

  finishShopierResponse(res, opts.mode, credit.success || Boolean(credit.alreadyCredited), {
    alreadyCredited: Boolean(credit.alreadyCredited),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Shopier OSB (Sipariş Bildirimi / notificationaccess.php) — sabit-link otomatik
// kredilendirme (Paket 3). Müşteri sabit Shopier ürün linkinden öder; bizim
// init akışımızdan GEÇMEZ → önceden payments satırı YOKTUR. Eşleştirme yalnız
// imzalı payload'daki email + productId ile yapılır. Shopier'in beklediği yanıt:
// başarıda gövdede "success" metni (HTTP 200). Çift-credit DB UNIQUE ile engellenir.
// ════════════════════════════════════════════════════════════════════════════

/** OSB'de log/saklamada güvenli alanlar — imza/hash ve PII-ağırlıklı ham gövde sızdırılmaz. */
function safeOsbLog(payload: Record<string, unknown> | undefined) {
  if (!payload) return {};
  const { orderid, productid, currency, istest } = payload;
  return { orderid, productid, currency, istest };
}

/** payloadJson'a yazılırken imza/hash ve teknik gürültüyü çıkar (PII minimumda tutulur). */
function safeOsbPayload(payload: Record<string, unknown>) {
  const blocked = new Set(["res", "hash", "signature", "sign", "0", "1", "0[value]", "1[value]"]);
  return Object.fromEntries(Object.entries(payload).filter(([k]) => !blocked.has(k.toLowerCase())));
}

async function recordOsbDeadLetter(
  orderId: string,
  reason: string,
  payload: OsbPayloadLike,
): Promise<void> {
  try {
    await db.insert(shopierOsbDeadLetters).values({
      shopierOrderId: orderId,
      reason,
      buyerEmail: payload.email ? String(payload.email) : null,
      productId: payload.productid ? String(payload.productid) : null,
      priceTL: payload.price !== undefined && Number.isFinite(Number(payload.price)) ? String(Number(payload.price)) : null,
      payloadJson: safeOsbPayload(payload) as any,
    }).onConflictDoNothing({ target: shopierOsbDeadLetters.shopierOrderId });
  } catch (e) {
    logger.error({ err: e, orderId, reason }, "OSB dead-letter insert failed");
  }
  adminPaymentNotificationEmail({
    title: "Shopier OSB otomatik kredilendirilemedi",
    method: "shopier_osb",
    reference: orderId,
    status: reason,
    reason: "Geçerli imzalı OSB bildirimi eşleştirilemedi — admin manuel kontrol gerekir.",
  }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
}

type OsbPayloadLike = Record<string, unknown> & {
  email?: unknown; orderid?: unknown; productid?: unknown; price?: unknown; currency?: unknown; istest?: unknown;
};

/**
 * Shopier OSB bildirimini işle. Shopier başarıyı gövdedeki "success" metni ile bekler,
 * bu yüzden eşleşmeyen/işlenemeyen GEÇERLİ-imzalı bildirimlere de 200 + "success" döneriz
 * (Shopier retry fırtınasını önlemek için), ama dead-letter'a yazıp admin'i uyarırız.
 * Yalnızca GERÇEK kredilendirme hatası (DB down vb.) HTTP 500 → Shopier retry eder.
 */
async function handleShopierOsbBody(body: unknown, res: Response): Promise<void> {
  const verifyResult = verifyOsbNotification(body);
  if (!verifyResult.valid) {
    logger.warn({ reason: verifyResult.reason }, "Shopier OSB verify failed");
    res.status(401).send("unauthorized");
    return;
  }

  const payload = verifyResult.payload as OsbPayloadLike;
  logger.info({ osb: safeOsbLog(payload as Record<string, unknown>) }, "Shopier OSB notification received");

  // Z3 — test siparişleri asla kredilendirmez.
  if (isOsbTestOrder(payload.istest)) {
    res.status(200).send("success");
    return;
  }

  // Z4 — orderid zorunlu (idempotency ankrajı; boşsa osb_undefined çakışması olur).
  const orderId = String(payload.orderid ?? "").trim();
  if (!orderId) {
    logger.warn({ osb: safeOsbLog(payload as Record<string, unknown>) }, "Shopier OSB missing orderid");
    res.status(200).send("success");
    return;
  }

  // Z2 — yalnız TL/TRY kredilenir.
  const currency = String(payload.currency ?? "").trim().toUpperCase();
  if (currency && !["TL", "TRY", "0"].includes(currency)) {
    await recordOsbDeadLetter(orderId, "currency_mismatch", payload);
    res.status(200).send("success");
    return;
  }

  // Ürün eşlemesi + tutar guard'ı.
  const product = resolveOsbProduct(payload.productid);
  if (!product) {
    await recordOsbDeadLetter(orderId, "unknown_product", payload);
    res.status(200).send("success");
    return;
  }
  const paidPrice = Number(payload.price);
  if (!Number.isFinite(paidPrice) || Math.abs(paidPrice - product.priceTL) > 0.01) {
    await recordOsbDeadLetter(orderId, "amount_mismatch", payload);
    res.status(200).send("success");
    return;
  }

  // Email → kullanıcı eşleştirme (tek eşleşme şart).
  const email = String(payload.email ?? "").trim().toLowerCase();
  const matchedUsers = email
    ? await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(2)
    : [];
  if (matchedUsers.length !== 1) {
    await recordOsbDeadLetter(orderId, matchedUsers.length > 1 ? "ambiguous_email" : "unknown_email", payload);
    res.status(200).send("success");
    return;
  }
  const userId = matchedUsers[0].id;

  // Z1 — kredilendirmeden ÖNCE payments satırını oluştur/bul. creditUserBalance
  // satırı yalnız UPDATE eder (INSERT etmez) ve idempotency'i payments.id (uuid) ile
  // kontrol eder. Sabit-linkte önceden satır yok → satırı burada açarız. payments.id
  // UUID kolonu olduğu için "osb_<orderid>" YAZILAMAZ; bunun yerine orderid'i UNIQUE
  // text `idempotencyKey="osb_<orderid>"` alanına koyar, gerçek uuid'yi geri okuruz.
  const osbIdemKey = `osb_${orderId}`;
  const kdv = calcKdv(product.creditTL);
  await db.insert(payments).values({
    userId,
    metod: "shopier_osb",
    miktarTL: String(product.creditTL),
    kdvTL: String(kdv.kdvTL),
    netTL: String(kdv.netTL),
    payableTL: String(product.priceTL),
    creditTL: String(product.creditTL),
    durum: "bekliyor",
    idempotencyKey: osbIdemKey,
  }).onConflictDoNothing({ target: payments.idempotencyKey });

  const paymentRows = await db.select({ id: payments.id })
    .from(payments).where(eq(payments.idempotencyKey, osbIdemKey)).limit(1);
  if (!paymentRows.length) {
    // Beklenmez (insert + onConflict sonrası satır olmalı) — güvenli tarafta dead-letter.
    logger.error({ osbIdemKey }, "OSB payment row not found after upsert");
    await recordOsbDeadLetter(orderId, "payment_row_missing", payload);
    res.status(200).send("success");
    return;
  }
  const paymentId = paymentRows[0].id;

  const credit = await creditUserBalance(
    userId,
    paymentId,
    product.creditTL,
    "shopier_osb",
    osbIdemKey,
    safeOsbPayload(payload),
    { paidTL: product.priceTL },
  );

  if (credit.success || credit.alreadyCredited) {
    res.status(200).send("success");
    return;
  }

  // Kredi başarısız → payment durumunu YENİDEN OKU (yarış kaybedeni / commit-sonrası
  // throw bakiyeyi yüklemiş olabilir). basarili ise success ack et, gereksiz retry önle.
  let recheckDurum: string | null = null;
  try {
    const recheck = await db.select({ durum: payments.durum }).from(payments).where(eq(payments.id, paymentId)).limit(1);
    recheckDurum = recheck.length ? recheck[0].durum : null;
  } catch (e) {
    logger.error({ err: e, paymentId }, "OSB credit recheck failed");
  }
  if (recheckDurum === "basarili") {
    res.status(200).send("success");
    return;
  }

  // Gerçek kredilendirme hatası → Shopier retry etsin.
  logger.error({ paymentId }, "Shopier OSB credit failed — returning 500 for retry");
  res.status(500).send("error");
}

// ── GET /api/payments/methods ─────────────────────────────────────────────────
router.get("/methods", userAuth, requireWhatsappVerified, async (_req, res, next) => {
  try {
    const ibanEnabled = isIbanConfigured(env);
    const shopierEnabled = !!(env.SHOPIER_API_KEY && env.SHOPIER_API_SECRET);
    const settings = await getManualPaymentSettings();
    const cryptomusProviderEnabled = !!(env.CRYPTOMUS_MERCHANT_ID && env.CRYPTOMUS_API_KEY);
    const manualCryptoEnabled = settings.cryptoWalletEnabled && !!settings.cryptoWalletAddress.trim();
    const cryptomusEnabled = cryptomusProviderEnabled || manualCryptoEnabled;
    const limits = await getPaymentLimits();
    const kur = await getPaymentKur();
    res.json({
      shopier: {
        enabled: shopierEnabled,
        reason: shopierEnabled ? null : "Shopier ödeme yöntemi şu an kapalı.",
      },
      iban: {
        enabled: ibanEnabled,
        reason: ibanEnabled ? null : "IBAN ödeme bilgileri henüz tanımlı değil.",
        bankName: env.IBAN_BANK_NAME,
        ibanNumber: env.IBAN_NUMBER,
        owner: env.IBAN_OWNER,
      },
      cryptomus: {
        enabled: cryptomusEnabled,
        reason: cryptomusEnabled ? null : "Kripto ödeme yöntemi şu an kapalı.",
        mode: cryptomusProviderEnabled ? "cryptomus_invoice" : (manualCryptoEnabled ? "manual_wallet" : "disabled"),
        cryptoWalletAsset: settings.cryptoWalletAsset,
        cryptoWalletNetwork: settings.cryptoWalletNetwork,
        cryptoWalletAddress: manualCryptoEnabled ? settings.cryptoWalletAddress : "",
        cryptoWalletMemo: manualCryptoEnabled ? settings.cryptoWalletMemo : "",
      },
      notification: {
        paymentWhatsappNumber: normalizeWhatsappNumber(settings.paymentWhatsappNumber),
      },
      limits: {
        minBakiyeTL: Number(limits.minBakiyeTL),
        maxBakiyeTL: Number(limits.maxBakiyeTL),
      },
      kur,
      kdvRate: env.KDV_RATE,
    });
  } catch (e) { next(e); }
});

// ── POST /api/payments/shopier/init ──────────────────────────────────────────
router.post("/shopier/init", userAuth, requireWhatsappVerified, async (req, res, next) => {
  try {
    if (!env.SHOPIER_API_KEY || !env.SHOPIER_API_SECRET) {
      res.status(503).json({ error: "Shopier ödeme yöntemi şu an kullanılamıyor." });
      return;
    }

    const { quote, amountValidation } = await buildQuoteFromRequest(req.body as Record<string, unknown>);
    if (!amountValidation.ok) {
      res.status(amountValidation.status).json({ error: amountValidation.error });
      return;
    }

    const kdv = calcKdv(quote.payableTL);

    // Load user info for form fields
    const userRows = await db.select({ email: users.email, adSoyad: users.adSoyad })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRows.length) { res.status(404).json({ error: "Kullanıcı bulunamadı." }); return; }
    const { email, adSoyad } = userRows[0];

    // Create payment row; its UUID becomes the platform_order_id (idempotency key)
    const inserted = await db.insert(payments).values({
      userId: req.user!.id,
      metod: "shopier",
      miktarTL: String(quote.payableTL),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      amountUsd: String(quote.amountUsd),
      payableTL: String(quote.payableTL),
      creditTL: String(quote.creditTL),
      kurAtPayment: String(quote.kur),
      roundingTL: String(quote.roundingTL),
      durum: "bekliyor",
      // idempotencyKey will be set to the id itself after insert
    }).returning({ id: payments.id });

    const paymentId = inserted[0].id;

    // Set idempotencyKey = paymentId
    await db.update(payments).set({ idempotencyKey: paymentId }).where(eq(payments.id, paymentId));

    const checkout = buildCheckoutForm({
      userId: req.user!.id,
      paymentId,
      miktarTL: quote.payableTL,
      email,
      adSoyad,
    });

    res.json({ paymentId, kdv, quote, ...checkout });
  } catch (e) { next(e); }
});

// ── POST /api/payments/shopier/callback (PUBLIC — Shopier calls this) ─────────
router.post(
  "/shopier/callback",
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, string>;
      await handleShopierCallbackBody(body, res, { mode: "redirect", allowFallback: false });
    } catch (e) { next(e); }
  }
);

// ── POST /api/payments/shopier/osb (PUBLIC — Shopier OSB relay, checkout-form format) ─
router.post(
  "/shopier/osb",
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, string>;
      await handleShopierCallbackBody(body, res, { mode: "json", allowFallback: true });
    } catch (e) { next(e); }
  }
);

// ── POST /api/payments/shopier/osb-notify (PUBLIC — Shopier official OSB / Sipariş
//    Bildirimi, sabit-link otomatik kredilendirme — Paket 3) ────────────────────
// notificationaccess.php formatı (res+hash, SHOPIER_OSB_USERNAME/PASSWORD HMAC).
// Shopier panelinde "Sipariş Bildirimi (OSB)" URL'si BUNA ayarlanır. Hem urlencoded
// (named / positional / bracket) hem json gövdeyi normalize eder.
router.post(
  "/shopier/osb-notify",
  express.urlencoded({ extended: true }),
  express.json(),
  async (req, res, next) => {
    try {
      await handleShopierOsbBody(req.body, res);
    } catch (e) { next(e); }
  }
);

// ── POST /api/payments/iban/init ─────────────────────────────────────────────
router.post("/iban/init", userAuth, requireWhatsappVerified, async (req, res, next) => {
  try {
    if (!isIbanConfigured(env)) {
      res.status(503).json({ error: "IBAN ödeme yöntemi şu an kullanılamıyor." });
      return;
    }

    const { quote, amountValidation } = await buildQuoteFromRequest(req.body as Record<string, unknown>);
    if (!amountValidation.ok) {
      res.status(amountValidation.status).json({ error: amountValidation.error });
      return;
    }

    const kdv = calcKdv(quote.payableTL);
    const referansKodu = generateReferansKodu();

    // Create payment row
    const paymentInserted = await db.insert(payments).values({
      userId: req.user!.id,
      metod: "iban",
      miktarTL: String(quote.payableTL),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      amountUsd: String(quote.amountUsd),
      payableTL: String(quote.payableTL),
      creditTL: String(quote.creditTL),
      kurAtPayment: String(quote.kur),
      roundingTL: String(quote.roundingTL),
      durum: "bekliyor",
      idempotencyKey: referansKodu,
    }).returning({ id: payments.id });

    const paymentId = paymentInserted[0].id;

    const userRows = await db.select({ email: users.email })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    const settings = await getManualPaymentSettings();

    // Create pending iban record
    await db.insert(pendingIbanPayments).values({
      userId: req.user!.id,
      miktarTL: String(quote.payableTL),
      kdvTL: String(kdv.kdvTL),
      amountUsd: String(quote.amountUsd),
      payableTL: String(quote.payableTL),
      creditTL: String(quote.creditTL),
      kurAtPayment: String(quote.kur),
      roundingTL: String(quote.roundingTL),
      referansKodu,
    });

    adminPaymentNotificationEmail({
      title: "Yeni IBAN ödeme bildirimi",
      userEmail: userRows[0]?.email,
      method: "iban",
      amountUsd: quote.amountUsd,
      payableTL: quote.payableTL,
      creditTL: quote.creditTL,
      reference: referansKodu,
      status: "bekliyor",
    }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));

    res.json({
      paymentId,
      referansKodu,
      kdv,
      quote,
      iban: {
        bankName: env.IBAN_BANK_NAME,
        ibanNumber: env.IBAN_NUMBER,
        owner: env.IBAN_OWNER,
      },
      whatsapp: buildPaymentNotification({
        method: "IBAN Havalesi",
        reference: referansKodu,
        amountUsd: quote.amountUsd,
        payableLabel: `₺${quote.payableTL.toFixed(0)}`,
        userEmail: userRows[0]?.email,
        settings,
      }),
      aciklama: `Ödeme bildirimi için referans kodunuz oluşturuldu: ${referansKodu}`,
    });
  } catch (e) { next(e); }
});

// ── POST /api/payments/crypto/init ───────────────────────────────────────────
router.post("/crypto/init", userAuth, requireWhatsappVerified, async (req, res, next) => {
  try {
    const settings = await getManualPaymentSettings();
    const cryptomusProviderEnabled = !!(env.CRYPTOMUS_MERCHANT_ID && env.CRYPTOMUS_API_KEY);
    const manualCryptoEnabled = settings.cryptoWalletEnabled && !!settings.cryptoWalletAddress.trim();
    if (!cryptomusProviderEnabled && !manualCryptoEnabled) {
      res.status(503).json({ error: "Kripto ödeme yöntemi şu an kullanılamıyor." });
      return;
    }

    const { quote, amountValidation } = await buildQuoteFromRequest(req.body as Record<string, unknown>);
    if (!amountValidation.ok) {
      res.status(amountValidation.status).json({ error: amountValidation.error });
      return;
    }

    const kdv = calcKdv(quote.payableTL);
    const userRows = await db.select({ email: users.email })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    const manualReference = generateReferansKodu();

    // Create payment row first
    const inserted = await db.insert(payments).values({
      userId: req.user!.id,
      metod: cryptomusProviderEnabled ? "cryptomus" : "crypto_manual",
      miktarTL: String(quote.payableTL),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      amountUsd: String(quote.amountUsd),
      payableTL: String(quote.payableTL),
      creditTL: String(quote.creditTL),
      kurAtPayment: String(quote.kur),
      roundingTL: String(quote.roundingTL),
      durum: "bekliyor",
      idempotencyKey: cryptomusProviderEnabled ? undefined : manualReference,
    }).returning({ id: payments.id });

    const paymentId = inserted[0].id;

    if (!cryptomusProviderEnabled) {
      res.json({
        paymentId,
        manual: true,
        referansKodu: manualReference,
        kdv,
        quote,
        cryptoWallet: {
          asset: settings.cryptoWalletAsset,
          network: settings.cryptoWalletNetwork,
          address: settings.cryptoWalletAddress,
          memo: settings.cryptoWalletMemo,
        },
        whatsapp: buildPaymentNotification({
          method: `${settings.cryptoWalletAsset} ${settings.cryptoWalletNetwork}`,
          reference: manualReference,
          amountUsd: quote.amountUsd,
          payableLabel: `$${quote.amountUsd.toFixed(2)} ${settings.cryptoWalletAsset}`,
          userEmail: userRows[0]?.email,
          settings,
        }),
        aciklama: `Kripto ödeme bildirimi için referans kodunuz oluşturuldu: ${manualReference}`,
      });
      return;
    }

    // Create Cryptomus invoice
    const invoice = await createInvoice({ paymentId, amountUsd: quote.amountUsd });

    // Store invoice uuid as idempotency key
    await db.update(payments)
      .set({ idempotencyKey: invoice.uuid })
      .where(eq(payments.id, paymentId));

    res.json({ paymentId, url: invoice.url, uuid: invoice.uuid, kdv, quote });
  } catch (e) { next(e); }
});

// ── POST /api/payments/crypto/webhook (PUBLIC — Cryptomus calls this) ─────────
router.post(
  "/crypto/webhook",
  express.json(),
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      logger.info({ webhook: safeCryptomusWebhookLog(body) }, "Cryptomus webhook received");

      const result = verifyWebhook(body);
      if (!result.valid) {
        logger.warn({ webhook: safeCryptomusWebhookLog(body) }, "Cryptomus webhook signature invalid");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      const { uuid, order_id, status } = body as { uuid: string; order_id: string; status: string };

      if (status !== "paid" && status !== "paid_over") {
        // Not a creditable status — acknowledge without action
        res.json({ ok: true });
        return;
      }

      // Find payment by idempotency_key = uuid
      const paymentRows = await db.select().from(payments)
        .where(eq(payments.idempotencyKey, uuid)).limit(1);

      if (!paymentRows.length) {
        // Try by id (order_id = paymentId)
        const byId = await db.select().from(payments)
          .where(eq(payments.id, order_id as string)).limit(1);
        if (!byId.length) {
          logger.warn({ uuid, order_id }, "Cryptomus webhook: payment not found");
          res.json({ ok: true });
          return;
        }
        paymentRows.push(byId[0]);
      }

      const payment = paymentRows[0];
      const expectedAmountUsd = Number(payment.amountUsd ?? payment.miktarTL);
      const paidAmountUsd = Number((body as { amount?: unknown }).amount);
      const paidCurrency = String((body as { currency?: unknown }).currency ?? "");
      const paidToCurrency = String((body as { to_currency?: unknown }).to_currency ?? "");
      if (paidCurrency && paidCurrency !== "USD") {
        logger.warn({
          uuid,
          order_id,
          paidCurrency,
        }, "Cryptomus webhook currency mismatch");
        res.json({ ok: true });
        return;
      }
      if (paidToCurrency && paidToCurrency !== "USDT") {
        logger.warn({
          uuid,
          order_id,
          paidToCurrency,
        }, "Cryptomus webhook target currency mismatch");
        res.json({ ok: true });
        return;
      }
      if (Number.isFinite(paidAmountUsd) && Math.abs(paidAmountUsd - expectedAmountUsd) > 0.01) {
        logger.warn({
          uuid,
          order_id,
          paidAmountUsd,
          expectedAmountUsd,
        }, "Cryptomus webhook amount mismatch");
        res.json({ ok: true });
        return;
      }

      const creditTL = Number(payment.creditTL ?? payment.miktarTL);
      const credit = await creditUserBalance(
        payment.userId,
        payment.id,
        creditTL,
        "cryptomus",
        uuid,
        safeProviderPayload(body),
        {
          paidTL: Number(payment.payableTL ?? payment.miktarTL),
          amountUsd: payment.amountUsd === null ? undefined : Number(payment.amountUsd),
          kurAtPayment: payment.kurAtPayment === null ? undefined : Number(payment.kurAtPayment),
          roundingTL: payment.roundingTL === null ? undefined : Number(payment.roundingTL),
        },
      );

      if (!credit.success && !credit.alreadyCredited) {
        res.status(500).json({ error: "Bakiye yüklenirken hata oluştu." });
        return;
      }

      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ── GET /api/payments/crypto/callback (PUBLIC — browser redirect from Cryptomus) ─
router.get("/crypto/callback", (_req, res) => {
  res.redirect(`${env.APP_BASE_URL}/?payment=pending`);
});

// ── GET /api/payments/me ─────────────────────────────────────────────────────
router.get("/me", userAuth, requireWhatsappVerified, async (req, res, next) => {
  try {
    const rows = await db.select().from(payments)
      .where(eq(payments.userId, req.user!.id))
      .orderBy(desc(payments.olusturma))
      .limit(20);
    res.json(rows.map(serializePayment));
  } catch (e) { next(e); }
});

// ── Admin: GET /api/payments/admin/pending-iban ───────────────────────────────
router.get("/admin/pending-iban", adminAuth, async (_req, res, next) => {
  try {
    const rows = await db.select({
      iban: pendingIbanPayments,
      email: users.email,
      adSoyad: users.adSoyad,
    })
      .from(pendingIbanPayments)
      .leftJoin(users, eq(pendingIbanPayments.userId, users.id))
      .orderBy(desc(pendingIbanPayments.olusturma));

    res.json(rows.map(r => ({
      ...serializeIban(r.iban),
      userEmail: r.email,
      userAdSoyad: r.adSoyad,
    })));
  } catch (e) { next(e); }
});

// ── Admin: POST /api/payments/admin/pending-iban/:id/approve ─────────────────
router.post("/admin/pending-iban/:id/approve", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { not } = req.body as { not?: string };

    const rows = await db.select().from(pendingIbanPayments).where(eq(pendingIbanPayments.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Havale kaydı bulunamadı." }); return; }

    const pending = rows[0];
    if (pending.durum !== "bekliyor") {
      res.status(409).json({ error: `Bu havale zaten ${pending.durum} durumunda.` });
      return;
    }

    // Find associated payment row by idempotency_key = referansKodu
    const paymentRows = await db.select().from(payments)
      .where(eq(payments.idempotencyKey, pending.referansKodu)).limit(1);

    if (!paymentRows.length) {
      res.status(404).json({ error: "İlgili ödeme kaydı bulunamadı." });
      return;
    }

    const payment = paymentRows[0];
    const creditTL = Number(payment.creditTL ?? pending.miktarTL);
    const credit = await creditUserBalance(
      pending.userId,
      payment.id,
      creditTL,
      "iban",
      pending.referansKodu,
      undefined,
      {
        paidTL: Number(payment.payableTL ?? pending.miktarTL),
        amountUsd: payment.amountUsd === null ? undefined : Number(payment.amountUsd),
        kurAtPayment: payment.kurAtPayment === null ? undefined : Number(payment.kurAtPayment),
        roundingTL: payment.roundingTL === null ? undefined : Number(payment.roundingTL),
      },
    );

    if (!credit.success && !credit.alreadyCredited) {
      res.status(500).json({ error: "Bakiye yüklenirken hata oluştu." });
      return;
    }

    // Update pending iban record
    await db.update(pendingIbanPayments).set({
      durum: "onaylandi",
      onay: new Date(),
      onaylayan: req.admin?.sub ?? "admin",
      not: not ?? null,
    }).where(eq(pendingIbanPayments.id, id));

    await writeAudit(
      "iban_approve",
      pending.userId,
      `IBAN onaylandı: ${pending.referansKodu} ₺${pending.miktarTL}${not ? " — " + not : ""}`,
      req.admin?.sub,
    );

    const updated = await db.select().from(pendingIbanPayments).where(eq(pendingIbanPayments.id, id)).limit(1);
    res.json({ ...serializeIban(updated[0]), transactionId: credit.txId });
  } catch (e) { next(e); }
});

// ── Admin: POST /api/payments/admin/pending-iban/:id/reject ──────────────────
router.post("/admin/pending-iban/:id/reject", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { not } = req.body as { not: string };
    if (!not?.trim()) { res.status(400).json({ error: "Red nedeni (not) zorunludur." }); return; }

    const rows = await db.select().from(pendingIbanPayments).where(eq(pendingIbanPayments.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Havale kaydı bulunamadı." }); return; }

    const pending = rows[0];
    if (pending.durum !== "bekliyor") {
      res.status(409).json({ error: `Bu havale zaten ${pending.durum} durumunda.` });
      return;
    }

    await db.update(pendingIbanPayments).set({
      durum: "reddedildi",
      onay: new Date(),
      onaylayan: req.admin?.sub ?? "admin",
      not,
    }).where(eq(pendingIbanPayments.id, id));

    // Also mark payment as iptal
    await db.update(payments)
      .set({ durum: "iptal", tamamlanma: new Date() })
      .where(eq(payments.idempotencyKey, pending.referansKodu));

    await writeAudit(
      "iban_reject",
      pending.userId,
      `IBAN reddedildi: ${pending.referansKodu} — ${not}`,
      req.admin?.sub,
    );

    const updated = await db.select().from(pendingIbanPayments).where(eq(pendingIbanPayments.id, id)).limit(1);
    res.json(serializeIban(updated[0]));
  } catch (e) { next(e); }
});

// ── Admin: GET /api/payments/admin/all ───────────────────────────────────────
router.get("/admin/all", adminAuth, async (req, res, next) => {
  try {
    const { metod, durum, userId } = req.query as Record<string, string>;
    let rows = await db.select().from(payments).orderBy(desc(payments.olusturma));
    if (metod) rows = rows.filter(p => p.metod === metod);
    if (durum) rows = rows.filter(p => p.durum === durum);
    if (userId) rows = rows.filter(p => p.userId === userId);
    res.json(rows.map(serializePayment));
  } catch (e) { next(e); }
});

// ── Admin: GET /api/payments/admin/osb-dead-letters ──────────────────────────
// Otomatik kredilendirilemeyen GEÇERLİ-imzalı OSB bildirimleri (manuel inceleme).
router.get("/admin/osb-dead-letters", adminAuth, async (req, res, next) => {
  try {
    const { durum } = req.query as Record<string, string>;
    let rows = await db.select().from(shopierOsbDeadLetters).orderBy(desc(shopierOsbDeadLetters.olusturma));
    if (durum) rows = rows.filter((r) => r.durum === durum);
    res.json(rows.map((r) => ({
      id: r.id,
      shopierOrderId: r.shopierOrderId,
      reason: r.reason,
      buyerEmail: r.buyerEmail,
      productId: r.productId,
      priceTL: r.priceTL === null ? null : Number(r.priceTL),
      durum: r.durum,
      cozumNotu: r.cozumNotu,
      cozenAdmin: r.cozenAdmin,
      transactionId: r.transactionId,
      olusturma: r.olusturma instanceof Date ? r.olusturma.toISOString() : String(r.olusturma),
      cozum: r.cozum instanceof Date ? r.cozum.toISOString() : (r.cozum ?? null),
    })));
  } catch (e) { next(e); }
});

// ── Admin: POST /api/payments/admin/osb-dead-letters/:id/resolve ──────────────
// Admin bir dead-letter'ı bir kullanıcıya manuel olarak kredilendirir. Kredi miktarı
// dead-letter'ın eşleştiği ürün (priceTL) veya açıkça verilen creditTL'dir. Idempotency:
// payments.idempotencyKey = "osbdl_<deadLetterId>" (UNIQUE text) → tekrar onayda already_credited.
router.post("/admin/osb-dead-letters/:id/resolve", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, creditTL: creditTLRaw, not } = req.body as { userId?: string; creditTL?: number; not?: string };

    const rows = await db.select().from(shopierOsbDeadLetters).where(eq(shopierOsbDeadLetters.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Dead-letter kaydı bulunamadı." }); return; }
    const dl = rows[0];
    if (dl.durum !== "bekliyor") {
      res.status(409).json({ error: `Bu kayıt zaten ${dl.durum} durumunda.` });
      return;
    }

    if (!userId) { res.status(400).json({ error: "userId zorunlu." }); return; }
    const userRows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userRows.length) { res.status(404).json({ error: "Kullanıcı bulunamadı." }); return; }

    const creditTL = Number(creditTLRaw ?? dl.priceTL ?? 0);
    if (!Number.isFinite(creditTL) || creditTL <= 0) {
      res.status(400).json({ error: "Geçerli bir creditTL gerekli." });
      return;
    }

    const osbIdemKey = `osbdl_${dl.id}`;
    const kdv = calcKdv(creditTL);
    await db.insert(payments).values({
      userId,
      metod: "shopier_osb_manual",
      miktarTL: String(creditTL),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      payableTL: dl.priceTL === null ? String(creditTL) : String(dl.priceTL),
      creditTL: String(creditTL),
      durum: "bekliyor",
      idempotencyKey: osbIdemKey,
    }).onConflictDoNothing({ target: payments.idempotencyKey });

    const paymentRows = await db.select({ id: payments.id })
      .from(payments).where(eq(payments.idempotencyKey, osbIdemKey)).limit(1);
    if (!paymentRows.length) {
      res.status(500).json({ error: "Ödeme kaydı oluşturulamadı." });
      return;
    }
    const paymentId = paymentRows[0].id;

    const credit = await creditUserBalance(
      userId,
      paymentId,
      creditTL,
      "shopier_osb_manual",
      osbIdemKey,
      undefined,
      { paidTL: dl.priceTL === null ? creditTL : Number(dl.priceTL) },
    );
    if (!credit.success && !credit.alreadyCredited) {
      res.status(500).json({ error: "Bakiye yüklenirken hata oluştu." });
      return;
    }

    await db.update(shopierOsbDeadLetters).set({
      durum: "cozuldu",
      cozum: new Date(),
      cozenAdmin: req.admin?.sub ?? "admin",
      cozumNotu: not ?? null,
      transactionId: credit.txId ?? null,
    }).where(eq(shopierOsbDeadLetters.id, id));

    await writeAudit(
      "osb_dead_letter_resolve",
      userId,
      `OSB dead-letter kredilendirildi: ${dl.shopierOrderId} ₺${creditTL.toFixed(2)}${not ? " — " + not : ""}`,
      req.admin?.sub,
    );

    res.json({ ok: true, transactionId: credit.txId, alreadyCredited: Boolean(credit.alreadyCredited) });
  } catch (e) { next(e); }
});

// ── Admin: POST /api/payments/admin/osb-dead-letters/:id/ignore ───────────────
router.post("/admin/osb-dead-letters/:id/ignore", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { not } = req.body as { not?: string };
    const rows = await db.select().from(shopierOsbDeadLetters).where(eq(shopierOsbDeadLetters.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Dead-letter kaydı bulunamadı." }); return; }
    if (rows[0].durum !== "bekliyor") {
      res.status(409).json({ error: `Bu kayıt zaten ${rows[0].durum} durumunda.` });
      return;
    }
    await db.update(shopierOsbDeadLetters).set({
      durum: "yoksayildi",
      cozum: new Date(),
      cozenAdmin: req.admin?.sub ?? "admin",
      cozumNotu: not ?? null,
    }).where(eq(shopierOsbDeadLetters.id, id));
    await writeAudit("osb_dead_letter_ignore", rows[0].buyerEmail ?? "", `OSB dead-letter yoksayıldı: ${rows[0].shopierOrderId}`, req.admin?.sub);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
