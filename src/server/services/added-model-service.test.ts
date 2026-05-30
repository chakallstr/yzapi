// Property-based tests for added-model-service / Model_Catalog_Resolver
// (panel-provider-model-config, Task 8).
//
// Covers design.md "Correctness Properties": P6, P7, P8, P14.
// The added_models / model_overrides / model_runtime_policies tables are backed
// by the in-memory fake of db/client.js (thin repository seam — design "Testing
// Strategy"), so these run without Postgres at ≥100 iterations each. The full
// reserve→settle pipeline and real enable/disable wiring are covered by Task 9
// itest; here P6/P7 are checked against the same accept/reject logic used by
// proxy.resolveEnabledModel via a local seam that mirrors it.

import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";

vi.mock("../db/client.js", async () => {
  const { fakeDb, fakeDbSql } = await import("./__fakes__/fake-db.js");
  return { db: fakeDb, dbSql: fakeDbSql };
});

import { MASTER_MODELS, canonicalizeModelId, type MasterModel } from "../../master-models.js";
import { addedModels, modelOverrides, modelRuntimePolicies } from "../db/schema.js";
import { BadRequestError, ConflictError, ModelDisabledError, ModelNotFoundError } from "../lib/errors.js";
import {
  createAddedModel,
  deleteAddedModel,
  getMergedCatalogModels,
  resolveCatalogModel,
  isMasterModelId,
  type AddedModelInput,
} from "./added-model-service.js";
import { resetFakeDb, seedTable, getTableRows } from "./__fakes__/fake-db.js";

const MASTER_IDS = MASTER_MODELS.map((m) => m.id);
const MASTER_ID_SET = new Set(MASTER_IDS);

// An id generator guaranteed not to collide with any MASTER_MODELS id/alias.
const nonMasterId = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => `added-${s.replace(/\s/g, "")}`)
  .filter((id) => id.trim().length > 0 && !isMasterModelId(id));

const addedModelInputArb: fc.Arbitrary<AddedModelInput> = fc.record({
  modelId: nonMasterId,
  name: fc.string({ minLength: 1, maxLength: 40 }),
  providerLabel: fc.string({ maxLength: 24 }),
  inputUsd: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  outputUsd: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  enabled: fc.boolean(),
});

// Mirror of proxy.resolveEnabledModel's accept/reject logic over the merged
// catalog + the disable tables. Kept local so P6/P7 exercise the exact decision
// the hot path makes (design "Changes to proxy.ts") without spinning Express.
async function resolveEnabledModelSeam(modelId: string, endpoint = "chat"): Promise<MasterModel> {
  const canonical = canonicalizeModelId(modelId) ?? modelId;
  const model = await resolveCatalogModel(canonical);
  if (!model) throw new ModelNotFoundError(modelId);
  if (!model.endpoints.includes(endpoint)) throw new BadRequestError(`unsupported endpoint ${endpoint}`);

  const overrides = getTableRows(modelOverrides);
  const override = overrides.find((row) => row.modelId === model.id);
  if (override?.enabled === false) throw new ModelDisabledError(model.id);

  const runtimes = getTableRows(modelRuntimePolicies);
  const runtime = runtimes.find((row) => row.modelId === model.id);
  if (runtime?.enabled === false) throw new ModelDisabledError(model.id);

  return model;
}

beforeEach(() => {
  resetFakeDb();
});

