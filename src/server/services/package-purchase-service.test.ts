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
    expect(res).toEqual({ entitlementId: "ent1", extended: false, newBalanceTL: 60, tip: "request_limit" });
  });

  it("account_delivery package debits balance and creates a delivery order", async () => {
    mockDbSql
      .mockResolvedValueOnce([]) // dup-check
      .mockResolvedValueOnce([{ ...PKG, tip: "account_delivery" }]); // package lookup
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "60", email: "u@x.com" }]) // debit
      .mockResolvedValueOnce([{ id: "tx1" }]) // transactions insert
      .mockResolvedValueOnce([{ id: "ord1" }]); // delivery order insert
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    const res = await purchasePackageWithBalance("u1", "p1", "key-ad", "user@gmail.com");
    expect(res).toEqual({ deliveryOrderId: "ord1", newBalanceTL: 60, tip: "account_delivery" });
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

  it("rejects a coming-soon package (satista=false) without debiting", async () => {
    mockDbSql
      .mockResolvedValueOnce([]) // dup-check: none
      .mockResolvedValueOnce([{ ...PKG, satista: false }]); // package lookup: vitrinde ama satışa kapalı
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    await expect(purchasePackageWithBalance("u1", "p1", "key-cs")).rejects.toThrow("henüz satışta değil");
    expect(mockBegin).not.toHaveBeenCalled(); // debit transaction'a hiç girilmez
  });

  it("rejects direct purchase of a negative-price package", async () => {
    mockDbSql
      .mockResolvedValueOnce([]) // dup-check: none
      .mockResolvedValueOnce([{ ...PKG, fiyat_tl: "-10" }]); // package lookup: negative price
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    await expect(purchasePackageWithBalance("u1", "p1", "key-neg")).rejects.toThrow();
    expect(mockBegin).not.toHaveBeenCalled(); // never reaches the debit transaction
  });
});

describe("renewEntitlement (Paketimi Yenile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBegin.mockImplementation(async (fn: (s: typeof mockTxSql) => unknown) => fn(mockTxSql));
  });

  it("404 when entitlement not found / not owned by user", async () => {
    mockDbSql.mockResolvedValueOnce([]); // SELECT entitlement+package → none
    const { renewEntitlement } = await import("./package-purchase-service.js");
    await expect(renewEntitlement("u1", "e-missing")).rejects.toThrow("bulunamadı");
    expect(mockBegin).not.toHaveBeenCalled(); // hiç tahsil/satın alma yapılmaz
  });

  it("400 when package tip is not request_limit (e.g. account_delivery)", async () => {
    mockDbSql.mockResolvedValueOnce([{ package_id: "p1", tip: "account_delivery", is_configurable: false, per_user_once: false }]);
    const { renewEntitlement } = await import("./package-purchase-service.js");
    await expect(renewEntitlement("u1", "e1")).rejects.toThrow("yenilenemez");
    expect(mockBegin).not.toHaveBeenCalled();
  });

  it("400 when package is per_user_once (single-use, not renewable)", async () => {
    mockDbSql.mockResolvedValueOnce([{ package_id: "p1", tip: "request_limit", is_configurable: false, per_user_once: true }]);
    const { renewEntitlement } = await import("./package-purchase-service.js");
    await expect(renewEntitlement("u1", "e1")).rejects.toThrow("tek seferlik");
    expect(mockBegin).not.toHaveBeenCalled();
  });
});
