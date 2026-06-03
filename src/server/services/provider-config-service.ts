// src/server/services/provider-config-service.ts
//
// Provider_Config service (panel-provider-model-config, Task 2).
//
// Resolves the effective upstream provider base URL + API key DB-first
// (system_api_config, id = 1) with env as a bootstrap fallback, and exposes
// admin-facing save/read/test operations. The decrypted provider API key lives
// only in this module's in-process cache; it is never logged nor returned to any
// client (only a masked form is ever exposed). See design.md "Components and
// Interfaces" §1 and §6.

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { systemApiConfig, providerProfiles } from "../db/schema.js";
import { aiProviderBaseUrl, aiProviderApiKey } from "../lib/env.js";
import { encryptApiKey, decryptApiKey } from "./api-key-service.js";
import { BadRequestError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

// ── Constants ────────────────────────────────────────────────────────────────

// In-process cache TTL. A saved change calls invalidateProviderConfigCache() so
// it is visible immediately (Requirement 3.5); the TTL just keeps the /v1 hot
// path off the database on every call.
const CACHE_TTL_MS = 5000;

// Connection-test upstream probe timeout. Short by design — the probe is a
// minimal model-list fetch (Requirement 8.1).
const TEST_TIMEOUT_MS = 8000;

// Fixed leading marker for the masked provider key (Requirement 2.2).
const MASK_MARKER = "sk-****";

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface EffectiveProviderConfig {
  baseUrl: string;            // never returned to clients
  apiKey: string | undefined; // never returned to clients
  source: {
    // "profile" => active provider_profiles row, "db" => system_api_config,
    // "env" => process env bootstrap fallback (Task 4 / R-resolve).
    baseUrl: "profile" | "db" | "env";
    apiKey: "profile" | "db" | "env" | "none";
  };
}

// Per-model resolved upstream context (per-model-routing). Carries the baseUrl +
// decrypted key + the model_map of the provider that serves THIS model. NEVER
// returned to clients; only the forwarders consume it. profileId is the matched
// provider_profiles.id, or null when no enabled profile pins the model and we
// fell back to the active/db/env config (i.e. the previous single-active
// behaviour). See resolveProviderForModel().
export interface ProviderContext {
  profileId: string | null;
  baseUrl: string;
  apiKey: string | undefined;
  modelMap: Record<string, string>;
  source: {
    baseUrl: "model_profile" | "active_profile" | "db" | "env";
    apiKey: "model_profile" | "active_profile" | "db" | "env" | "none";
  };
}

// The active provider profile, parsed safely from provider_profiles. Used by the
// Task 5 catalog filter (supportedModelIds) and the closerouter model mapping
// (modelMap). NEVER carries the cipher or the plaintext key.
export interface ActiveProfile {
  id: string;
  supportedModelIds: string[];          // [] => parsed empty / malformed jsonb
  modelMap: Record<string, string>;     // {} => parsed empty / malformed jsonb
}

// Admin-facing (authenticated) view — base URL + masked key + timestamp.
// NEVER contains the cipher or the plaintext key.
export interface ProviderConfigAdminView {
  providerBaseUrl: string | null;       // null => env fallback in effect
  providerBaseUrlSource: "db" | "env";
  providerApiKeyMasked: string | null;  // null => no DB key (env fallback)
  providerApiKeyUpdatedAt: string | null;
}

// Admin-facing (authenticated) view of one provider_profiles row (Task 6 /
// R-panel). Carries only the masked key — NEVER the cipher or the plaintext.
export interface ProviderProfileAdminView {
  id: string;
  label: string;
  baseUrl: string;
  apiKeyMasked: string | null;          // null => no key stored on this profile
  enabled: boolean;
  supportedModelIds: string[];
  modelMap: Record<string, string>;
  isActive: boolean;                    // id === system_api_config.activeProviderId
}

export interface ConnectionTestResult {
  ok: boolean;
  upstreamStatus: number | null; // observed HTTP status, or null when connection failed
  latencyMs: number;
  errorCategory?: "timeout" | "connection" | "http_error" | "unknown";
  // NEVER includes the provider API key or cipher
}

// ── In-process cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  config: EffectiveProviderConfig;
  at: number;
}

