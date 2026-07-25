import { AppError } from "./errors.js";
import type { Lang } from "../middleware/request-lang.js";
import type { ApiDialect } from "./quota-error.js";

/**
 * Context-window aşımı için temiz, dialect-tipli hata (quota-error.ts deseninin ikizi).
 *
 * NEDEN: request-guard bağlam-penceresi aşımını jenerik `{error:"<string>",code:400}` ile
 * reddediyordu → Codex CLI / OpenAI-SDK bunu context hatası olarak TANIMIYOR → auto-compaction
 * TETİKLENMİYOR → aynı dev isteği körlemesine tekrar atıyor (kanıt: prod logunda 8 tekrar).
 * ChatGPT/Codex backend'inin GERÇEK kodu `context_too_large` (canlı seat probe'uyla ölçüldü:
 * 1.5M token → 400 `{error:{message,type:"invalid_request_error",code:"context_too_large"}}`).
 * Bu koda çevrilince Codex kendi compaction'ını tetikler; upstream'in kendi 400'ü de zaten
 * `forwardUpstreamError` ile verbatim geçiyor → guard-erken-red ile passthrough tutarlı olur.
 */
export class ContextTooLargeError extends AppError {
  readonly contextLimitTokens?: number;
  constructor(message: string, contextLimitTokens?: number) {
    super(400, message);
    this.name = "ContextTooLargeError";
    this.contextLimitTokens = contextLimitTokens;
  }
}

const CONTEXT_MSG: Record<Lang, string> = {
  tr: "İstek modelin bağlam penceresini aşıyor. Codex kullanıyorsanız /compact çalıştırın veya yeni bir oturum başlatın; diğer istemcilerde konuşmayı kısaltın.",
  en: "The request exceeds the model's context window. In Codex run /compact or start a new session; in other clients shorten the conversation.",
};

export function contextTooLargeMessage(lang: Lang): string {
  return CONTEXT_MSG[lang] ?? CONTEXT_MSG.tr;
}

/**
 * Dialect-tipli 400 gövdesi (context aşımı):
 *  - openai (chat/responses): { error: { message, type:"invalid_request_error", code:"context_too_large" } }
 *    ← makine-tetiği `code`; ChatGPT/Codex backend'inin GERÇEK şekliyle birebir (param YOK).
 *  - anthropic (/messages):   { type:"error", error:{ type:"invalid_request_error", message } }
 */
export function contextTooLargeBody(dialect: ApiDialect, lang: Lang): Record<string, unknown> {
  const message = contextTooLargeMessage(lang);
  if (dialect === "anthropic") {
    return { type: "error", error: { type: "invalid_request_error", message } };
  }
  return { error: { message, type: "invalid_request_error", code: "context_too_large" } };
}

// proxy catch'lerinin ihtiyaç duyduğu minimal Response yüzeyi (express.Response uyumlu; quota-error ile aynı).
interface ContextResponse {
  headersSent: boolean;
  status(code: number): ContextResponse;
  json(body: unknown): unknown;
}

/**
 * Hata bir `ContextTooLargeError` ise temiz dialect-tipli 400 yazar ve true döner. Stream
 * başlamışsa (headersSent) statü değişemez → dokunmaz, false (çağıran raw passthrough'a düşer).
 * Context-dışı hata → false (emitQuotaExhausted/forwardUpstreamError/next zinciri devam eder).
 */
export function emitContextTooLarge(
  err: unknown,
  res: ContextResponse,
  dialect: ApiDialect,
  lang: Lang,
): boolean {
  if (res.headersSent) return false;
  if (err instanceof ContextTooLargeError) {
    res.status(400).json(contextTooLargeBody(dialect, lang));
    return true;
  }
  return false;
}
