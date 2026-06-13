import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./codefast-reseller-service.js", () => ({
  cfCreateOrder: vi.fn(),
  cfGetOrder: vi.fn(),
  extractCustomerKey: (o: any) => o?.customer_api_key?.api_key ?? null,
  CodefastError: class CodefastError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = "CodefastError"; }
  },
}));
vi.mock("../db/client.js", () => {
  const fn: any = vi.fn().mockResolvedValue([]);
  return { dbSql: fn };
});
vi.mock("./api-key-service.js", () => ({ encryptApiKey: (s: string) => `cipher(${s})` }));

describe("codefast-provisioning-service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("auto product → stores key + provisioned, sends Idempotency-Key", async () => {
    const { cfCreateOrder } = await import("./codefast-reseller-service.js");
    (cfCreateOrder as any).mockResolvedValue({
      order: { id: "ord1", status: "fulfilled", reseller_cost_amount: 1035 },
      customer: { id: "cust1" }, entitlement_ids: ["ent1"], manual_review_required: false,
      customer_api_key: { api_key: "cf_rc_live_abc" },
    });
    const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
    const r = await provisionCodefastEntitlement({
      entitlementId: "e1", userId: "u1", externalOrderId: "pkg_purchase_u1_x",
      pkg: { cfCatalogId: "c1", cfApiSlug: "codex-api", cfManual: false, gunlukIstekLimiti: 500, sureGun: 30 },
      username: "u1",
    });
    expect(r).toEqual({ cfStatus: "provisioned", cfOrderId: "ord1" });
    expect(cfCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ external_customer_id: "u1", items: [{ catalog_id: "c1", limit_amount: 500, duration_days: 30 }] }),
      "pkg_purchase_u1_x",
    );
  });

  it("manual product (Claude) → pending_manual, no key stored", async () => {
    const { cfCreateOrder } = await import("./codefast-reseller-service.js");
    (cfCreateOrder as any).mockResolvedValue({
      order: { id: "ord2", status: "manual_review", reseller_cost_amount: 155.25 },
      customer: { id: "cust2" }, manual_review_required: true,
    });
    const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
    const r = await provisionCodefastEntitlement({
      entitlementId: "e2", userId: "u2", externalOrderId: "k2",
      pkg: { cfCatalogId: "claude", cfApiSlug: "claude-api", cfManual: true, gunlukIstekLimiti: 0, sureGun: 999, cfTokenMillions: 25 },
    });
    expect(r.cfStatus).toBe("pending_manual");
    expect(cfCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ catalog_id: "claude", claude_token_millions: 25 }] }),
      "k2",
    );
  });

  it("auto product, no key on create (idempotent replay) + cfGetOrder also no key → failed (NOT pending)", async () => {
    const { cfCreateOrder, cfGetOrder } = await import("./codefast-reseller-service.js");
    (cfCreateOrder as any).mockResolvedValue({
      order: { id: "ord5", status: "fulfilled" }, customer: { id: "c5" }, manual_review_required: false, idempotent: true,
      // customer_api_key OMITTED (idempotent replay)
    });
    (cfGetOrder as any).mockResolvedValue({ order: { id: "ord5", status: "fulfilled" }, manual_review_required: false }); // still no key
    const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
    const r = await provisionCodefastEntitlement({
      entitlementId: "e5", userId: "u5", externalOrderId: "o5",
      pkg: { cfCatalogId: "c1", cfApiSlug: "codex-api", cfManual: false, gunlukIstekLimiti: 500, sureGun: 30 },
    });
    expect(r.cfStatus).toBe("failed"); // auto ürün anahtarsız → failed (çağıran iade eder), pending DEĞİL
    expect(cfGetOrder).toHaveBeenCalledWith("ord5");
  });

  it("auto product, no key on create but cfGetOrder RECOVERS key → provisioned", async () => {
    const { cfCreateOrder, cfGetOrder } = await import("./codefast-reseller-service.js");
    (cfCreateOrder as any).mockResolvedValue({
      order: { id: "ord6", status: "fulfilled" }, customer: { id: "c6" }, manual_review_required: false, idempotent: true,
    });
    (cfGetOrder as any).mockResolvedValue({ order: { id: "ord6", status: "fulfilled" }, manual_review_required: false, customer_api_key: { api_key: "cf_rc_live_recovered" } });
    const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
    const r = await provisionCodefastEntitlement({
      entitlementId: "e6", userId: "u6", externalOrderId: "o6",
      pkg: { cfCatalogId: "c1", cfApiSlug: "codex-api", cfManual: false, gunlukIstekLimiti: 500, sureGun: 30 },
    });
    expect(r.cfStatus).toBe("provisioned");
  });

  it("CF error → failed (never throws)", async () => {
    const { cfCreateOrder, CodefastError } = await import("./codefast-reseller-service.js");
    (cfCreateOrder as any).mockRejectedValue(new (CodefastError as any)(402, "no balance"));
    const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
    const r = await provisionCodefastEntitlement({
      entitlementId: "e3", userId: "u3", externalOrderId: "z",
      pkg: { cfCatalogId: "c1", cfApiSlug: "codex-api", cfManual: false, gunlukIstekLimiti: 500, sureGun: 30 },
    });
    expect(r.cfStatus).toBe("failed");
  });

  it("attachManualCustomerKey rejects non-cf_rc_live_ keys", async () => {
    const { attachManualCustomerKey } = await import("./codefast-provisioning-service.js");
    await expect(attachManualCustomerKey("e1", "bad_key")).rejects.toThrow();
  });
});
