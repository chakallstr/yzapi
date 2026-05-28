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

async function runUserAuth(token?: string) {
  const { userAuth } = await import("./user-auth.js");
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as Request;
  const res = makeResponse();
  const next = vi.fn() as NextFunction;

  await userAuth(req, res, next);
  return { req, res, next };
}

describe("userAuth account status policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAccessToken.mockReset();
    mocks.limit.mockReset();
  });

  it("allows active users", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([{ id: "user-1", email: "user@example.com", durum: "aktif" }]);

    const { req, next } = await runUserAuth("user-token");

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: "user-1", email: "user@example.com" });
  });

  it("blocks suspended users even with a valid JWT", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-2", role: "user" });
    mocks.limit.mockResolvedValueOnce([{ id: "user-2", email: "user@example.com", durum: "askida" }]);

    const { res, next } = await runUserAuth("user-token");

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ error: "User account is not active" });
  });
});
