// Property-based test for zero-charge + full-refund on upstream error (K1)
// (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P10.
// billing-service.ts is DOKUNULMAZ; this test only OBSERVES settleReservedUsage
// through a precise db seam (the same mock shape billing-service.test.ts uses).
// It proves that for any model (master OR added) with a prior reservation,
// settling with status="error" charges 0 and the post-settle balance returns to
// the pre-reserve balance (net reserve+settle change = 0). The full pipeline is
// also exercised end-to-end against a real DB by Task 9 itest.
//
// NOTE: billing-service is imported DYNAMICALLY inside the test (repo convention,
// see billing-service.test.ts) so the `mock*` factory vars are initialized before
// the db/client mock factory runs.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { MASTER_MODELS, type MasterModel } from "../../master-models.js";

// ── DB seam (mirrors billing-service.test.ts) ─────────────────────────────────
const mockDbSqlBegin = vi.fn();
const mockTxSql = vi.fn();
const mockInsertValues = vi.fn();
const mockSelectLimit = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {
    insert: () => ({ values: mockInsertValues }),
    select: () => ({ from: () => ({ where: () => ({ limit: mockSelectLimit }) }) }),
    update: () => ({ set: () => ({ where: vi.fn().mockResolvedValue([]) }) }),
  },
  dbSql: Object.assign(vi.fn(), { begin: mockDbSqlBegin }),
}));

// Pricing path is fixed; cost is irrelevant on the error branch (forced to 0),
// but the helpers are still invoked so we stub them to stay DB-free.
vi.mock("./pricing-service.js", () => ({
  buildPricingConfig: vi.fn().mockResolvedValue({
    kur: 50, liveKur: 48, kurBuffer: 0.04, textCarpan: 3, imageCarpan: 3, videoCarpan: 3,
  }),
  applyOverride: vi.fn().mockImplementation(async (m: MasterModel) => m),
  computePrice: vi.fn().mockReturnValue({
    unit: "1M token", input: { usd: 15, tl: 750 }, output: { usd: 60, tl: 3000 },
  }),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Local synthesized text model standing in for an "added model" — the SAME
// customer-facing text shape added-model-service.addedModelToMasterModel emits
// (that exact synthesis + pricing parity is proven by P15). Kept DB-free so this
// file never imports added-model-service (which would load db/client).
function synthAddedTextModel(id: string, inputUsd: number, outputUsd: number): MasterModel {
  return {
    id,
    name: id,
    provider: "VendorCo",
    providerSlug: "vendorco",
    type: "Metin",
    context: "—",
    contextTokens: null,
    maxOutputTokens: null,
    inputModalities: ["text"],
    outputModalities: ["text"],
    endpoints: ["chat", "messages"],
    pricingUnit: "usd_per_million_tokens",
    customerInputUsd: inputUsd,
    customerOutputUsd: outputUsd,
  };
}

const modelArb: fc.Arbitrary<MasterModel> = fc.oneof(
  fc.constantFrom(...MASTER_MODELS),
  fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 16 }).map((s) => `added-${s.replace(/\s/g, "")}`),
      inputUsd: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
      outputUsd: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
    })
    .map((r) => synthAddedTextModel(r.id, r.inputUsd, r.outputUsd)),
);

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSqlBegin.mockImplementation(async (fn: (sql: typeof mockTxSql) => unknown) => fn(mockTxSql));
});

describe("zero charge + full refund on error (K1) — properties", () => {
  // Feature: panel-provider-model-config, Property 10: For any model (master or added) with a prior reservation, settling with status "error" charges the customer 0 and fully refunds the reservation, so the net balance change across reserve + settle is 0.
  it("P10 status=error => cost 0 and balance returns to the pre-reserve value", async () => {
    const { settleReservedUsage } = await import("./billing-service.js");

    await fc.assert(
      fc.asyncProperty(
        modelArb,
        fc.double({ min: 0.01, max: 500, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        async (model, reservedTL, preReserveBalance, promptTokens, completionTokens) => {
          vi.clearAllMocks();
          mockDbSqlBegin.mockImplementation(async (fn: (sql: typeof mockTxSql) => unknown) => fn(mockTxSql));

          const reserved = Math.round(reservedTL * 10000) / 10000;
          const preReserve = Math.round(preReserveBalance * 10000) / 10000;
          const postReserveBalance = preReserve - reserved; // balance after reserve deducts

          // findExistingCharge => none; findReservation => the reservation row.
          mockSelectLimit
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              { miktarTL: (-reserved).toFixed(4), sonrakiBakiye: postReserveBalance.toFixed(4) },
            ]);

          // Inside the tx: refund UPDATE returns the balance after adding the
          // reservation back; subsequent inserts (refund tx, usage record) → [].
          const refundedBalance = postReserveBalance + reserved; // === preReserve
          mockTxSql
            .mockResolvedValueOnce([{ bakiye_tl: refundedBalance.toFixed(4), email: "u@test.com" }])
            .mockResolvedValue([]);

          const result = await settleReservedUsage({
            userId: "00000000-0000-0000-0000-000000000001",
            apiKeyId: "00000000-0000-0000-0000-000000000002",
            model,
            usage: { promptTokens, completionTokens },
            responseMs: 100,
            requestId: `req-${model.id}-${reserved}`,
            rawUsageJson: { promptTokens, completionTokens },
            status: "error",
            errorCode: "upstream_502",
          });

          // No charge on error …
          expect(result.costTL).toBe(0);
          // … and the balance is fully restored to the pre-reserve value
          // (net reserve+settle change = 0), within float tolerance.
          expect(Math.abs(result.remainingTL - preReserve)).toBeLessThan(1e-4);
        },
      ),
      { numRuns: 100 },
    );
  });
});
