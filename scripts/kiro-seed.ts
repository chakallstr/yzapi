// One-shot seed for the Kiro private-beta seat. Run on the VPS AFTER the code
// deploy (kiro-beta-service.ts + proxy.ts gate) with:
//   cd /opt/turkapiprojesi && node --env-file=.env.production --import tsx scripts/kiro-seed.ts
// Idempotent: re-running updates the rows rather than erroring.
import { createAddedModel, deleteAddedModel, listAddedModels } from "../src/server/services/added-model-service.js";
import { upsertProviderProfile } from "../src/server/services/provider-config-service.js";

// Customer-facing id is a normal-looking "opus-4.8" (provider "Anthropic") so
// the Kiro/AWS upstream is never disclosed in /v1/models (codename-noleak + ban
// exposure). Distinct from the PUBLIC "claude-opus-4.8" (which stays on cf-claude).
const MODEL_ID = "opus-4.8";
const BRIDGE_URL = "http://127.0.0.1:8321/v1";
const BRIDGE_KEY = "yzk_kiro_92e20ccf9b594c5ad8659b0b0fea787295d88855";

// 1) private catalog model (priced like claude-opus-4.8: 1.40/1.40 USD per 1M)
const modelInput = {
  modelId: MODEL_ID,
  name: "Opus-4.8",
  providerLabel: "Anthropic",
  inputUsd: 1.4,
  outputUsd: 1.4,
  enabled: true,
  contextTokens: 200000,
  type: "Metin" as const,
};
const existing = (await listAddedModels()).some((m) => m.modelId === MODEL_ID);
if (existing) {
  await deleteAddedModel(MODEL_ID); // re-create to apply current values (no update fn)
  console.log("added_model existed -> deleted for re-create:", MODEL_ID);
}
await createAddedModel(modelInput);
console.log("added_model created:", MODEL_ID);

// 2) kiro provider profile — serves ONLY the private id, routes to the bridge,
//    rewrites kiro-opus-4.8 -> claude-opus-4.8 on the wire (belt-and-suspenders
//    with the bridge's own alias). No fallback (test seat; failures surface).
await upsertProviderProfile({
  id: "kiro",
  label: "Kiro (CodeWhisperer seat)",
  baseUrl: BRIDGE_URL,
  apiKey: BRIDGE_KEY,
  enabled: true,
  supportedModelIds: [MODEL_ID],
  modelMap: { [MODEL_ID]: "claude-opus-4.8" }, // wire rewrite: beta-opus-4.8 -> claude-opus-4.8
  fallbackProviderId: null,
});
console.log("provider_profile upserted: kiro ->", BRIDGE_URL);
console.log("DONE. Set KIRO_BETA_USER_IDS in .env.production and restart to open the gate.");
process.exit(0); // services hold a DB pool open; exit explicitly so logs flush
