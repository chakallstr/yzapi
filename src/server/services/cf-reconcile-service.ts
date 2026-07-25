/**
 * CF reconcile (R-2) — daily read-only reconciliation of our cf_remaining mirror
 * against the authoritative CF usage ledger (cf_usage_ledger, populated by R-1).
 *
 * For each CF customer it compares CF's real current balance (latest ledger event
 * `remaining`) against the sum of our active entitlements' `cf_remaining` mirror,
 * and surfaces three actionable signals:
 *   - mirror_stale   : active CF entitlements whose cf_remaining is NULL or >6h old
 *                      (we are flying blind on that customer's gate)
 *   - mirror_drift   : |CF ledger remaining − our mirror sum| beyond threshold
 *                      (panel/gate under/over-reports vs CF reality)
 *   - low_cf_balance : CF's real remaining near exhaustion (early 402 warning)
 *
 * INERT & SAFE: SELECT-only (no writes to any table), alerts via notifyAdmin
 * (never-throws, no-op when unconfigured), never throws to the caller.
 */
import { dbSql } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { notifyAdmin } from "./admin-notify-service.js";

export interface CfReconcileRow {
  email: string;
  externalCustomerId: string;
  cfLedgerRemaining: number | null;  // latest ledger event remaining (CF truth)
  cfLedgerEvents: number;            // # events mirrored so far
  cfLatestAt: string | null;
  ourMirrorRemaining: number;        // Σ active entitlements cf_remaining (NULL→0)
  mirrorStaleEnts: number;           // active ents with cf_remaining NULL or cf_remaining_at >6h
  activeEnts: number;
  ourSuccess: number;                // package-success requests
}

export interface CfReconcileFinding extends CfReconcileRow {
  drift: number | null;              // cfLedgerRemaining − ourMirrorRemaining
  flags: string[];
}

export const RECON_DRIFT_THRESHOLD = 100; // units
export const RECON_LOW_BALANCE = 50;      // units

/** PURE: classify each customer row into flags. Never throws. */
export function buildReconcileFindings(rows: CfReconcileRow[]): {
  findings: CfReconcileFinding[];
  flagged: CfReconcileFinding[];
} {
  const findings = rows.map((r) => {
    const drift = r.cfLedgerRemaining == null ? null : r.cfLedgerRemaining - r.ourMirrorRemaining;
    const flags: string[] = [];
    if (r.mirrorStaleEnts > 0) flags.push("mirror_stale");
    if (drift != null && Math.abs(drift) > RECON_DRIFT_THRESHOLD) flags.push("mirror_drift");
    if (r.cfLedgerRemaining != null && r.cfLedgerRemaining < RECON_LOW_BALANCE) flags.push("low_cf_balance");
    return { ...r, drift, flags };
  });
  return { findings, flagged: findings.filter((f) => f.flags.length > 0) };
}

/** SELECT-only read of the per-CF-customer reconcile inputs. */
export async function loadReconcileRows(): Promise<CfReconcileRow[]> {
  const rows = await dbSql<any[]>`
    WITH cf_users AS (
      SELECT DISTINCT cf_customer_id AS uid FROM user_package_entitlements WHERE cf_customer_id IS NOT NULL
    ),
    ledger_latest AS (
      SELECT DISTINCT ON (external_customer_id)
             external_customer_id::text AS uid, remaining AS latest_remaining, cf_created_at AS latest_at
      FROM cf_usage_ledger ORDER BY external_customer_id, cf_created_at DESC NULLS LAST
    ),
    ledger_cnt AS (
      SELECT external_customer_id::text AS uid, count(*)::int AS events FROM cf_usage_ledger GROUP BY external_customer_id
    ),
    ents AS (
      SELECT cf_customer_id AS uid,
             count(*) FILTER (WHERE status='active')::int AS active_ents,
             COALESCE(sum(cf_remaining) FILTER (WHERE status='active'), 0)::numeric AS mirror_remaining,
             count(*) FILTER (WHERE status='active' AND cf_units_ordered > 0
               AND (cf_remaining IS NULL OR cf_remaining_at < now() - interval '6 hours'))::int AS stale_ents
      FROM user_package_entitlements WHERE cf_customer_id IS NOT NULL GROUP BY cf_customer_id
    ),
    succ AS (
      SELECT user_id::text AS uid, count(*) FILTER (WHERE status='success' AND billed_via='package')::int AS success
      FROM usage_records WHERE user_id IN (SELECT uid::uuid FROM cf_users) GROUP BY user_id
    )
    SELECT u.uid,
           (SELECT email FROM users WHERE id = u.uid::uuid) AS email,
           ll.latest_remaining, COALESCE(lc.events, 0) AS events,
           to_char(ll.latest_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS latest_at,
           COALESCE(e.mirror_remaining, 0) AS mirror_remaining,
           COALESCE(e.stale_ents, 0) AS stale_ents, COALESCE(e.active_ents, 0) AS active_ents,
           COALESCE(s.success, 0) AS success
    FROM cf_users u
    LEFT JOIN ledger_latest ll ON ll.uid = u.uid
    LEFT JOIN ledger_cnt   lc ON lc.uid = u.uid
    LEFT JOIN ents          e ON e.uid  = u.uid
    LEFT JOIN succ          s ON s.uid  = u.uid
  `;
  return rows.map((r) => ({
    email: r.email ?? "(unknown)",
    externalCustomerId: r.uid,
    cfLedgerRemaining: r.latest_remaining == null ? null : Number(r.latest_remaining),
    cfLedgerEvents: Number(r.events) || 0,
    cfLatestAt: r.latest_at ?? null,
    ourMirrorRemaining: Number(r.mirror_remaining) || 0,
    mirrorStaleEnts: Number(r.stale_ents) || 0,
    activeEnts: Number(r.active_ents) || 0,
    ourSuccess: Number(r.success) || 0,
  }));
}

function digest(flagged: CfReconcileFinding[]): string {
  return flagged
    .slice(0, 15)
    .map((f) => `• ${f.email}: ${f.flags.join(",")} (CF kalan=${f.cfLedgerRemaining ?? "?"}, ayna=${f.ourMirrorRemaining}, drift=${f.drift ?? "?"}, bayat-ent=${f.mirrorStaleEnts})`)
    .join("\n");
}

/** Daily reconcile: log a summary, and alert admin when any customer is flagged. Never throws. */
export async function runCfReconcile(): Promise<{ customers: number; flagged: number }> {
  try {
    const rows = await loadReconcileRows();
    const { findings, flagged } = buildReconcileFindings(rows);
    logger.info(
      { customers: findings.length, flagged: flagged.length, flags: flagged.map((f) => ({ email: f.email, flags: f.flags, drift: f.drift })) },
      "[cf-reconcile] daily reconcile",
    );
    if (flagged.length > 0) {
      await notifyAdmin({
        kind: "sistem_uyarisi",
        title: `CF mutabakat: ${flagged.length} müşteride sapma`,
        severity: "yellow", // advisory digest (no paging); mirror drift is non-money
        detail: digest(flagged),
      });
    }
    return { customers: findings.length, flagged: flagged.length };
  } catch (e) {
    logger.error({ err: e }, "[cf-reconcile] run failed");
    return { customers: 0, flagged: 0 };
  }
}
