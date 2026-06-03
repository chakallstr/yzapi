import { describe, it, expect, vi, beforeEach } from "vitest";
import { calcKdv } from "./payment-common.js";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  transaction: vi.fn(),
  txUpdateSet: vi.fn(),
  txUpdateWhere: vi.fn(),
  txUpdateReturning: vi.fn(),
  txInsertValues: vi.fn(),
  txReturning: vi.fn(),
}));

// Mock the db import to prevent real DB connections
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.limit,
        })),
      })),
    })),
    transaction: mocks.transaction,
  },
}));

vi.mock("./audit-service.js", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./email-service.js", () => ({ paymentReceiptEmail: vi.fn().mockResolvedValue(undefined) }));

describe("calcKdv — KDV-inclusive math", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockReset();
    mocks.transaction.mockReset();
    mocks.txUpdateSet.mockReset();
    mocks.txUpdateWhere.mockReset();
    mocks.txUpdateReturning.mockReset();
    mocks.txInsertValues.mockReset();
    mocks.txReturning.mockReset();
    mocks.transaction.mockImplementation(async (fn) => fn({
      update: vi.fn(() => ({
        set: mocks.txUpdateSet.mockImplementation(() => ({
          where: mocks.txUpdateWhere.mockReturnValue({
            returning: mocks.txUpdateReturning.mockResolvedValue([{ email: "u@test.com", adSoyad: "Test User", bakiyeTL: "160.0000" }]),
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: mocks.txInsertValues.mockReturnValue({
          returning: mocks.txReturning.mockResolvedValue([{ id: "tx-123" }]),
        }),
      })),
    }));
  });

  it("extracts correct net and KDV from gross at 20%", () => {
    const result = calcKdv(120);
    expect(result.gross).toBe(120);
    // net = 120 / 1.20 = 100
    expect(result.netTL).toBeCloseTo(100, 4);
    // kdv = 120 - 100 = 20
    expect(result.kdvTL).toBeCloseTo(20, 4);
  });

  it("gross = netTL + kdvTL", () => {
    const r = calcKdv(250);
    expect(r.netTL + r.kdvTL).toBeCloseTo(r.gross, 4);
  });

  it("handles small amounts without negative kdv", () => {
    const r = calcKdv(0.01);
    expect(r.kdvTL).toBeGreaterThanOrEqual(0);
    expect(r.netTL).toBeGreaterThan(0);
  });

  it("zero gross yields zero net and zero kdv", () => {
    const r = calcKdv(0);
    expect(r.netTL).toBe(0);
    expect(r.kdvTL).toBe(0);
  });

  it("rounds to 4 decimal places", () => {
    const r = calcKdv(100);
    const decimals = (v: number) => (v.toString().split(".")[1] ?? "").length;
    expect(decimals(r.netTL)).toBeLessThanOrEqual(4);
    expect(decimals(r.kdvTL)).toBeLessThanOrEqual(4);
  });

  it("large amount stays consistent", () => {
    const r = calcKdv(50000);
    expect(r.netTL + r.kdvTL).toBeCloseTo(50000, 2);
  });

  it("KDV_RATE env var default is 0.20 — net = gross/1.20", () => {
    // env.KDV_RATE defaults to 0.20 in test setup
    const r = calcKdv(1200);
    expect(r.netTL).toBeCloseTo(1000, 3);
  });
});

describe("creditUserBalance — usable TL balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockReset();
    mocks.transaction.mockReset();
    mocks.txUpdateSet.mockReset();
    mocks.txUpdateWhere.mockReset();
    mocks.txUpdateReturning.mockReset();
    mocks.txInsertValues.mockReset();
    mocks.txReturning.mockReset();
    mocks.transaction.mockImplementation(async (fn) => fn({
      update: vi.fn(() => ({
        set: mocks.txUpdateSet.mockImplementation(() => ({
          where: mocks.txUpdateWhere.mockReturnValue({
            returning: mocks.txUpdateReturning.mockResolvedValue([{ email: "u@test.com", adSoyad: "Test User", bakiyeTL: "160.0000" }]),
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: mocks.txInsertValues.mockReturnValue({
          returning: mocks.txReturning.mockResolvedValue([{ id: "tx-123" }]),
        }),
      })),
    }));
  });

  it("credits the full gross amount as usable balance", async () => {
    mocks.limit
      .mockResolvedValueOnce([{ id: "pay-1", durum: "bekliyor", transactionId: null }])
      .mockResolvedValueOnce([{ email: "u@test.com", adSoyad: "Test User", bakiyeTL: "40.0000" }]);

    const { creditUserBalance } = await import("./payment-common.js");

    const result = await creditUserBalance("user-1", "pay-1", 120, "iban", "KEY-ABC123");

    expect(result).toEqual({ success: true, txId: "tx-123" });
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      tip: "yukleme",
      miktarTL: "120",
      oncekiBakiye: "40",
      sonrakiBakiye: "160",
      idempotencyKey: "pay_KEY-ABC123",
    }));
  });

  it("increments balance atomically instead of setting a stale snapshot", async () => {
    mocks.limit
      .mockResolvedValueOnce([{ id: "pay-1", durum: "bekliyor", transactionId: null }])
      .mockResolvedValueOnce([{ email: "u@test.com", adSoyad: "Test User", bakiyeTL: "40.0000" }]);

    const { creditUserBalance } = await import("./payment-common.js");

    await creditUserBalance("user-1", "pay-1", 120, "iban", "KEY-ABC123");

    const balanceUpdate = mocks.txUpdateSet.mock.calls[0]?.[0];
    expect(balanceUpdate).toBeDefined();
    expect(balanceUpdate.bakiyeTL).not.toBe("160");
    expect(typeof balanceUpdate.bakiyeTL).not.toBe("string");
  });

  it("does not credit the same successful payment twice", async () => {
    mocks.limit.mockResolvedValueOnce([{ id: "pay-1", durum: "basarili", transactionId: "tx-existing" }]);

    const { creditUserBalance } = await import("./payment-common.js");

    const result = await creditUserBalance("user-1", "pay-1", 120, "iban", "KEY-ABC123");

    expect(result).toEqual({ success: true, alreadyCredited: true, txId: "tx-existing" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
