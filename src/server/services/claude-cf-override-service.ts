/**
 * Per-customer Claude → CodeFast reseller override (PAYG-preserving).
 *
 * Routes a flagged user's Claude requests to CF's claude-api reseller endpoint
 * (stable) instead of the seat path, WITHOUT switching to units/package billing.
 * Selection is driven by users.claude_cf_entitlement_id → a paused=true
 * claude-api entitlement that holds the per-customer cf_rc_live_ key.
 *
 * INERT by construction: with no pointer set (claude_cf_entitlement_id NULL for
 * everyone, the migration default) getClaudeCfOverrideSlot() returns null for
 * every user → the proxy never builds the override chain → behavior is byte-identical
 * to today for every user and model.
 */
import { dbSql } from "../db/client.js";
import { entitlementOverrideChain, CF_SLUG_MODEL_MAPS } from "./package-provider-override.js";
import type { ProviderChain, ProviderContext } from "./provider-config-service.js";

/**
 * The set of model ids that the CF claude-api reseller serves — read at runtime from the
 * SAME map (`CF_SLUG_MODEL_MAPS["claude-api"]`) that entitlementOverrideChain uses for the
 * wire translation, so the match set can never drift from the routing map.
 */
const CLAUDE_API_MODELS = new Set(Object.keys(CF_SLUG_MODEL_MAPS["claude-api"] ?? {}));

/** True iff `modelId` is a Claude model the CF claude-api reseller endpoint can serve. */
export function isClaudeOverrideModel(modelId: string): boolean {
  return CLAUDE_API_MODELS.has((modelId ?? "").trim());
}

export interface ClaudeCfSlot {
  entitlementId: string;
  cfApiSlug: string;
  cfRcKeyCipher: string;
}

/**
 * Returns the override slot iff the user has the pointer set AND the pointed-at entitlement
 * is a provisioned, active claude-api entitlement holding a cf_rc key. Otherwise null
 * (→ caller keeps the normal seat chain; pointer NULL = no override for anyone).
 */
export async function getClaudeCfOverrideSlot(userId: string): Promise<ClaudeCfSlot | null> {
  const rows = await dbSql<{ entitlement_id: string; cf_api_slug: string; cf_rc_key_cipher: string }[]>`
    SELECT e.id AS entitlement_id, e.cf_api_slug, e.cf_rc_key_cipher
    FROM users u
    JOIN user_package_entitlements e ON e.id = u.claude_cf_entitlement_id
    WHERE u.id = ${userId}::uuid
      AND u.claude_cf_entitlement_id IS NOT NULL
      AND e.status = 'active'
      AND e.cf_status = 'provisioned'
      AND e.cf_rc_key_cipher IS NOT NULL
      AND e.cf_api_slug = 'claude-api'
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  return { entitlementId: r.entitlement_id, cfApiSlug: r.cf_api_slug, cfRcKeyCipher: r.cf_rc_key_cipher };
}

/**
 * Builds the override chain: CF reseller claude-api as PRIMARY, the normal seat chain as
 * FALLBACK (so CF-down ⇒ automatic seat fallback, customer never worse off than today).
 * Returns null if the CF chain can't be built (missing/undecryptable key) → caller keeps
 * the normal chain (request is never broken).
 */
export function buildClaudeCfChain(
  slot: ClaudeCfSlot,
  resellerBase: string,
  normalPrimary: ProviderContext,
): ProviderChain | null {
  const cf = entitlementOverrideChain(
    { entitlementId: slot.entitlementId, cfApiSlug: slot.cfApiSlug, cfRcKeyCipher: slot.cfRcKeyCipher },
    resellerBase,
  );
  if (!cf) return null;
  return { primary: cf.primary, fallback: normalPrimary };
}

/**
 * Mirrors CF's reported remaining (x-codefast-remaining) onto the OVERRIDE entitlement ONLY,
 * keyed by entitlement id. Deliberately NOT the customer-keyed updateCfRemaining(userId,…),
 * which touches EVERY active CF entitlement of the user (cf_customer_id match) and would
 * clobber a sibling CF *package* mirror with this Claude token-buffer's value — bypassing the
 * over-serve LEAST guard on that package (a real money risk if the user ever also holds a CF
 * package). This row is paused=true → it never gates billing; the mirror only feeds the
 * override's own top-up decision + panel display. Best-effort: never throws (a mirror write
 * must not fail a successful TL settle); a stale mirror is bounded by the lifetime cap + seat
 * fallback. cf_remaining is NUMERIC — store the decimal verbatim.
 */
export async function setClaudeOverrideRemaining(entitlementId: string, remaining: number): Promise<void> {
  if (!Number.isFinite(remaining)) return;
  try {
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_remaining = ${remaining}, cf_remaining_at = now()
      WHERE id = ${entitlementId}::uuid
    `;
  } catch {
    /* best-effort mirror — never break a successful settle */
  }
}
