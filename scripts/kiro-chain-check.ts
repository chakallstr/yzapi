import { resolveProviderChainForModel } from "../src/server/services/provider-config-service.js";
try {
  const c = await resolveProviderChainForModel("beta-opus-4.8");
  console.log("primary:", c?.primary?.profileId);
  console.log("fallbacks:", JSON.stringify((c?.fallbacks ?? []).map((f: any) => f?.profileId)));
  console.log("full chain keys:", Object.keys(c ?? {}));
} catch (e) {
  console.error("ERR", (e as Error).message);
}
process.exit(0);
