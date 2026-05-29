import { describe, it, expect, vi, beforeEach } from "vitest";
import { InsufficientBalanceError } from "../lib/errors.js";

// ── Mock DB ────────────────────────────────────────────────────────────────────
const mockDbSql = vi.fn();
const mockDbSqlBegin = vi.fn();
const mockTxSql = vi.fn();
const mockInsertValues = vi.fn();
const mockSelectLimit = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {
    insert: (table: unknown) => ({
      values: mockInsertValues,
    }),
    select: (cols: unknown) => ({
      from: (t: unknown) => ({
        where: (c: unknown) => ({
          limit: mockSelectLimit,
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue([]) }) }),
  },
  dbSql: Object.assign(mockDbSql, { begin: mockDbSqlBegin }),
}));

vi.mock("./pricing-service.js", () => ({
  buildPricingConfig: vi.fn().mockResolvedValue({
    kur: 50,
    liveKur: 48,
    kurBuffer: 0.04,
    textCarpan: 3.0,
    imageCarpan: 3.0,
    videoCarpan: 3.0,
  }),
  applyOverride: vi.fn().mockImplementation(async (m) => m),
  computePrice: vi.fn().mockReturnValue({
    unit: "1M token",
    input: { usd: 15, tl: 750 },
    output: { usd: 60, tl: 3000 },
  }),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe("chargeUsage — billing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSqlBegin.mockImplementation(async (fn: (sql: typeof mockTxSql) => unknown) => fn(mockTxSql));
  });

  it("throws InsufficientBalanceError when balance would go negative", async () => {
    // Simulate DB returning empty (balance check fails / insufficient)
    mockTxSql.mockResolvedValueOnce([]); // UPDATE returns empty = no row with positive balance
    mockInsertValues.mockResolvedValue([]);

    const { chargeUsage } = await import("./billing-service.js");

    const model = {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "Metin" as const,
      context: "128K",
      endpoints: ["chat"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 15,
    };

    await expect(
      chargeUsage({
        userId: "user-1",
        apiKeyId: "key-1",
        model,
        usage: { promptTokens: 1000, completionTokens: 500 },
        responseMs: 200,
        status: "success",
      }),
    ).rejects.toThrow(InsufficientBalanceError);

    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      status: "error",
      errorCode: "insufficient_balance",
    }));
  });

  it("returns 0 cost and does not deduct for error status", async () => {
    mockSelectLimit.mockResolvedValue([{ bakiye: "100.0000", email: "user@test.com" }]);
    mockInsertValues.mockResolvedValue([]);

    const { chargeUsage } = await import("./billing-service.js");

    const model = {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "Metin" as const,
      context: "128K",
      endpoints: ["chat"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 15,
    };

    const result = await chargeUsage({
      userId: "user-1",
      apiKeyId: "key-1",
      model,
      usage: { promptTokens: 1000, completionTokens: 500 },
      responseMs: 200,
      status: "error",
    });

    expect(result.costTL).toBe(0);
    expect(result.remainingTL).toBe(100);
    // Atomic update should NOT be called for error status
    expect(mockDbSqlBegin).not.toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      costTL: "0",
      remainingTL: "100.0000",
      status: "error",
    }));
  });

  it("deducts balance and writes usage evidence in one DB transaction", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "95.7500", email: "user@test.com" }])
      .mockResolvedValueOnce([{ id: "tx-1" }])
      .mockResolvedValueOnce([]);

    const { chargeUsage } = await import("./billing-service.js");

    const model = {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "Metin" as const,
      context: "128K",
      endpoints: ["chat"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 15,
    };

    const result = await chargeUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 500 },
      responseMs: 200,
      status: "success",
      requestId: "req-1",
      rawUsageJson: { promptTokens: 1000, completionTokens: 500 },
    });

    expect(result.costTL).toBe(2.25);
    expect(result.remainingTL).toBe(95.75);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
    expect(mockTxSql).toHaveBeenCalledTimes(3);
  });

  it("returns existing request charge and does not deduct twice", async () => {
    mockSelectLimit.mockResolvedValue([{ costTL: "2.2500", remainingTL: "95.7500", status: "success" }]);

    const { chargeUsage } = await import("./billing-service.js");

    const model = {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "Metin" as const,
      context: "128K",
      endpoints: ["chat"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 15,
    };

    const result = await chargeUsage({
      userId: "user-1",
      apiKeyId: "key-1",
      model,
      usage: { promptTokens: 1000, completionTokens: 500 },
      responseMs: 200,
      status: "success",
      requestId: "req-duplicate",
    });

    expect(result).toEqual({ costTL: 2.25, remainingTL: 95.75, alreadyCharged: true });
    expect(mockDbSqlBegin).not.toHaveBeenCalled();
  });

  it("reserves balance before upstream usage starts", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "97.7500", email: "user@test.com" }])
      .mockResolvedValueOnce([{ id: "reserve-tx-1" }]);

    const { reserveUsageBudget } = await import("./billing-service.js");

    const model = {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "Metin" as const,
      context: "128K",
      endpoints: ["chat"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 15,
    };

    const result = await reserveUsageBudget({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 500 },
      requestId: "reserve-1",
    });

    expect(result.reservedTL).toBe(2.25);
    expect(result.remainingTL).toBe(97.75);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
  });

  it("reconciles a reservation by refunding the unused portion and recording final usage", async () => {
    mockSelectLimit
      .mockResolvedValueOnce([]) // existing usage record
      .mockResolvedValueOnce([{ miktarTL: "-2.2500", sonrakiBakiye: "97.7500" }]); // reservation row
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "98.8750", email: "user@test.com" }]) // refund update
      .mockResolvedValueOnce([{ id: "refund-tx-1" }]) // refund tx
      .mockResolvedValueOnce([{ bakiye_tl: "98.1250", email: "user@test.com" }]) // final charge update
      .mockResolvedValueOnce([{ id: "final-tx-1" }]) // final tx
      .mockResolvedValueOnce([]); // usage record insert

    const { settleReservedUsage } = await import("./billing-service.js");

    const model = {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "Metin" as const,
      context: "128K",
      endpoints: ["chat"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 15,
    };

    const result = await settleReservedUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 500, completionTokens: 250 },
      responseMs: 120,
      requestId: "reserve-1",
      rawUsageJson: { promptTokens: 500, completionTokens: 250 },
      status: "success",
    });

    expect(result.costTL).toBe(1.125);
    expect(result.remainingTL).toBe(98.125);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
  });

  it("on error status, refunds the full reservation and charges zero (K1)", async () => {
    mockSelectLimit
      .mockResolvedValueOnce([]) // existing usage record: none
      .mockResolvedValueOnce([{ miktarTL: "-2.2500", sonrakiBakiye: "97.7500" }]); // reservation row
    // Error path: only refund update + refund tx + usage record insert run (no charge block, cost=0)
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "100.0000", email: "user@test.com" }]) // refund update
      .mockResolvedValueOnce([{ id: "refund-tx-1" }]) // refund tx
      .mockResolvedValueOnce([]); // usage record insert

    const { settleReservedUsage } = await import("./billing-service.js");

    const model = {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      type: "Metin" as const,
      context: "128K",
      endpoints: ["chat"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 15,
    };

    const result = await settleReservedUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 0 },
      responseMs: 90,
      requestId: "reserve-err-1",
      rawUsageJson: { promptTokens: 1000, completionTokens: 0 },
      errorCode: "upstream_502",
      status: "error",
    });

    // No charge: customer is fully refunded, cost is zero
    expect(result.costTL).toBe(0);
    expect(result.remainingTL).toBe(100);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
    // usage_records insert must record status "error" with zero cost
    const usageInsertCall = mockTxSql.mock.calls.find((call) => {
      const sql = String(call[0]?.[0] ?? call[0] ?? "");
      return sql.includes("usage_records");
    });
    expect(usageInsertCall).toBeTruthy();
  });
});
