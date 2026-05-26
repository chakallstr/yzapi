import { Router } from "express";
import express from "express";
import { db } from "../db/client.js";
import { payments, pendingIbanPayments, systemConfig, users, transactions } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { env } from "../lib/env.js";
import { userAuth } from "../middleware/user-auth.js";
import { adminAuth } from "../middleware/admin-auth.js";
import { calcKdv, creditUserBalance } from "../services/payment-common.js";
import { buildCheckoutForm, verifyCallback } from "../services/shopier-service.js";
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

// ── GET /api/payments/methods ─────────────────────────────────────────────────
router.get("/methods", userAuth, async (_req, res, next) => {
  try {
    const ibanEnabled = isIbanConfigured(env);
    const shopierEnabled = !!(env.SHOPIER_API_KEY && env.SHOPIER_API_SECRET);
    const cryptomusEnabled = !!(env.CRYPTOMUS_MERCHANT_ID && env.CRYPTOMUS_API_KEY);
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
router.post("/shopier/init", userAuth, async (req, res, next) => {
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
      logger.info({ callback: safeShopierCallbackLog(body) }, "Shopier callback received");

      const result = verifyCallback(body);
      if (!result.valid) {
        logger.warn({ callback: safeShopierCallbackLog(body) }, "Shopier callback signature invalid");
        adminPaymentNotificationEmail({
          title: "Shopier callback imza hatası",
          method: "shopier",
          reference: body.platform_order_id,
          status: "invalid_signature",
        }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
        res.redirect(`${env.APP_BASE_URL}/?payment=fail`);
        return;
      }

      if (result.status !== "success") {
        // Mark payment as failed
        if (result.platformOrderId) {
          await db.update(payments)
            .set({ durum: "basarisiz", tamamlanma: new Date() })
            .where(eq(payments.id, result.platformOrderId));
        }
        adminPaymentNotificationEmail({
          title: "Shopier ödeme başarısız",
          method: "shopier",
          reference: result.platformOrderId,
          status: result.status ?? "fail",
        }).catch((e: unknown) => logger.error({ err: e }, "admin payment notification failed"));
        res.redirect(`${env.APP_BASE_URL}/?payment=fail`);
        return;
      }

      const paymentId = result.platformOrderId!;
      const paymentRows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!paymentRows.length) {
        logger.warn({ paymentId }, "Shopier callback: payment not found");
        res.redirect(`${env.APP_BASE_URL}/?payment=fail`);
        return;
      }

      const payment = paymentRows[0];
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

      if (credit.success) {
        res.redirect(`${env.APP_BASE_URL}/?payment=success`);
      } else {
        res.redirect(`${env.APP_BASE_URL}/?payment=fail`);
      }
    } catch (e) { next(e); }
  }
);

// ── POST /api/payments/iban/init ─────────────────────────────────────────────
router.post("/iban/init", userAuth, async (req, res, next) => {
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
      aciklama: `Havale açıklamasına mutlaka referans kodunuzu yazın: ${referansKodu}`,
    });
  } catch (e) { next(e); }
});

// ── POST /api/payments/crypto/init ───────────────────────────────────────────
router.post("/crypto/init", userAuth, async (req, res, next) => {
  try {
    if (!env.CRYPTOMUS_MERCHANT_ID || !env.CRYPTOMUS_API_KEY) {
      res.status(503).json({ error: "Kripto ödeme yöntemi şu an kullanılamıyor." });
      return;
    }

    const { quote, amountValidation } = await buildQuoteFromRequest(req.body as Record<string, unknown>);
    if (!amountValidation.ok) {
      res.status(amountValidation.status).json({ error: amountValidation.error });
      return;
    }

    const kdv = calcKdv(quote.payableTL);

    // Create payment row first
    const inserted = await db.insert(payments).values({
      userId: req.user!.id,
      metod: "cryptomus",
      miktarTL: String(quote.payableTL),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      amountUsd: String(quote.amountUsd),
      payableTL: String(quote.payableTL),
      creditTL: String(quote.creditTL),
      kurAtPayment: String(quote.kur),
      roundingTL: String(quote.roundingTL),
      durum: "bekliyor",
    }).returning({ id: payments.id });

    const paymentId = inserted[0].id;

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
router.get("/me", userAuth, async (req, res, next) => {
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

export default router;
