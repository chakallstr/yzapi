/**
 * CodeFast provisioning — turns a freshly-granted entitlement into a live
 * CodeFast customer order and stores the per-customer key on the entitlement.
 *
 * Called AFTER the yzapi balance transaction commits (never inside the money
 * `dbSql.begin` — this makes a network side-effect). Never throws to the caller:
 * on failure it marks the entitlement `cf_status='failed'` so a retry job can
 * pick it up (the CodeFast `Idempotency-Key` makes a retry safe — no double charge).
 *
 * Auto products → order returns `cf_rc_live_…` immediately → status 'provisioned'.
 * Claude Max (manual_review) → no key yet → status 'pending_manual' (admin delivers later).
 */
import { dbSql } from "../db/client.js";
import { encryptApiKey } from "./api-key-service.js";
import { cfCreateOrder, extractCustomerKey, CodefastError } from "./codefast-reseller-service.js";

export interface CfPkgMeta {
  cfCatalogId: string;
  cfApiSlug: string;
  cfManual: boolean;
  gunlukIstekLimiti: number;
  sureGun: number;
  cfTokenMillions?: number | null;
}

export interface ProvisionResult {
  cfStatus: "provisioned" | "pending_manual" | "failed";
  cfOrderId?: string;
}

export async function provisionCodefastEntitlement(args: {
  entitlementId: string;
  userId: string;
  externalOrderId: string;
  pkg: CfPkgMeta;
  email?: string;
  username?: string;
}): Promise<ProvisionResult> {
  const { entitlementId, userId, externalOrderId, pkg } = args;
  const item = pkg.cfTokenMillions
    ? { catalog_id: pkg.cfCatalogId, claude_token_millions: pkg.cfTokenMillions }
    : { catalog_id: pkg.cfCatalogId, limit_amount: pkg.gunlukIstekLimiti, duration_days: pkg.sureGun };

  try {
    const order = await cfCreateOrder(
      {
        external_customer_id: userId,
        external_order_id: externalOrderId,
        customer: { email: args.email, username: args.username },
        create_customer_api_key: true,
        items: [item],
      },
      externalOrderId,
    );
    const key = extractCustomerKey(order);
    const manual = order.manual_review_required || pkg.cfManual || !key;
    const status: ProvisionResult["cfStatus"] = manual ? "pending_manual" : "provisioned";
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_customer_id = ${userId},
          cf_order_id = ${order.order.id},
          cf_api_slug = ${pkg.cfApiSlug},
          cf_rc_key_cipher = ${key ? encryptApiKey(key) : null},
          cf_status = ${status},
          updated_at = now()
      WHERE id = ${entitlementId}::uuid
    `;
    return { cfStatus: status, cfOrderId: order.order.id };
  } catch (e) {
    const msg = e instanceof CodefastError ? e.message : String(e);
    await dbSql`
      UPDATE user_package_entitlements SET cf_status = 'failed', updated_at = now()
      WHERE id = ${entitlementId}::uuid
    `.catch(() => {});
    console.error("[codefast] provisioning failed", entitlementId, msg);
    return { cfStatus: "failed" };
  }
}

/**
 * Admin manual delivery: after CodeFast admin delivers a Claude Max key,
 * attach the cf_rc_live_ key to the pending entitlement and mark provisioned.
 */
export async function attachManualCustomerKey(entitlementId: string, customerApiKey: string): Promise<boolean> {
  const key = customerApiKey.trim();
  if (!key.startsWith("cf_rc_live_")) {
    throw new CodefastError(400, "Geçersiz customer key (cf_rc_live_ ile başlamalı)");
  }
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements
    SET cf_rc_key_cipher = ${encryptApiKey(key)}, cf_status = 'provisioned', updated_at = now()
    WHERE id = ${entitlementId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}
