import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSql = vi.fn();
const mockOnConflict = vi.fn();
const mockReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflict }));

vi.mock("../db/client.js", () => ({
  db: { insert: () => ({ values: mockInsertValues }) },
  dbSql: mockDbSql,
}));

describe("entitlement-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflict.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
  });

  it("tryReservePackageSlot returns covered+id when UPDATE returns a row", async () => {
    mockDbSql.mockResolvedValueOnce([{ id: "ent-1" }]);
    const { tryReservePackageSlot } = await import("./entitlement-service.js");
    const res = await tryReservePackageSlot("user-1", "claude-opus-4.8");
    expect(res).toMatchObject({ covered: true, entitlementId: "ent-1" });
  });

  it("tryReservePackageSlot returns not-covered when UPDATE returns empty (quota exhausted)", async () => {
    mockDbSql.mockResolvedValueOnce([]);
    const { tryReservePackageSlot } = await import("./entitlement-service.js");
    const res = await tryReservePackageSlot("user-1", "claude-opus-4.8");
    expect(res).toEqual({ covered: false });
  });

  it("checkPackageCoverage returns true when a covering entitlement exists", async () => {
    mockDbSql.mockResolvedValueOnce([{ id: "ent-1" }]);
    const { checkPackageCoverage } = await import("./entitlement-service.js");
    expect(await checkPackageCoverage("u", "claude-opus-4.8")).toBe(true);
  });

  it("recordPackageUsage writes a usage row with costTL=0 and billed_via=package", async () => {
    const { recordPackageUsage } = await import("./entitlement-service.js");
    await recordPackageUsage({
      userId: "u", apiKeyId: "k", modelId: "claude-opus-4.8", entitlementId: "e",
      inputUsage: 10, outputUsage: 5, responseMs: 100, status: "success", requestId: "r1",
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ costTL: "0", billedVia: "package", entitlementId: "e" }),
    );
  });
});
