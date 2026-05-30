// Property-based test for added-model pricing parity (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P15.
// Pure computePrice over a synthesized MasterModel — no DB seam needed. The
// billing/pricing math itself is DOKUNULMAZ; this only proves an added model
// flows through the identical text-pricing branch as a master text model with
// the same customer USD-per-million values.

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

// added-model-service imports db/client transitively; mock it so importing the
// pure addedModelToMasterModel helper never opens a Postgres connection.
vi.mock("../db/client.js", async () => {
  const { fakeDb, fakeDbSql } = await import("./__fakes__/fake-db.js");
  return { db: fakeDb, dbSql: fakeDbSql };
});

import { computePrice, type PricingConfig } from "../../pricing.js";
import type { MasterModel } from "../../master-models.js";
import { addedModelToMasterModel, type AddedModelRecord } from "./added-model-service.js";

const pricingConfigArb: fc.Arbitrary<PricingConfig> = fc.record({
  kur: fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
  liveKur: fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
  kurBuffer: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  textCarpan: fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
  imageCarpan: fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
  videoCarpan: fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
});

const usdArb = fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true });

// A reference master text model carrying the same customer USD values.
function masterTextModel(inputUsd: number, outputUsd: number): MasterModel {
  return {
    id: "ref-master-text",
    name: "Reference",
    provider: "Ref",
    type: "Metin",
    context: "1M",
    endpoints: ["chat", "messages"],
    pricingUnit: "usd_per_million_tokens",
    customerInputUsd: inputUsd,
    customerOutputUsd: outputUsd,
  };
}

describe("added-model pricing parity — properties", () => {
  // Feature: panel-provider-model-config, Property 15: For any added model and pricing config, computePrice over its synthesized MasterModel equals computePrice for a master text model carrying the same customer USD-per-million input/output values — i.e. added models introduce no new pricing math.
  it("P15 added-model price equals a master text model with the same customer USD values", () => {
    fc.assert(
      fc.property(usdArb, usdArb, pricingConfigArb, (inputUsd, outputUsd, cfg) => {
        const row: AddedModelRecord = {
          modelId: "added-x",
          name: "Added X",
          providerLabel: "VendorCo",
          inputUsd,
          outputUsd,
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const addedPrice = computePrice(addedModelToMasterModel(row), cfg);
        const masterPrice = computePrice(masterTextModel(inputUsd, outputUsd), cfg);

        expect(addedPrice).toEqual(masterPrice);
        // And it is priced on the text branch (1M token unit), not a new path.
        expect(addedPrice.unit).toBe("1M token");
      }),
      { numRuns: 100 },
    );
  });
});
