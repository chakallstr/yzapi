/**
 * R-3 CF over-serve cap — pure decision helper + the cf_served snapshot refresher.
 *
 * Caps the 10-minute stale-mirror safety valve so a CF entitlement cannot serve
 * UNBOUNDEDLY beyond its paid quota, while preserving the deadlock protection for
 * legitimately-stale mirrors (within grace) and never blocking a customer who has
 * real CF units (cf_remaining > 0).
 *
 * INERT: capMult comes from system_api_config.cf_overserve_cap_multiplier (default 0
 * = disabled → gate behaves exactly as today). Activated separately by setting it > 0.
 *
 * cf_served is a SNAPSHOT derived from usage_records (refreshCfServed, run by a 15-min
 * job), NOT a hot-path counter — so it biases stale-LOW (lenient) and a reserve leak
 * can never inflate it toward a false-lockout.
 */
import { dbSql } from "../db/client.js";

export interface OverServeCapInput {
  capMult: number;                          // system_api_config.cf_overserve_cap_multiplier (0 = disabled)
  cfRemaining: number | null | undefined;   // mirror; >0 = real paid units → never cap
  cfRemainingAt: number | string | Date | null | undefined;
  cfServed: number;                         // snapshot of successful package serves since activated_at
  dailyLimit: number;                       // daily_limit_snapshot (= paid CF unit quota for the entitlement)
  nowMs: number;
  staleMs?: number;
}

/**
 * PURE: should this already-reserved package slot be capped (released + 402)?
 * Cap iff: enabled AND mirror-exhausted AND served beyond quota*grace AND no real units.
 */
export function shouldCapOverServe(p: OverServeCapInput): boolean {
  if (!(p.capMult > 0)) return false;                 // disabled / inert
  if (!(p.dailyLimit > 0)) return false;              // defensive
  // Cap on REAL over-consumption (cf_served = success-count snapshot) beyond quota*grace, REGARDLESS of
  // the cf_remaining mirror. A CF-SERVED package can never exceed its quota (cf_served <= cf_units_ordered
  // <= daily_limit_snapshot), so this only fires for SEAT-served packages (gpt-5.x → Codex seats) whose
  // cf_remaining never decrements and therefore stayed > 0 forever — the old `cf_remaining > 0 → never cap`
  // exemption left them serving UNBOUNDEDLY (yokum: 936 served on a 500 cap). cf_served is a stale-LOW
  // 15-min snapshot → conservative: a within-quota customer is never false-locked (a legit CF customer is
  // always within quota*grace here, so the stale-mirror deadlock-protection still holds).
  return p.cfServed > p.dailyLimit * p.capMult;
}

/**
 * Rebuild cf_served for active CF entitlements from usage_records (success, package-billed,
 * since activated_at). Idempotent SELECT-derived UPDATE; touches only cf_served. Never throws.
 * Returns number of rows updated.
 */
export async function refreshCfServed(): Promise<number> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements e
    SET cf_served = (
          SELECT count(*)::int FROM usage_records ur
          WHERE ur.entitlement_id = e.id
            AND ur.status = 'success'
            AND ur.billed_via = 'package'
            AND ur.timestamp >= e.activated_at
        ),
        updated_at = now()
    WHERE e.cf_units_ordered > 0 AND e.status = 'active'
    RETURNING e.id
  `;
  return rows.length;
}
