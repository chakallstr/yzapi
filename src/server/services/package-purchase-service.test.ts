import { describe, it, expect, vi, beforeEach } from "vitest";
import { InsufficientBalanceError } from "../lib/errors.js";

const mockDbSql = vi.fn();
const mockBegin = vi.fn();
const mockTxSql = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {},
  dbSql: Object.assign(mockDbSql, { begin: mockBegin }),
}));

describe("purchasePackageWithBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBegin.mockImplementation(async (fn: (s: typeof mockTxSql) => unknown) => fn(mockTxSql));
  });

  it("throws InsufficientBalanceError when balance UPDATE returns empty", async () => {
    mockDbSql.mockResolvedValueOnce([
      { id: "p1", ad: "Codex", fiyat_tl: "40", sure_gun: 1, gunluk_istek_limiti: 500, allowed_models: ["gpt-5.5"], enabled: true, tip: "request_limit" },
    ]);
    mockTxSql.mockResolvedValueOnce([]); // balance debit returns empty = insufficient
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    await expect(purchasePackageWithBalance("u1", "p1")).rejects.toThrow(InsufficientBalanceError);
  });

  it("creates entitlement and returns new balance on success", async () => {
    mockDbSql.mockResolvedValueOnce([
      { id: "p1", ad: "Codex", fiyat_tl: "40", sure_gun: 1, gunluk_istek_limiti: 500, allowed_models: ["gpt-5.5"], enabled: true, tip: "request_limit" },
    ]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "60", email: "u@x.com" }]) // debit
      .mockResolvedValueOnce([{ id: "tx1" }])                          // transactions insert
      .mockResolvedValueOnce([])                                       // existing entitlement: none
      .mockResolvedValueOnce([{ id: "ent1" }]);                        // insert entitlement
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    const res = await purchasePackageWithBalance("u1", "p1");
    expect(res).toEqual({ entitlementId: "ent1", newBalanceTL: 60 });
  });

  it("rejects a disabled package", async () => {
    mockDbSql.mockResolvedValueOnce([
      { id: "p1", ad: "Codex", fiyat_tl: "40", sure_gun: 1, gunluk_istek_limiti: 500, allowed_models: [], enabled: false, tip: "request_limit" },
    ]);
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    await expect(purchasePackageWithBalance("u1", "p1")).rejects.toThrow("satışta değil");
  });
});
