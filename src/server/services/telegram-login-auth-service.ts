import { createHash, createHmac, timingSafeEqual } from "crypto";
import { env } from "../lib/env.js";
import type { TelegramActor } from "./telegram-bot-service.js";

const LOGIN_FIELDS = ["auth_date", "first_name", "id", "last_name", "photo_url", "username"] as const;

export class TelegramLoginAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramLoginAuthError";
  }
}

function readLoginString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function buildDataCheckString(payload: Record<string, string>): string {
  return LOGIN_FIELDS
    .filter((field) => payload[field])
    .sort()
    .map((field) => `${field}=${payload[field]}`)
    .join("\n");
}

export function validateTelegramLoginPayload(input: Record<string, unknown>): TelegramActor {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new TelegramLoginAuthError("Telegram bot token is not configured");
  }

  const payload = {
    id: readLoginString(input.id),
    first_name: readLoginString(input.first_name),
    last_name: readLoginString(input.last_name),
    username: readLoginString(input.username),
    photo_url: readLoginString(input.photo_url),
    auth_date: readLoginString(input.auth_date),
    hash: readLoginString(input.hash).toLowerCase(),
  };

  if (!/^\d+$/.test(payload.id) || !/^\d+$/.test(payload.auth_date) || !/^[a-f0-9]{64}$/.test(payload.hash)) {
    throw new TelegramLoginAuthError("Invalid Telegram login payload");
  }

  const authDate = Number(payload.auth_date);
  const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - authDate);
  if (ageSec > env.TELEGRAM_LOGIN_MAX_AGE_SEC) {
    throw new TelegramLoginAuthError("Telegram login payload expired");
  }

  const dataCheckString = buildDataCheckString({
    auth_date: payload.auth_date,
    first_name: payload.first_name,
    id: payload.id,
    last_name: payload.last_name,
    photo_url: payload.photo_url,
    username: payload.username,
  });
  const secretKey = createHash("sha256").update(env.TELEGRAM_BOT_TOKEN).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(payload.hash, "hex"))) {
    throw new TelegramLoginAuthError("Invalid Telegram login hash");
  }

  return {
    id: payload.id,
    username: payload.username || undefined,
    first_name: payload.first_name || undefined,
    last_name: payload.last_name || undefined,
  };
}
