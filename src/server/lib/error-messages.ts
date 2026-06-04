import {
  AppError,
  InsufficientBalanceError,
  RateLimitError,
  ModelNotFoundError,
  ModelDisabledError,
} from "./errors.js";
import type { Lang } from "../middleware/request-lang.js";

/**
 * Boundary localization for API error messages (TR/EN). Applied ONLY in the
 * error-handler — NO throw-site or service edits, so billing/pricing stay
 * untouched (DOKUNULMAZ).
 *
 * Regression-safe policy:
 *  - High-value classes (402 insufficient balance, 429 rate limit, model errors)
 *    are always localized — the concept matters, not the per-instance wording.
 *  - Generic classes (Unauthorized/NotFound/Conflict) are only re-localized when
 *    the thrown message is the known ENGLISH DEFAULT; custom (often Turkish)
 *    messages are preserved as-is.
 *  - Fixed-message branches (invalid JSON, internal 500) localize via MESSAGES.
 *  - Plain AppError / BadRequestError → null (keep the original message).
 */
export const MESSAGES = {
  insufficientBalance: {
    tr: "Yetersiz bakiye. Lütfen bakiye yükleyin.",
    en: "Insufficient balance. Please top up.",
  },
  rateLimit: {
    tr: "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
    en: "Too many requests. Please try again shortly.",
  },
  unauthorized: {
    tr: "Yetkisiz. Lütfen giriş yapın veya API anahtarınızı kontrol edin.",
    en: "Unauthorized. Please sign in or check your API key.",
  },
  notFound: {
    tr: "Bulunamadı.",
    en: "Not found.",
  },
  conflict: {
    tr: "Çakışma: işlem zaten yapılmış olabilir.",
    en: "Conflict: the operation may already be completed.",
  },
  modelNotFound: {
    tr: "Model bulunamadı: {model}",
    en: "Model not found: {model}",
  },
  modelDisabled: {
    tr: "Model şu an kapalı: {model}",
    en: "Model is currently disabled: {model}",
  },
  invalidJson: {
    tr: "Geçersiz JSON gövdesi.",
    en: "Invalid JSON body.",
  },
  internal: {
    tr: "Sunucu hatası. Lütfen daha sonra tekrar deneyin.",
    en: "Internal server error. Please try again later.",
  },
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function pickMessage(key: MessageKey, lang: Lang): string {
  return MESSAGES[key][lang] ?? MESSAGES[key].tr;
}

// Known English defaults thrown by errors.ts (no custom message) → safe to re-localize.
const ENGLISH_DEFAULTS: Record<string, MessageKey> = {
  Unauthorized: "unauthorized",
  "Not found": "notFound",
  Conflict: "conflict",
};

function extractModelId(message: string): string {
  const idx = message.indexOf(":");
  return idx >= 0 ? message.slice(idx + 1).trim() : "";
}

/**
 * Returns a localized message for `err`, or null to keep the original message.
 */
export function localizeError(err: unknown, lang: Lang): string | null {
  if (err instanceof InsufficientBalanceError) return pickMessage("insufficientBalance", lang);
  if (err instanceof RateLimitError) return pickMessage("rateLimit", lang);
  if (err instanceof ModelNotFoundError) {
    return pickMessage("modelNotFound", lang).replace("{model}", extractModelId(err.message));
  }
  if (err instanceof ModelDisabledError) {
    return pickMessage("modelDisabled", lang).replace("{model}", extractModelId(err.message));
  }
  if (err instanceof AppError) {
    const key = ENGLISH_DEFAULTS[err.message];
    if (key) return pickMessage(key, lang);
  }
  return null;
}
