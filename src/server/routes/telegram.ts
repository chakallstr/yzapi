import { Router, Request, Response, NextFunction } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { payments, systemConfig, telegramAccounts, telegramDeliveries, users } from "../db/schema.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { adminAuth } from "../middleware/admin-auth.js";
import { userAuth } from "../middleware/user-auth.js";
import { calcKdv, creditUserBalance } from "../services/payment-common.js";
import { buildUsdTopupQuote } from "../services/payment-pricing.js";
import {
  CryptoPayError,
  createCryptoPayInvoice,
  getPaidCryptoPayInvoice,
  verifyCryptoPayWebhook,
  type CryptoPayInvoicePayload,
} from "../services/crypto-pay-service.js";
import {
  answerTelegramCallback,
  buildTelegramMainMenu,
  buildTelegramTopupPanelMenu,
  consumeTelegramLinkCode,
  createTelegramLinkCode,
  deliverApiAccessToTelegramUser,
  editTelegramMessageText,
  formatBalanceMessage,
  getUserBalanceTL,
  getTelegramUsageMessage,
  parseTelegramCommand,
  sendTelegramMessage,
  upsertTelegramAccount,
  type TelegramActor,
} from "../services/telegram-bot-service.js";
import { TelegramWebAppAuthError, validateTelegramWebAppInitData } from "../services/telegram-webapp-auth-service.js";

const router = Router();
const TOPUP_QUICK_AMOUNTS_USD = [5, 10, 25];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RawRequest = Request & { rawBody?: string };

interface TelegramMessageUpdate {
  message?: {
    message_id?: number;
    text?: string;
    chat: { id: number | string };
    from?: TelegramActor;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramActor;
    message?: { message_id?: number; chat: { id: number | string } };
  };
}

function assertTelegramConfigured(res: Response): boolean {
  if (!env.TELEGRAM_BOT_TOKEN) {
    res.status(503).json({ error: "Telegram bot is not configured" });
    return false;
  }
  return true;
}

function telegramSecretAllowed(req: Request): boolean {
  if (!env.TELEGRAM_WEBHOOK_SECRET) return true;
  return req.header("x-telegram-bot-api-secret-token") === env.TELEGRAM_WEBHOOK_SECRET;
}

function cryptoPaySecretAllowed(req: Request): boolean {
  if (!env.CRYPTO_PAY_WEBHOOK_SECRET) return true;
  return req.params.secret === env.CRYPTO_PAY_WEBHOOK_SECRET;
}

function appBaseUrl(): string {
  return env.APP_BASE_URL.replace(/\/+$/, "");
}

function telegramTopupWebAppUrl(): string {
  return `${appBaseUrl()}/telegram/topup`;
}

function parseAmountUsd(value: unknown): number {
  const raw = typeof value === "number" ? String(value) : (typeof value === "string" ? value.trim() : "");
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(raw)) {
    throw new Error("Geçerli bir USD miktarı gir.");
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Geçerli bir USD miktarı gir.");
  }
  return amount;
}

function isTopupInputError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.startsWith("Minimum yükleme")
    || error.message.startsWith("Maksimum yükleme")
    || error.message.startsWith("Geçerli bir USD miktarı");
}

function validateWebAppActor(req: Request): TelegramActor {
  return validateTelegramWebAppInitData(req.header("x-telegram-init-data")).actor;
}

function sendWebAppAuthError(res: Response, error: unknown): boolean {
  if (error instanceof TelegramWebAppAuthError) {
    res.status(401).json({ error: "Invalid Telegram WebApp init data" });
    return true;
  }
  return false;
}

async function editOrSendTelegramMessage(input: {
  chatId: string | number;
  messageId?: number;
  text: string;
  replyMarkup: unknown;
}): Promise<void> {
  if (input.messageId) {
    try {
      await editTelegramMessageText({
        chatId: input.chatId,
        messageId: input.messageId,
        text: input.text,
        replyMarkup: input.replyMarkup,
      });
      return;
    } catch (error) {
      logger.warn({
        chatId: input.chatId,
        messageId: input.messageId,
        error: error instanceof Error ? error.message : String(error),
      }, "Telegram edit failed; sending a new message");
    }
  }
  await sendTelegramMessage(input.chatId, input.text, input.replyMarkup);
}

function safeProviderPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  return JSON.parse(JSON.stringify(payload, (_key, value) => {
    if (typeof value === "string" && value.length > 256) return `${value.slice(0, 256)}…`;
    return value;
  }));
}

