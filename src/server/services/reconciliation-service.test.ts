import { describe, expect, it } from "vitest";
import { buildReconciliationReport } from "./reconciliation-service.js";

describe("buildReconciliationReport", () => {
  it("returns ok when balances match ledger totals", () => {
    const report = buildReconciliationReport({
      totals: {
        users: "2",
        currentBalanceTL: "170.0000",
        ledgerBalanceTL: "170.0000",
        creditsTL: "250.0000",
        debitsTL: "80.0000",
        usageRecordsTL: "80.0000",
        usageRecordCount: "4",
        errorUsageCount: "1",
        streamMissingUsageCount: "0",
        upstreamErrorCount: "1",
      },
      userDrifts: [],
    });

    expect(report.status).toBe("ok");
    expect(report.totals.driftTL).toBe(0);
    expect(report.totals.usageRecordCount).toBe(4);
    expect(report.totals.upstreamErrorCount).toBe(1);
  });

  it("returns drift and lists user balance mismatches", () => {
    const report = buildReconciliationReport({
      totals: {
        users: "1",
        currentBalanceTL: "120.0000",
        ledgerBalanceTL: "100.0000",
        creditsTL: "120.0000",
        debitsTL: "20.0000",
        usageRecordsTL: "20.0000",
        usageRecordCount: "1",
        errorUsageCount: "0",
        streamMissingUsageCount: "0",
        upstreamErrorCount: "0",
      },
      userDrifts: [{
        userId: "user-1",
        email: "u@example.com",
        currentBalanceTL: "120.0000",
        ledgerBalanceTL: "100.0000",
        driftTL: "20.0000",
      }],
    });

    expect(report.status).toBe("drift");
    expect(report.totals.driftTL).toBe(20);
    expect(report.userDrifts).toEqual([{
      userId: "user-1",
      email: "u@example.com",
      currentBalanceTL: 120,
      ledgerBalanceTL: 100,
      driftTL: 20,
    }]);
  });
});
