import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const validateApiKeyMock = vi.fn();

vi.mock("../services/api-key-service.js", () => ({
  validateApiKey: validateApiKeyMock,
}));

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe("apiKeyAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when bearer key is missing or not yzk_live", async () => {
    const { apiKeyAuth } = await import("./api-key-auth.js");
    const req = { headers: { authorization: "Bearer bad_key" } } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Valid yzk_live_ API key required" });
    expect(validateApiKeyMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when key is invalid or revoked", async () => {
    validateApiKeyMock.mockResolvedValueOnce(null);
    const { apiKeyAuth } = await import("./api-key-auth.js");
    const req = { headers: { authorization: "Bearer yzk_live_abc123" } } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid API key" });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches user and api key context for valid keys", async () => {
    validateApiKeyMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "u@test.com" },
      key: { id: "key-1" },
    });
    const { apiKeyAuth } = await import("./api-key-auth.js");
    const req = { headers: { authorization: "Bearer yzk_live_abc123" } } as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await apiKeyAuth(req, res, next);

    expect((req as any).user).toEqual({ id: "user-1", email: "u@test.com" });
    expect((req as any).apiKey).toEqual({ id: "key-1", userId: "user-1" });
    expect(next).toHaveBeenCalledOnce();
  });
});
