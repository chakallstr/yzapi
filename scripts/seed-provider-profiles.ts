// scripts/seed-provider-profiles.ts
//
// One-shot operator script: seeds the provider profiles for PER-MODEL routing and
// (re-)applies the fallback active provider. Each enabled profile's
// supported_model_ids is a DISJOINT partition; the request's model picks the
// upstream (resolveProviderForModel). PROBE-VERIFIED topology (updated 2026-06-07):
//
//   wellflow    — Claude family upstream (base https://api.wellflow.dev/v1). OWN
//                 reseller key (wf_-prefixed) from env WELLFLOW_API_KEY (conditional,
//                 empty env keeps stored cipher). Serves opus-4.8 (DOT wire) + opus-4-7/4-6,
//                 sonnet-4-6, haiku-4-5 (model_map → DOT wire names). Re-probe 2026-06-05:
//                 wellflow serves claude-opus-4.8 (GET /v1/models lists it; chat+messages 200).
//                 fallback_provider_id = closerouter → infra (502/503/504/timeout) failover.
//   closerouter — "Popusk" multi-model upstream (base https://api.claude-popusk.shop/v1).
//                 OWN reseller key from env POPUSK_API_KEY (conditional). Serves the
//                 GPT-5 LOWER family (gpt-5.4-mini and below) + o-series + Gemini.
//                 NOTE: gpt-5.5 and gpt-5.4 (top-tier) moved to rika 2026-06-07.
//                 NOTE: opus-4.8 was moved to wellflow-PRIMARY 2026-06-05.
//   rika        — Reseller GPT-5 top-tier upstream. OWN reseller key from env RIKA_API_KEY.
//                 Serves gpt-5.5 and gpt-5.4 (the two confirmed models from the Rika catalog).
//                 Wire names verbatim. No fallback configured.
//   metro       — DELETED. The old api.stepanovikov.uno profile is removed: GPT/Gemini
//                 moved to popusk, Claude to wellflow (operator decision 2026-06-03).
//
// Provider keys are read from env (WELLFLOW_API_KEY, POPUSK_API_KEY, RIKA_API_KEY) — never
// hard-coded / committed. The fallback active provider defaults to "closerouter"
// (popusk) since it serves the bulk of the catalog; override with ACTIVE_PROVIDER.
// Under per-model routing the active provider only serves models pinned to no
// enabled profile (plus web-search / Gözcü probe / connection-test).
//
// Run on the server (reads .env.production for DATABASE_URL + secrets):
//   ENV_FILE_PATH=.env.production NODE_ENV=production \
//     WELLFLOW_API_KEY='wf_***' POPUSK_API_KEY='***' RIKA_API_KEY='***' \
//     ACTIVE_PROVIDER=closerouter npx tsx scripts/seed-provider-profiles.ts
//
// Idempotent: re-running upserts the rows in place, deletes any metro row, and
// re-applies the active provider. Prints a masked summary; NEVER prints the key.

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { eq } from "drizzle-orm";
import {
  upsertProviderProfile,
  setActiveProvider,
  listProviderProfiles,
} from "../src/server/services/provider-config-service.js";
import { db, dbSql } from "../src/server/db/client.js";
import { addedModels, providerProfiles } from "../src/server/db/schema.js";

// Added models (additive layer; MASTER_MODELS 42-kilit korunur). Seeded inline
// (NOT imported from db/seed.ts, whose top-level main() would run as an import
// side-effect). Idempotent via onConflictDoNothing — never overwrites an existing
// row's price/label. Prices from the approved locked table (USD/1M).
// claude-opus-4.8 is served by wellflow (primary, since 2026-06-05); gemini-3.5-flash is kept for catalog parity
// but NO enabled profile serves it now (popusk doesn't expose it) → it stays hidden
// from the UNION catalog until a provider lists it.
const ADDED_MODELS = [
  { modelId: "claude-opus-4.8", name: "Claude Opus 4.8", providerLabel: "Anthropic", inputUsd: "1.40", outputUsd: "1.40" },
  { modelId: "gemini-3.5-flash", name: "Gemini 3.5 Flash", providerLabel: "Google", inputUsd: "0.90", outputUsd: "0.90" },
] as const;

async function seedAddedModelsInline() {
  for (const m of ADDED_MODELS) {
    await db
      .insert(addedModels)
      .values({
        modelId: m.modelId,
        name: m.name,
        providerLabel: m.providerLabel,
        inputUsd: m.inputUsd,
        outputUsd: m.outputUsd,
        enabled: true,
      })
      .onConflictDoNothing();
  }
}

// ── wellflow (Claude family) ──────────────────────────────────────────────────
// PROBE-VERIFIED 2026-06-03: GET /v1/models, POST /v1/chat/completions and POST
// /v1/messages all return 200 under the /v1 base (closerouter-service builds
// `${base}/messages` → /v1/messages). The docs' "ANTHROPIC_BASE_URL without /v1"
// is only because the Anthropic SDK auto-appends /v1.
const WELLFLOW_BASE_URL = process.env.WELLFLOW_BASE_URL || "https://api.wellflow.dev/v1";

