import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithRuntimeTimeout } from "./closerouter-service.js";

// Reproduces the LIVE incident (2026-06-04): Roo Code on claude-opus-4.8 → Popusk
// (api.claude-popusk.shop) intermittently fails to ACCEPT a new TLS connection
// within undici's default 10s connectTimeout → `TypeError: fetch failed` caused by
// `ConnectTimeoutError` (code UND_ERR_CONNECT_TIMEOUT) → surfaced to the customer as
// a raw 500. A connect timeout means the request NEVER reached upstream, so retrying
// is money-safe (no double-charge / double-processing on the provider side).

function connectTimeoutError(): Error {
  const e = new TypeError("fetch failed");
  (e as unknown as { cause: unknown }).cause = {
    code: "UND_ERR_CONNECT_TIMEOUT",
    message: "Connect Timeout Error (attempted address: api.claude-popusk.shop:443, timeout: 10000ms)",
  };
  return e;
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchWithRuntimeTimeout — upstream connect retry", () => {
  it("retries a transient connect timeout and returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connectTimeoutError())
      .mockRejectedValueOnce(connectTimeoutError())
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRuntimeTimeout("https://up/v1/chat/completions", { method: "POST", body: "{}" }, 5000, 3, 0);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns immediately on first success (no retry)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRuntimeTimeout("https://up/v1/chat/completions", { method: "POST", body: "{}" }, 5000, 3, 0);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry ECONNRESET (could be mid-flight → double-send risk)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRuntimeTimeout("https://up/v1/chat/completions", { method: "POST", body: "{}" }, 5000, 3, 0),
    ).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry our own deliberate abort (overall timeout)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRuntimeTimeout("https://up/v1/chat/completions", { method: "POST", body: "{}" }, 5000, 3, 0),
    ).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after exhausting retries on connect timeout, throws a retryable 503-tagged error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(connectTimeoutError());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRuntimeTimeout("https://up/v1/chat/completions", { method: "POST", body: "{}" }, 5000, 3, 0),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
