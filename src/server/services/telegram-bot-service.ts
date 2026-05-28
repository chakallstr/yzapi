import { createHash, randomBytes } from "crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { apiKeys, telegramAccounts, telegramDeliveries, telegramLinkCodes, usageRecords, users } from "../db/schema.js";
import { env } from "../lib/env.js";
import { decryptApiKey, encryptApiKey, generateApiKey, hashApiKey } from "./api-key-service.js";

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
  rotated?: boolean;
}

export interface TelegramUsageMessageInput {
  balanceTL: number;
  usageItems: Array<{
    modelId: string;
    costTL: number;
    remainingTL: number | null;
    status: string;
    timestamp: Date | string;
  }>;
}

export interface TelegramMessageEditInput {
  chatId: string | number;
  messageId: string | number;
  text: string;
  replyMarkup?: unknown;
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

function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
        { text: "Yükleme Paneli", callback_data: "tg:topup:panel" },
      ],
      [
        { text: "Bakiye", callback_data: "tg:balance" },
        { text: "API Key", callback_data: "tg:apikey" },
      ],
      [
        { text: "Kullanım", callback_data: "tg:usage" },
        { text: "Destek", callback_data: "tg:support" },
      ],
    ],
  };
}

export function buildTelegramTopupPanelMenu(webAppUrl: string) {
  return {
    inline_keyboard: [
      [{ text: "Paneli Aç", web_app: { url: webAppUrl } }],
      [{ text: "Geri", callback_data: "tg:menu" }],
    ],
  };
}

export function buildTelegramApiKeyMenu() {
  return {
    inline_keyboard: [
      [{ text: "Değiştir", callback_data: "tg:apikey:change" }],
      [{ text: "Ana Menü", callback_data: "tg:menu" }],
    ],
  };
}

export function formatApiDeliveryMessage(input: ApiDeliveryMessageInput): string {
  const visibleKey = input.fullKey ?? input.maskedKey;
  const lines = [
    input.rotated ? "Yeni API key hazır. Eski key iptal edildi:" : input.created ? "API erişimin hazır:" : "Aktif API anahtarın:",
    `<code>${escapeTelegramHtml(visibleKey)}</code>`,
    "",
    `Bakiye: ${input.balanceTL.toFixed(2)} TL`,
    "API endpoint: https://api.yapayzekalab.org/v1",
  ];

  if (input.created) {
    lines.push("kopyala: Yukarıdaki kod alanına basılı tut.");
    lines.push("Anahtarı güvenli sakla.");
  } else {
    lines.push(input.fullKey
      ? "Değiştir mevcut key'i iptal eder ve yenisini üretir."
      : "Bu eski key'in tam hali saklanmıyor. Değiştir mevcut key'i iptal eder ve yenisini üretir.");
  }
  return lines.join("\n");
}

export function formatBalanceMessage(balanceTL: number): string {
  return `Güncel bakiyen: ${balanceTL.toFixed(2)} TL`;
}

function formatTelegramUsageTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTelegramUsageMessage(input: TelegramUsageMessageInput): string {
  const lines = [`Güncel bakiyen: ${input.balanceTL.toFixed(2)} TL`, ""];

  if (!input.usageItems.length) {
    lines.push("Henüz kullanım kaydı yok.");
    return lines.join("\n");
  }

  lines.push("Son kullanım:");
  for (const [index, item] of input.usageItems.entries()) {
    lines.push(
      `${index + 1}. ${item.modelId} · -${item.costTL.toFixed(2)} TL · ${item.status === "success" ? "Başarılı" : "Başarısız"}`,
    );
    lines.push(`Kalan: ${(item.remainingTL ?? input.balanceTL).toFixed(2)} TL · ${formatTelegramUsageTimestamp(item.timestamp)}`);
  }

  return lines.join("\n");
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: unknown,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<{ messageId?: number }> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured");

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      ...(parseMode ? { parse_mode: parseMode } : {}),
    }),
  });
  const data = await response.json() as { ok: boolean; result?: { message_id?: number }; description?: string };
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description ?? "unknown"}`);
  return { messageId: data.result?.message_id };
}

export async function editTelegramMessageText(input: TelegramMessageEditInput): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("Telegram bot token is not configured");

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chatId,
      message_id: input.messageId,
      text: input.text,
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    }),
  });
  const data = await response.json() as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram editMessageText failed: ${data.description ?? "unknown"}`);
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

