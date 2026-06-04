import { describe, it, expect, vi, beforeEach } from "vitest";
import { InsufficientBalanceError } from "../lib/errors.js";

const mockDbSql = vi.fn();
const mockBegin = vi.fn();
const mockTxSql = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {},
  dbSql: Object.assign(mockDbSql, { begin: mockBegin }),
}));

const PKG = {
  id: "p1", ad: "Codex", fiyat_tl: "40", sure_gun: 1, gunluk_istek_limiti: 500,
  allowed_models: ["gpt-5.5"], enabled: true, tip: "request_limit",
};

describe("purchasePackageWithBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBegin.mockImplementation(async (fn: (s: typeof mockTxSql) => unknown) => fn(mockTxSql));
  });

  it("throws InsufficientBalanceError when balance UPDATE returns empty", async () => {
    mockDbSql
      .mockResolvedValueOnce([]) // dup-check: none
      .mockResolvedValueOnce([PKG]); // package lookup
    mockTxSql.mockResolvedValueOnce([]); // balance debit returns empty = insufficient
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    await expect(purchasePackageWithBalance("u1", "p1", "key-1")).rejects.toThrow(InsufficientBalanceError);
  });

  it("creates entitlement and returns new balance on success", async () => {
    mockDbSql
      .mockResolvedValueOnce([]) // dup-check: none
      .mockResolvedValueOnce([PKG]); // package lookup
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "60", email: "u@x.com" }]) // debit
      .mockResolvedValueOnce([{ id: "tx1" }]) // transactions insert
      .mockResolvedValueOnce([]) // existing entitlement: none
      .mockResolvedValueOnce([{ id: "ent1" }]); // insert entitlement
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    const res = await purchasePackageWithBalance("u1", "p1", "key-2");
    expect(res).toEqual({ entitlementId: "ent1", newBalanceTL: 60 });
  });

  it("is idempotent: a duplicate key does NOT debit again", async () => {
    mockDbSql
      .mockResolvedValueOnce([{ id: "tx1" }]) // dup-check: already purchased
      .mockResolvedValueOnce([{ bakiye_tl: "60" }]) // loadPurchaseState: balance
      .mockResolvedValueOnce([{ id: "tx1" }]) // loadPurchaseState: transaction
      .mockResolvedValueOnce([{ id: "ent1" }]); // loadPurchaseState: entitlement
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    const res = await purchasePackageWithBalance("u1", "p1", "key-dup");
    expect(res).toEqual({ entitlementId: "ent1", newBalanceTL: 60, duplicate: true });
    expect(mockBegin).not.toHaveBeenCalled(); // no transaction / no debit
  });

  it("rejects a disabled package", async () => {
    mockDbSql
      .mockResolvedValueOnce([]) // dup-check: none
      .mockResolvedValueOnce([{ ...PKG, enabled: false }]); // package lookup
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    await expect(purchasePackageWithBalance("u1", "p1", "key-3")).rejects.toThrow("satışta değil");
  });
});
