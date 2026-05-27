import { describe, expect, it, vi, beforeEach } from "vitest";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

describe("frontend auth client refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: storage },
      configurable: true,
    });
  });

  it("refreshes an expired access token and retries protected JSON requests once", async () => {
    const { storeAuthTokens, apiJson } = await import("./yapayzekalab/auth-client.js");
    storeAuthTokens({ accessToken: "expired-access", refreshToken: "valid-refresh" });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: "fresh-access", refreshToken: "fresh-refresh" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiJson("/api/payments/iban/init", { method: "POST", body: { amountUsd: 10 } })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe("Bearer expired-access");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ refreshToken: "valid-refresh" });
    expect(fetchMock.mock.calls[2][1]?.headers?.Authorization).toBe("Bearer fresh-access");
    expect(window.localStorage.getItem("yz_access_token")).toBe("fresh-access");
    expect(window.localStorage.getItem("yz_refresh_token")).toBe("fresh-refresh");
  });

  it("clears stale auth tokens when refresh fails", async () => {
    const { storeAuthTokens, apiJson } = await import("./yapayzekalab/auth-client.js");
    storeAuthTokens({ accessToken: "expired-access", refreshToken: "revoked-refresh" });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Refresh token revoked or not found" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiJson("/api/payments/iban/init", { method: "POST", body: { amountUsd: 10 } })).rejects.toThrow(/tekrar giriş/i);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem("yz_access_token")).toBeNull();
    expect(window.localStorage.getItem("yz_refresh_token")).toBeNull();
    expect(window.localStorage.getItem("userAccessToken")).toBeNull();
    expect(window.localStorage.getItem("userRefreshToken")).toBeNull();
  });
});
