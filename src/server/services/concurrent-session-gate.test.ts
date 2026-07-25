import { afterEach, describe, expect, it } from "vitest";

import {
  acquireProxyConcurrencyGate,
  clearProxyConcurrencyGateTestLimits,
  extractProxySessionId,
  resetProxyConcurrencyGateForTest,
} from "./concurrent-session-gate.js";

afterEach(() => {
  clearProxyConcurrencyGateTestLimits();
});

describe("concurrent-session-gate", () => {
  it("blocks the third distinct active session for one API key", async () => {
    resetProxyConcurrencyGateForTest({ concurrentSessionsPerKey: 2, concurrentRequestsPerKey: 10 });

    const first = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s1" });
    const second = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s2" });
    const third = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s3" });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third).toMatchObject({ allowed: false, reason: "max_concurrent_sessions", activeSessions: 2 });

    first.release?.();
    const retry = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s3" });
    expect(retry.allowed).toBe(true);
  });

  it("allows multiple requests in the same active session up to request limit", async () => {
    resetProxyConcurrencyGateForTest({ concurrentSessionsPerKey: 2, concurrentRequestsPerKey: 3 });

    const first = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s1" });
    const second = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s1" });
    const third = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s1" });
    const fourth = await acquireProxyConcurrencyGate({ apiKeyId: "key-1", sessionId: "s1" });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(fourth).toMatchObject({ allowed: false, reason: "max_concurrent_requests", activeRequests: 3 });
  });

  it("extracts session id from headers, body, metadata, then default", () => {
    expect(extractProxySessionId({}, { "x-yz-session-id": "abc" })).toBe("abc");
    expect(extractProxySessionId({ session_id: "body-session" }, {})).toBe("body-session");
    expect(extractProxySessionId({ metadata: { sessionId: "meta-session" } }, {})).toBe("meta-session");
    expect(extractProxySessionId({}, {})).toBe("default");
  });
});
