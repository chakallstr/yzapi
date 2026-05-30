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
import { systemApiConfig } from "../db/schema.js";
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
    baseUrl: "db" | "env";
    apiKey: "db" | "env" | "none";
  };
}

// Admin-facing (authenticated) view — base URL + masked key + timestamp.
// NEVER contains the cipher or the plaintext key.
export interface ProviderConfigAdminView {
  providerBaseUrl: string | null;       // null => env fallback in effect
  providerBaseUrlSource: "db" | "env";
  providerApiKeyMasked: string | null;  // null => no DB key (env fallback)
  providerApiKeyUpdatedAt: string | null;
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

// Clears the in-process cache so the next resolve reads fresh DB state.
// Called by the admin save handler (Requirement 3.5).
export function invalidateProviderConfigCache(): void {
  cache = null;
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

// ── Resolution (DB-first, env fallback) ──────────────────────────────────────

// Combined resolve (single DB read), used by the connection test and forwarders.
export async function resolveEffectiveProviderConfig(): Promise<EffectiveProviderConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.config;
  }

  const row = await readConfigRow();

  // Base URL: DB-first (Requirement 3.1), else env (Requirement 3.2).
  let baseUrl: string;
  let baseUrlSource: "db" | "env";
  if (row && isNonEmptyString(row.providerBaseUrl)) {
    baseUrl = row.providerBaseUrl;
    baseUrlSource = "db";
  } else {
    baseUrl = aiProviderBaseUrl();
    baseUrlSource = "env";
  }

  // API key: DB cipher → decrypt (rotation fallback) (Requirement 3.3 / 13.2),
  // else env (Requirement 3.4).
  let apiKey: string | undefined;
  let apiKeySource: "db" | "env" | "none";
  if (row && isNonEmptyString(row.providerApiKeyCipher)) {
    const decrypted = decryptApiKey(row.providerApiKeyCipher);
    if (decrypted) {
      apiKey = decrypted;
      apiKeySource = "db";
    } else {
      // Cipher could not be decrypted under any active secret — fall back to env
      // rather than forwarding upstream with a broken credential.
      apiKey = aiProviderApiKey();
      apiKeySource = apiKey ? "env" : "none";
    }
  } else {
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