async function paymentConfig() {
  const rows = await db.select({
    kur: systemConfig.kur,
    minBakiyeTL: systemConfig.minBakiyeTL,
    maxBakiyeTL: systemConfig.maxBakiyeTL,
  }).from(systemConfig).limit(1);

  const cfg = rows[0];
  return {
    kur: Number(cfg?.kur ?? 47.084289),
    minBakiyeTL: Number(cfg?.minBakiyeTL ?? 250),
    maxBakiyeTL: Number(cfg?.maxBakiyeTL ?? 50000),
  };
}

async function createTelegramTopup(userId: string, telegramId: string, amountUsd: number) {
  if (!env.CRYPTO_PAY_API_TOKEN) throw new CryptoPayError("Crypto Pay API token is not configured");

  const cfg = await paymentConfig();
  const quote = buildUsdTopupQuote(amountUsd, cfg.kur);

  if (quote.payableTL < cfg.minBakiyeTL) {
    throw new Error(`Minimum yükleme ${cfg.minBakiyeTL.toFixed(2)} TL`);
  }
  if (quote.payableTL > cfg.maxBakiyeTL) {
    throw new Error(`Maksimum yükleme ${cfg.maxBakiyeTL.toFixed(2)} TL`);
  }

  const kdv = calcKdv(quote.payableTL);
  const inserted = await db.insert(payments).values({
    userId,
    metod: "crypto_bot",
    miktarTL: String(quote.payableTL),
    kdvTL: String(kdv.kdvTL),
    netTL: String(kdv.netTL),
    amountUsd: String(quote.amountUsd),
    payableTL: String(quote.payableTL),
    creditTL: String(quote.creditTL),
    kurAtPayment: String(quote.kur),
    roundingTL: String(quote.roundingTL),
    durum: "bekliyor",
    providerPayload: { source: "telegram", telegramId } as any,
  }).returning({ id: payments.id });

  const paymentId = inserted[0].id;
  const invoice = await createCryptoPayInvoice({
    paymentId,
    amountUsd: quote.amountUsd,
    description: `YapayZekaLab ${quote.amountUsd.toFixed(2)} USD bakiye yükleme`,
  });

  await db.update(payments).set({
    idempotencyKey: invoice.invoiceId,
    providerPayload: { source: "telegram", telegramId, invoice: invoice.raw } as any,
  }).where(eq(payments.id, paymentId));

  return { paymentId, invoice, quote };
}

async function handleTopup(chatId: string | number, actor: TelegramActor, amountUsd: number): Promise<void> {
  const account = await upsertTelegramAccount(actor);
  const topup = await createTelegramTopup(account.userId, String(actor.id), amountUsd);
  const balanceTL = await getUserBalanceTL(account.userId);

  await sendTelegramMessage(
    chatId,
    `${formatBalanceMessage(balanceTL)}\n${topup.quote.amountUsd.toFixed(2)} USD bakiye yükleme invoice hazır.\nÖdeme sonrası API erişimi otomatik teslim edilir.`,
    {
      inline_keyboard: [
        [{ text: "Crypto Bot ile öde", url: topup.invoice.payUrl }],
        [{ text: "Bakiye", callback_data: "tg:balance" }],
      ],
    },
  );
}

async function handleTelegramMessage(update: TelegramMessageUpdate): Promise<void> {
  const message = update.message;
  if (!message?.from) return;

  const chatId = message.chat.id;
  const command = parseTelegramCommand(message.text);

  if (command.type === "link") {
    const linked = await consumeTelegramLinkCode(command.code, message.from);
    if (linked.status === "linked") {
      await sendTelegramMessage(chatId, "Telegram hesabın YapayZekaLab hesabına bağlandı.", buildTelegramMainMenu());
      return;
    }
    await sendTelegramMessage(
      chatId,
      linked.status === "conflict"
        ? "Bu Telegram hesabı başka bir YapayZekaLab hesabına bağlı. Destek ile iletişime geç."
        : "Link kodu geçersiz veya süresi dolmuş.",
      buildTelegramMainMenu(),
    );
    return;
  }

  if (command.type === "topup") {
    await handleTopup(chatId, message.from, command.amountUsd);
    return;
  }

  const account = await upsertTelegramAccount(message.from);
  const balance = await getUserBalanceTL(account.userId);
  await sendTelegramMessage(
    chatId,
    command.type === "start"
      ? `YapayZekaLab API botuna hoş geldin.\n${formatBalanceMessage(balance)}`
      : `Komut menüsü.\n${formatBalanceMessage(balance)}`,
    buildTelegramMainMenu(),
  );
}

