import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/cf-ledger-service.js", () => ({
  listCfCustomerIds: vi.fn(),
  mapCfEventsToLedgerRows: vi.fn(() => []),
  latestRemainingFromRows: vi.fn(),
  resolveFreshestRemaining: vi.fn(),
  syncCfRemainingMirror: vi.fn(),
}));
vi.mock("../services/codefast-reseller-service.js", () => ({
  cfUsage: vi.fn(),
  CodefastError: class CodefastError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "CodefastError";
    }
  },
}));
vi.mock("../services/codefast-provisioning-service.js", () => ({ topUpCfIfNeeded: vi.fn() }));
vi.mock("../db/client.js", () => ({ dbSql: vi.fn().mockResolvedValue([{ id: "ent-1" }]) }));

describe("cf-mirror-sync-job", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aktif müşteri için aynayı CF-gerçeğine eşitler + düşük havuzda override ile top-up çağırır", async () => {
    const led = await import("../services/cf-ledger-service.js");
    const res = await import("../services/codefast-reseller-service.js");
    const prov = await import("../services/codefast-provisioning-service.js");
    (led.listCfCustomerIds as any).mockResolvedValue(["c1"]);
    (res.cfUsage as any).mockResolvedValue({});
    (led.resolveFreshestRemaining as any).mockResolvedValue(5);
    const { runCfMirrorSyncTick } = await import("./cf-mirror-sync-job.js");
    const out = await runCfMirrorSyncTick({ dryRun: false, proactiveTopup: true });
    expect(out.customers).toBe(1);
    expect(led.syncCfRemainingMirror).toHaveBeenCalledWith("c1", 5);
    expect(prov.topUpCfIfNeeded).toHaveBeenCalledWith("ent-1", 5); // CF-gerçeği override geçilir
  });

  it("dryRun: hiçbir yazma/top-up yok", async () => {
    const led = await import("../services/cf-ledger-service.js");
    const res = await import("../services/codefast-reseller-service.js");
    const prov = await import("../services/codefast-provisioning-service.js");
    (led.listCfCustomerIds as any).mockResolvedValue(["c1"]);
    (res.cfUsage as any).mockResolvedValue({});
    (led.latestRemainingFromRows as any).mockReturnValue(5);
    const { runCfMirrorSyncTick } = await import("./cf-mirror-sync-job.js");
    await runCfMirrorSyncTick({ dryRun: true, proactiveTopup: true });
    expect(led.syncCfRemainingMirror).not.toHaveBeenCalled();
    expect(led.resolveFreshestRemaining).not.toHaveBeenCalled(); // dry-run SELECT'siz kalır
    expect(prov.topUpCfIfNeeded).not.toHaveBeenCalled();
  });

  it("proactiveTopup kapalı: mirror eşitlenir ama top-up çağrılmaz", async () => {
    const led = await import("../services/cf-ledger-service.js");
    const res = await import("../services/codefast-reseller-service.js");
    const prov = await import("../services/codefast-provisioning-service.js");
    (led.listCfCustomerIds as any).mockResolvedValue(["c1"]);
    (res.cfUsage as any).mockResolvedValue({});
    (led.resolveFreshestRemaining as any).mockResolvedValue(5);
    const { runCfMirrorSyncTick } = await import("./cf-mirror-sync-job.js");
    await runCfMirrorSyncTick({ dryRun: false, proactiveTopup: false });
    expect(led.syncCfRemainingMirror).toHaveBeenCalledWith("c1", 5);
    expect(prov.topUpCfIfNeeded).not.toHaveBeenCalled();
  });

  it("bir müşteri patlarsa diğerleri devam (never-throw)", async () => {
    const led = await import("../services/cf-ledger-service.js");
    const res = await import("../services/codefast-reseller-service.js");
    (led.listCfCustomerIds as any).mockResolvedValue(["bad", "c2"]);
    (res.cfUsage as any).mockRejectedValueOnce(new Error("boom")).mockResolvedValue({});
    (led.resolveFreshestRemaining as any).mockResolvedValue(10);
    const { runCfMirrorSyncTick } = await import("./cf-mirror-sync-job.js");
    await expect(runCfMirrorSyncTick({ dryRun: false, proactiveTopup: false })).resolves.toEqual({ customers: 2 });
    expect(led.syncCfRemainingMirror).toHaveBeenCalledWith("c2", 10); // ikinci müşteri yine işlendi
  });

  it("CodeFast 429 görünce aynı tick içinde kalan müşterileri zorlamaz", async () => {
    const led = await import("../services/cf-ledger-service.js");
    const res = await import("../services/codefast-reseller-service.js");
    (led.listCfCustomerIds as any).mockResolvedValue(["rate-limited", "c2", "c3"]);
    (res.cfUsage as any).mockRejectedValueOnce(new res.CodefastError(429, "rate limited"));
    const { runCfMirrorSyncTick } = await import("./cf-mirror-sync-job.js");
    await expect(runCfMirrorSyncTick({ dryRun: false, proactiveTopup: false })).resolves.toEqual({ customers: 3 });
    expect(res.cfUsage).toHaveBeenCalledTimes(1);
    expect(led.syncCfRemainingMirror).not.toHaveBeenCalled();
  });

  it("remaining null ise top-up çağrılmaz (mirror sync yine güvenli — kendisi guard'lar)", async () => {
    const led = await import("../services/cf-ledger-service.js");
    const res = await import("../services/codefast-reseller-service.js");
    const prov = await import("../services/codefast-provisioning-service.js");
    (led.listCfCustomerIds as any).mockResolvedValue(["c1"]);
    (res.cfUsage as any).mockResolvedValue({});
    (led.resolveFreshestRemaining as any).mockResolvedValue(null);
    const { runCfMirrorSyncTick } = await import("./cf-mirror-sync-job.js");
    await runCfMirrorSyncTick({ dryRun: false, proactiveTopup: true });
    expect(prov.topUpCfIfNeeded).not.toHaveBeenCalled();
    expect(led.syncCfRemainingMirror).toHaveBeenCalledWith("c1", null);
  });
});
