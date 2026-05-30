// Property-based tests for the MASTER_MODELS 42-lock + additive-only invariant
// (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P9.
// added_models is backed by the in-memory fake of db/client.js (thin repository
// seam — design "Testing Strategy"), so getMergedCatalogModels runs without
// Postgres at ≥100 iterations.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";

vi.mock("../db/client.js", async () => {
  const { fakeDb, fakeDbSql } = await import("./__fakes__/fake-db.js");
  return { db: fakeDb, dbSql: fakeDbSql };
});

import { MASTER_MODELS } from "../../master-models.js";
import { addedModels } from "../db/schema.js";
import {
  createAddedModel,
  deleteAddedModel,
  getMergedCatalogModels,
  isMasterModelId,
  type AddedModelInput,
} from "./added-model-service.js";
import { resetFakeDb } from "./__fakes__/fake-db.js";

// Snapshot the canonical 42 ids and a deep price snapshot taken ONCE at module
// load, so the property can prove MASTER_MODELS never drifts across operations.
const FROZEN_MASTER_IDS = MASTER_MODELS.map((m) => m.id);
const FROZEN_MASTER_SNAPSHOT = JSON.stringify(
  MASTER_MODELS.map((m) => ({
    id: m.id,
    customerInputUsd: m.customerInputUsd,
    customerOutputUsd: m.customerOutputUsd,
  })),
);

const nonMasterId = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => `added-${s.replace(/\s/g, "")}`)
  .filter((id) => id.trim().length > 0 && !isMasterModelId(id));

// A single create/delete operation on the additive layer.
const opArb = fc.oneof(
  fc.record({
    kind: fc.constant("create" as const),
    input: fc.record({
      modelId: nonMasterId,
      name: fc.string({ minLength: 1, maxLength: 30 }),
      providerLabel: fc.string({ maxLength: 16 }),
      inputUsd: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
      outputUsd: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
      enabled: fc.boolean(),
    }) as fc.Arbitrary<AddedModelInput>,
  }),
  fc.record({ kind: fc.constant("delete" as const), modelId: nonMasterId }),
);

beforeEach(() => {
  resetFakeDb();
});

describe("MASTER_MODELS 42-lock + additive-only — properties", () => {
  // Feature: panel-provider-model-config, Property 9: For any sequence of enable/disable, added-model, or provider-config operations, MASTER_MODELS remains exactly 42 entries with unchanged ids, ordering, and customer prices; the merged catalog begins with those 42 master entries in their original order; and every entry in the merged catalog that is not one of the 42 master entries corresponds to an added_models row (no added model is ever injected into the constant).
  it("P9 keeps the 42-entry master lock and merged catalog stays additive-only", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { maxLength: 12 }), async (ops) => {
        resetFakeDb();

        const created = new Set<string>();
        for (const op of ops) {
          if (op.kind === "create") {
            const id = op.input.modelId.trim();
            if (created.has(id)) continue; // skip duplicates (would 409)
            await createAddedModel(op.input);
            created.add(id);
          } else {
            await deleteAddedModel(op.modelId.trim());
            created.delete(op.modelId.trim());
          }
        }

        const merged = await getMergedCatalogModels();

        // 1) MASTER_MODELS itself is byte-for-byte unchanged (42, ids, order, price).
        expect(MASTER_MODELS).toHaveLength(42);
        expect(MASTER_MODELS.map((m) => m.id)).toEqual(FROZEN_MASTER_IDS);
        expect(
          JSON.stringify(
            MASTER_MODELS.map((m) => ({
              id: m.id,
              customerInputUsd: m.customerInputUsd,
              customerOutputUsd: m.customerOutputUsd,
            })),
          ),
        ).toBe(FROZEN_MASTER_SNAPSHOT);

        // 2) Merged catalog begins with the 42 master entries in original order.
        expect(merged.length).toBeGreaterThanOrEqual(42);
        expect(merged.slice(0, 42).map((m) => m.id)).toEqual(FROZEN_MASTER_IDS);

        // 3) Every non-master merged entry maps to an enabled added row (never
        //    injected into the constant).
        const tail = merged.slice(42);
        for (const entry of tail) {
          expect(isMasterModelId(entry.id)).toBe(false);
          expect(created.has(entry.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
