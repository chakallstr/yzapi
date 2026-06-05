// src/server/services/provider-failover.ts
// Cross-provider failover: eligibility taxonomy + execution wrapper.
// See docs/superpowers/specs/2026-06-05-provider-failover-design.md §3.3/§3.5.

import type { Response } from "express";
import { logger } from "../lib/logger.js";
import type { ProviderContext, ProviderChain } from "./provider-config-service.js";
import type { AttemptOptions } from "./closerouter-service.js";
import { shouldTryPrimary, recordReachable, recordFailure } from "./provider-circuit-breaker.js";

export const FAILOVER_PRIMARY_BUDGET_MS = 7000;

const FAILOVER_CONNECT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

// Only INFRASTRUCTURE failures are eligible (spec §3.3): 502/503/504 + connection-level
// (connect timeout/refused/DNS) + our single-shot budget abort. Any 4xx and any other
// 5xx (incl 500/501) are NOT eligible — the fallback would just return the same app error.
export function isFailoverEligible(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    status?: number;
    name?: string;
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  if (e.status === 502 || e.status === 503 || e.status === 504) return true;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true; // primary budget abort
  const code = e.cause?.code ?? e.code;
  if (code && FAILOVER_CONNECT_CODES.has(code)) return true;
  const msg = `${e.cause?.message ?? ""} ${e.message ?? ""}`.toLowerCase();
  if (msg.includes("connect timeout") || msg.includes("connecttimeout") || msg.includes("socket hang up")) {
    return true;
  }
  return false;
}

export type RunForward<T> = (ctx: ProviderContext, attempt?: AttemptOptions) => Promise<T>;
export interface FailoverOpts {
  res?: Response;
}

// Runs `runForward` against the chain's primary with a single-shot ~7s time-to-headers
// budget; on an ELIGIBLE, PRE-COMMIT failure it records a breaker failure and retries
// the fallback once. Reserve/settle stay OUTSIDE this wrapper (one reqId → no double
// charge). The breaker may short-circuit straight to the fallback while open.
export async function forwardWithFailover<T>(
  chain: ProviderChain,
  opts: FailoverOpts,
  runForward: RunForward<T>,
): Promise<{ result: T; servedBy: string | null; failedOver: boolean }> {
  const { primary, fallback } = chain;

  // No fallback configured → today's behavior, byte-identical (default attempt budget).
  if (!fallback) {
    const result = await runForward(primary, undefined);
    return { result, servedBy: primary.profileId, failedOver: false };
  }

  const key = primary.profileId ?? "_active";

  // Breaker open → skip the primary entirely, serve from fallback (no 7s tax).
  if (!shouldTryPrimary(key)) {
    const result = await runForward(fallback, undefined);
    return { result, servedBy: fallback.profileId, failedOver: true };
  }

  try {
    const result = await runForward(primary, { timeoutMs: FAILOVER_PRIMARY_BUDGET_MS, maxAttempts: 1 });
    recordReachable(key);
    return { result, servedBy: primary.profileId, failedOver: false };
  } catch (err) {
    const eligible = isFailoverEligible(err);
    // Post-commit guard: if the stream already started writing to the client we cannot
    // fail over (headers/bytes are out). For non-streaming, headersSent is false here.
    const committed = opts.res?.headersSent === true;
    if (eligible && !committed) {
      recordFailure(key);
      logger.warn(
        { from: primary.profileId, to: fallback.profileId, reason: (err as Error)?.message },
        "provider failover",
      );
      const result = await runForward(fallback, undefined);
      return { result, servedBy: fallback.profileId, failedOver: true };
    }
    // Non-eligible error = primary responded (4xx/app) → it is reachable → close breaker.
    if (!eligible) recordReachable(key);
    throw err;
  }
}
