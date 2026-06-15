import { describe, it, expect } from "vitest";
import { consumeActionRate } from "./rate-limit-service.js";

describe("consumeActionRate (aksiyon limiti)", () => {
  it("aynı scope'ta perMinute=1 → ilki allowed, ikincisi reddedilir + retryAfter", () => {
    const scope = `test-action-${Math.random()}`;
    const first = consumeActionRate(scope, 1);
    const second = consumeActionRate(scope, 1);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(typeof second.retryAfter).toBe("number");
  });

  it("limit<=0 → her zaman allowed (kapalı)", () => {
    expect(consumeActionRate(`x-${Math.random()}`, 0).allowed).toBe(true);
  });
});
