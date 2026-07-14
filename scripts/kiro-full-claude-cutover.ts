// Full public-Claude cutover to the Kiro seat pool (operator request 2026-07-14:
// "yapayzekalab.org bütün claude isteklerini tamamen kiro seatlerine yönlendir").
//
// Today `cf-claude` (CF claude-api reseller, cloak routing since 07-03) serves ALL
// public Claude ids. This script moves every Claude id the Kiro bridge actually
// supports over to the `kiro` profile, and leaves ONLY `claude-fable-5` on
// `cf-claude` — the Kiro/CodeWhisperer catalog does NOT serve fable-5 (verified
// live 2026-07-14, see ~/kiro-bridge/CLAUDE.md "Model catalog"), so pinning it to
// kiro would 404/INVALID_MODEL_ID every fable-5 request instead of routing it.
//
// Safety net: kiro.fallbackProviderId = "cf-claude" (same pattern as
// wellflow/sub-codex/vexly → closerouter/sub-claude) — a Kiro-side 502/503/504/
// timeout fails over to CF instead of breaking the request. This does NOT cover
// non-infra failures (e.g. a seat ban surfacing as 401/403) — see kiro-bridge's
// own seat-disable/alert path for that.
//
// The private beta id ("opus-4.8", used by package beta-opus-500-24h) is kept in
// kiro's supportedModelIds unchanged — it already only routes there.
//
// DOES NOT touch KIRO_BETA_USER_IDS / kiro-beta-service.ts: that gate restricts
// the PRIVATE id + beta package purchases only. Public ids below bypass it
// entirely (same mechanism cf-claude used) — every customer gets Kiro-served
// Claude once this runs, not just the beta allowlist.
//
// ⚠️ Only 3 Kiro seats exist today (accounts/google-primary|2|3.json, round-robin
// pool) vs. cf-claude's full production Claude volume — capacity/ban risk is real.
// Run only after the operator has weighed that (see kiro-bridge/CLAUDE.md "Ban
// risk is real" + "Overages"). NOT wired into sync-deploy.sh; run by hand on the
// VPS post-deploy, same as kiro-seed.ts:
//   cd /opt/turkapiprojesi && NODE_ENV=production npx tsx scripts/kiro-full-claude-cutover.ts
// Idempotent: re-running just re-applies the same partition.
import { upsertProviderProfile, listProviderProfiles } from "../src/server/services/provider-config-service.js";

// Kiro/CodeWhisperer-servable Claude ids (verified live 2026-07-14 against the
// logged-in seat, see ~/kiro-bridge/CLAUDE.md "Model catalog"). claude-fable-5 is
// deliberately EXCLUDED — not in the Kiro catalog.
const KIRO_CLAUDE_MODEL_MAP: Record<string, string> = {
  "claude-opus-4.8": "claude-opus-4.8",
  "claude-opus-4-8": "claude-opus-4.8",
  "claude-opus-4-7": "claude-opus-4.7",
  "claude-opus-4-6": "claude-opus-4.6",
  "claude-sonnet-4-6": "claude-sonnet-4.6",
  "claude-sonnet-5": "claude-sonnet-5",
  "claude-haiku-4-5-20251001": "claude-haiku-4.5",
};

// Stays on cf-claude — no Kiro equivalent.
const CF_CLAUDE_ONLY_MODEL_IDS = ["claude-fable-5"];

// Private beta id — already kiro-only; kept verbatim so this script is idempotent
// even if run before kiro-seed.ts's own upsert.
const KIRO_PRIVATE_BETA_MODEL_ID = "opus-4.8";
const KIRO_PRIVATE_BETA_MODEL_MAP: Record<string, string> = { [KIRO_PRIVATE_BETA_MODEL_ID]: "claude-opus-4.8" };

const kiroSupportedModelIds = [KIRO_PRIVATE_BETA_MODEL_ID, ...Object.keys(KIRO_CLAUDE_MODEL_MAP)];
const kiroModelMap = { ...KIRO_PRIVATE_BETA_MODEL_MAP, ...KIRO_CLAUDE_MODEL_MAP };

await upsertProviderProfile({
  id: "kiro",
  enabled: true,
  supportedModelIds: kiroSupportedModelIds,
  modelMap: kiroModelMap,
  fallbackProviderId: "cf-claude",
});
console.log("kiro upserted: ", kiroSupportedModelIds.length, "models, fallback=cf-claude");

await upsertProviderProfile({
  id: "cf-claude",
  enabled: true,
  supportedModelIds: CF_CLAUDE_ONLY_MODEL_IDS,
});
console.log("cf-claude narrowed to:", CF_CLAUDE_ONLY_MODEL_IDS);

const profiles = await listProviderProfiles();
for (const p of profiles) {
  if (p.id === "kiro" || p.id === "cf-claude") {
    console.log(`  [${p.enabled ? "enabled" : "disabled"}] ${p.id} fallback=${p.fallbackProviderId ?? "(none)"} models=${JSON.stringify(p.supportedModelIds)}`);
  }
}
console.log("DONE. Public Claude traffic (except claude-fable-5) now pinned to kiro.");
process.exit(0);
