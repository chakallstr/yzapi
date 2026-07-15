import { canonicalizeModelId } from "../src/master-models.js";
import { resolveProviderChainForModel } from "../src/server/services/provider-config-service.js";
import { resolveActiveCatalogModel } from "../src/server/services/added-model-service.js";

for (const id of ["opus-4.8", "Opus-4.8", "opus4.8", "beta-opus-4.8", "claude-opus-4.8"]) {
  let canon = "?";
  try { canon = String(canonicalizeModelId(id)); } catch (e) { canon = "canonERR"; }
  let route = "-", cat = "-";
  try { route = (await resolveProviderChainForModel(canon))?.primary?.profileId ?? "(none)"; } catch (e) { route = "routeERR"; }
  try { const m = await resolveActiveCatalogModel(id); cat = m ? String(m.id) : "(not-in-catalog)"; } catch (e) { cat = "catERR:" + (e as Error).message.slice(0, 30); }
  console.log(`${id.padEnd(18)} canon=${canon.padEnd(20)} catalogId=${cat.padEnd(22)} route=${route}`);
}
process.exit(0);
