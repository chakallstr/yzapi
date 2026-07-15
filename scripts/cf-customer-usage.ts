// scripts/cf-customer-usage.ts — READ-ONLY CF ground-truth probe.
// Prints our local mirror vs CF's actual /usage for an entitlement's CF customer.
// Usage: ENV_FILE_PATH=.env.production npx tsx scripts/cf-customer-usage.ts <entitlementId>
import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

const [, , entId] = process.argv;
if (!entId) { console.error("usage: cf-customer-usage.ts <entitlementId>"); process.exit(1); }

const { dbSql } = await import("../src/server/db/client.js");
const { cfUsage } = await import("../src/server/services/codefast-reseller-service.js");

const rows = await dbSql<any[]>`
  SELECT e.cf_customer_id, e.cf_units_ordered, e.cf_remaining, e.daily_limit_snapshot,
         e.cf_status, e.expires_at, p.cf_catalog_id
  FROM user_package_entitlements e JOIN packages p ON p.id = e.package_id
  WHERE e.id = ${entId}::uuid LIMIT 1`;
const e = rows[0];
if (!e) { console.error("entitlement not found"); process.exit(2); }
console.log("LOCAL MIRROR:", JSON.stringify(e, null, 2));
if (!e.cf_customer_id) { console.error("no cf_customer_id"); process.exit(2); }

try {
  const usage = await cfUsage(e.cf_customer_id);
  console.log("\nCF /usage (GROUND TRUTH):", JSON.stringify(usage, null, 2));
} catch (err) {
  console.error("\ncfUsage FAILED:", (err as Error).message);
}
process.exit(0);
