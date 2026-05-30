// src/server/services/added-model-service.ts
//
// Model_Catalog_Resolver (Task 3): combines the canonical, code-defined
// MASTER_MODELS catalog with an additive, database-backed layer of
// `added_models`. MASTER_MODELS is NEVER mutated (Requirement 12.3) — the merge
// produces a brand-new array with the 42 master entries first (unchanged order)
// followed by enabled added models synthesized into MasterModel shape.
//
// Added models reuse the existing USD-per-million pricing path: the synthesized
// MasterModel only carries the customer-facing USD values, so downstream
// applyOverride/computePrice price it exactly like a text master model. No new
// pricing math is introduced here.

import { asc, eq } from "drizzle-orm";
import {
  MASTER_MODELS,
  canonicalizeModelId,
  type MasterModel,
  type MasterModelEndpoint,
} from "../../master-models.js";
import { db } from "../db/client.js";
import { addedModels } from "../db/schema.js";
import { BadRequestError, ConflictError } from "../lib/errors.js";

// ── Public types ──────────────────────────────────────────────────────────────

export interface AddedModelInput {
  modelId: string;
  name: string;
  providerLabel: string;
  inputUsd: number; // USD per million tokens (customer-facing price unit)
  outputUsd: number; // USD per million tokens (customer-facing price unit)
  enabled?: boolean; // default true
}

export interface AddedModelRecord extends AddedModelInput {
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Text-model shape mirrors (kept in sync with master-models.ts textModel) ─────
// master-models.ts keeps these private, so we reconstruct the identical text
// endpoint/parameter shape here to synthesize a text MasterModel that serializes
// uniformly with the master text models.

const CHAT_PARAMS = ["model", "messages", "max_tokens", "temperature", "top_p", "stream", "stop", "tools", "tool_choice"];
const MESSAGE_PARAMS = ["model", "messages", "max_tokens", "system", "temperature", "top_p", "stream", "stop_sequences", "tools", "tool_choice"];
const TEXT_ENDPOINT_DETAILS: MasterModelEndpoint[] = [
  { type: "chat", supportsStreaming: true, supportedParameters: CHAT_PARAMS },
  { type: "messages", supportsStreaming: true, supportedParameters: MESSAGE_PARAMS },
];
const TEXT_ENDPOINTS = TEXT_ENDPOINT_DETAILS.map((endpoint) => endpoint.type);
const TEXT_SUPPORTED_PARAMETERS = Array.from(new Set(TEXT_ENDPOINT_DETAILS.flatMap((endpoint) => endpoint.supportedParameters)));

// Set of canonical MASTER_MODELS ids for fast membership checks.
const MASTER_MODEL_IDS = new Set(MASTER_MODELS.map((model) => model.id));

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type AddedModelRow = typeof addedModels.$inferSelect;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function rowToRecord(row: AddedModelRow): AddedModelRecord {
  return {
    modelId: row.modelId,
    name: row.name,
    providerLabel: row.providerLabel,
    inputUsd: Number(row.inputUsd),
    outputUsd: Number(row.outputUsd),
    enabled: row.enabled,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

// ── Master id guard ───────────────────────────────────────────────────────────

// Is this id (or one of its aliases) a MASTER_MODELS id? Used by the duplicate
// guard (5.2) and the delete guard (6.2).
export function isMasterModelId(modelId: string): boolean {
  const trimmed = modelId.trim();
  const canonical = canonicalizeModelId(trimmed) ?? trimmed;
  return MASTER_MODEL_IDS.has(canonical);
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listAddedModels(): Promise<AddedModelRecord[]> {
  const rows = await db.select().from(addedModels).orderBy(asc(addedModels.createdAt));
  return rows.map(rowToRecord);
}

export async function createAddedModel(input: AddedModelInput): Promise<AddedModelRecord> {
  const modelId = input.modelId.trim();

  // 5.2 — cannot shadow a master catalog id (or alias).
  if (isMasterModelId(modelId)) {
    throw new ConflictError(`Model id already exists in master catalog: ${modelId}`);
  }

  // 5.2 — cannot duplicate an existing added model.
  const existing = await db.select().from(addedModels).where(eq(addedModels.modelId, modelId)).limit(1);
  if (existing.length) {
    throw new ConflictError(`Added model already exists: ${modelId}`);
  }

  // 5.1 — persist the added model. numeric columns take string values.
  const inserted = await db
    .insert(addedModels)
    .values({
      modelId,
      name: input.name,
      providerLabel: input.providerLabel,
      inputUsd: String(input.inputUsd),
      outputUsd: String(input.outputUsd),
      enabled: input.enabled ?? true,
    })
    .returning();

  return rowToRecord(inserted[0]);
}

export async function deleteAddedModel(modelId: string): Promise<void> {
  const trimmed = modelId.trim();

  // 6.2 — refuse to delete a master catalog model through this route.
  if (isMasterModelId(trimmed)) {
    throw new BadRequestError(`Cannot delete master catalog model: ${trimmed}`);
  }

  // 6.1 — no-op when the row is absent.
  await db.delete(addedModels).where(eq(addedModels.modelId, trimmed));
}

// ── Synthesis + merge ─────────────────────────────────────────────────────────

// Build a MasterModel-shaped entry for an added model so existing
// pricing/serialization reuse it (type "Metin", usd_per_million_tokens).
// NEVER mutates MASTER_MODELS (Requirement 12.3).
export function addedModelToMasterModel(row: AddedModelRecord): MasterModel {
  return {
    id: row.modelId,
    name: row.name,
    provider: row.providerLabel,
    providerSlug: slugify(row.providerLabel),
    type: "Metin",
    context: "—",
    contextTokens: null,
    maxOutputTokens: null,
    description: null,
    inputModalities: ["text"],
    outputModalities: ["text"],
    endpoints: TEXT_ENDPOINTS,
    endpointDetails: TEXT_ENDPOINT_DETAILS,
    supportedParameters: TEXT_SUPPORTED_PARAMETERS,
    pricingUnit: "usd_per_million_tokens",
    customerInputUsd: row.inputUsd,
    customerOutputUsd: row.outputUsd,
  };
}

// Merged catalog: MASTER_MODELS first (unchanged order), then enabled added
// models appended. Returns a fresh MasterModel[] so callers treat both uniformly
// and MASTER_MODELS is never mutated.
export async function getMergedCatalogModels(): Promise<MasterModel[]> {
  const added = await listAddedModels();
  const enabledAdded = added.filter((row) => row.enabled).map(addedModelToMasterModel);
  return [...MASTER_MODELS, ...enabledAdded];
}

// Resolve a single model id to a MasterModel from the merged catalog
// (master OR added). Returns undefined if not found in either source.
export async function resolveCatalogModel(modelId: string): Promise<MasterModel | undefined> {
  const merged = await getMergedCatalogModels();
  const canonical = canonicalizeModelId(modelId) ?? modelId;
  return merged.find((model) => model.id === modelId || model.id === canonical);
}
