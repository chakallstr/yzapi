import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSqlBegin = vi.fn();
const mockTxSql = vi.fn();

vi.mock("../db/client.js", () => ({
  dbSql: Object.assign(vi.fn(), { begin: mockDbSqlBegin }),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../lib/env.js", () => ({
  env: { NODE_ENV: "test", ORPHAN_RESERVATION_GRACE_MIN: 15 },
}));

describe("reapOrphanReservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSqlBegin.mockImplementation(async (fn: (sql: typeof mockTxSql) => unknown) => fn(mockTxSql));
  });

  it("refunds each orphan reservation with a release transaction", async () => {
    // First txSql call = SELECT orphans; rest = per-orphan UPDATE + INSERT
    mockTxSql
      .mockResolvedValueOnce([
        { idempotency_key: "usage_reserve_req-1", request_id: "req-1", user_id: "00000000-0000-0000-0000-000000000001", user_email: "u@test.com", amount_tl: "2.5000" },
      ])
      .mockResolvedValueOnce([{ bakiye_tl: "12.5000" }]) // UPDATE users refund
      .mockResolvedValueOnce([]); // INSERT release tx

    const { reapOrphanReservations } = await import("./orphan-reservation-reaper-job.js");
    const count = await reapOrphanReservations();

    expect(count).toBe(1);
    expect(mockDbSqlBegin).toHaveBeenCalledTimes(1);
    // SELECT + UPDATE + INSERT = 3 calls
    expect(mockTxSql).toHaveBeenCalledTimes(3);
  });

  it("does nothing when there are no orphans", async () => {
    mockTxSql.mockResolvedValueOnce([]); // SELECT returns none

    const { reapOrphanReservations } = await import("./orphan-reservation-reaper-job.js");
    const count = await reapOrphanReservations();

    expect(count).toBe(0);
    expect(mockTxSql).toHaveBeenCalledTimes(1); // only the SELECT
  });

  it("skips reservations with non-positive amount", async () => {
    mockTxSql.mockResolvedValueOnce([
      { idempotency_key: "usage_reserve_req-bad", request_id: "req-bad", user_id: "00000000-0000-0000-0000-000000000002", user_email: "u2@test.com", amount_tl: "0" },
    ]);

    const { reapOrphanReservations } = await import("./orphan-reservation-reaper-job.js");
    const count = await reapOrphanReservations();

    expect(count).toBe(0);
    // no UPDATE/INSERT, only SELECT
    expect(mockTxSql).toHaveBeenCalledTimes(1);
  });
});
