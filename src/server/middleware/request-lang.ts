import { Request, Response, NextFunction } from "express";

export type Lang = "tr" | "en";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      lang?: Lang;
    }
  }
}

/**
 * Resolve the request language for user-facing API responses.
 * Priority: explicit `X-Lang` header (tr|en) → first `Accept-Language` tag →
 * default `tr`. The frontend sends `X-Lang` from the user's chosen toggle so the
 * response language follows the UI even when the browser locale differs.
 * Read-only: never touches money/business logic.
 */
export function requestLang(req: Request, _res: Response, next: NextFunction): void {
  let lang: Lang = "tr";
  const explicit = String(req.headers["x-lang"] ?? "").trim().toLowerCase();
  if (explicit === "tr" || explicit === "en") {
    lang = explicit;
  } else {
    const accept = String(req.headers["accept-language"] ?? "").toLowerCase();
    const first = (accept.split(",")[0] ?? "").trim();
    if (first.startsWith("en")) lang = "en";
    else if (first.startsWith("tr")) lang = "tr";
    // anything else → default tr
  }
  req.lang = lang;
  next();
}

/** Narrow an unknown value to a supported Lang, defaulting to tr. */
export function asLang(value: unknown): Lang {
  return value === "en" ? "en" : "tr";
}
