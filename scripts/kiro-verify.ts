// Structural live verify (run on VPS). Proves the beta gate + routing without a
// customer key. Exits explicitly (services hold a DB pool open).
import { resolveProviderChainForModel } from "../src/server/services/provider-config-service.js";
import { getActiveCatalogModels } from "../src/server/services/added-model-service.js";
import { isKiroRestrictedModel, isKiroBetaUser } from "../src/server/services/kiro-beta-service.js";

const TESTER = "d76e275b-b6fb-4c75-8416-b5e6eb72fa4b"; // canakboyraz
const RANDOM = "00000000-0000-0000-0000-000000000000";

try {
  const chain = await resolveProviderChainForModel("beta-opus-4.8");
  console.log("route beta-opus-4.8 -> profile:", chain?.primary?.profileId, "| wireModel:", chain?.primary?.modelId ?? "(unmapped)");

  const cat = await getActiveCatalogModels();
  const inCat = cat.some((m) => m.id === "beta-opus-4.8");
  console.log("in active catalog:", inCat);

  console.log("gate isKiroRestrictedModel(beta-opus-4.8):", isKiroRestrictedModel("beta-opus-4.8"));
  console.log("gate isKiroRestrictedModel(claude-opus-4.8):", isKiroRestrictedModel("claude-opus-4.8"));
  console.log("env KIRO_BETA_USER_IDS set:", (process.env.KIRO_BETA_USER_IDS ?? "").length > 0);
  console.log("isKiroBetaUser(tester):", isKiroBetaUser(TESTER));
  console.log("isKiroBetaUser(random):", isKiroBetaUser(RANDOM));

  // claude-opus-4.8 must NOT route to kiro (public traffic unaffected)
  const pub = await resolveProviderChainForModel("claude-opus-4.8");
  console.log("route claude-opus-4.8 -> profile:", pub?.primary?.profileId, "(must NOT be kiro)");
} catch (e) {
  console.error("VERIFY ERROR:", (e as Error).message);
}
process.exit(0);
