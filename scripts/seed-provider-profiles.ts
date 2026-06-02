// scripts/seed-provider-profiles.ts
//
// One-shot operator script: seeds the two provider profiles for the
// metro-provider-switch feature and (optionally) activates one.
//
//   metro       — ACTIVE upstream (api.stepanovikov.uno/v1). Serves a subset of
//                 the catalog; some catalog ids need a wire-name rewrite
//                 (model_map) because metro expects the nokta-form id.
//   closerouter — STANDBY upstream (Claude Popusk, base https://api.claude-popusk.shop/v1
//                 via env AI_PROVIDER_BASE_URL). Has its OWN dedicated reseller key
//                 read from env POPUSK_API_KEY (set conditionally so an empty env
//                 keeps the stored cipher). Serves the full master catalog minus
//                 gemini-3-pro-preview, PLUS added model claude-opus-4.8 (dot→dash
//                 wire rewrite via model_map).
//
// Provider keys are read from env (METRO_API_KEY, POPUSK_API_KEY) — never
// hard-coded / committed. The active profile is set from env ACTIVE_PROVIDER
// (default "metro"); this script only refreshes the closerouter row and re-applies
// the active provider, so pass the CURRENT active provider to avoid switching.
//
// Run on the server (reads .env.production for DATABASE_URL + secrets):
//   ENV_FILE_PATH=.env.production NODE_ENV=production METRO_API_KEY='***' \
//     ACTIVE_PROVIDER=metro npx tsx scripts/seed-provider-profiles.ts
//
// Idempotent: re-running updates the rows in place (upsert) and re-applies the
// active provider. Prints a masked summary; NEVER prints the plaintext key.

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { MASTER_MODELS } from "../src/master-models.js";
import {
  upsertProviderProfile,
  setActiveProvider,
  listProviderProfiles,
} from "../src/server/services/provider-config-service.js";
import { aiProviderBaseUrl } from "../src/server/lib/env.js";
import { db, dbSql } from "../src/server/db/client.js";
import { addedModels } from "../src/server/db/schema.js";

// Metro added models (additive layer; MASTER_MODELS 42-kilit korunur). Seeded
// inline (NOT imported from db/seed.ts, whose top-level main() would run as an
// import side-effect). Idempotent via onConflictDoNothing — never overwrites an
// existing row's price/label. Prices from the approved locked table (USD/1M).
const METRO_ADDED_MODELS = [
  { modelId: "claude-opus-4.8", name: "Claude Opus 4.8", providerLabel: "Anthropic", inputUsd: "1.40", outputUsd: "1.40" },
  { modelId: "gemini-3.5-flash", name: "Gemini 3.5 Flash", providerLabel: "Google", inputUsd: "0.90", outputUsd: "0.90" },
] as const;

async function seedAddedModelsInline() {
  for (const m of METRO_ADDED_MODELS) {
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

// Metro upstream base URL (OpenAI-compatible, Bearer). The provider serves
// /v1/chat/completions, so the base URL keeps the /v1 suffix.
const METRO_BASE_URL = process.env.METRO_BASE_URL || "https://api.stepanovikov.uno/v1";

// Metro's supported catalog ids (canonical). Verified live against metro's
// chat/completions allow-list. Two of these are added_models (gemini-3.5-flash,
// claude-opus-4.8); the rest are master ids.
const METRO_SUPPORTED_MODEL_IDS = [
  "gpt-5.5",
  "gpt-5.4",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash", // added model
  "claude-opus-4.8", // added model
];

// Canonical catalog id → metro upstream wire name. Only ids whose canonical
// (tire) form differs from metro's expected (nokta) form need an entry; the rest
// are forwarded verbatim.
const METRO_MODEL_MAP: Record<string, string> = {
  "claude-opus-4-6": "claude-opus-4.6",
  "claude-sonnet-4-6": "claude-sonnet-4.6",
  "claude-haiku-4-5-20251001": "claude-haiku-4.5",
};

// Standby (closerouter = Claude Popusk) supported ids = Claude-only catalog for now;
// GPT/Gemini/o-series closed until pricing is finalized (user decision 2026-06-02).
// These are the previously-live wellflow-era Claude set, all deliberately priced.
// claude-opus-4.8 is the added-model DOT id (exposed via the modelMap dot→dash
// rewrite below); the other four are MASTER_MODELS dash ids.
const STANDBY_SUPPORTED_MODEL_IDS = [
  "claude-opus-4.8", // added model — exposed via the modelMap dot→dash rewrite
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

async function main() {
  const metroKey = process.env.METRO_API_KEY;
  if (!metroKey || !metroKey.trim()) {
    throw new Error("METRO_API_KEY env zorunlu (metro profili anahtarı). Script key'i dosyaya yazmaz.");
  }
  const activeProvider = (process.env.ACTIVE_PROVIDER || "metro").trim();

  console.log("Seeding provider profiles...");

  // ── added_models (metro yeni modelleri) ─────────────────────────────────────
  // claude-opus-4.8 + gemini-3.5-flash added_models katmanından gelir (MASTER_MODELS
  // 42-kilit korunur). deploy seed.ts'i çalıştırmadığı için burada idempotent seed
  // edilir; metro profili bu id'leri supported_model_ids ile görünür kılar.
  await seedAddedModelsInline();
  console.log("  added_models (metro) seeded (claude-opus-4.8, gemini-3.5-flash)");

  // ── metro (active upstream) ─────────────────────────────────────────────────
  await upsertProviderProfile({
    id: "metro",
    label: "Metro",
    baseUrl: METRO_BASE_URL,
    apiKey: metroKey,
    enabled: true,
    supportedModelIds: METRO_SUPPORTED_MODEL_IDS,
    modelMap: METRO_MODEL_MAP,
  });
  console.log(`  metro upserted (base=${METRO_BASE_URL}, ${METRO_SUPPORTED_MODEL_IDS.length} models, ${Object.keys(METRO_MODEL_MAP).length} mapped)`);

  // ── closerouter (standby upstream = Claude Popusk) ──────────────────────────
  // KEY: popusk has its OWN reseller key, read from env POPUSK_API_KEY (never
  // hard-coded / committed; mirrors the METRO_API_KEY handling above). Set it
  // conditionally so an empty env preserves any existing stored cipher instead
  // of nulling it. NOTE: the old behaviour (omit apiKey → fall back to the env
  // AI_PROVIDER_API_KEY) is WRONG now that the active provider's key lives there.
  const standbyBase = aiProviderBaseUrl();
  await upsertProviderProfile({
    id: "closerouter",
    label: "Claude Popusk (standby)",
    baseUrl: standbyBase,
    ...(process.env.POPUSK_API_KEY ? { apiKey: process.env.POPUSK_API_KEY } : {}),
    enabled: true,
    supportedModelIds: STANDBY_SUPPORTED_MODEL_IDS,
    // canonical id → popusk wire id. opus-4.8's canonical id is dot-form but
    // popusk serves it as the dash form; the rest forward verbatim.
    modelMap: { "claude-opus-4.8": "claude-opus-4-8" },
  });
  console.log(`  closerouter upserted (base=${standbyBase}, ${STANDBY_SUPPORTED_MODEL_IDS.length} models, key=${process.env.POPUSK_API_KEY ? "POPUSK_API_KEY" : "(unchanged)"})`);

  // ── activate ─────────────────────────────────────────────────────────────────
  await setActiveProvider(activeProvider);
  console.log(`  active provider => ${activeProvider}`);

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
