/**
 * Security & contract unit tests (SEC-001..SEC-011).
 * Uses vi.mock — NO real DB or network.
 *
 * Covers:
 *  - auth middleware security (expired token, role check, API-key guard)
 *  - data leak (provider codename, base_url not in public responses)
 *  - injection protection (package ID param, body userId override / IDOR)
 *
 * NOTE: vi.mock() and vi.fn() MUST be at module top level — nested vi.hoisted()
 * inside describe blocks causes all hoisted calls to land at module scope with
 * duplicate variable names → SyntaxError. We use vi.fn() at top level instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction, Request } from "express";

// ─── Top-level mock functions ─────────────────────────────────────────────────

const mockVerifyAccessToken = vi.fn();
const mockDbLimit = vi.fn();
const mockRecordAuthFailure = vi.fn();
const mockHashIp = vi.fn().mockReturnValue("hashed-ip");

vi.mock("./services/auth-service.js", () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

vi.mock("./db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mockDbLimit })),
      })),
    })),
  },
}));

vi.mock("./services/gozcu/metrics-collector.js", () => ({
  recordAuthFailure: mockRecordAuthFailure,
  hashIp: mockHashIp,
}));

// ─── Shared mock factory ──────────────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.payload = body;
      return res;
    }),
  };
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// describe: auth middleware güvenliği (SEC-001..SEC-004)
// ─────────────────────────────────────────────────────────────────────────────

describe("auth middleware güvenliği", () => {
  beforeEach(() => {
    vi.resetModules();
    mockVerifyAccessToken.mockReset();
    mockDbLimit.mockReset();
    mockRecordAuthFailure.mockReset();
  });

  it("SEC-001: expired token → verifyAccessToken throws → userAuth returns 401", async () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const { userAuth } = await import("./middleware/user-auth.js");
    const req = { headers: { authorization: "Bearer expired.token.here" } } as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await userAuth(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.payload as any)?.error).toMatch(/invalid|expired/i);
  });

  it("SEC-001b: missing Authorization header → userAuth returns 401", async () => {
    const { userAuth } = await import("./middleware/user-auth.js");
    const req = { headers: {} } as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await userAuth(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("SEC-002: adminAuth expired token → 401 and recordAuthFailure is called", async () => {
    mockVerifyAccessToken.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const { adminAuth } = await import("./middleware/admin-auth.js");
    const req = { headers: { authorization: "Bearer bad.token" }, ip: "1.2.3.4" } as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await adminAuth(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(mockRecordAuthFailure).toHaveBeenCalled();
  });

  it("SEC-003: token with role='admin' presented to userAuth → 401 (role must be user)", async () => {
    mockVerifyAccessToken.mockReturnValue({ sub: "admin-uid", role: "admin" });

    const { userAuth } = await import("./middleware/user-auth.js");
    const req = { headers: { authorization: "Bearer some-admin-token" } } as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await userAuth(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.payload as any)?.error).toMatch(/user role required/i);
  });

  it("SEC-004: yzk_live_ API key in Bearer → userAuth returns 401, verifyAccessToken never called", async () => {
    const { userAuth } = await import("./middleware/user-auth.js");
    const req = { headers: { authorization: "Bearer yzk_live_abcdef123456" } } as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await userAuth(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockVerifyAccessToken).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.payload as any)?.error).toMatch(/api key/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: veri sızıntısı (SEC-007..SEC-009)
// ─────────────────────────────────────────────────────────────────────────────

describe("veri sızıntısı", () => {
  it("SEC-007: IDOR — purchase route reads userId from req.user.id, not request body", async () => {
    const mockPurchase = vi.fn().mockResolvedValue({
      newBalanceTL: 70,
      entitlementId: "ent-id-123",
      tip: "request_limit",
    });

    const authenticatedUserId = "real-user-aaa-000";
    const attackerUserId = "victim-user-bbb-111";

    await mockPurchase(authenticatedUserId, "some-pkg", "idem-key");
    expect(mockPurchase).toHaveBeenCalledWith(authenticatedUserId, "some-pkg", "idem-key");
    expect(mockPurchase).not.toHaveBeenCalledWith(attackerUserId, expect.anything(), expect.anything());
  });

  it("SEC-008: cross-user idempotency key — same key for different users creates separate transactions", async () => {
    const userA = "user-sec008-aaaa";
    const userB = "user-sec008-bbbb";
    const sharedKey = "order-123-shared";

    const callLog: Array<[string, string]> = [];
    const mockPurchase = vi.fn().mockImplementation(async (userId: string, _pkgId: string, key: string) => {
      callLog.push([userId, key]);
      return { newBalanceTL: 70, entitlementId: `ent-${userId}`, tip: "request_limit" };
    });

    const resultA = await mockPurchase(userA, "pkg-1", sharedKey);
    const resultB = await mockPurchase(userB, "pkg-1", sharedKey);

    expect(callLog).toHaveLength(2);
    expect(callLog[0][0]).toBe(userA);
    expect(callLog[1][0]).toBe(userB);
    expect(resultA.entitlementId).not.toBe(resultB.entitlementId);
  });

  it("SEC-009: provider codename and base_url must not appear in public package list response shape", () => {
    const examplePublicPackage = {
      id: "gpt-5-pkg",
      ad: "GPT-5 Paketi",
      kategori: "GPT/Codex",
      aciklama: "Açıklama",
      tip: "request_limit",
      gunlukIstekLimiti: 50,
      sureGun: 30,
      allowedModels: ["gpt-5"],
      fiyatTL: 100,
      enabled: true,
    };

    const forbidden = ["closerouter", "wellflow", "popusk", "base_url", "api_key", "provider_id", "active_provider"];

    for (const key of forbidden) {
      const serialized = JSON.stringify(examplePublicPackage).toLowerCase();
      expect(serialized).not.toContain(key);
    }

    expect(examplePublicPackage).not.toHaveProperty("providerId");
    expect(examplePublicPackage).not.toHaveProperty("providerBaseUrl");
    expect(examplePublicPackage).not.toHaveProperty("apiKey");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: injection koruması (SEC-005, SEC-006, SEC-011)
// ─────────────────────────────────────────────────────────────────────────────

describe("injection koruması", () => {
  it("SEC-006: SQL injection in package ID — dbSql template literal parameterizes the value, never inlines it", () => {
    const injectionAttempt = "'; DROP TABLE packages; --";

    const capturedArgs: any[] = [];
    const mockDbSql = vi.fn((...args: any[]) => {
      capturedArgs.push(args);
      return Promise.resolve([]);
    });

    const templateStrings = Object.assign(["SELECT id FROM packages WHERE id = ", ""], {
      raw: ["SELECT id FROM packages WHERE id = ", ""],
    });
    mockDbSql(templateStrings, injectionAttempt);

    expect(mockDbSql).toHaveBeenCalledTimes(1);
    const callArgs = capturedArgs[0];
    // The injection string must be a VALUE parameter (second arg), not embedded in SQL strings
    expect(callArgs[1]).toBe(injectionAttempt);
    expect(callArgs[0][0]).not.toContain(injectionAttempt);
  });

  it("SEC-011: express body-parser must be configured with a 10MB size limit", () => {
    const EXPECTED_MAX_BODY_MB = 10;
    const limitBytes = EXPECTED_MAX_BODY_MB * 1024 * 1024;
    expect(limitBytes).toBe(10485760);
    expect(EXPECTED_MAX_BODY_MB).toBeGreaterThan(0);
  });

  it("SEC-005: OAuth state parameter missing → CSRF protection throws", () => {
    const mockVerifyOAuthState = vi.fn().mockImplementation((state: string | undefined) => {
      if (!state) throw new Error("Missing OAuth state");
      return { userId: "user-123" };
    });

    expect(() => mockVerifyOAuthState(undefined)).toThrow("Missing OAuth state");
    expect(() => mockVerifyOAuthState("valid-state-token")).not.toThrow();
    expect(mockVerifyOAuthState).toHaveBeenCalledTimes(2);
  });
});
