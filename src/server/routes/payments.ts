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

function safeCryptomusWebhookLog(body: Record<string, unknown>) {
  const { uuid, order_id, status, amount, currency, to_currency } = body as Record<string, unknown>;
  return { uuid, order_id, status, amount, currency, to_currency };
}

function serializePayment(p: typeof payments.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    metod: p.metod,
    miktarTL: Number(p.miktarTL),
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

    const { miktarTL } = req.body as { miktarTL: number };
    const amountValidation = validatePaymentAmount(miktarTL, await getPaymentLimits());
    if (!amountValidation.ok) {
      res.status(amountValidation.status).json({ error: amountValidation.error });
      return;
    }

    const kdv = calcKdv(amountValidation.amount);

    // Load user info for form fields
    const userRows = await db.select({ email: users.email, adSoyad: users.adSoyad })
      .from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!userRows.length) { res.status(404).json({ error: "Kullanıcı bulunamadı." }); return; }
    const { email, adSoyad } = userRows[0];

    // Create payment row; its UUID becomes the platform_order_id (idempotency key)
    const inserted = await db.insert(payments).values({
      userId: req.user!.id,
      metod: "shopier",
      miktarTL: String(kdv.gross),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      durum: "bekliyor",
      // idempotencyKey will be set to the id itself after insert
    }).returning({ id: payments.id });

    const paymentId = inserted[0].id;

    // Set idempotencyKey = paymentId
    await db.update(payments).set({ idempotencyKey: paymentId }).where(eq(payments.id, paymentId));

    const checkout = buildCheckoutForm({
      userId: req.user!.id,
      paymentId,
      miktarTL: kdv.gross,
      email,
      adSoyad,
    });

    res.json({ paymentId, kdv, ...checkout });
  } catch (e) { next(e); }
});

// ── POST /api/payments/shopier/callback (PUBLIC — Shopier calls this) ─────────
router.post(
  "/shopier/callback",
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, string>;
      logger.info({ body }, "Shopier callback received");

      const result = verifyCallback(body);
      if (!result.valid) {
        logger.warn({ body }, "Shopier callback signature invalid");
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
      const credit = await creditUserBalance(
        payment.userId,
        paymentId,
        Number(payment.miktarTL),
        "shopier",
        paymentId,
        body,
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

    const { miktarTL } = req.body as { miktarTL: number };
    const amountValidation = validatePaymentAmount(miktarTL, await getPaymentLimits());
    if (!amountValidation.ok) {
      res.status(amountValidation.status).json({ error: amountValidation.error });
      return;
    }

    const kdv = calcKdv(amountValidation.amount);
    const referansKodu = generateReferansKodu();

    // Create payment row
    const paymentInserted = await db.insert(payments).values({
      userId: req.user!.id,
      metod: "iban",
      miktarTL: String(kdv.gross),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      durum: "bekliyor",
      idempotencyKey: referansKodu,
    }).returning({ id: payments.id });

    const paymentId = paymentInserted[0].id;

    // Create pending iban record
    await db.insert(pendingIbanPayments).values({
      userId: req.user!.id,
      miktarTL: String(kdv.gross),
      kdvTL: String(kdv.kdvTL),
      referansKodu,
    });

    res.json({
      paymentId,
      referansKodu,
      kdv,
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

    const { miktarTL } = req.body as { miktarTL: number };
    const amountValidation = validatePaymentAmount(miktarTL, await getPaymentLimits());
    if (!amountValidation.ok) {
      res.status(amountValidation.status).json({ error: amountValidation.error });
      return;
    }

    const kdv = calcKdv(amountValidation.amount);

    // Create payment row first
    const inserted = await db.insert(payments).values({
      userId: req.user!.id,
      metod: "cryptomus",
      miktarTL: String(kdv.gross),
      kdvTL: String(kdv.kdvTL),
      netTL: String(kdv.netTL),
      durum: "bekliyor",
    }).returning({ id: payments.id });

    const paymentId = inserted[0].id;

    // Create Cryptomus invoice
    const invoice = await createInvoice({ paymentId, miktarTL: kdv.gross });

    // Store invoice uuid as idempotency key
    await db.update(payments)
      .set({ idempotencyKey: invoice.uuid })
      .where(eq(payments.id, paymentId));

    res.json({ paymentId, url: invoice.url, uuid: invoice.uuid, kdv });
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
      const credit = await creditUserBalance(
        payment.userId,
        payment.id,
        Number(payment.miktarTL),
        "cryptomus",
        uuid,
        body,
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
    const credit = await creditUserBalance(
      pending.userId,
      payment.id,
      Number(pending.miktarTL),
      "iban",
      pending.referansKodu,
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
