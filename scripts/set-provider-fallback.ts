// scripts/set-provider-fallback.ts
//
// Sets (or clears) provider_profiles.fallback_provider_id for the failover rollout.
// Used MANUALLY during rollout — NOT run by deploy. Loads env via ENV_FILE_PATH
// (default ".env"), mirroring scripts/seed-provider-profiles.ts. The service module
// is imported AFTER env is loaded (dynamic import) so db/client picks up DATABASE_URL.
//
// Usage:
//   ENV_FILE_PATH=.env.production npx tsx scripts/set-provider-fallback.ts <profileId> <fallbackProviderId|none>
// Examples:
//   ... set-provider-fallback.ts wellflow closerouter   # wellflow → popusk failover
//   ... set-provider-fallback.ts wellflow none          # clear failover

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

const [, , id, fbArg] = process.argv;
if (!id) {
  console.error("usage: set-provider-fallback.ts <profileId> <fallbackProviderId|none>");
  process.exit(1);
}

const fallbackProviderId = !fbArg || fbArg === "none" || fbArg === "null" ? null : fbArg;

const { upsertProviderProfile } = await import("../src/server/services/provider-config-service.js");
const view = await upsertProviderProfile({ id, fallbackProviderId });
console.log(JSON.stringify({ id: view.id, fallbackProviderId: view.fallbackProviderId, enabled: view.enabled }, null, 2));
process.exit(0);
