import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldTryPrimary,
  recordReachable,
  recordFailure,
  getBreakerState,
  __resetBreaker,
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_COOLDOWN_MS,
} from "./provider-circuit-breaker.js";

describe("provider-circuit-breaker", () => {
  beforeEach(() => __resetBreaker());
  const K = "wellflow";

  it("starts closed and allows primary", () => {
    expect(getBreakerState(K)).toBe("closed");
    expect(shouldTryPrimary(K, 0)).toBe(true);
  });

  it("opens after THRESHOLD consecutive failures", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    expect(getBreakerState(K)).toBe("open");
    expect(shouldTryPrimary(K, 0)).toBe(false); // still cooling
  });

  it("reachable resets failures (no open)", () => {
    recordFailure(K, 0);
    recordFailure(K, 0);
    recordReachable(K);
    expect(getBreakerState(K)).toBe("closed");
    recordFailure(K, 0);
    expect(getBreakerState(K)).toBe("closed"); // counter was reset → single failure stays closed
  });

  it("open → half-open after cooldown, single probe only", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    const now = BREAKER_COOLDOWN_MS;
    expect(shouldTryPrimary(K, now)).toBe(true); // first request probes
    expect(getBreakerState(K)).toBe("half-open");
    expect(shouldTryPrimary(K, now)).toBe(false); // concurrent → fallback
  });

  it("half-open probe success → closed", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    shouldTryPrimary(K, BREAKER_COOLDOWN_MS);
    recordReachable(K);
    expect(getBreakerState(K)).toBe("closed");
  });

  it("half-open probe failure → reopens with fresh cooldown", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    shouldTryPrimary(K, BREAKER_COOLDOWN_MS);
    recordFailure(K, BREAKER_COOLDOWN_MS);
    expect(getBreakerState(K)).toBe("open");
    expect(shouldTryPrimary(K, BREAKER_COOLDOWN_MS)).toBe(false); // new cooldown, not elapsed
  });

  it("half-open reachable on a non-eligible 4xx closes too (reachability semantics)", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    shouldTryPrimary(K, BREAKER_COOLDOWN_MS);
    recordReachable(K); // caller maps non-eligible 4xx → recordReachable
    expect(getBreakerState(K)).toBe("closed");
  });

  it("keys are independent", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure("a", 0);
    expect(getBreakerState("a")).toBe("open");
    expect(getBreakerState("b")).toBe("closed");
  });
});
