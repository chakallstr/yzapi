// Prove claude-opus-4.8 from the package holder routes to the Kiro bridge (not
// cf-claude). Reserves a slot to read the provider override, then RELEASES it.
import { tryReservePackageSlot, releasePackageSlot, checkPackageCoverage } from "../src/server/services/entitlement-service.js";
import { packageOverrideChain } from "../src/server/services/package-provider-override.js";
import { resolveProviderChainForModel } from "../src/server/services/provider-config-service.js";

const U = "d76e275b-b6fb-4c75-8416-b5e6eb72fa4b";
const g = (b: boolean) => (b ? "✓" : "✗ FAIL");

console.log("checkPackageCoverage(claude-opus-4.8):", g(await checkPackageCoverage(U, "claude-opus-4.8")));

const slot = await tryReservePackageSlot(U, "claude-opus-4.8");
console.log("reserve covered:", g(slot.covered), "| providerBaseUrl:", (slot as any).providerBaseUrl ?? (slot as any).provider_base_url ?? "(none)");
if (slot.covered && slot.entitlementId) {
  try {
    const chain = packageOverrideChain(slot as any);
    console.log("packageOverrideChain baseUrl:", chain?.primary?.baseUrl, g(!!chain?.primary?.baseUrl?.includes("8321")));
  } catch (e) { console.log("override chain err:", (e as Error).message); }
  await releasePackageSlot(slot.entitlementId, "claude-opus-4.8"); // give the slot back
  console.log("slot released (quota restored)");
}
// public path unaffected
const pub = await resolveProviderChainForModel("claude-opus-4.8");
console.log("public claude-opus-4.8 (no package) route:", pub?.primary?.profileId, g(pub?.primary?.profileId !== "kiro"));
process.exit(0);