describe("added-model-service — properties", () => {
  // Feature: panel-provider-model-config, Property 6: For any model in the merged catalog (master or added), resolveEnabledModel rejects the request with the model-disabled error when its effective state is disabled (via model_overrides / model_runtime_policies for master, or enabled=false for added) and accepts it when enabled.
  it("P6 enable/disable governs request acceptance for master and added models", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...MASTER_IDS),
        fc.boolean(),
        fc.boolean(),
        addedModelInputArb,
        async (masterId, pricingEnabled, runtimeEnabled, addedInput) => {
          resetFakeDb();

          // Master model: effective state is the AND of the two disable tables.
          seedTable(modelOverrides, [{ modelId: masterId, enabled: pricingEnabled }]);
          seedTable(modelRuntimePolicies, [{ modelId: masterId, enabled: runtimeEnabled }]);

          // Added model: enabled flag on the row itself.
          const addedEnabled = addedInput.enabled ?? true;
          seedTable(addedModels, [
            {
              modelId: addedInput.modelId,
              name: addedInput.name,
              providerLabel: addedInput.providerLabel,
              inputUsd: String(addedInput.inputUsd),
              outputUsd: String(addedInput.outputUsd),
              enabled: addedEnabled,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);

          // Master acceptance follows AND(pricingEnabled, runtimeEnabled).
          if (pricingEnabled && runtimeEnabled) {
            const m = await resolveEnabledModelSeam(masterId);
            expect(m.id).toBe(masterId);
          } else {
            await expect(resolveEnabledModelSeam(masterId)).rejects.toBeInstanceOf(ModelDisabledError);
          }

          // Added model: disabled rows never reach the merged catalog at all, so
          // the hot path rejects them as not-found; enabled rows are accepted.
          if (addedEnabled) {
            const a = await resolveEnabledModelSeam(addedInput.modelId);
            expect(a.id).toBe(addedInput.modelId);
          } else {
            await expect(resolveEnabledModelSeam(addedInput.modelId)).rejects.toBeInstanceOf(ModelNotFoundError);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 7: For any valid non-duplicate added model, after createAddedModel it appears in the merged catalog and is accepted by resolveEnabledModel when enabled, and after deleteAddedModel it is absent from the merged catalog and resolveEnabledModel rejects it with the model-not-found error.
  it("P7 added-model lifecycle round-trip: create => present/accepted, delete => absent/not-found", async () => {
    await fc.assert(
      fc.asyncProperty(addedModelInputArb, async (input) => {
        resetFakeDb();

        const enabled = input.enabled ?? true;
        const record = await createAddedModel(input);
        expect(record.modelId).toBe(input.modelId.trim());

        const mergedAfterCreate = await getMergedCatalogModels();
        const present = mergedAfterCreate.some((m) => m.id === input.modelId.trim());
        // Merged catalog only surfaces ENABLED added models.
        expect(present).toBe(enabled);

        if (enabled) {
          const resolved = await resolveEnabledModelSeam(input.modelId.trim());
          expect(resolved.id).toBe(input.modelId.trim());
        } else {
          await expect(resolveEnabledModelSeam(input.modelId.trim())).rejects.toBeInstanceOf(ModelNotFoundError);
        }

        await deleteAddedModel(input.modelId.trim());

        const mergedAfterDelete = await getMergedCatalogModels();
        expect(mergedAfterDelete.some((m) => m.id === input.modelId.trim())).toBe(false);
        await expect(resolveEnabledModelSeam(input.modelId.trim())).rejects.toBeInstanceOf(ModelNotFoundError);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 8: For any model id that collides with a MASTER_MODELS id or an existing added-model id, createAddedModel fails with HTTP 409; and for any MASTER_MODELS id, deleteAddedModel fails with HTTP 400. In both cases the existing record set and MASTER_MODELS are left unchanged.
  it("P8 guards reject duplicates (409) and master deletions (400) without side effects", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...MASTER_IDS),
        addedModelInputArb,
        async (masterId, existing) => {
          resetFakeDb();

          // Seed one existing added model.
          await createAddedModel(existing);
          const beforeRows = getTableRows(addedModels);
          const masterLengthBefore = MASTER_MODELS.length;

          // Duplicate of a master id → 409 (ConflictError).
          await expect(
            createAddedModel({ ...existing, modelId: masterId }),
          ).rejects.toBeInstanceOf(ConflictError);

          // Duplicate of the existing added id → 409.
          await expect(
            createAddedModel({ ...existing, modelId: existing.modelId, name: "dup" }),
          ).rejects.toBeInstanceOf(ConflictError);

          // Deleting a master id via the added-model route → 400 (BadRequestError).
          const err = await deleteAddedModel(masterId).catch((e) => e);
          expect(err).toBeInstanceOf(BadRequestError);
          expect((err as BadRequestError).statusCode).toBe(400);

          // The added_models set is unchanged and MASTER_MODELS is untouched.
          const afterRows = getTableRows(addedModels);
          expect(afterRows).toHaveLength(beforeRows.length);
          expect(MASTER_MODELS).toHaveLength(masterLengthBefore);
          expect(MASTER_MODELS.map((m) => m.id)).toEqual(MASTER_IDS);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: panel-provider-model-config, Property 8 (status codes): ConflictError surfaces as 409.
  it("P8 ConflictError carries HTTP 409", () => {
    const err = new ConflictError("dup");
    expect(err.statusCode).toBe(409);
  });

  // Feature: panel-provider-model-config, Property 14: For any combination of model_overrides and model_runtime_policies states, the admin model-management list contains exactly the 42 master model ids, and each entry's effectiveEnabled equals the logical AND of its pricing-enabled and runtime-enabled flags.
  it("P14 admin model list is complete with effectiveEnabled = pricingEnabled AND runtimeEnabled", async () => {
    // listAdminApiSettingModels lives in api-settings-service; it reads the same
    // two disable tables, so we exercise it through the same fake-db seam.
    const { listAdminApiSettingModels } = await import("./api-settings-service.js");

    const stateArb = fc.dictionary(
      fc.constantFrom(...MASTER_IDS),
      fc.record({ pricing: fc.boolean(), runtime: fc.boolean() }),
      { maxKeys: 8 },
    );

    await fc.assert(
      fc.asyncProperty(stateArb, async (states) => {
        resetFakeDb();
        seedTable(
          modelOverrides,
          Object.entries(states).map(([modelId, s]) => ({ modelId, enabled: s.pricing })),
        );
        seedTable(
          modelRuntimePolicies,
          Object.entries(states).map(([modelId, s]) => ({ modelId, enabled: s.runtime })),
        );

        const list = await listAdminApiSettingModels();

        // Exactly the 42 master ids, in master order.
        expect(list).toHaveLength(MASTER_MODELS.length);
        expect(list.map((row) => row.modelId)).toEqual(MASTER_IDS);

        for (const row of list) {
          const expectedPricing = states[row.modelId]?.pricing ?? true;
          const expectedRuntime = states[row.modelId]?.runtime ?? true;
          expect(row.pricingEnabled).toBe(expectedPricing);
          expect(row.runtimeEnabled).toBe(expectedRuntime);
          expect(row.effectiveEnabled).toBe(expectedPricing && expectedRuntime);
        }
      }),
      { numRuns: 100 },
    );
  });
});
