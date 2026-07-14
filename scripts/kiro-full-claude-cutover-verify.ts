// Read-only check for the kiro-full-claude-cutover.ts migration. Run BEFORE to
// confirm the current (pre-cutover) routing, and AFTER to confirm every public
// Claude id now resolves to kiro (except claude-fable-5, which stays on
// cf-claude — no Kiro equivalent). Mutates nothing.
//   cd /opt/turkapiprojesi && NODE_ENV=production npx tsx scripts/kiro-full-claude-cutover-verify.ts
import { resolveProviderChainForModel } from "../src/server/services/provider-config-service.js";

const EXPECT_KIRO = [
  "claude-opus-4.8",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
  "opus-4.8", // private beta id — unchanged
];
const EXPECT_CF_CLAUDE = ["claude-fable-5"];

const g = (b: boolean) => (b ? "✓" : "✗ FAIL");

for (const id of EXPECT_KIRO) {
  const chain = await resolveProviderChainForModel(id);
  console.log(
    `${id.padEnd(24)} primary=${String(chain.primary.profileId).padEnd(12)} fallback=${String(chain.fallback?.profileId ?? "(none)").padEnd(10)} ${g(chain.primary.profileId === "kiro")}`,
  );
}
for (const id of EXPECT_CF_CLAUDE) {
  const chain = await resolveProviderChainForModel(id);
  console.log(`${id.padEnd(24)} primary=${String(chain.primary.profileId).padEnd(12)} ${g(chain.primary.profileId === "cf-claude")}`);
}
process.exit(0);
