import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { apiKeys, telegramAccounts, telegramDeliveries, telegramLinkCodes, users } from "../db/schema.js";
import { env } from "../lib/env.js";
import { generateApiKey, hashApiKey } from "./api-key-service.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export type TelegramCommand =
  | { type: "start" }
  | { type: "link"; code: string }
  | { type: "topup"; amountUsd: number }
  | { type: "menu" };

export interface TelegramActor {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface ApiDeliveryMessageInput {
  balanceTL: number;
  maskedKey: string;
  fullKey?: string;
  created: boolean;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function telegramId(actor: TelegramActor): string {
  return String(actor.id);
}

function displayName(actor: TelegramActor): string {
  return [actor.first_name, actor.last_name].filter(Boolean).join(" ").trim() || actor.username || `Telegram ${telegramId(actor)}`;
}

function internalTelegramEmail(actor: TelegramActor): string {
  return `tg_${telegramId(actor)}@telegram.yapayzekalab.local`;
}

export function parseTelegramCommand(text?: string): TelegramCommand {
  const trimmed = (text ?? "").trim();
  if (trimmed === "/start" || trimmed.startsWith("/start ")) return { type: "start" };

  const link = trimmed.match(/^\/link\s+([A-Za-z0-9_-]{4,64})$/i);
  if (link) return { type: "link", code: link[1] };

  const topup = trimmed.match(/^\/topup\s+([0-9]+(?:\.[0-9]{1,2})?)$/i);
  if (topup) return { type: "topup", amountUsd: Number(topup[1]) };

  return { type: "menu" };
}

export function buildTelegramMainMenu() {
  return {
    inline_keyboard: [
      [
        { text: "Bakiye", callback_data: "tg:balance" },
        { text: "API Key", callback_data: "tg:apikey" },
      ],
      [
        { text: "5 USD yükle", callback_data: "tg:topup:5" },
        { text: "10 USD yükle", callback_data: "tg:topup:10" },
        { text: "25 USD yükle", callback_data: "tg:topup:25" },
      ],
      [
        { text: "Kullanım", callback_data: "tg:usage" },
        { text: "Destek", callback_data: "tg:support" },
      ],
    ],
  };
}

export function formatApiDeliveryMessage(input: ApiDeliveryMessageInput): string {
  const lines = [
    input.created ? "API erişimin hazır. Bu anahtar tek sefer tam gösterilir:" : "Aktif API anahtarın:",
    input.created && input.fullKey ? input.fullKey : input.maskedKey,
    "",
    `Bakiye: ${input.balanceTL.toFixed(2)} TL`,
    "API endpoint: https://api.yapayzekalab.org/v1",
  ];

  if (input.created) lines.push("Anahtarı güvenli sakla; panelde daha sonra sadece maskeli görünür.");
  return lines.join("\n");
}

export function formatBalanceMessage(balanceTL: number): string {
  return `Güncel bakiyen: ${balanceTL.toFixed(2)} TL`;
}

export async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: unknown): Promise<{ messageId?: number }> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured");

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  const data = await response.json() as { ok: boolean; result?: { message_id?: number }; description?: string };
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description ?? "unknown"}`);
  return { messageId: data.result?.message_id };
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured");

  await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  });
}

export async function upsertTelegramAccount(actor: TelegramActor): Promise<{ userId: string; telegramAccountId: string; createdUser: boolean }> {
  const id = telegramId(actor);
  const existing = await db.select().from(telegramAccounts).where(eq(telegramAccounts.telegramId, id)).limit(1);

  if (existing.length) {
    await db.update(telegramAccounts).set({
      username: actor.username ?? null,
      firstName: actor.first_name ?? null,
      lastName: actor.last_name ?? null,
      updatedAt: new Date(),
    }).where(eq(telegramAccounts.id, existing[0].id));
    return { userId: existing[0].userId, telegramAccountId: existing[0].id, createdUser: false };
  }

  const insertedUsers = await db.insert(users).values({
    email: internalTelegramEmail(actor),
    adSoyad: displayName(actor),
    bakiyeTL: "0",
    durum: "aktif",
    plan: "ucretsiz",
  }).returning({ id: users.id });

  const userId = insertedUsers[0].id;
  const insertedAccounts = await db.insert(telegramAccounts).values({
    userId,
    telegramId: id,
    username: actor.username ?? null,
    firstName: actor.first_name ?? null,
    lastName: actor.last_name ?? null,
  }).returning({ id: telegramAccounts.id });

  return { userId, telegramAccountId: insertedAccounts[0].id, createdUser: true };
}

export async function createTelegramLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = randomBytes(6).toString("base64url").toUpperCase();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

  await db.insert(telegramLinkCodes).values({
    userId,
    codeHash: sha256(code),
    expiresAt,
  });

  return { code, expiresAt };
}

export async function consumeTelegramLinkCode(
  code: string,
  actor: TelegramActor,
): Promise<{ status: "linked"; userId: string; telegramAccountId: string } | { status: "not_found" | "conflict" }> {
  const codeRows = await db
    .select()
    .from(telegramLinkCodes)
    .where(and(
      eq(telegramLinkCodes.codeHash, sha256(code.trim().toUpperCase())),
      isNull(telegramLinkCodes.consumedAt),
      gt(telegramLinkCodes.expiresAt, new Date()),
    ))
    .limit(1);

  if (!codeRows.length) return { status: "not_found" };

  const id = telegramId(actor);
  const existingAccount = await db.select().from(telegramAccounts).where(eq(telegramAccounts.telegramId, id)).limit(1);
  if (existingAccount.length && existingAccount[0].userId !== codeRows[0].userId) return { status: "conflict" };

  const account = existingAccount.length
    ? (await db.update(telegramAccounts).set({
      userId: codeRows[0].userId,
      username: actor.username ?? null,
      firstName: actor.first_name ?? null,
      lastName: actor.last_name ?? null,
      linkedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(telegramAccounts.id, existingAccount[0].id)).returning({ id: telegramAccounts.id }))[0]
    : (await db.insert(telegramAccounts).values({
      userId: codeRows[0].userId,
      telegramId: id,
      username: actor.username ?? null,
      firstName: actor.first_name ?? null,
      lastName: actor.last_name ?? null,
    }).returning({ id: telegramAccounts.id }))[0];

  await db.update(telegramLinkCodes).set({
    consumedAt: new Date(),
    telegramId: id,
  }).where(eq(telegramLinkCodes.id, codeRows[0].id));

  return { status: "linked", userId: codeRows[0].userId, telegramAccountId: account.id };
}

export async function getUserBalanceTL(userId: string): Promise<number> {
  const rows = await db.select({ bakiyeTL: users.bakiyeTL }).from(users).where(eq(users.id, userId)).limit(1);
  return Number(rows[0]?.bakiyeTL ?? 0);
}

export async function getOrCreateTelegramApiKey(userId: string): Promise<{ created: boolean; maskedKey: string; fullKey?: string; apiKeyId: string }> {
  const existing = await db
    .select({ id: apiKeys.id, maskedKey: apiKeys.maskedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.aktif, true)))
    .limit(1);

  if (existing.length) {
    return { created: false, maskedKey: existing[0].maskedKey, apiKeyId: existing[0].id };
  }

  const { fullKey, prefix, maskedKey } = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const inserted = await db.insert(apiKeys).values({
    userId,
    ad: "telegram-delivery",
    maskedKey,
    keyHash,
    prefix,
  }).returning({ id: apiKeys.id });

  await db.update(users).set({
    apiKeyCount: sql`${users.apiKeyCount} + 1`,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  return { created: true, maskedKey, fullKey, apiKeyId: inserted[0].id };
}

async function existingPaymentDelivery(paymentId?: string): Promise<{ id: string; status: string } | null> {
  if (!paymentId) return null;
  const rows = await db
    .select({ id: telegramDeliveries.id, status: telegramDeliveries.status })
    .from(telegramDeliveries)
    .where(and(
      eq(telegramDeliveries.paymentId, paymentId),
      eq(telegramDeliveries.deliveryType, "api_key"),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function deliverApiAccessToTelegramUser(opts: {
  userId: string;
  telegramAccountId: string;
  chatId: string | number;
  paymentId?: string;
}): Promise<{ delivered: boolean; alreadyDelivered: boolean; createdKey?: boolean; maskedKey?: string }> {
  const existingDelivery = await existingPaymentDelivery(opts.paymentId);
  if (existingDelivery?.status === "delivered") {
    return { delivered: true, alreadyDelivered: true };
  }

  const key = await getOrCreateTelegramApiKey(opts.userId);
  const balanceTL = await getUserBalanceTL(opts.userId);
  const message = formatApiDeliveryMessage({
    balanceTL,
    maskedKey: key.maskedKey,
    fullKey: key.fullKey,
    created: key.created,
  });

  try {
    const sent = await sendTelegramMessage(opts.chatId, message, buildTelegramMainMenu());
    const deliveryValues = {
      userId: opts.userId,
      telegramAccountId: opts.telegramAccountId,
      paymentId: opts.paymentId,
      deliveryType: "api_key",
      status: "delivered",
      maskedKey: key.maskedKey,
      messageId: sent.messageId === undefined ? null : String(sent.messageId),
      deliveredAt: new Date(),
      attemptCount: existingDelivery ? sql`${telegramDeliveries.attemptCount} + 1` : 1,
      updatedAt: new Date(),
    };
    if (existingDelivery) {
      await db.update(telegramDeliveries).set(deliveryValues).where(eq(telegramDeliveries.id, existingDelivery.id));
    } else {
      await db.insert(telegramDeliveries).values(deliveryValues);
    }
    return { delivered: true, alreadyDelivered: false, createdKey: key.created, maskedKey: key.maskedKey };
  } catch (error) {
    const deliveryValues = {
      userId: opts.userId,
      telegramAccountId: opts.telegramAccountId,
      paymentId: opts.paymentId,
      deliveryType: "api_key",
      status: "failed",
      maskedKey: key.maskedKey,
      lastError: error instanceof Error ? error.message : String(error),
      attemptCount: existingDelivery ? sql`${telegramDeliveries.attemptCount} + 1` : 1,
      updatedAt: new Date(),
    };
    if (existingDelivery) {
      await db.update(telegramDeliveries).set(deliveryValues).where(eq(telegramDeliveries.id, existingDelivery.id));
    } else {
      await db.insert(telegramDeliveries).values(deliveryValues);
    }
    throw error;
  }
}
