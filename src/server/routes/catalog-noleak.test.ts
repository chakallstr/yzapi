// Property-based test for the public catalog non-leak invariant
// (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P11.
// Drives the real /api/models + /v1/models serializers (master ∪ added models)
// through the in-memory fake of db/client.js (thin repository seam — design
// "Testing Strategy") and asserts that no provider cost basis or pricing
// multiplier ever appears in the serialized payloads.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";

vi.mock("../db/client.js", async () => {
  const { fakeDb, fakeDbSql } = await import("../services/__fakes__/fake-db.js");
  return { db: fakeDb, dbSql: fakeDbSql };
});

import express from "express";
import request from "supertest";
import { systemConfig, addedModels } from "../db/schema.js";
import { buildV1ModelsResponse, type V1CatalogEntry } from "./v1-catalog.js";
import { getMergedCatalogModels } from "../services/added-model-service.js";
import { buildPricingConfig } from "../services/pricing-service.js";
import { computePrice } from "../../pricing.js";
import { resetFakeDb, seedTable } from "../services/__fakes__/fake-db.js";
import modelsRouter from "./models.js";

// Build V1 catalog entries from the same merged catalog the /v1/models route
// uses (master ∪ enabled added models), priced with the seeded config.
async function buildMergedCatalogEntries(): Promise<V1CatalogEntry[]> {
  const cfg = await buildPricingConfig();
  const merged = await getMergedCatalogModels();
  return merged.map((model) => ({ model, computed: computePrice(model, cfg), enabled: true }));
}

// Forbidden substrings: provider cost basis fields + all pricing multipliers.
// NOTE: customer-facing sale price (customerInputUsd/customerOutputUsd) is
// intentionally allowed on /api/models (it is the price shown to customers);
// P11 only forbids the upstream cost basis and the multipliers.
const FORBIDDEN = [
  "providerInputUsd",
  "providerOutputUsd",
  "providerImageInputUsd",
  "providerImageOutputUsd",
  "providerPerSecond",
  "textCarpan",
  "imageCarpan",
  "videoCarpan",
];

const nonMasterId = fc
  .string({ minLength: 1, maxLength: 16 })
  .map((s) => `added-${s.replace(/\s/g, "")}`)
  .filter((id) => id.trim().length > 0);

const addedRowArb = fc.record({
  modelId: nonMasterId,
  name: fc.string({ minLength: 1, maxLength: 24 }),
  providerLabel: fc.string({ maxLength: 16 }),
  inputUsd: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  outputUsd: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  enabled: fc.boolean(),
});

const pricingRowArb = fc.record({
  textCarpan: fc.double({ min: 0.1, max: 9, noNaN: true, noDefaultInfinity: true }),
  imageCarpan: fc.double({ min: 0.1, max: 9, noNaN: true, noDefaultInfinity: true }),
  videoCarpan: fc.double({ min: 0.1, max: 9, noNaN: true, noDefaultInfinity: true }),
  kurBuffer: fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
  liveKur: fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
});

function seedSystemConfig(p: { textCarpan: number; imageCarpan: number; videoCarpan: number; kurBuffer: number; liveKur: number }) {
  seedTable(systemConfig, [
    {
      id: 1,
      kur: String(p.liveKur),
      liveKur: String(p.liveKur),
      kurBuffer: String(p.kurBuffer),
      textCarpan: String(p.textCarpan),
      imageCarpan: String(p.imageCarpan),
      videoCarpan: String(p.videoCarpan),
      updatedAt: new Date(),
    },
  ]);
}

function seedAdded(rows: Array<{ modelId: string; name: string; providerLabel: string; inputUsd: number; outputUsd: number; enabled: boolean }>) {
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const id = r.modelId.trim();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  seedTable(
    addedModels,
    unique.map((r) => ({
      modelId: r.modelId.trim(),
      name: r.name,
      providerLabel: r.providerLabel,
      inputUsd: String(r.inputUsd),
      outputUsd: String(r.outputUsd),
      enabled: r.enabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
}

beforeEach(() => {
  resetFakeDb();
});

describe("public catalog non-leak — properties", () => {
  // Feature: panel-provider-model-config, Property 11: For any merged catalog (master and added models) and any pricing config, the serialized /api/models and /v1/models payloads exclude provider cost fields (providerInputUsd, providerOutputUsd, image/video provider costs) and the pricing multiplier values (textCarpan and the other *Carpan values).
  it("P11 /api/models and /v1/models never expose provider cost basis or multipliers", async () => {
    const app = express();
    app.use("/api", modelsRouter);

    await fc.assert(
      fc.asyncProperty(fc.array(addedRowArb, { maxLength: 6 }), pricingRowArb, async (added, pricing) => {
        resetFakeDb();
        seedSystemConfig(pricing);
        seedAdded(added);

        // /api/models (public) — real Express handler over the fake db.
        const apiRes = await request(app).get("/api/models");
        expect(apiRes.status).toBe(200);
        const apiBody = JSON.stringify(apiRes.body);
        for (const needle of FORBIDDEN) {
          expect(apiBody).not.toContain(needle);
        }

        // /v1/models (public) — build entries from the same merged catalog seam.
        const entries: V1CatalogEntry[] = await buildMergedCatalogEntries();
        const v1Body = JSON.stringify(buildV1ModelsResponse(entries));
        for (const needle of FORBIDDEN) {
          expect(v1Body).not.toContain(needle);
        }
      }),
      { numRuns: 100 },
    );
  });
});
