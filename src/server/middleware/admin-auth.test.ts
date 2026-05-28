import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../services/auth-service.js", () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.limit,
        })),
      })),
    })),
  },
}));

function makeResponse() {
  const res = {
    statusCode: 200,
    payload: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.payload = payload;
      return res;
    }),
  };
  return res as unknown as Response & { statusCode: number; payload: unknown };
}

async function runAdminAuth(token?: string) {
  const { adminAuth } = await import("./admin-auth.js");
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as Request;
  const res = makeResponse();
  const next = vi.fn() as NextFunction;

  await adminAuth(req, res, next);
  return { req, res, next };
}

describe("adminAuth single-owner policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAccessToken.mockReset();
    mocks.limit.mockReset();
  });

  it("allows only the configured admin email via a normal user token", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([{ id: "user-1", email: "cix.crazy666@gmail.com", durum: "aktif" }]);

    const { req, next } = await runAdminAuth("user-token");

    expect(next).toHaveBeenCalledOnce();
    expect(req.admin).toEqual({ sub: "user-1", role: "admin" });
    expect(req.user).toEqual({ id: "user-1", email: "cix.crazy666@gmail.com" });
  });

  it("rejects normal user tokens from every other email", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-2", role: "user" });
    mocks.limit.mockResolvedValueOnce([{ id: "user-2", email: "user@example.com", durum: "aktif" }]);

    const { res, next } = await runAdminAuth("user-token");

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ error: "Admin email required" });
  });

  it("does not accept legacy admin-role tokens", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "admin", role: "admin" });

    const { res, next } = await runAdminAuth("legacy-admin-token");

    expect(next).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.payload).toEqual({ error: "User token required" });
  });

  it("blocks inactive admin candidates", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-3", role: "user" });
    mocks.limit.mockResolvedValueOnce([{ id: "user-3", email: "cix.crazy666@gmail.com", durum: "askida" }]);

    const { res, next } = await runAdminAuth("user-token");

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ error: "User account is not active" });
  });
});