const WELLFLOW_SUPPORTED_MODEL_IDS = [
  "claude-opus-4.8", // moved here 2026-06-05 (wellflow PRIMARY); DOT wire = canonical → no map entry needed
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

// Canonical catalog id → wellflow upstream wire name. PROBE-VERIFIED: GET /v1/models
// exposes the DOT forms (claude-opus-4.7/4.6, claude-sonnet-4.6, claude-haiku-4.5).
// wellflow normalizes dash↔dot for opus/sonnet, but our canonical haiku id is DATED
// (claude-haiku-4-5-20251001) and MUST be rewritten to claude-haiku-4.5 — so all
// four are mapped explicitly for safety/determinism.
const WELLFLOW_MODEL_MAP: Record<string, string> = {
  "claude-opus-4-7": "claude-opus-4.7",
  "claude-opus-4-6": "claude-opus-4.6",
  "claude-sonnet-4-6": "claude-sonnet-4.6",
  "claude-haiku-4-5-20251001": "claude-haiku-4.5",
};

// ── rika — GPT-5 top-tier (gpt-5.5, gpt-5.4) ────────────────────────────────────
// Reseller upstream. Key from env RIKA_API_KEY (conditional; empty env keeps cipher).
// Only the two models confirmed by the Rika catalog are listed here.
// Wire names verbatim (no model_map needed).
const RIKA_BASE_URL = process.env.RIKA_BASE_URL || "https://ai.rika.wtf/v1";

const RIKA_SUPPORTED_MODEL_IDS = [
  "gpt-5.5", "gpt-5.5-2026-04-23",
  "gpt-5.4", "gpt-5.4-2026-03-05",
];

const RIKA_MODEL_MAP: Record<string, string> = {};

// ── closerouter ("Popusk") — GPT + o-series + Gemini + opus-4.8 ─────────────────
// PROBE-VERIFIED 2026-06-03 (GET https://api.claude-popusk.shop/v1/models): popusk
// is a full multi-model router. The ids below are exactly those popusk exposes AND
// that exist in our MASTER_MODELS (verified), plus the added claude-opus-4.8. Wire
// names are verbatim (dash) — only opus-4.8 needs a dot→dash rewrite (see map).
// NOTE: gpt-5.5 and gpt-5.4 (+ dated variants) moved to rika 2026-06-07.
const POPUSK_BASE_URL = process.env.POPUSK_BASE_URL || "https://api.claude-popusk.shop/v1";

const POPUSK_SUPPORTED_MODEL_IDS = [
  // GPT-5 lower family (gpt-5.5 / gpt-5.4 moved to rika)
  "gpt-5.4-mini", "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-nano", "gpt-5.4-nano-2026-03-17",
  "gpt-5.3-chat-latest",
  "gpt-5.2", "gpt-5.2-2025-12-11", "gpt-5.2-chat-latest",
  "gpt-5.1", "gpt-5.1-2025-11-13", "gpt-5.1-chat-latest",
  "gpt-5", "gpt-5-2025-08-07", "gpt-5-chat-latest",
  "gpt-5-mini", "gpt-5-mini-2025-08-07",
  "gpt-5-nano", "gpt-5-nano-2025-08-07",
  "gpt-5-search-api", "gpt-5-search-api-2025-10-14",
  // o-series (6)
  "o4-mini", "o4-mini-2025-04-16",
  "o3", "o3-2025-04-16",
  "o3-mini", "o3-mini-2025-01-31",
  // Gemini (3 — exactly what popusk exposes)
  "gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools", "gemini-3-flash-preview",
  // NOTE: claude-opus-4.8 was moved to wellflow-PRIMARY (2026-06-05) — it is NO LONGER in
  // popusk's supportedModelIds (else, by id sort order, closerouter would hijack primary
  // routing). popusk now only serves opus-4.8 as the FAILOVER target (see POPUSK_MODEL_MAP).
];

// canonical id → popusk wire id. opus-4.8's canonical id is dot-form but popusk
// serves it as the dash form. KEPT even though opus-4.8 is no longer in popusk's
// supportedModelIds: the wellflow→closerouter failover leg routes opus-4.8 here and
// needs this dot→dash rewrite (fallback uses the fallback profile's own modelMap).
const POPUSK_MODEL_MAP: Record<string, string> = {
  "claude-opus-4.8": "claude-opus-4-8",
};

async function main() {
  // Active fallback provider. Default "closerouter" (popusk serves the bulk). If an
  // operator passes the now-deleted "metro", coerce to closerouter so we never try
  // to activate a profile we're about to delete.
  let activeProvider = (process.env.ACTIVE_PROVIDER || "closerouter").trim();
  if (activeProvider === "metro") {
    console.log("  ACTIVE_PROVIDER=metro istendi ama metro siliniyor → closerouter'a çevrildi");
    activeProvider = "closerouter";
  }

  console.log("Seeding provider profiles...");

  // ── added_models ────────────────────────────────────────────────────────────
  await seedAddedModelsInline();
  console.log("  added_models seeded (claude-opus-4.8 [wellflow primary → popusk fallback], gemini-3.5-flash [hidden — no provider])");

  // ── rika (GPT-5 top-tier: gpt-5.5, gpt-5.4) ────────────────────────────────────
  await upsertProviderProfile({
    id: "rika",
    label: "Rika",
    baseUrl: RIKA_BASE_URL,
    ...(process.env.RIKA_API_KEY ? { apiKey: process.env.RIKA_API_KEY } : {}),
    enabled: true,
    supportedModelIds: RIKA_SUPPORTED_MODEL_IDS,
    modelMap: RIKA_MODEL_MAP,
  });
  console.log(`  rika upserted (base=${RIKA_BASE_URL}, ${RIKA_SUPPORTED_MODEL_IDS.length} models, key=${process.env.RIKA_API_KEY ? "RIKA_API_KEY" : "(unchanged)"})`);

  // ── wellflow (Claude family) ─────────────────────────────────────────────────
  // OWN reseller key (wf_-prefixed) from env WELLFLOW_API_KEY, conditional so an
  // empty env preserves any stored cipher. ⚠️ The key MUST be present (stored or
  // env) — a keyless enabled profile makes resolveProviderForModel fall back to the
  // active provider for Claude, which (popusk) would mis-serve the wire names.
  await upsertProviderProfile({
    id: "wellflow",
    label: "Wellflow",
    baseUrl: WELLFLOW_BASE_URL,
    ...(process.env.WELLFLOW_API_KEY ? { apiKey: process.env.WELLFLOW_API_KEY } : {}),
    enabled: true,
    supportedModelIds: WELLFLOW_SUPPORTED_MODEL_IDS,
    modelMap: WELLFLOW_MODEL_MAP,
    // Infra-failover target (2026-06-05): wellflow Claude (incl. opus-4.8) falls over
    // to closerouter/Popusk on 502/503/504/connect-timeout. Baked into the seed so a
    // re-seed restores the edge (was previously set manually via set-provider-fallback).
    fallbackProviderId: "closerouter",
  });
  console.log(`  wellflow upserted (base=${WELLFLOW_BASE_URL}, ${WELLFLOW_SUPPORTED_MODEL_IDS.length} models, ${Object.keys(WELLFLOW_MODEL_MAP).length} mapped, key=${process.env.WELLFLOW_API_KEY ? "WELLFLOW_API_KEY" : "(unchanged)"})`);

  // ── closerouter ("Popusk") — GPT + o-series + Gemini + opus-4.8 ───────────────
  // OWN reseller key from env POPUSK_API_KEY (conditional; empty env keeps the
  // stored cipher). Base EXPLICIT — never derived from aiProviderBaseUrl().
  await upsertProviderProfile({
    id: "closerouter",
    label: "Popusk",
    baseUrl: POPUSK_BASE_URL,
    ...(process.env.POPUSK_API_KEY ? { apiKey: process.env.POPUSK_API_KEY } : {}),
    enabled: true,
    supportedModelIds: POPUSK_SUPPORTED_MODEL_IDS,
    modelMap: POPUSK_MODEL_MAP,
  });
  console.log(`  closerouter(Popusk) upserted (base=${POPUSK_BASE_URL}, ${POPUSK_SUPPORTED_MODEL_IDS.length} models, ${Object.keys(POPUSK_MODEL_MAP).length} mapped, key=${process.env.POPUSK_API_KEY ? "POPUSK_API_KEY" : "(unchanged)"})`);

  // ── activate (before deleting metro so active_provider_id never dangles) ──────
  await setActiveProvider(activeProvider);
  console.log(`  active provider => ${activeProvider}`);

  // ── delete metro (operator decision: komple sil) ──────────────────────────────
  // Done AFTER activation so system_api_config.active_provider_id is already off
  // metro. provider_profiles has no FK referencing it, so a plain delete is safe.
  const delRes = await db.delete(providerProfiles).where(eq(providerProfiles.id, "metro"));
  console.log(`  metro profile deleted (rows=${(delRes as { count?: number }).count ?? "?"})`);

  // ── masked summary ──────────────────────────────────────────────────────────
  const profiles = await listProviderProfiles();
  for (const p of profiles) {
    console.log(
      `    [${p.isActive ? "ACTIVE" : "standby"}] ${p.id} base=${p.baseUrl} key=${p.apiKeyMasked ?? "(env)"} models=${p.supportedModelIds.length} mapped=${Object.keys(p.modelMap).length}`,
    );
  }

  console.log("Provider profiles seed complete.");
  await dbSql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
