import { resolveProviderChainForModel } from "../src/server/services/provider-config-service.js";
import { getActiveCatalogModels } from "../src/server/services/added-model-service.js";
import { isKiroRestrictedModel, isKiroBetaUser, packageGrantsRestrictedModel } from "../src/server/services/kiro-beta-service.js";

const TESTER = "d76e275b-b6fb-4c75-8416-b5e6eb72fa4b";
const RANDOM = "00000000-0000-0000-0000-000000000000";
const g = (b: boolean) => (b ? "✓" : "✗ FAIL");

const chain = await resolveProviderChainForModel("opus-4.8");
console.log("opus-4.8 route:", chain?.primary?.profileId, "| fallbacks:", JSON.stringify((chain?.fallbacks ?? []).map((f: any) => f?.profileId)), g(chain?.primary?.profileId === "kiro" && (chain?.fallbacks ?? []).length === 0));

const cat = await getActiveCatalogModels();
console.log("opus-4.8 in catalog:", g(cat.some((m) => m.id === "opus-4.8")));
console.log("beta-opus-4.8 gone:", g(!cat.some((m) => m.id === "beta-opus-4.8")));

console.log("gate opus-4.8 restricted:", g(isKiroRestrictedModel("opus-4.8")));
console.log("gate Opus-4.8 (caps) restricted:", g(isKiroRestrictedModel("Opus-4.8")));
console.log("gate claude-opus-4.8 NOT restricted:", g(!isKiroRestrictedModel("claude-opus-4.8")));
console.log("tester allowed:", g(isKiroBetaUser(TESTER)), "| random denied:", g(!isKiroBetaUser(RANDOM)));
console.log("purchase-gate: pkg[opus-4.8] restricted:", g(packageGrantsRestrictedModel(["opus-4.8"])), "| pkg[claude-opus-4.8] public:", g(!packageGrantsRestrictedModel(["claude-opus-4.8"])));

const pub = await resolveProviderChainForModel("claude-opus-4.8");
console.log("claude-opus-4.8 route:", pub?.primary?.profileId, g(pub?.primary?.profileId !== "kiro"));
process.exit(0);
