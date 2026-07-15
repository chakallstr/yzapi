// scripts/unlock-cf-entitlement.ts
//
// One-off MANUAL unlock for a CF lazy-provisioning DEADLOCK: when CF reports a
// fractional remaining (<1), updateCfRemaining writes Math.trunc→0 AND fresh-stamps
// cf_remaining_at=now(), so the gate rejects (cf_remaining=0, not stale) AND the
// 10-min self-heal never fires (timestamp kept fresh by the ~3-min mirror) → top-up
// never triggers → permanent lock, even though the package still has unordered quota
// (cf_units_ordered < daily_limit). Panel "remaining" is correct; the GATE is wrong.
//
// This calls the app's OWN idempotent topUpCfIfNeeded (CF order + cf_remaining bump) —
// NO raw ledger/SQL write. The CF units come from our CF balance, already covered by
// the customer's purchase; topUpCfIfNeeded's idempotency key + UPDATE guard make it
// safe to run more than once (only the first application takes effect).
//
// Usage:
//   ENV_FILE_PATH=.env.production npx tsx scripts/unlock-cf-entitlement.ts <entitlementId> [--dry-run]
//
// --dry-run prints the entitlement state + what WOULD happen, ordering/writing NOTHING.

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

const [, , entId, ...flags] = process.argv;
const dryRun = flags.includes("--dry-run");
if (!entId) {
  console.error("usage: unlock-cf-entitlement.ts <entitlementId> [--dry-run]");
  process.exit(1);
}

const { dbSql } = await import("../src/server/db/client.js");
const { topUpCfIfNeeded, CF_TOPUP_BATCH_UNITS, CF_TOPUP_THRESHOLD_UNITS } = await import(
  "../src/server/services/codefast-provisioning-service.js"
);

async function snapshot() {
  const rows = await dbSql<any[]>`
    SELECT e.id, u.email, p.cf_catalog_id, (e.cf_customer_id IS NOT NULL) AS has_cust,
           e.cf_status, e.cf_units_ordered AS ordered, e.cf_remaining AS remaining,
           e.daily_limit_snapshot AS cap, e.expires_at, e.status,
           round(EXTRACT(EPOCH FROM (now() - e.cf_remaining_at))::numeric, 0) AS age_sec
    FROM user_package_entitlements e
    JOIN users u ON u.id = e.user_id
    JOIN packages p ON p.id = e.package_id
    WHERE e.id = ${entId}::uuid
    LIMIT 1`;
  return rows[0];
}

const before = await snapshot();
if (!before) {
  console.error("entitlement not found:", entId);
  process.exit(2);
}
console.log("BEFORE:", JSON.stringify(before, null, 2));

// Replicate topUpCfIfNeeded's preconditions so a dry-run explains exactly what it will do.
const ordered = Number(before.ordered) || 0;
const cap = Number(before.cap) || 0;
const remaining = before.remaining == null ? 0 : Number(before.remaining);
const reasons: string[] = [];
if (before.cf_status !== "provisioned") reasons.push(`cf_status=${before.cf_status} (provisioned değil)`);
if (ordered <= 0) reasons.push("cf_units_ordered<=0 (lazy değil)");
if (ordered >= cap) reasons.push(`ordered(${ordered}) >= cap(${cap}) (tüm CF kotası alınmış, telafi yok)`);
if (remaining >= CF_TOPUP_THRESHOLD_UNITS) reasons.push(`remaining(${remaining}) >= threshold(${CF_TOPUP_THRESHOLD_UNITS}) (buffer zaten yeterli)`);
if (!before.has_cust || !before.cf_catalog_id) reasons.push("cf_customer_id / cf_catalog_id eksik");
const msLeft = new Date(before.expires_at).getTime() - Date.now();
if (!Number.isFinite(msLeft) || msLeft <= 0) reasons.push("entitlement süresi geçmiş/bozuk");

if (reasons.length) {
  console.log("\nSKIP — topUpCfIfNeeded koşulları sağlanmıyor:\n  - " + reasons.join("\n  - "));
  process.exit(0);
}

const batch = Math.min(CF_TOPUP_BATCH_UNITS, cap - ordered);
console.log(
  `\nWOULD top-up: +${batch} ünite → cf_units_ordered ${ordered}→${ordered + batch}, ` +
    `cf_remaining ${remaining}→~${Math.min(remaining + batch, cap)} (gate açılır: cf_remaining>0)`,
);

if (dryRun) {
  console.log("\n[DRY-RUN] hiçbir sipariş/yazma yapılmadı.");
  process.exit(0);
}

console.log("\ntopUpCfIfNeeded() çağrılıyor...");
await topUpCfIfNeeded(entId);

const after = await snapshot();
console.log("AFTER:", JSON.stringify(after, null, 2));
const ok = Number(after.ordered) > ordered && Number(after.remaining) > 0;
console.log(
  ok
    ? "\n✅ UNLOCK OK — cf_units_ordered arttı + cf_remaining>0 → kapı artık geçirir."
    : "\n⚠️ Beklenen değişim yok — topUpCfIfNeeded hatayı YUTAR (try/catch). Sunucu loglarına bak.",
);
process.exit(ok ? 0 : 3);
