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

async function runAdminAuth(
  token?: string,
  route?: { method?: string; baseUrl?: string; path?: string },
) {
  const { adminAuth } = await import("./admin-auth.js");
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    method: route?.method ?? "GET",
    baseUrl: route?.baseUrl ?? "/api/admin",
    path: route?.path ?? "/dashboard",
    ip: "127.0.0.1",
  } as unknown as Request;
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
    mocks.limit.mockResolvedValueOnce([
      { id: "user-1", email: "cix.crazy666@gmail.com", durum: "aktif", role: "user" },
    ]);

    const { req, next } = await runAdminAuth("user-token");

    expect(next).toHaveBeenCalledOnce();
    expect(req.admin).toEqual({ sub: "user-1", role: "admin" });
    expect(req.user).toEqual({ id: "user-1", email: "cix.crazy666@gmail.com" });
    expect(req.adminRole).toBe("owner");
  });

  it("rejects normal user tokens from every other email", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-2", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "user-2", email: "user@example.com", durum: "aktif", role: "user" },
    ]);

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
    mocks.limit.mockResolvedValueOnce([
      { id: "user-3", email: "cix.crazy666@gmail.com", durum: "askida", role: "user" },
    ]);

    const { res, next } = await runAdminAuth("user-token");

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ error: "User account is not active" });
  });

  it("partner rolü izinli uca erişebilir", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "p-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "p-1", email: "ortak@example.com", durum: "aktif", role: "partner" },
    ]);

    const { req, next } = await runAdminAuth("partner-token", {
      method: "GET",
      baseUrl: "/api/admin",
      path: "/users",
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.adminRole).toBe("partner");
  });

  it("partner owner-only uca 403 alır", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "p-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "p-1", email: "ortak@example.com", durum: "aktif", role: "partner" },
    ]);

    const { res, next } = await runAdminAuth("partner-token", {
      method: "POST",
      baseUrl: "/api/admin",
      path: "/provider-profiles/activate",
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("partner rol-değiştirme ucuna (privilege escalation) 403 alır", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "p-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "p-1", email: "ortak@example.com", durum: "aktif", role: "partner" },
    ]);

    const { res, next } = await runAdminAuth("partner-token", {
      method: "POST",
      baseUrl: "/api/admin",
      path: "/users/x9/role",
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("owner owner-only uca erişebilir", async () => {
    mocks.verifyAccessToken.mockReturnValue({ sub: "user-1", role: "user" });
    mocks.limit.mockResolvedValueOnce([
      { id: "user-1", email: "cix.crazy666@gmail.com", durum: "aktif", role: "user" },
    ]);

    const { req, next } = await runAdminAuth("owner-token", {
      method: "POST",
      baseUrl: "/api/admin",
      path: "/provider-profiles/activate",
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.adminRole).toBe("owner");
  });

  it("keeps the configured owner email as the only admin identity", async () => {
    const source = await import("./admin-auth.js");
    expect(source.ADMIN_EMAIL).toBe("cix.crazy666@gmail.com");
  });
});