// Module-level cache. Holds the decrypted key in memory only; never logged.
let cache: CacheEntry | null = null;

// Parsed view of an enabled provider_profiles row, used by the per-model router.
// Holds the decrypted key in memory only; never logged.
interface ParsedProfile {
  id: string;
  baseUrl: string;
  apiKey: string | undefined;
  supportedModelIds: string[];
  modelMap: Record<string, string>;
}

// All-enabled-profiles cache (per-model routing + UNION catalog). Shares the
// same 5s TTL as `cache` and is cleared by the same invalidate call.
let profilesCache: { profiles: ParsedProfile[]; at: number } | null = null;

// Clears the in-process cache so the next resolve reads fresh DB state.
// Called by the admin save handler (Requirement 3.5).
export function invalidateProviderConfigCache(): void {
  cache = null;
  profilesCache = null;
}

// ── DB read helpers ──────────────────────────────────────────────────────────

async function readConfigRow(): Promise<typeof systemApiConfig.$inferSelect | null> {
  try {
    const rows = await db
      .select()
      .from(systemApiConfig)
      .where(eq(systemApiConfig.id, 1))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    // DB unreachable (e.g. unit tests with no live DB, or bootstrap before the
    // first migration): treat as "no row" so resolution falls back to env,
    // mirroring getRuntimeApiConfig()'s resilience. The env fallback is the
    // intended bootstrap path (design.md "Provider Config Resolution Layer").
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// ── Active provider profile read helpers ──────────────────────────────────────

// Reads the active provider_profiles row: the row whose id == activeProviderId
// and which is enabled. Returns null when there is no system_api_config row, no
// active id, no matching/enabled profile, or when the provider_profiles table is
// not reachable yet (e.g. before migration 0013, or unit tests without a live
// DB). The null result keeps resolution on the existing system_api_config → env
// path, preserving backward compatibility (Task 4 / R-resolve).
async function readActiveProfileRow(): Promise<typeof providerProfiles.$inferSelect | null> {
  const configRow = await readConfigRow();
  const activeProviderId = configRow?.activeProviderId;
  if (!isNonEmptyString(activeProviderId)) return null;

  try {
    const rows = await db
      .select()
      .from(providerProfiles)
      .where(eq(providerProfiles.id, activeProviderId))
      .limit(1);
    const row = rows[0] ?? null;
    if (!row || row.enabled !== true) return null;
    return row;
  } catch {
    // provider_profiles unreachable (pre-migration / no live DB / fake-db without
    // the table seeded): behave exactly as before — system_api_config → env.
    return null;
  }
}

// Parse a jsonb value expected to hold string[]. Tolerates missing/malformed
// data (returns []), and arrays already materialised by Drizzle as JS values.
function parseStringArray(value: unknown): string[] {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is string => typeof item === "string");
}

// Parse a jsonb value expected to hold Record<string, string>. Tolerates
// missing/malformed data (returns {}), drops non-string values defensively.
function parseStringRecord(value: unknown): Record<string, string> {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return {};
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(candidate as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ── All-enabled-profiles read (per-model routing + UNION catalog) ─────────────

// Reads every enabled provider_profiles row with a non-empty base URL, parsed +
// decrypted, sorted deterministically by id. The deterministic sort makes the
// per-model first-match resolution stable even if two profiles accidentally list
// the same model id (the seed keeps the supportedModelIds a disjoint partition,
// so first-match is normally unambiguous). Returns [] when provider_profiles is
// unreachable (pre-migration 0013 / unit tests without a live DB), which keeps
// the catalog + routing on the existing system_api_config → env path.
async function readAllEnabledProfiles(): Promise<ParsedProfile[]> {
  if (profilesCache && Date.now() - profilesCache.at < CACHE_TTL_MS) {
    return profilesCache.profiles;
  }
  let rows: (typeof providerProfiles.$inferSelect)[] = [];
  try {
    rows = await db.select().from(providerProfiles);
  } catch {
    rows = [];
  }
  const profiles: ParsedProfile[] = rows
    .filter((r) => r.enabled === true && isNonEmptyString(r.baseUrl))
    .map((r) => ({
      id: r.id,
      baseUrl: r.baseUrl,
      // Decrypt with the rotation fallback order; an undecryptable cipher yields
      // undefined so the router falls back rather than forwarding a broken key.
      apiKey: isNonEmptyString(r.apiKeyCipher) ? (decryptApiKey(r.apiKeyCipher) ?? undefined) : undefined,
      supportedModelIds: parseStringArray(r.supportedModelIds),
      modelMap: parseStringRecord(r.modelMap),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  profilesCache = { profiles, at: Date.now() };
  return profiles;
}

// ── Resolution (DB-first, env fallback) ──────────────────────────────────────

// Combined resolve (single DB read), used by the connection test and forwarders.
//
// Resolution order (Task 4 / R-resolve):
//   1. Active provider profile (provider_profiles where id = activeProviderId AND
//      enabled) — base URL when non-empty; key from decrypting api_key_cipher.
//   2. Existing system_api_config (id = 1) — provider_base_url / cipher.
//   3. Process env (aiProviderBaseUrl / aiProviderApiKey) — bootstrap fallback.
//
// Backward compatibility: when no active/enabled provider_profiles row exists
// (e.g. before the profiles seed/migration, or a live DB without profiles), the
// resolver behaves exactly as before — system_api_config → env.
export async function resolveEffectiveProviderConfig(): Promise<EffectiveProviderConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.config;
  }

  const row = await readConfigRow();
  const profile = await readActiveProfileRow();

  // ── Base URL ────────────────────────────────────────────────────────────────
  let baseUrl: string;
  let baseUrlSource: "profile" | "db" | "env";
  if (profile && isNonEmptyString(profile.baseUrl)) {
    // 1. Active provider profile.
    baseUrl = profile.baseUrl;
    baseUrlSource = "profile";
  } else if (row && isNonEmptyString(row.providerBaseUrl)) {
    // 2. system_api_config (Requirement 3.1).
    baseUrl = row.providerBaseUrl;
    baseUrlSource = "db";
  } else {
    // 3. env (Requirement 3.2).
    baseUrl = aiProviderBaseUrl();
    baseUrlSource = "env";
  }

  // ── API key ───────────────────────────────────────────────────────────────
  // Each cipher is decrypted with the rotation fallback order (Requirement 13.2);
  // a cipher that cannot be decrypted under any active secret falls through to the
  // next source rather than forwarding upstream with a broken credential.
  let apiKey: string | undefined;
  let apiKeySource: "profile" | "db" | "env" | "none";
  const profileKey =
    profile && isNonEmptyString(profile.apiKeyCipher) ? decryptApiKey(profile.apiKeyCipher) : null;
  const dbKey =
    row && isNonEmptyString(row.providerApiKeyCipher) ? decryptApiKey(row.providerApiKeyCipher) : null;

  if (profileKey) {
    // 1. Active provider profile.
    apiKey = profileKey;
    apiKeySource = "profile";
  } else if (dbKey) {
    // 2. system_api_config (Requirement 3.3).
    apiKey = dbKey;
    apiKeySource = "db";
  } else {
    // 3. env (Requirement 3.4).
    apiKey = aiProviderApiKey();
    apiKeySource = apiKey ? "env" : "none";
  }

  const config: EffectiveProviderConfig = {
    baseUrl,
    apiKey,
    source: { baseUrl: baseUrlSource, apiKey: apiKeySource },
  };
  cache = { config, at: Date.now() };
  return config;
}

// ── Active profile resolution (catalog filter + closerouter model mapping) ────

// Returns the active provider profile parsed safely from provider_profiles, or
// null when no active/enabled profile exists (no profile restriction). Used by
// the Task 5 catalog filter and the profile-based closerouter model mapping.
export async function resolveActiveProfile(): Promise<ActiveProfile | null> {
  const profile = await readActiveProfileRow();
  if (!profile) return null;
  return {
    id: profile.id,
    supportedModelIds: parseStringArray(profile.supportedModelIds),
    modelMap: parseStringRecord(profile.modelMap),
  };
}

// The active profile's catalog-id → upstream-id model map. Empty object when
// there is no active profile (closerouter passes model ids through unchanged).
export async function resolveActiveModelMap(): Promise<Record<string, string>> {
  const profile = await resolveActiveProfile();
  return profile ? profile.modelMap : {};
}

// The customer-visible catalog ids = the UNION of supportedModelIds across ALL
// enabled provider profiles (per-model routing: each provider serves its own
// slice, the catalog is everything any enabled provider serves). Returns null
// only when there are zero enabled profiles — null means "no profile restriction
// → show all" (backward compat; every fake-db unit test relies on this path). An
// empty union (profiles exist but none lists a model) returns [] (show nothing).
export async function resolveSupportedModelIds(): Promise<string[] | null> {
  const profiles = await readAllEnabledProfiles();
  if (profiles.length === 0) return null;
  const union = new Set<string>();
  for (const p of profiles) {
    for (const id of p.supportedModelIds) union.add(id);
  }
  return [...union];
}

// ── Per-model upstream routing ────────────────────────────────────────────────

// Resolves the upstream provider that serves a given (canonical) catalog model
// id. Fallback chain:
//   1. model → first enabled profile whose supportedModelIds contains the id AND
//      has a usable (decryptable) key — uses that profile's baseUrl/key/modelMap.
//   2/3/4. no pinning profile → the existing combined resolver (active profile →
//      system_api_config → env) + the active profile's modelMap. This branch is
//      byte-for-byte the previous single-active behaviour, so a model that is in
//      no enabled profile's set routes exactly as it does today.
// The canonicalModelId MUST be the same id used in supportedModelIds (i.e.
// masterModel.id — dash form for masters, dot form for added models like
// claude-opus-4.8); proxy.ts already sends that id upstream.
export async function resolveProviderForModel(canonicalModelId: string): Promise<ProviderContext> {
  const profiles = await readAllEnabledProfiles();
  const match = profiles.find((p) => p.supportedModelIds.includes(canonicalModelId));
  if (match && match.apiKey) {
    return {
      profileId: match.id,
      baseUrl: match.baseUrl,
      apiKey: match.apiKey,
      modelMap: match.modelMap,
      source: { baseUrl: "model_profile", apiKey: "model_profile" },
    };
  }

  // Fallback: active profile → system_api_config → env (unchanged single-active).
  const eff = await resolveEffectiveProviderConfig();
  const activeMap = await resolveActiveModelMap();
  return {
    profileId: null,
    baseUrl: eff.baseUrl,
    apiKey: eff.apiKey,
    modelMap: activeMap,
    source: {
      baseUrl: eff.source.baseUrl === "profile" ? "active_profile" : eff.source.baseUrl,
      apiKey: eff.source.apiKey === "profile" ? "active_profile" : eff.source.apiKey,
    },
  };
}

// DB-first resolution with env fallback. Reads system_api_config (id = 1).
export async function resolveProviderBaseUrl(): Promise<string> {
  const { baseUrl } = await resolveEffectiveProviderConfig();
  return baseUrl;
}

export async function resolveProviderApiKey(): Promise<string | undefined> {
  const { apiKey } = await resolveEffectiveProviderConfig();
  return apiKey;
}

// ── Masking + validation helpers ─────────────────────────────────────────────

// Masking helper for admin read responses. Reveals only a fixed marker + last 4.
// e.g. maskProviderApiKey("sk-abcdEFGHijklUHNk") === "sk-****UHNk".
// Returns null on empty/missing input.
export function maskProviderApiKey(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const last4 = plaintext.slice(-4);
  return `${MASK_MARKER}${last4}`;
}

// URL validation used by saveProviderConfig and the route. Absolute http/https only.
export function isValidProviderBaseUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

// ── Admin view ───────────────────────────────────────────────────────────────

// Admin-facing (authenticated) view — base URL + masked key + timestamp.
// NEVER exposes the cipher or plaintext.
export async function getProviderConfigAdminView(): Promise<ProviderConfigAdminView> {
  const row = await readConfigRow();

  const hasDbBaseUrl = !!row && isNonEmptyString(row.providerBaseUrl);
  const providerBaseUrl = hasDbBaseUrl ? row!.providerBaseUrl! : null;
  const providerBaseUrlSource: "db" | "env" = hasDbBaseUrl ? "db" : "env";

  let providerApiKeyMasked: string | null = null;
  let providerApiKeyUpdatedAt: string | null = null;
  if (row && isNonEmptyString(row.providerApiKeyCipher)) {
    // Decrypt only to derive the masked display; the plaintext stays local.
    providerApiKeyMasked = maskProviderApiKey(decryptApiKey(row.providerApiKeyCipher));
    providerApiKeyUpdatedAt = row.providerApiKeyUpdatedAt
      ? row.providerApiKeyUpdatedAt.toISOString()
      : null;
  }

  return {
    providerBaseUrl,
    providerBaseUrlSource,
    providerApiKeyMasked,
    providerApiKeyUpdatedAt,
  };
}

// ── Save ─────────────────────────────────────────────────────────────────────

// Persists provider config. Encrypts apiKey only when a non-empty value is
// supplied (write-only semantics). Validates the base URL. Returns the masked
// admin view. NEVER logs the key.
export async function saveProviderConfig(input: {
  providerBaseUrl?: string;            // optional; when present must be valid http/https
  providerApiKey?: string | undefined; // optional; when omitted, cipher unchanged; empty string rejected
}): Promise<ProviderConfigAdminView> {
  const patch: Partial<typeof systemApiConfig.$inferInsert> = {};

  // Base URL validation (Requirement 1.3) — reject 400 and leave value unchanged.
  if (input.providerBaseUrl !== undefined) {
    const trimmed = input.providerBaseUrl.trim();
    if (!isValidProviderBaseUrl(trimmed)) {
      throw new BadRequestError("Geçersiz sağlayıcı base URL — mutlak http/https adresi gerekli.");
    }
    patch.providerBaseUrl = trimmed; // Requirement 1.1
  }

  // Empty-string API key is rejected; cipher left unchanged (Requirement 2.6).
  if (input.providerApiKey === "") {
    throw new BadRequestError("Sağlayıcı API anahtarı boş olamaz.");
  }

  // Non-empty key → encrypt (AES-GCM, primary secret) + stamp (Requirements 2.1, 13.1).
  // Omitted key → cipher + timestamp left untouched (Requirement 2.4).
  if (isNonEmptyString(input.providerApiKey)) {
    patch.providerApiKeyCipher = encryptApiKey(input.providerApiKey);
    patch.providerApiKeyUpdatedAt = new Date();
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await db.update(systemApiConfig).set(patch).where(eq(systemApiConfig.id, 1));
  }

  invalidateProviderConfigCache();

  logger.info(
    {
      baseUrlChanged: input.providerBaseUrl !== undefined,
      apiKeyChanged: isNonEmptyString(input.providerApiKey),
    },
    "provider config saved",
  );

  return getProviderConfigAdminView();
}

// ── Provider profiles (Task 6 / R-panel: metro ⇄ closerouter switch) ──────────

// Builds the admin-safe view of a provider_profiles row. The key is masked via
// maskProviderApiKey(decrypt(cipher)); the cipher/plaintext are NEVER exposed.
// A cipher that cannot be decrypted under any active secret masks to null
// (rather than throwing) so the panel still renders.
function toProviderProfileAdminView(
  row: typeof providerProfiles.$inferSelect,
  activeProviderId: string | null,
): ProviderProfileAdminView {
  let apiKeyMasked: string | null = null;
  if (isNonEmptyString(row.apiKeyCipher)) {
    const plaintext = decryptApiKey(row.apiKeyCipher);
    apiKeyMasked = plaintext ? maskProviderApiKey(plaintext) : null;
  }
  return {
    id: row.id,
    label: row.label ?? "",
    baseUrl: row.baseUrl ?? "",
    apiKeyMasked,
    enabled: row.enabled === true,
    supportedModelIds: parseStringArray(row.supportedModelIds),
    modelMap: parseStringRecord(row.modelMap),
    isActive: activeProviderId !== null && row.id === activeProviderId,
  };
}

// Lists every provider_profiles row as an admin-safe view. NEVER returns the
// cipher or plaintext (only the masked key). isActive marks the row whose id
// equals system_api_config.activeProviderId.
export async function listProviderProfiles(): Promise<ProviderProfileAdminView[]> {
  const configRow = await readConfigRow();
  const activeProviderId = isNonEmptyString(configRow?.activeProviderId)
    ? configRow!.activeProviderId
    : null;

  const rows = await db.select().from(providerProfiles);
  return rows.map((row) => toProviderProfileAdminView(row, activeProviderId));
}

// Upserts a provider_profiles row. The apiKey is write-only: a non-empty value
// is encrypted (AES-GCM) and stored; an omitted key leaves the cipher unchanged;
// an empty-string key is rejected (400). The base URL, when present, must be a
// valid absolute http/https URL (400). Invalidates the resolver cache so the
// change is visible immediately (no restart). Returns the admin-safe view.
export async function upsertProviderProfile(input: {
  id: string;
  label?: string;
  baseUrl?: string;
  apiKey?: string | undefined;
  enabled?: boolean;
  supportedModelIds?: string[];
  modelMap?: Record<string, string>;
}): Promise<ProviderProfileAdminView> {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) {
    throw new BadRequestError("Sağlayıcı profili id zorunlu.");
  }

  // Base URL validation (mirrors saveProviderConfig) — reject 400, value unchanged.
  let baseUrl: string | undefined;
  if (input.baseUrl !== undefined) {
    const trimmed = input.baseUrl.trim();
    if (!isValidProviderBaseUrl(trimmed)) {
      throw new BadRequestError("Geçersiz sağlayıcı base URL — mutlak http/https adresi gerekli.");
    }
    baseUrl = trimmed;
  }

  // Empty-string key rejected; omitted key leaves cipher unchanged (write-only).
  if (input.apiKey === "") {
    throw new BadRequestError("Sağlayıcı API anahtarı boş olamaz.");
  }

  const existingRows = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.id, id))
    .limit(1);
  const existing = existingRows[0] ?? null;

  if (existing) {
    // ── Update: only patch provided fields; cipher untouched unless a non-empty key. ──
    const patch: Partial<typeof providerProfiles.$inferInsert> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
    if (baseUrl !== undefined) patch.baseUrl = baseUrl;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.supportedModelIds !== undefined) patch.supportedModelIds = input.supportedModelIds;
    if (input.modelMap !== undefined) patch.modelMap = input.modelMap;
    if (isNonEmptyString(input.apiKey)) patch.apiKeyCipher = encryptApiKey(input.apiKey);

    await db.update(providerProfiles).set(patch).where(eq(providerProfiles.id, id));
  } else {
    // ── Insert: a brand-new profile. ──
    const values: typeof providerProfiles.$inferInsert = {
      id,
      label: input.label ?? "",
      baseUrl: baseUrl ?? "",
      enabled: input.enabled ?? true,
      supportedModelIds: input.supportedModelIds ?? [],
      modelMap: input.modelMap ?? {},
    };
    if (isNonEmptyString(input.apiKey)) values.apiKeyCipher = encryptApiKey(input.apiKey);

    await db.insert(providerProfiles).values(values);
  }

  invalidateProviderConfigCache();

  logger.info(
    {
      profileId: id,
      baseUrlChanged: baseUrl !== undefined,
      apiKeyChanged: isNonEmptyString(input.apiKey),
    },
    "provider profile upserted",
  );

  const configRow = await readConfigRow();
  const activeProviderId = isNonEmptyString(configRow?.activeProviderId)
    ? configRow!.activeProviderId
    : null;
  const savedRows = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.id, id))
    .limit(1);
  const saved = savedRows[0];
  if (!saved) {
    // Should not happen (we just wrote it); defensive guard.
    throw new BadRequestError("Sağlayıcı profili kaydedilemedi.");
  }
  return toProviderProfileAdminView(saved, activeProviderId);
}

