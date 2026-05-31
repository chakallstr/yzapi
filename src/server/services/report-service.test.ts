import { describe, expect, it } from "vitest";
import {
  monthRange,
  buildMonthlyReportCsv,
  buildMonthlyReportPdf,
  type MonthlyReport,
} from "./report-service.js";

const sampleReport: MonthlyReport = {
  month: "2026-05",
  rangeStart: "2026-05-01T00:00:00.000Z",
  rangeEnd: "2026-06-01T00:00:00.000Z",
  summary: {
    requestCount: 4821,
    successfulRequests: 4800,
    failedRequests: 21,
    inputTokens: 1_200_000,
    outputTokens: 340_000,
    totalTokens: 1_540_000,
    costUsd: 12.3456,
    costTL: 583.21,
    paymentTL: 1000,
  },
  byModel: [
    {
      modelId: "claude-opus-4-7",
      requestCount: 4821,
      inputTokens: 1_200_000,
      outputTokens: 340_000,
      costUsd: 12.3456,
      costTL: 583.21,
    },
  ],
};

describe("monthRange", () => {
  it("returns half-open UTC range for a valid month", () => {
    const { start, end } = monthRange("2026-05");
    expect(start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("wraps year boundary for December", () => {
    const { start, end } = monthRange("2026-12");
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(() => monthRange("2026-13")).toThrow("invalid_month");
    expect(() => monthRange("2026-00")).toThrow("invalid_month");
    expect(() => monthRange("not-a-month")).toThrow("invalid_month");
    expect(() => monthRange("2026/05")).toThrow("invalid_month");
  });
});

describe("buildMonthlyReportCsv", () => {
  it("includes the real request count, not a capped number", () => {
    const csv = buildMonthlyReportCsv(sampleReport);
    expect(csv).toContain('"Istek sayisi","4821"');
    expect(csv).toContain('"claude-opus-4-7"');
  });

  it("escapes embedded quotes", () => {
    const csv = buildMonthlyReportCsv({
      ...sampleReport,
      byModel: [{ ...sampleReport.byModel[0], modelId: 'weird"model' }],
    });
    expect(csv).toContain('"weird""model"');
  });
});

describe("buildMonthlyReportPdf", () => {
  it("produces a valid PDF buffer", () => {
    const pdf = buildMonthlyReportPdf(sampleReport);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-5).toString("latin1")).toBe("%%EOF");
    expect(pdf.toString("latin1")).toContain("4821");
  });
});
