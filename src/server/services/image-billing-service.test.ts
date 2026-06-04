import { describe, it, expect, vi, beforeEach } from "vitest";
import { InsufficientBalanceError } from "../lib/errors.js";

const mockDbSql = vi.fn();
const mockBegin = vi.fn();
const mockTxSql = vi.fn();
const mockSelectLimit = vi.fn();
const mockInsertValues = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mockSelectLimit }) }) }),
    insert: () => ({ values: mockInsertValues }),
  },
  dbSql: Object.assign(mockDbSql, { begin: mockBegin }),
}));
vi.mock("./pricing-service.js", () => ({
  buildPricingConfig: vi.fn().mockResolvedValue({ kur: 47, liveKur: 47, kurBuffer: 0.03, textCarpan: 3, imageCarpan: 3, videoCarpan: 3 }),
  computePrice: vi.fn().mockReturnValue({ unit: "image", input: { usd: 0.04, tl: 1.88 } }),
}));
vi.mock("../lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const MODEL = { id: "test-image", name: "Test Image", provider: "x", type: "Görsel", context: "—", endpoints: ["images"], providerImageInputUsd: 0.04 };

describe("chargeImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBegin.mockImplementation(async (fn: (s: typeof mockTxSql) => unknown) => fn(mockTxSql));
    mockInsertValues.mockResolvedValue([]);
  });

  it("charges per-image fee on success", async () => {
    mockSelectLimit.mockResolvedValueOnce([]); // findExisting: none
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "98.12", email: "u@x" }]) // debit
      .mockResolvedValueOnce([]) // transactions insert
      .mockResolvedValueOnce([]); // usage insert
    const { chargeImage } = await import("./image-billing-service.js");
    const r = await chargeImage({ userId: "u", apiKeyId: "k", model: MODEL as never, imageRequestId: "img_r1", imageCount: 1, responseMs: 100, status: "success" });
    expect(r.costTL).toBe(1.88);
    expect(r.remainingTL).toBe(98.12);
    expect(r.alreadyCharged).toBe(false);
  });

  it("charges N×perImage for imageCount>1", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "94.24", email: "u@x" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { chargeImage } = await import("./image-billing-service.js");
    const r = await chargeImage({ userId: "u", apiKeyId: "k", model: MODEL as never, imageRequestId: "img_r2", imageCount: 3, responseMs: 100, status: "success" });
    expect(r.costTL).toBe(5.64); // 1.88 × 3
  });

  it("throws InsufficientBalanceError when debit returns empty", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    mockTxSql.mockResolvedValueOnce([]); // debit empty
    const { chargeImage } = await import("./image-billing-service.js");
    await expect(chargeImage({ userId: "u", apiKeyId: "k", model: MODEL as never, imageRequestId: "img_r3", imageCount: 1, responseMs: 100, status: "success" }))
      .rejects.toThrow(InsufficientBalanceError);
  });

  it("does not charge on no_charge (cost-0 usage row, no debit)", async () => {
    mockSelectLimit
      .mockResolvedValueOnce([]) // findExisting
      .mockResolvedValueOnce([{ bakiye: "100" }]); // balance read
    const { chargeImage } = await import("./image-billing-service.js");
    const r = await chargeImage({ userId: "u", apiKeyId: "k", model: MODEL as never, imageRequestId: "img_r4", imageCount: 1, responseMs: 100, status: "no_charge" });
    expect(r.costTL).toBe(0);
    expect(mockBegin).not.toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ costTL: "0", type: "image" }));
  });

  it("is idempotent — existing charge returns early", async () => {
    mockSelectLimit.mockResolvedValueOnce([{ costUsd: "0.04", costTL: "1.88", remainingTL: "50" }]);
    const { chargeImage } = await import("./image-billing-service.js");
    const r = await chargeImage({ userId: "u", apiKeyId: "k", model: MODEL as never, imageRequestId: "img_r1", imageCount: 1, responseMs: 100, status: "success" });
    expect(r).toEqual({ costUsd: 0.04, costTL: 1.88, remainingTL: 50, alreadyCharged: true });
    expect(mockBegin).not.toHaveBeenCalled();
  });
});