// Sets the active provider. Verifies a provider_profiles row with that id exists
// and is enabled (else 400 — you cannot activate an unknown/disabled provider),
// writes system_api_config.activeProviderId, and invalidates the resolver cache
// so the switch takes effect immediately (no restart). This is the metro ⇄
// closerouter switch.
export async function setActiveProvider(id: string): Promise<ProviderProfileAdminView> {
  const targetId = typeof id === "string" ? id.trim() : "";
  if (!targetId) {
    throw new BadRequestError("Aktifleştirilecek sağlayıcı id zorunlu.");
  }

  const rows = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.id, targetId))
    .limit(1);
  const profile = rows[0] ?? null;
  if (!profile) {
    throw new BadRequestError("Sağlayıcı profili bulunamadı.");
  }
  if (profile.enabled !== true) {
    throw new BadRequestError("Pasif sağlayıcı aktifleştirilemez.");
  }

  await db
    .update(systemApiConfig)
    .set({ activeProviderId: targetId, updatedAt: new Date() })
    .where(eq(systemApiConfig.id, 1));

  invalidateProviderConfigCache();

  logger.info({ activeProviderId: targetId }, "active provider switched");

  return toProviderProfileAdminView(profile, targetId);
}

// ── Connection test ──────────────────────────────────────────────────────────

