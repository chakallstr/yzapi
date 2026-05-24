import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!";
const mockInsertValues = vi.fn().mockResolvedValue([]);
const mockUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
const mockSelectLimitFn = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {
    insert: () => ({ values: mockInsertValues }),
    update: () => ({ set: mockUpdateSet }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectLimitFn,
        }),
      }),
    }),
  },
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips sub and role", async () => {
    const { signAccessToken, verifyAccessToken } = await import("./auth-service.js");
    const token = signAccessToken({ sub: "user-123", role: "user" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.role).toBe("user");
  });

  it("verifyAccessToken throws on tampered token", async () => {
    const { signAccessToken, verifyAccessToken } = await import("./auth-service.js");
    const token = signAccessToken({ sub: "user-123", role: "user" });
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("verifyAccessToken throws on expired token", async () => {
    const expired = jwt.sign({ sub: "user-123", role: "user" }, JWT_SECRET, { expiresIn: -1 });
    const { verifyAccessToken } = await import("./auth-service.js");
    expect(() => verifyAccessToken(expired)).toThrow();
  });

  it("admin role is preserved", async () => {
    const { signAccessToken, verifyAccessToken } = await import("./auth-service.js");
    const token = signAccessToken({ sub: "admin-1", role: "admin" });
    const payload = verifyAccessToken(token);
    expect(payload.role).toBe("admin");
  });
});

describe("hashPassword / comparePassword", () => {
  it("hashes and verifies correct password", async () => {
    const { hashPassword, comparePassword } = await import("./auth-service.js");
    const hash = await hashPassword("mysecret");
    const match = await comparePassword("mysecret", hash);
    expect(match).toBe(true);
  });

  it("rejects wrong password", async () => {
    const { hashPassword, comparePassword } = await import("./auth-service.js");
    const hash = await hashPassword("mysecret");
    const match = await comparePassword("wrongpass", hash);
    expect(match).toBe(false);
  });
});

describe("signRefreshToken / rotateRefreshToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signRefreshToken inserts a session row", async () => {
    const { signRefreshToken } = await import("./auth-service.js");
    await signRefreshToken("user-123");
    expect(mockInsertValues).toHaveBeenCalledOnce();
  });

  it("rotateRefreshToken rejects revoked token", async () => {
    // Mock select returning revoked=true session
    mockSelectLimitFn.mockResolvedValueOnce([
      { jti: "some-jti", revoked: true, expiresAt: new Date(Date.now() + 60000) },
    ]);

    const { signRefreshToken, rotateRefreshToken } = await import("./auth-service.js");
    const token = await signRefreshToken("user-123");

    // Force session row to show revoked
    mockSelectLimitFn.mockResolvedValueOnce([
      { jti: "some-jti", revoked: true, expiresAt: new Date(Date.now() + 60000) },
    ]);

    await expect(rotateRefreshToken(token)).rejects.toThrow(/revoked/i);
  });

  it("rotateRefreshToken rejects expired token", async () => {
    const { signRefreshToken, rotateRefreshToken } = await import("./auth-service.js");
    // Create a token with very short expiry manually
    const expiredToken = jwt.sign(
      { sub: "user-123", jti: "expired-jti", type: "refresh" },
      JWT_SECRET,
      { expiresIn: -1 },
    );
    await expect(rotateRefreshToken(expiredToken)).rejects.toThrow();
  });
});
