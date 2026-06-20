import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSql = vi.fn();
const mockBegin = vi.fn();
const mockTxSql = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {},
  dbSql: Object.assign(mockDbSql, { begin: mockBegin }),
}));

vi.mock("./entitlement-service.js", () => ({
  grantPackageEntitlement: vi.fn().mockResolvedValue({ entitlementId: "ent-pkg-1", extended: false }),
}));

describe("redeem-code-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBegin.mockImplementation(async (fn: (s: typeof mockTxSql) => unknown) => fn(mockTxSql));
  });

  it("generateRedeemCodes rejects balance without amount", async () => {
    const { generateRedeemCodes } = await import("./redeem-code-service.js");
    await expect(generateRedeemCodes({ tip: "balance", count: 1 })).rejects.toThrow("amountTL");
  });

  it("generateRedeemCodes rejects package without packageId", async () => {
    const { generateRedeemCodes } = await import("./redeem-code-service.js");
    await expect(generateRedeemCodes({ tip: "package", count: 1 })).rejects.toThrow("packageId");
  });

  it("redeemCode rejects an unknown code", async () => {
    mockTxSql.mockResolvedValueOnce([]); // lookup empty
    const { redeemCode } = await import("./redeem-code-service.js");
    await expect(redeemCode("u1", "NOPE")).rejects.toThrow("Geçersiz kod");
  });

  it("redeemCode rejects when user already used the code (23505)", async () => {
    mockTxSql
      .mockResolvedValueOnce([{ id: "rc1", tip: "balance", amount_tl: "50", max_uses: 1, used_count: 0, per_user_once: true, expires_at: null, enabled: true }])
      .mockRejectedValueOnce({ code: "23505" });
    const { redeemCode } = await import("./redeem-code-service.js");
    await expect(redeemCode("u1", "ABC")).rejects.toThrow("zaten kulland");
  });

  it("redeemCode (balance) credits and returns new balance", async () => {
    mockTxSql
      .mockResolvedValueOnce([{ id: "rc1", tip: "balance", amount_tl: "50", max_uses: 1, used_count: 0, per_user_once: true, expires_at: null, enabled: true }])
      .mockResolvedValueOnce([{ id: "use1" }])
      .mockResolvedValueOnce([{ id: "rc1" }])
      .mockResolvedValueOnce([{ bakiye_tl: "150", email: "u@x" }])
      .mockResolvedValueOnce([{ id: "tx1" }])
      .mockResolvedValueOnce([]);
    const { redeemCode } = await import("./redeem-code-service.js");
    const res = await redeemCode("u1", "abc");
    expect(res).toEqual({ tip: "balance", amountTL: 50, newBalanceTL: 150 });
  });

  it("redeemCode (package) grants an entitlement", async () => {
    mockTxSql
      .mockResolvedValueOnce([{ id: "rc1", tip: "package", package_id: "p1", max_uses: 1, used_count: 0, per_user_once: true, expires_at: null, enabled: true }])
      .mockResolvedValueOnce([{ id: "use1" }])
      .mockResolvedValueOnce([{ id: "rc1" }])
      .mockResolvedValueOnce([{ id: "p1", sure_gun: 30, gunluk_istek_limiti: 500, allowed_models: ["gpt-5.5"], enabled: true }])
      .mockResolvedValueOnce([]);
    const { redeemCode } = await import("./redeem-code-service.js");
    const res = await redeemCode("u1", "abc");
    expect(res).toEqual({ tip: "package", entitlementId: "ent-pkg-1" });
  });

  it("redeemCode (package) rejects a coming-soon package (satista=false)", async () => {
    mockTxSql
      .mockResolvedValueOnce([{ id: "rc1", tip: "package", package_id: "p1", max_uses: 1, used_count: 0, per_user_once: true, expires_at: null, enabled: true }])
      .mockResolvedValueOnce([{ id: "use1" }])
      .mockResolvedValueOnce([{ id: "rc1" }])
      .mockResolvedValueOnce([{ id: "p1", sure_gun: 30, gunluk_istek_limiti: 500, allowed_models: ["gpt-5.5"], enabled: true, satista: false }]);
    const { redeemCode } = await import("./redeem-code-service.js");
    await expect(redeemCode("u1", "abc")).rejects.toThrow("henüz satışta değil");
  });

  it("redeemCode rejects exhausted code (used_count>=max_uses)", async () => {
    mockTxSql.mockResolvedValueOnce([{ id: "rc1", tip: "balance", amount_tl: "50", max_uses: 1, used_count: 1, per_user_once: true, expires_at: null, enabled: true }]);
    const { redeemCode } = await import("./redeem-code-service.js");
    await expect(redeemCode("u1", "abc")).rejects.toThrow("limiti dolmuş");
  });
});