function categorizeError(err: unknown): "timeout" | "connection" | "unknown" {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
    if (err.name === "TypeError") return "connection"; // fetch network failure
  }
  return "unknown";
}

// Uses pending config when supplied, else the saved/effective config.
// Performs ONE minimal probe: GET {base}/models and treats 2xx as success.
// Bounded by a short timeout. Persists nothing; writes no transactions/usage_records.
// The result NEVER contains the provider API key.
export async function testProviderConnection(pending?: {
  providerBaseUrl?: string;
  providerApiKey?: string;
}): Promise<ConnectionTestResult> {
  let baseUrl: string;
  if (isNonEmptyString(pending?.providerBaseUrl)) {
    const trimmed = pending!.providerBaseUrl!.trim();
    if (!isValidProviderBaseUrl(trimmed)) {
      throw new BadRequestError("Geçersiz sağlayıcı base URL — mutlak http/https adresi gerekli.");
    }
    baseUrl = trimmed;
  } else {
    baseUrl = await resolveProviderBaseUrl();
  }

  // Pending key (in-memory only, never persisted) else the resolved effective key.
  const apiKey = isNonEmptyString(pending?.providerApiKey)
    ? pending!.providerApiKey
    : await resolveProviderApiKey();

  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey ?? ""}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    return {
      ok: res.ok,
      upstreamStatus: res.status,
      latencyMs: Date.now() - start,
      errorCategory: res.ok ? undefined : "http_error", // Requirements 8.2 / 8.3
    };
  } catch (err) {
    return {
      ok: false,
      upstreamStatus: null,
      latencyMs: Date.now() - start,
      errorCategory: categorizeError(err), // Requirement 8.3
    };
  }
}
