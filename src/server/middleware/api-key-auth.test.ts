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

  // Anthropic-native istemciler (Claude Desktop "Configure Third-Party Inference",
  // Anthropic SDK) anahtarı `x-api-key` başlığıyla yollar. Bearer'a ek olarak bunu
  // da kabul et ki yzapi gerçek bir Anthropic-uyumlu gateway olsun.
  it("accepts the key via the x-api-key header (Anthropic-native clients)", async () => {
    validateApiKeyMock.mockResolvedValueOnce({
      user: { id: "user-2", email: "x@test.com" },
      key: { id: "key-2" },
    });
    const { apiKeyAuth } = await import("./api-key-auth.js");
    const req = { headers: { "x-api-key": "yzk_live_xyz789" } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(validateApiKeyMock).toHaveBeenCalledWith("yzk_live_xyz789");
    expect((req as any).user).toEqual({ id: "user-2", email: "x@test.com" });
    expect((req as any).apiKey).toEqual({ id: "key-2", userId: "user-2" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when x-api-key is present but not a yzk_live_ key", async () => {
    const { apiKeyAuth } = await import("./api-key-auth.js");
    const req = { headers: { "x-api-key": "sk-not-ours" } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(validateApiKeyMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
