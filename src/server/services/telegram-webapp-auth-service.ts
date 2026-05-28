import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../lib/env.js";
import type { TelegramActor } from "./telegram-bot-service.js";

const DEFAULT_MAX_AGE_SEC = 24 * 60 * 60;
const DEFAULT_FUTURE_SKEW_SEC = 60;

export class TelegramWebAppAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramWebAppAuthError";
  }
}

export interface TelegramWebAppInitDataResult {
  actor: TelegramActor;
  authDate: Date;
  queryId?: string;
}

export interface TelegramWebAppInitDataOptions {
  botToken?: string;
  now?: Date;
  maxAgeSec?: number;
  maxFutureSkewSec?: number;
}

function fail(message: string): never {
  throw new TelegramWebAppAuthError(message);
}

function safeHexEqual(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]+$/i.test(actual)) return false;
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseActor(rawUser: string | null): TelegramActor {
  if (!rawUser) fail("Telegram WebApp user missing");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUser);
  } catch {
    fail("Telegram WebApp user is invalid JSON");
  }

  if (!parsed || typeof parsed !== "object") fail("Telegram WebApp user is invalid");
  const record = parsed as Record<string, unknown>;
  const id = record.id;
  if ((typeof id !== "number" && typeof id !== "string") || String(id).trim() === "") {
    fail("Telegram WebApp user id missing");
  }

  return {
    id,
    username: typeof record.username === "string" ? record.username : undefined,
    first_name: typeof record.first_name === "string" ? record.first_name : undefined,
    last_name: typeof record.last_name === "string" ? record.last_name : undefined,
  };
}

export function validateTelegramWebAppInitData(
  initData: string | undefined,
  options: TelegramWebAppInitDataOptions = {},
): TelegramWebAppInitDataResult {
  const botToken = options.botToken ?? env.TELEGRAM_BOT_TOKEN;
  if (!botToken) fail("Telegram bot token is not configured");
  if (!initData || typeof initData !== "string") fail("Telegram WebApp init data missing");

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) fail("Telegram WebApp hash missing");

  const seen = new Set<string>();
  const entries: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    if (seen.has(key)) fail("Telegram WebApp init data has duplicate keys");
    seen.add(key);
    entries.push([key, value]);
  }
  if (!entries.length) fail("Telegram WebApp init data empty");

  const dataCheckString = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeHexEqual(receivedHash, expectedHash)) fail("Telegram WebApp hash invalid");

  const authDateSec = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateSec) || authDateSec <= 0) fail("Telegram WebApp auth_date missing");

  const nowSec = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const maxAgeSec = options.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;
  const maxFutureSkewSec = options.maxFutureSkewSec ?? DEFAULT_FUTURE_SKEW_SEC;
  if (nowSec - authDateSec > maxAgeSec) fail("Telegram WebApp init data expired");
  if (authDateSec - nowSec > maxFutureSkewSec) fail("Telegram WebApp auth_date is in the future");

  return {
    actor: parseActor(params.get("user")),
    authDate: new Date(authDateSec * 1000),
    queryId: params.get("query_id") ?? undefined,
  };
}
