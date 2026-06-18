import { describe, it, expect, vi, beforeEach } from "vitest";

// OSB credentials + a PACKAGE-aware product map must be set BEFORE importing the
// service (env is parsed at import time).
process.env.SHOPIER_OSB_USERNAME = "osb_user_demo";
process.env.SHOPIER_OSB_PASSWORD = "osb_pass_demo";
// Two entries: one BALANCE-only (back-compat / current prod shape, no packageId)
// and one PACKAGE-granting (optional packageId added in B2.1).
process.env.SHOPIER_OSB_PRODUCT_MAP = JSON.stringify({
  "47233749": { priceTL: 899, creditTL: 899 }, // balance-only (no packageId) — inert default
  "55500001": { priceTL: 1500, creditTL: 1500, packageId: "pkg-codex-1" }, // package grant
  "55500002": { priceTL: 100, creditTL: 100, packageId: "" }, // empty → dropped (defensive)
  "55500003": { priceTL: 100, creditTL: 100, packageId: 42 }, // non-string → dropped (defensive)
});

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("getOsbProductMap — optional packageId (B2.1, inert by default)", () => {
  beforeEach(async () => {
    const { resetOsbProductMapCache } = await import("./shopier-service.js");
    resetOsbProductMapCache();
  });

  it("parses packageId when present, leaves it undefined otherwise (back-compat)", async () => {
    const { resolveOsbProduct } = await import("./shopier-service.js");
    const balanceOnly = resolveOsbProduct("47233749");
    const pkg = resolveOsbProduct("55500001");
    expect(balanceOnly).toEqual({ priceTL: 899, creditTL: 899 });
    expect(balanceOnly?.packageId).toBeUndefined(); // INERT: no packageId → balance path
    expect(pkg).toMatchObject({ priceTL: 1500, creditTL: 1500, packageId: "pkg-codex-1" });
  });

  it("ignores a non-string / empty packageId (defensive parse, falls back to balance)", async () => {
    const { getOsbProductMap } = await import("./shopier-service.js");
    const map = getOsbProductMap();
    // empty/non-string packageId → undefined (still a valid balance entry, not dropped)
    expect(map["55500002"]).toEqual({ priceTL: 100, creditTL: 100 });
    expect(map["55500002"].packageId).toBeUndefined();
    expect(map["55500003"]).toEqual({ priceTL: 100, creditTL: 100 });
    expect(map["55500003"].packageId).toBeUndefined();
    // valid string packageId survives
    expect(map["55500001"].packageId).toBe("pkg-codex-1");
  });
});

// ── grantOsbPackageEntitlement — behavioral, fully dependency-injected ──────────
//
// The OSB route handler delegates the package-grant decision to this helper. DB,
// entitlement grant, dead-letter and notify are INJECTED so the decision logic is
// unit-tested without a database. This is the real RED→GREEN behavioral coverage
// for B2.1 (grant vs credit) and B2.2 (inactive/unknown guard).

function makeDeps(over: Partial<any> = {}) {
  return {
    loadPackageForGrant: vi.fn(async (_id: string) => ({
      id: "pkg-codex-1",
      enabled: true,
      satista: true,
      kategori: "Codex",
      sureGun: 30,
      gunlukIstekLimiti: 1000,
      allowedModels: ["gpt-5.5"],
    })),
    grantEntitlement: vi.fn(async () => ({ entitlementId: "ent-1", already: false })),
    recordDeadLetter: vi.fn(async () => {}),
    notifyPaid: vi.fn(async () => {}),
    notifyProblem: vi.fn(async () => {}),
    ...over,
  };
}

