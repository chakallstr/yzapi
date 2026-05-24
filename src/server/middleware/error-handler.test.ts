import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { InsufficientBalanceError, ModelDisabledError, RateLimitError } from "../lib/errors.js";
import { errorHandler } from "./error-handler.js";

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

function makeRes() {
  const headers = new Map<string, string>();
  const res = {
    setHeader: vi.fn((key: string, value: string) => headers.set(key, value)),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headers,
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
    headers: Map<string, string>;
  };
}

describe("errorHandler", () => {
  it("maps insufficient balance to 402 with request id", () => {
    const req = { id: "req-402" } as unknown as Request;
    const res = makeRes();

    errorHandler(new InsufficientBalanceError("Insufficient balance"), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      error: "Insufficient balance",
      code: 402,
      requestId: "req-402",
    });
  });

  it("maps disabled model to 403", () => {
    const req = { id: "req-403" } as unknown as Request;
    const res = makeRes();

    errorHandler(new ModelDisabledError("openai/gpt-5.4"), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Model disabled: openai/gpt-5.4",
      code: 403,
      requestId: "req-403",
    });
  });

  it("maps rate limit to 429 and sets retry-after", () => {
    const req = { id: "req-429" } as unknown as Request;
    const res = makeRes();

    errorHandler(new RateLimitError("Rate limit exceeded", 30), req, res, vi.fn());

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "30");
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Rate limit exceeded",
      code: 429,
      requestId: "req-429",
      retryAfter: 30,
    });
  });
});