async function handleTelegramCallback(update: TelegramMessageUpdate): Promise<void> {
  const callback = update.callback_query;
  if (!callback) return;

  await answerTelegramCallback(callback.id);
  const chatId = callback.message?.chat.id ?? callback.from.id;
  const data = callback.data ?? "";
  const account = await upsertTelegramAccount(callback.from);
  const balance = await getUserBalanceTL(account.userId);

  if (data === "tg:topup:panel") {
    const text = `${formatBalanceMessage(balance)}\nYükleme paneli hazır.\nUSD miktarını kendin seçebilir, Crypto Bot invoice alabilirsin.`;
    const replyMarkup = buildTelegramTopupPanelMenu(telegramTopupWebAppUrl());
    await editOrSendTelegramMessage({ chatId, messageId: callback.message?.message_id, text, replyMarkup });
    return;
  }

  if (data === "tg:menu") {
    const text = `Menü\n${formatBalanceMessage(balance)}`;
    const replyMarkup = buildTelegramMainMenu();
    await editOrSendTelegramMessage({ chatId, messageId: callback.message?.message_id, text, replyMarkup });
    return;
  }

  if (data.startsWith("tg:topup:")) {
    await handleTopup(chatId, callback.from, Number(data.split(":")[2]));
    return;
  }

  if (data === "tg:balance") {
    await sendTelegramMessage(chatId, formatBalanceMessage(balance), buildTelegramMainMenu());
    return;
  }

  if (data === "tg:apikey") {
    await deliverApiAccessToTelegramUser({
      userId: account.userId,
      telegramAccountId: account.telegramAccountId,
      chatId,
    });
    return;
  }

  if (data === "tg:apikey:change") {
    await deliverApiAccessToTelegramUser({
      userId: account.userId,
      telegramAccountId: account.telegramAccountId,
      chatId,
      forceNewKey: true,
    });
    return;
  }

  if (data === "tg:usage") {
    await sendTelegramMessage(chatId, await getTelegramUsageMessage(account.userId), buildTelegramMainMenu());
    return;
  }

  if (data === "tg:support") {
    await sendTelegramMessage(chatId, `${formatBalanceMessage(balance)}\n${env.TELEGRAM_SUPPORT_URL || "Destek: destek@yapayzekalab.com"}`, buildTelegramMainMenu());
    return;
  }

  await sendTelegramMessage(chatId, "Menü", buildTelegramMainMenu());
}

router.post("/webhook", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!assertTelegramConfigured(res)) return;
    if (!telegramSecretAllowed(req)) {
      res.status(401).json({ error: "Invalid Telegram webhook secret" });
      return;
    }

    const update = req.body as TelegramMessageUpdate;
    if (update.message) await handleTelegramMessage(update);
    if (update.callback_query) await handleTelegramCallback(update);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