describe("grantOsbPackageEntitlement — B2.1 grant path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grants the package (idempotent osb key) and fires odeme_yapildi on a fresh grant; does NOT credit balance", async () => {
    const { grantOsbPackageEntitlement } = await import("./shopier-osb-package-service.js");
    const deps = makeDeps();
    const r = await grantOsbPackageEntitlement(deps as any, {
      userId: "u-1",
      packageId: "pkg-codex-1",
      orderId: "OSB-1",
    });

    expect(r.granted).toBe(true);
    expect(r.deadLetter).toBeFalsy();
    // grant called with the OSB idempotency key
    expect(deps.grantEntitlement).toHaveBeenCalledTimes(1);
    expect(deps.grantEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", packageId: "pkg-codex-1", idempotencyKey: "osb_OSB-1" }),
    );
    // fresh grant → notify paid once
    expect(deps.notifyPaid).toHaveBeenCalledTimes(1);
    expect(deps.notifyProblem).not.toHaveBeenCalled();
    expect(deps.recordDeadLetter).not.toHaveBeenCalled();
  });

  it("does NOT re-notify on a replay (already-granted) — exactly-once", async () => {
    const { grantOsbPackageEntitlement } = await import("./shopier-osb-package-service.js");
    const deps = makeDeps({
      grantEntitlement: vi.fn(async () => ({ entitlementId: "ent-1", already: true })),
    });
    const r = await grantOsbPackageEntitlement(deps as any, {
      userId: "u-1",
      packageId: "pkg-codex-1",
      orderId: "OSB-1",
    });
    expect(r.granted).toBe(true);
    expect(deps.notifyPaid).not.toHaveBeenCalled(); // replay → no notify
    expect(deps.notifyProblem).not.toHaveBeenCalled();
  });
});

describe("grantOsbPackageEntitlement — B2.2 inactive/unknown guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does NOT grant an inactive (enabled=false) package → dead-letter + odeme_sorunu", async () => {
    const { grantOsbPackageEntitlement } = await import("./shopier-osb-package-service.js");
    const deps = makeDeps({
      loadPackageForGrant: vi.fn(async () => ({
        id: "pkg-codex-1", enabled: false, satista: true, kategori: "Codex",
        sureGun: 30, gunlukIstekLimiti: 1000, allowedModels: [],
      })),
    });
    const r = await grantOsbPackageEntitlement(deps as any, {
      userId: "u-1", packageId: "pkg-codex-1", orderId: "OSB-2",
    });
    expect(r.granted).toBe(false);
    expect(r.deadLetter).toBe(true);
    expect(deps.grantEntitlement).not.toHaveBeenCalled();
    expect(deps.recordDeadLetter).toHaveBeenCalledWith("OSB-2", "package_not_sellable", expect.anything());
    expect(deps.notifyProblem).toHaveBeenCalledTimes(1);
    expect(deps.notifyPaid).not.toHaveBeenCalled();
  });

  it("does NOT grant a satista=false (not-yet-for-sale) package → dead-letter + odeme_sorunu", async () => {
    const { grantOsbPackageEntitlement } = await import("./shopier-osb-package-service.js");
    const deps = makeDeps({
      loadPackageForGrant: vi.fn(async () => ({
        id: "pkg-codex-1", enabled: true, satista: false, kategori: "Codex",
        sureGun: 30, gunlukIstekLimiti: 1000, allowedModels: [],
      })),
    });
    const r = await grantOsbPackageEntitlement(deps as any, {
      userId: "u-1", packageId: "pkg-codex-1", orderId: "OSB-3",
    });
    expect(r.granted).toBe(false);
    expect(r.deadLetter).toBe(true);
    expect(deps.grantEntitlement).not.toHaveBeenCalled();
    expect(deps.notifyProblem).toHaveBeenCalledTimes(1);
  });

  it("does NOT grant an unknown package (not found) → dead-letter + odeme_sorunu", async () => {
    const { grantOsbPackageEntitlement } = await import("./shopier-osb-package-service.js");
    const deps = makeDeps({ loadPackageForGrant: vi.fn(async () => null) });
    const r = await grantOsbPackageEntitlement(deps as any, {
      userId: "u-1", packageId: "ghost", orderId: "OSB-4",
    });
    expect(r.granted).toBe(false);
    expect(r.deadLetter).toBe(true);
    expect(deps.grantEntitlement).not.toHaveBeenCalled();
    expect(deps.recordDeadLetter).toHaveBeenCalledWith("OSB-4", "unknown_package", expect.anything());
    expect(deps.notifyProblem).toHaveBeenCalledTimes(1);
  });
});
