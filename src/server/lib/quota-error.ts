import { AppError } from "./errors.js";
import type { Lang } from "../middleware/request-lang.js";

/**
 * Fix A: müşteri/paket kotası (CF ünite / bakiye) bitince temiz, dialect-tipli 429
 * üret — istemci "boş boş bekleyip" tekrar denemesin, net "Bakiyeniz bitti" görsün.
 *
 * İki tetik:
 *  1. Yerel-tespit: paket sayacı/CF aynası tükenmiş → proxy `QuotaExhaustedError` fırlatır.
 *  2. Upstream CF 403 LIMIT_EXCEEDED → catch'te `isCfQuotaError` ile tanınır.
 * Her ikisi de catch bloğunda `quotaExhaustedBody` ile 429'a çevrilir (Retry-After YOK).
 */

// 429 — kota bitti. errorHandler fallback'i de 429 verir; proxy catch'leri dialect-tipler.
export class QuotaExhaustedError extends AppError {
  constructor(message: string) {
    super(429, message);
    this.name = "QuotaExhaustedError";
  }
}

/**
 * CF upstream'in kota-tükendi 403'ünü tanı. forwardChat bunu `err.status=403` +
 * `err.body={CF gövdesi}` olarak fırlatır. SADECE gerçek kota sinyalinde true döner —
 * sıradan bir 403 (auth/forbidden) yanlışlıkla "bakiyeniz bitti"ye çevrilmez.
 */
export function isCfQuotaError(err: unknown): boolean {
  const e = err as { status?: number; body?: unknown } | null | undefined;
  if (!e || e.status !== 403) return false;
  const body = e.body as Record<string, any> | null | undefined;
  if (!body || typeof body !== "object") return false;

  const QUOTA_RE = /limit[_\s-]?exceeded|insufficient[_\s-]?quota/i;
  const code = body?.error?.code ?? body?.code;
  if (typeof code === "string" && QUOTA_RE.test(code)) return true;
  const msg = body?.error?.message ?? body?.message;
  if (typeof msg === "string" && QUOTA_RE.test(msg)) return true;

  // CF LIMIT_EXCEEDED gövdesi: error.details.remaining (veya üst-düzey details.remaining).
  // Birincil sinyal yukarıdaki code/message regex'i; bu yalnız onlar yoksa devreye girer.
  // remaining<=0 → kota bitti. (Bilinen tek CF 403 şekli bu; alakasız bir 403 gövdesinde
  // remaining alanı taşıma ihtimali yok denecek kadar düşük.)
  const rem = body?.error?.details?.remaining ?? body?.details?.remaining;
  if (rem != null && Number.isFinite(Number(rem)) && Number(rem) <= 0) return true;

  return false;
}

export type ApiDialect = "openai" | "anthropic";

const QUOTA_MSG: Record<Lang, string> = {
  tr: "Bakiyeniz/paket kotanız bitti. Lütfen paketinizi yenileyin ya da bakiye yükleyin.",
  en: "Your balance/package quota is finished. Please renew your package or top up.",
};

export function quotaExhaustedMessage(lang: Lang): string {
  return QUOTA_MSG[lang] ?? QUOTA_MSG.tr;
}

/**
 * Dialect-tipli 429 gövdesi:
 *  - openai (chat/responses): { error: { message, type:"insufficient_quota", code } }
 *  - anthropic (/messages):   { type:"error", error:{ type:"rate_limit_error", message } }
 * Retry-After / retryAfter YOK — SDK'lar sonsuz bekle-tekrar döngüsüne girmesin, mesajı göstersin.
 */
export function quotaExhaustedBody(dialect: ApiDialect, lang: Lang): Record<string, unknown> {
  const message = quotaExhaustedMessage(lang);
  if (dialect === "anthropic") {
    return { type: "error", error: { type: "rate_limit_error", message } };
  }
  return { error: { message, type: "insufficient_quota", code: "insufficient_quota" } };
}

// proxy catch'lerinin ihtiyaç duyduğu minimal Response yüzeyi (express.Response uyumlu).
interface QuotaResponse {
  headersSent: boolean;
  status(code: number): QuotaResponse;
  json(body: unknown): unknown;
}

/**
 * Hata kota-tükendi ise (yerel `QuotaExhaustedError` VEYA upstream CF kota-403'ü) temiz
 * dialect-tipli 429 yazar ve true döner. Stream başlamışsa (headersSent) statü değişemez →
 * dokunmaz, false döner (çağıran raw passthrough'a düşer). Kota-dışı hata → false.
 */
export function emitQuotaExhausted(
  err: unknown,
  res: QuotaResponse,
  dialect: ApiDialect,
  lang: Lang,
): boolean {
  if (res.headersSent) return false;
  if (err instanceof QuotaExhaustedError || isCfQuotaError(err)) {
    res.status(429).json(quotaExhaustedBody(dialect, lang));
    return true;
  }
  return false;
}