async function handleCryptoPayWebhook(req: RawRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!cryptoPaySecretAllowed(req)) {
      res.status(401).json({ error: "Invalid Crypto Pay webhook secret" });
      return;
    }

    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    if (!verifyCryptoPayWebhook(rawBody, req.headers)) {
      res.status(401).json({ error: "Invalid Crypto Pay signature" });
      return;
    }

    const invoice = getPaidCryptoPayInvoice(req.body);
    if (!invoice) {
      res.json({ ok: true });
      return;
    }

    const payment = await findCryptoBotPayment(invoice);
    if (!payment) {
      logger.warn({ invoiceId: invoice.invoice_id, payload: invoice.payload }, "Crypto Pay webhook payment not found");
      res.json({ ok: true });
      return;
    }

    if (!amountMatches(payment, invoice)) {
      logger.warn({ paymentId: payment.id, invoice }, "Crypto Pay webhook amount mismatch");
      res.json({ ok: true });
      return;
    }

    const creditTL = Number(payment.creditTL ?? payment.miktarTL);
    const credit = await creditUserBalance(
      payment.userId,
      payment.id,
      creditTL,
      "crypto_bot",
      String(invoice.invoice_id),
      safeProviderPayload(req.body),
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

    await deliverPaidPayment(payment.id, payment.userId).catch((err) => {
      logger.error({ err, paymentId: payment.id }, "Telegram API delivery failed after Crypto Pay credit");
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

async function findCryptoBotPayment(invoice: CryptoPayInvoicePayload) {
  const invoiceId = String(invoice.invoice_id);
  const paymentId = invoice.payload && UUID_RE.test(invoice.payload) ? invoice.payload : undefined;

  const where = paymentId
    ? or(eq(payments.idempotencyKey, invoiceId), eq(payments.id, paymentId))
    : eq(payments.idempotencyKey, invoiceId);

  const rows = await db.select().from(payments).where(where).limit(1);
  const payment = rows[0];
  return payment?.metod === "crypto_bot" ? payment : null;
}

function amountMatches(payment: typeof payments.$inferSelect, invoice: CryptoPayInvoicePayload): boolean {
  if (invoice.fiat && invoice.fiat !== "USD") return false;
  const expected = Number(payment.amountUsd ?? 0);
  const actual = Number(invoice.amount ?? 0);
  return Math.abs(expected - actual) <= 0.01;
}

async function deliverPaidPayment(paymentId: string, userId: string): Promise<void> {
  const accountRows = await db.select().from(telegramAccounts).where(eq(telegramAccounts.userId, userId)).limit(1);
  const account = accountRows[0];
  if (!account) {
    await db.insert(telegramDeliveries).values({
      userId,
      paymentId,
      deliveryType: "api_key",
      status: "failed",
      lastError: "Telegram account not found",
      attemptCount: 1,
    });
    return;
  }

  await deliverApiAccessToTelegramUser({
    userId,
    telegramAccountId: account.id,
    chatId: account.telegramId,
    paymentId,
  });
}

router.post("/crypto-pay/webhook", handleCryptoPayWebhook);
router.post("/crypto-pay/webhook/:secret", handleCryptoPayWebhook);

router.get("/webapp/me", async (req, res, next) => {
  try {
    if (!assertTelegramConfigured(res)) return;
    const actor = validateWebAppActor(req);
    const account = await upsertTelegramAccount(actor);
    const balanceTL = await getUserBalanceTL(account.userId);
    const cfg = await paymentConfig();

    res.json({
      user: {
        telegramId: String(actor.id),
        username: actor.username ?? null,
        firstName: actor.first_name ?? null,
        lastName: actor.last_name ?? null,
      },
      balanceTL,
      kur: cfg.kur,
      minBakiyeTL: cfg.minBakiyeTL,
      maxBakiyeTL: cfg.maxBakiyeTL,
      quickAmountsUsd: TOPUP_QUICK_AMOUNTS_USD,
    });
  } catch (e) {
    if (sendWebAppAuthError(res, e)) return;
    next(e);
  }
});

router.post("/webapp/invoices", async (req, res, next) => {
  try {
    if (!assertTelegramConfigured(res)) return;
    if (!env.CRYPTO_PAY_API_TOKEN) {
      res.status(503).json({ error: "Crypto Pay is not configured" });
      return;
    }

    const actor = validateWebAppActor(req);
    const amountUsd = parseAmountUsd(req.body?.amountUsd);
    const account = await upsertTelegramAccount(actor);
    const topup = await createTelegramTopup(account.userId, String(actor.id), amountUsd);

    res.json({
      paymentId: topup.paymentId,
      invoiceId: topup.invoice.invoiceId,
      payUrl: topup.invoice.payUrl,
      amountUsd: topup.quote.amountUsd,
      payableTL: topup.quote.payableTL,
      creditTL: topup.quote.creditTL,
      kur: topup.quote.kur,
      roundingTL: topup.quote.roundingTL,
    });
  } catch (e) {
    if (sendWebAppAuthError(res, e)) return;
    if (isTopupInputError(e)) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Geçerli bir USD miktarı gir." });
      return;
    }
    if (e instanceof CryptoPayError) {
      res.status(503).json({ error: "Crypto Pay invoice oluşturulamadı." });
      return;
    }
    next(e);
  }
});

router.post("/link-code", userAuth, async (req, res, next) => {
  try {
    const result = await createTelegramLinkCode(req.user!.id);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get("/admin/accounts", adminAuth, async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: telegramAccounts.id,
        userId: telegramAccounts.userId,
        telegramId: telegramAccounts.telegramId,
        username: telegramAccounts.username,
        firstName: telegramAccounts.firstName,
        lastName: telegramAccounts.lastName,
        linkedAt: telegramAccounts.linkedAt,
        userEmail: users.email,
        bakiyeTL: users.bakiyeTL,
      })
      .from(telegramAccounts)
      .leftJoin(users, eq(telegramAccounts.userId, users.id));

    res.json(rows.map((row) => ({ ...row, bakiyeTL: Number(row.bakiyeTL ?? 0) })));
  } catch (e) {
    next(e);
  }
});

router.get("/admin/deliveries", adminAuth, async (_req, res, next) => {
  try {
    const rows = await db.select().from(telegramDeliveries);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
