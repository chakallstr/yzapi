import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requestId } from "./request-id.js";

function makeReq(headers: Record<string, string | undefined> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes() {
  const headers = new Map<string, string>();
  const res = {
    setHeader: vi.fn((key: string, value: string) => headers.set(key, value)),
    headers,
  };
  return res as unknown as Response & {
    setHeader: ReturnType<typeof vi.fn>;
    headers: Map<string, string>;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("requestId middleware (K2)", () => {
  it("always generates a server-side UUID, ignoring client X-Request-Id for req.id", () => {
    const req = makeReq({ "x-request-id": "client-controlled-id" });
    const res = makeRes();
    const next = vi.fn();

    requestId(req, res, next);

    expect((req as any).id).toMatch(UUID_RE);
    expect((req as any).id).not.toBe("client-controlled-id");
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns the server-generated id in the X-Request-Id response header", () => {
    const req = makeReq();
    const res = makeRes();

    requestId(req, res, vi.fn());

    expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", (req as any).id);
    expect(res.headers.get("X-Request-Id")).toMatch(UUID_RE);
  });

  it("keeps the client value as a trace hint, trimmed to 200 chars", () => {
    const long = "x".repeat(500);
    const req = makeReq({ "x-request-id": long });
    requestId(req, makeRes(), vi.fn());

    expect((req as any).clientTraceId).toHaveLength(200);
    expect((req as any).id).not.toBe(long);
  });

  it("generates a UUID even when no client header is present", () => {
    const req = makeReq();
    requestId(req, makeRes(), vi.fn());

    expect((req as any).id).toMatch(UUID_RE);
    expect((req as any).clientTraceId).toBeUndefined();
  });

  it("produces a distinct id on each invocation (no client replay)", () => {
    const reqA = makeReq({ "x-request-id": "same-client-id" });
    const reqB = makeReq({ "x-request-id": "same-client-id" });
    requestId(reqA, makeRes(), vi.fn());
    requestId(reqB, makeRes(), vi.fn());

    expect((reqA as any).id).not.toBe((reqB as any).id);
  });
});