async function createTelegramApiKeyForUser(userId: string, name: string): Promise<{ created: true; maskedKey: string; fullKey: string; apiKeyId: string }> {
  const { fullKey, prefix, maskedKey } = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const fullKeyCipher = encryptApiKey(fullKey);
  const inserted = await db.insert(apiKeys).values({
    userId,
    ad: name,
    maskedKey,
    keyHash,
    fullKeyCipher,
    prefix,
  }).returning({ id: apiKeys.id });

  await db.update(users).set({
    apiKeyCount: sql`${users.apiKeyCount} + 1`,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  return { created: true, maskedKey, fullKey, apiKeyId: inserted[0].id };
}

async function revokeActiveTelegramApiKeys(userId: string): Promise<void> {
  await db.update(apiKeys).set({ aktif: false }).where(and(eq(apiKeys.userId, userId), eq(apiKeys.aktif, true)));
}

export async function getOrCreateTelegramApiKey(userId: string): Promise<{ created: boolean; maskedKey: string; fullKey?: string; apiKeyId: string }> {
  const existing = await db
    .select({ id: apiKeys.id, maskedKey: apiKeys.maskedKey, fullKeyCipher: apiKeys.fullKeyCipher })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.aktif, true)))
    .limit(1);

  if (existing.length) {
    const fullKey = decryptApiKey(existing[0].fullKeyCipher) ?? undefined;
    return {
      created: false,
      maskedKey: existing[0].maskedKey,
      fullKey,
      apiKeyId: existing[0].id,
    };
  }

  return createTelegramApiKeyForUser(userId, "telegram-delivery");
}

export async function getTelegramUsageMessage(userId: string): Promise<string> {
  const balanceTL = await getUserBalanceTL(userId);
  const rows = await db
    .select({
      modelId: usageRecords.modelId,
      costTL: usageRecords.costTL,
      remainingTL: usageRecords.remainingTL,
      status: usageRecords.status,
      timestamp: usageRecords.timestamp,
    })
    .from(usageRecords)
    .where(eq(usageRecords.userId, userId))
    .orderBy(desc(usageRecords.timestamp))
    .limit(5);

  return formatTelegramUsageMessage({
    balanceTL,
    usageItems: rows.map((row) => ({
      modelId: row.modelId,
      costTL: Number(row.costTL),
      remainingTL: row.remainingTL === null ? null : Number(row.remainingTL),
      status: row.status,
      timestamp: row.timestamp,
    })),
  });
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
  forceNewKey?: boolean;
}): Promise<{ delivered: boolean; alreadyDelivered: boolean; createdKey?: boolean; maskedKey?: string }> {
  const existingDelivery = await existingPaymentDelivery(opts.paymentId);
  if (existingDelivery?.status === "delivered") {
    return { delivered: true, alreadyDelivered: true };
  }

  let key: Awaited<ReturnType<typeof getOrCreateTelegramApiKey>>;
  if (opts.forceNewKey) {
    await revokeActiveTelegramApiKeys(opts.userId);
    key = await createTelegramApiKeyForUser(opts.userId, "telegram-change");
  } else {
    key = await getOrCreateTelegramApiKey(opts.userId);
  }
  const balanceTL = await getUserBalanceTL(opts.userId);
  const message = formatApiDeliveryMessage({
    balanceTL,
    maskedKey: key.maskedKey,
    fullKey: key.fullKey,
    created: key.created,
    rotated: Boolean(opts.forceNewKey),
  });

  try {
    const sent = await sendTelegramMessage(opts.chatId, message, buildTelegramApiKeyMenu(), "HTML");
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
