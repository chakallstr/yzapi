// src/server/services/provider-circuit-breaker.ts
// In-memory circuit breaker for provider failover, keyed by PRIMARY profile id.
// Single Node process → module-level state is coherent. Reflects PRIMARY
// reachability only; fallback outcomes NEVER touch it.
// See docs/superpowers/specs/2026-06-05-provider-failover-design.md §3.4.

export const BREAKER_FAILURE_THRESHOLD = 3;
export const BREAKER_COOLDOWN_MS = 60_000;

type BreakerState = "closed" | "open" | "half-open";
interface Entry {
  state: BreakerState;
  failures: number;
  openedAt: number;
  halfOpenInFlight: boolean;
}

const entries = new Map<string, Entry>();

function get(key: string): Entry {
  let e = entries.get(key);
  if (!e) {
    e = { state: "closed", failures: 0, openedAt: 0, halfOpenInFlight: false };
    entries.set(key, e);
  }
  return e;
}

// May the next request try the PRIMARY? Sets halfOpenInFlight SYNCHRONOUSLY (no
// await between decision and flag-set) so concurrent half-open requests yield
// exactly one probe; the rest go to the fallback.
export function shouldTryPrimary(key: string, now: number = Date.now()): boolean {
  const e = get(key);
  if (e.state === "open" && now - e.openedAt >= BREAKER_COOLDOWN_MS) {
    e.state = "half-open";
    e.halfOpenInFlight = false;
  }
  if (e.state === "closed") return true;
  if (e.state === "open") return false;
  // half-open: only ONE probe at a time
  if (!e.halfOpenInFlight) {
    e.halfOpenInFlight = true;
    return true;
  }
  return false;
}

// Primary responded at all (2xx OR a non-eligible 4xx/5xx — i.e. upstream is up)
// → reachable → reset to closed. Also releases halfOpenInFlight.
export function recordReachable(key: string): void {
  entries.set(key, { state: "closed", failures: 0, openedAt: 0, halfOpenInFlight: false });
}

// Eligible infrastructure failure on the PRIMARY → count toward / reopen. In
// half-open a single failure reopens with a fresh cooldown. Releases halfOpenInFlight.
export function recordFailure(key: string, now: number = Date.now()): void {
  const e = get(key);
  if (e.state === "half-open") {
    e.state = "open";
    e.openedAt = now;
    e.failures = BREAKER_FAILURE_THRESHOLD;
    e.halfOpenInFlight = false;
    return;
  }
  e.failures += 1;
  e.halfOpenInFlight = false;
  if (e.failures >= BREAKER_FAILURE_THRESHOLD) {
    e.state = "open";
    e.openedAt = now;
  }
}

export function getBreakerState(key: string): BreakerState {
  return get(key).state;
}

// test-only: clear all breaker state between tests.
export function __resetBreaker(): void {
  entries.clear();
}
