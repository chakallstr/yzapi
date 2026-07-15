import { describe, expect, it, vi, beforeEach } from "vitest";

// jose + env dış bağımlılıkları — deterministik test için mock ŞART (ağ / gizli anahtar).
// State testleri jose davranışına bağlı değildir; JWT_SECRET tutarlı olduğu için etkilenmezler.
const h = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => "JWKS_STUB"),
}));

vi.mock("jose", () => ({
  jwtVerify: h.jwtVerify,
  createRemoteJWKSet: h.createRemoteJWKSet,
}));

vi.mock("../lib/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:4567/api/auth/google/callback",
  },
}));

import { verifyIdToken, exchangeCode } from "./google-oauth-service.js";

describe("Google OAuth state", () => {
  it("creates a signed state that verifies without in-memory process state", async () => {
    const { createOAuthState, verifyOAuthState } = await import("./google-oauth-service.js");

    const state = createOAuthState(1_000);

    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(40);
    expect(verifyOAuthState(state, 60_000)).toBe(true);
  });

  it("rejects tampered or expired OAuth state values", async () => {
    const { createOAuthState, verifyOAuthState } = await import("./google-oauth-service.js");

    const state = createOAuthState(1_000);
    const [payload, signature] = state.split(".");
    const replacement = payload.startsWith("a") ? "b" : "a";
    const tampered = `${replacement}${payload.slice(1)}.${signature}`;

    expect(verifyOAuthState(tampered, 60_000)).toBe(false);
    expect(verifyOAuthState(state, 6 * 60 * 1000 + 1_001)).toBe(false);
  });
});

function jwksTimeout(): Error {
  // jose'nin gerçekte fırlattığı JWKSTimeout ile aynı şekil (canlıda 2026-07-06 kanıtlandı).
  const e = new Error("request timed out") as Error & { code?: string };
  e.name = "JWKSTimeout";
  e.code = "ERR_JWKS_TIMEOUT";
  return e;
}

const okPayload = {
  payload: { sub: "sub-1", email: "user@example.com", email_verified: true, name: "User", picture: "p.png" },
};

describe("google-oauth-service — geçici JWKS/ağ hatalarına dayanıklılık (500 login bug fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.jwtVerify.mockReset();
  });

  it("verifyIdToken: tek bir JWKS timeout'unda retry eder ve başarıyla profili döner", async () => {
    h.jwtVerify.mockRejectedValueOnce(jwksTimeout()).mockResolvedValueOnce(okPayload);

    const profile = await verifyIdToken("fake.jwt.token");

    expect(profile.email).toBe("user@example.com");
    expect(h.jwtVerify).toHaveBeenCalledTimes(2);
  });

  it("verifyIdToken: geçici OLMAYAN hatada (imza) retry ETMEZ, hemen fırlatır", async () => {
    const bad = new Error("signature verification failed") as Error & { code?: string };
    bad.code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
    h.jwtVerify.mockRejectedValue(bad);

    await expect(verifyIdToken("fake")).rejects.toThrow(/signature/);
    expect(h.jwtVerify).toHaveBeenCalledTimes(1);
  });

  it("verifyIdToken: tüm denemeler timeout olursa sınırlı sayıda dener ve vazgeçer", async () => {
    h.jwtVerify.mockRejectedValue(jwksTimeout());

    await expect(verifyIdToken("fake")).rejects.toMatchObject({ code: "ERR_JWKS_TIMEOUT" });
    expect(h.jwtVerify).toHaveBeenCalledTimes(3); // 1 deneme + 2 retry
  });

  it("exchangeCode: fetch'e bir timeout signal'i geçirir (sonsuz askıda kalmaz)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: "idt", access_token: "act" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exchangeCode("auth-code");

    expect(r.idToken).toBe("idt");
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});
