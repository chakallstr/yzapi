import { checkPackageCoverage } from "../src/server/services/entitlement-service.js";
const U = "d76e275b-b6fb-4c75-8416-b5e6eb72fa4b";
const should = ["claude-opus-4.8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "gpt-5.6-sol"];
const shouldNot = ["claude-fable-5", "gemini-3.1-pro-preview", "gpt-5.4"];
let ok = true;
for (const m of should) { const c = await checkPackageCoverage(U, m); if (!c) ok = false; console.log((c ? "✓" : "✗ FAIL"), "covered:", m); }
for (const m of shouldNot) { const c = await checkPackageCoverage(U, m); if (c) ok = false; console.log((!c ? "✓" : "✗ FAIL"), "NOT covered (correct):", m); }
console.log(ok ? "\n✅ all 7 Kiro models covered, fable + non-Kiro excluded" : "\n⚠️ mismatch");
process.exit(0);
