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

  it("prices cache-read tokens at flat $0.06/1M instead of the full input rate", async () => {
    // Mock input price: 750 TL / $15 per 1M => kur*carpan ratio = 50.
    // Flat cache-read = $0.06/1M => 0.06 * 50 = 3.0 TL/1M.
    // 1000 prompt tokens, ALL cache-read => billable base = 0.
    //   cost = (0/1e6)*750 + (1000/1e6)*3.0 = 0.003 TL   (was 0.75 TL at full rate)
    mockSelectLimit.mockResolvedValueOnce([]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "99.9975", email: "user@test.com" }])
      .mockResolvedValueOnce([{ id: "tx-cache-1" }])
      .mockResolvedValueOnce([]);

    const { chargeUsage } = await import("./billing-service.js");

    const model = {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      provider: "anthropic",
      type: "Metin" as const,
      context: "1M",
      endpoints: ["messages"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 25,
    };

    const result = await chargeUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 0 },
      responseMs: 200,
      status: "success",
      requestId: "req-cache-1",
      rawUsageJson: { input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: 0 },
    });

    // Cache-read discount applied: 0.003 TL, NOT the 0.75 TL full-rate charge.
    expect(result.costTL).toBe(0.003);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
  });

  it("splits mixed base+cache-read prompt: base at full rate, cache-read at $0.06/1M", async () => {
    // 1000 prompt total, 800 cache-read => 200 base.
    //   TL = (200/1e6)*750 + (800/1e6)*3.0 = 0.15 + 0.0024 = 0.1524
    mockSelectLimit.mockResolvedValueOnce([]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "99.8480", email: "user@test.com" }])
      .mockResolvedValueOnce([{ id: "tx-cache-2" }])
      .mockResolvedValueOnce([]);

    const { chargeUsage } = await import("./billing-service.js");

    const model = {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      provider: "anthropic",
      type: "Metin" as const,
      context: "1M",
      endpoints: ["messages"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 25,
    };

    const result = await chargeUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 0 },
      responseMs: 200,
      status: "success",
      requestId: "req-cache-2",
      rawUsageJson: { input_tokens: 200, cache_read_input_tokens: 800, output_tokens: 0 },
    });

    expect(result.costTL).toBe(0.1524);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
  });

  it("applies the cache-read discount from the LIVE ChatUsage shape (cache under .providerRaw)", async () => {
    // Production path: proxy passes the normalized ChatUsage object as
    // rawUsageJson; the raw provider usage (with cache_read_input_tokens) lives
    // under `.providerRaw`, NOT at the top level. Billing must unwrap it.
    // 1000 prompt, all cache-read => 0.003 TL (same as the direct-raw case).
    mockSelectLimit.mockResolvedValueOnce([]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "99.9975", email: "user@test.com" }])
      .mockResolvedValueOnce([{ id: "tx-cache-live-1" }])
      .mockResolvedValueOnce([]);

    const { chargeUsage } = await import("./billing-service.js");

    const model = {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      provider: "anthropic",
      type: "Metin" as const,
      context: "1M",
      endpoints: ["messages"] as string[],
      providerInputUsd: 5,
      providerOutputUsd: 25,
    };

    const result = await chargeUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 0 },
      responseMs: 200,
      status: "success",
      requestId: "req-cache-live-1",
      // LIVE shape: top-level has normalized tokens; cache is under providerRaw.
      rawUsageJson: {
        promptTokens: 1000,
        completionTokens: 0,
        providerRaw: { input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: 0 },
      },
    });

    expect(result.costTL).toBe(0.003);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
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

  it("settles even when real cost exceeds reservation without dropping the charge (Y2)", async () => {
    mockSelectLimit
      .mockResolvedValueOnce([]) // existing usage record: none
      .mockResolvedValueOnce([{ miktarTL: "-2.2500", sonrakiBakiye: "1.0000" }]); // small reservation, low remaining
    // Overage path: refund (+2.25) then charge a larger actual cost. The charge
    // UPDATE no longer has a balance guard, so it must succeed and write the
    // final tx + usage record (regression guard for Y2 partial-commit bug).
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "3.2500", email: "user@test.com" }]) // refund update (1.00 + 2.25)
      .mockResolvedValueOnce([{ id: "refund-tx-1" }]) // refund tx
      .mockResolvedValueOnce([{ bakiye_tl: "-1.2500", email: "user@test.com" }]) // charge update (3.25 - 4.50), may dip negative
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

    // computePrice mock => input 15 tl/1M, output 60 tl/1M.
    // 1000 prompt + 1000 completion => (1000/1e6)*750? no: mock returns tl input 750, output 3000.
    // cost = (1000/1e6)*750 + (1000/1e6)*3000 = 0.75 + 3.0 = 3.75 (just needs to exceed reserve 2.25)
    const result = await settleReservedUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 1000 },
      responseMs: 150,
      requestId: "reserve-overage-1",
      rawUsageJson: { promptTokens: 1000, completionTokens: 1000 },
      status: "success",
    });

    // The final charge must be applied (no silent drop), balance reflects charge update
    expect(result.costTL).toBeGreaterThan(2.25);
    expect(result.remainingTL).toBe(-1.25);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
    // both refund and charge UPDATEs plus the usage record insert ran
    expect(mockTxSql).toHaveBeenCalledTimes(5);
  });

  it("charges the estimate and records stream_missing_usage when the upstream omits usage (G4)", async () => {
    mockSelectLimit
      .mockResolvedValueOnce([]) // existing usage record: none
      .mockResolvedValueOnce([{ miktarTL: "-2.2500", sonrakiBakiye: "97.7500" }]); // reservation row
    // Fallback ON: this is NOT an error, so the estimated cost is still charged.
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "100.0000", email: "user@test.com" }]) // refund update
      .mockResolvedValueOnce([{ id: "refund-tx-1" }]) // refund tx
      .mockResolvedValueOnce([{ bakiye_tl: "99.2500", email: "user@test.com" }]) // charge update
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

    // computePrice mock => input 750 tl/1M. 1000 prompt tokens => 0.75 TL estimate.
    const result = await settleReservedUsage({
      userId: "00000000-0000-0000-0000-000000000001",
      apiKeyId: "00000000-0000-0000-0000-000000000002",
      model,
      usage: { promptTokens: 1000, completionTokens: 0 },
      responseMs: 110,
      requestId: "reserve-stream-missing-1",
      rawUsageJson: { promptTokens: 1000, completionTokens: 0 },
      status: "stream_missing_usage",
    });

    // Unlike the error path (cost 0), the estimate is charged here.
    expect(result.costTL).toBeGreaterThan(0);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
    // refund + charge + usage record insert all ran (5 tx calls)
    expect(mockTxSql).toHaveBeenCalledTimes(5);
    // usage_records insert must carry the stream_missing_usage status + error code
    const usageInsertCall = mockTxSql.mock.calls.find((call) => {
      const sql = String(call[0]?.[0] ?? call[0] ?? "");
      return sql.includes("usage_records");
    });
    expect(usageInsertCall).toBeTruthy();
  });
});
