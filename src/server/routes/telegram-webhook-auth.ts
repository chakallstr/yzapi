import { timingSafeEqual } from "crypto";

/**
 * Pure decision for whether a Telegram webhook request is authorised (K4).
 *
 * - In production a webhook secret is MANDATORY: if it is unset, every update is
 *   rejected (the webhook would otherwise be open and an attacker could forge
 *   updates to hijack a victim's API key delivery).
 * - In dev/test, an unset secret is permissive for local convenience.
 * - When a secret is configured, the provided token is compared in constant time
 *   (length-guarded so timingSafeEqual never throws on a length mismatch).
 */
export function isTelegramWebhookAuthorized(opts: {
  expectedSecret: string | undefined;
  providedToken: string | undefined;
  nodeEnv: string;
}): boolean {
  const expected = opts.expectedSecret;
  if (!expected) {
    if (opts.nodeEnv === "production") return false;
    return true;
  }
  const got = String(opts.providedToken ?? "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
