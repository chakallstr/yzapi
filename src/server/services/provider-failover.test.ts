import { describe, it, expect, beforeEach, vi } from "vitest";
import { isFailoverEligible, forwardWithFailover } from "./provider-failover.js";
import {
  __resetBreaker,
  getBreakerState,
  BREAKER_FAILURE_THRESHOLD,
} from "./provider-circuit-breaker.js";

describe("isFailoverEligible", () => {
  it("502/503/504 → eligible", () => {
    for (const s of [502, 503, 504]) expect(isFailoverEligible({ status: s })).toBe(true);
  });
  it("upstream 402 (platform quota exhausted) → eligible (fallback uses a different account)", () => {
    expect(isFailoverEligible({ status: 402 })).toBe(true);
    expect(
      isFailoverEligible({ status: 402, body: { error: { code: "insufficient_quota" } } }),
    ).toBe(true);
  });
  it("other 4xx and non-{502,503,504} 5xx → NOT eligible", () => {
    for (const s of [400, 401, 403, 404, 429, 500, 501]) expect(isFailoverEligible({ status: s })).toBe(false);
  });
  it("budget abort (AbortError/TimeoutError) → eligible", () => {
    expect(isFailoverEligible({ name: "AbortError" })).toBe(true);
    expect(isFailoverEligible({ name: "TimeoutError" })).toBe(true);
  });
  it("connection codes → eligible", () => {
    for (const code of ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]) {
      expect(isFailoverEligible({ cause: { code } })).toBe(true);
    }
  });
  it("connect-timeout / socket hang up message → eligible", () => {
    expect(isFailoverEligible({ message: "Connect Timeout Error" })).toBe(true);
    expect(isFailoverEligible({ cause: { message: "socket hang up" } })).toBe(true);
  });
  it("null/plain/app errors → NOT eligible", () => {
    expect(isFailoverEligible(null)).toBe(false);
    expect(isFailoverEligible(new Error("boom"))).toBe(false);
  });
});

const primary = { profileId: "wellflow", baseUrl: "p", apiKey: "k", modelMap: {}, source: {} as never } as never;
const fallback = { profileId: "closerouter", baseUrl: "f", apiKey: "k", modelMap: {}, source: {} as never } as never;
const e503 = () => Object.assign(new Error("x"), { status: 503 });
const e400 = () => Object.assign(new Error("x"), { status: 400 });
const e402 = () => Object.assign(new Error("x"), { status: 402, body: { error: { code: "insufficient_quota" } } });

describe("forwardWithFailover", () => {
  beforeEach(() => __resetBreaker());

  it("no fallback → runs primary once, no failover", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    const r = await forwardWithFailover({ primary, fallback: null }, {}, run);
    expect(r).toMatchObject({ result: "ok", servedBy: "wellflow", failedOver: false });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toBeUndefined(); // default budget
  });

  it("primary 503 (eligible) → fallback served; primary got single-shot budget", async () => {
    const run = vi.fn().mockRejectedValueOnce(e503()).mockResolvedValueOnce("fb");
    const r = await forwardWithFailover({ primary, fallback }, {}, run);
    expect(r).toMatchObject({ result: "fb", servedBy: "closerouter", failedOver: true });
    expect(run.mock.calls[0][1]).toMatchObject({ maxAttempts: 1, timeoutMs: 7000 });
    expect(run.mock.calls[1][1]).toBeUndefined();
  });

  it("primary 402 (quota exhausted, eligible) → fallback served", async () => {
    const run = vi.fn().mockRejectedValueOnce(e402()).mockResolvedValueOnce("fb");
    const r = await forwardWithFailover({ primary, fallback }, {}, run);
    expect(r).toMatchObject({ result: "fb", servedBy: "closerouter", failedOver: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("primary 400 (not eligible) → propagate, NO failover, breaker stays closed", async () => {
    const run = vi.fn().mockRejectedValue(e400());
    await expect(forwardWithFailover({ primary, fallback }, {}, run)).rejects.toMatchObject({ status: 400 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(getBreakerState("wellflow")).toBe("closed");
  });

  it("post-commit (res.headersSent) eligible error → NO failover", async () => {
    const run = vi.fn().mockRejectedValue(e503());
    const res = { headersSent: true } as never;
    await expect(forwardWithFailover({ primary, fallback }, { res }, run)).rejects.toMatchObject({ status: 503 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("breaker opens after THRESHOLD failures → next request skips primary", async () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) {
      const run = vi.fn().mockRejectedValueOnce(e503()).mockResolvedValueOnce("fb");
      await forwardWithFailover({ primary, fallback }, {}, run);
    }
    expect(getBreakerState("wellflow")).toBe("open");

    const run = vi.fn().mockResolvedValue("fb");
    const r = await forwardWithFailover({ primary, fallback }, {}, run);
    expect(r).toMatchObject({ servedBy: "closerouter", failedOver: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].profileId).toBe("closerouter"); // primary skipped
  });
});
