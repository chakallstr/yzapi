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
import { cfCreateOrder, cfGetOrder, extractCustomerKey, CodefastError } from "./codefast-reseller-service.js";

export interface CfPkgMeta {
  cfCatalogId: string;
  cfApiSlug: string;
  cfManual: boolean;
  gunlukIstekLimiti: number;
  sureGun: number;
  cfTokenMillions?: number | null;
  /** DOLU → order template_id ile yapılır (CF panel şablonu); NULL/boş → items[catalog_id] akışı. */
  cfTemplateId?: string | null;
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
  // HİBRİT: cf_template_id doluysa CF panel şablonuyla (template_id), yoksa items[catalog_id] ile order.
  const useTemplate = typeof pkg.cfTemplateId === "string" && pkg.cfTemplateId.length > 0;
  const item = pkg.cfTokenMillions
    ? { catalog_id: pkg.cfCatalogId, claude_token_millions: pkg.cfTokenMillions }
    : { catalog_id: pkg.cfCatalogId, limit_amount: pkg.gunlukIstekLimiti, duration_days: pkg.sureGun };
  const orderReq = {
    external_customer_id: userId,
    external_order_id: externalOrderId,
    customer: { email: args.email, username: args.username },
    create_customer_api_key: true,
    ...(useTemplate ? { template_id: pkg.cfTemplateId as string } : { items: [item] }),
  };

  try {
    const order = await cfCreateOrder(orderReq, externalOrderId);
    let key = extractCustomerKey(order);
    const isManualProduct = order.manual_review_required || pkg.cfManual;
    // AUTO ürün ama key yok (idempotent replay anomalisi — replay customer_api_key DÖNDÜRMEZ):
    // order'dan kurtarmayı dene; kurtarılamazsa 'failed' (çağıran iade eder) — pending_manual'da
    // SONSUZA dek takılı bırakma (müşteri öder, 409 alır, kurtuluş yok).
    if (!key && !isManualProduct) {
      try {
        const fresh = await cfGetOrder(order.order.id);
        key = extractCustomerKey(fresh);
      } catch { /* yut — aşağıda failed'e düşer */ }
      if (!key) {
        await dbSql`
          UPDATE user_package_entitlements
          SET cf_customer_id = ${userId}, cf_order_id = ${order.order.id}, cf_api_slug = ${pkg.cfApiSlug},
              cf_status = 'failed', updated_at = now()
          WHERE id = ${entitlementId}::uuid
        `.catch(() => {});
        console.error("[codefast] auto product returned no customer key (irrecoverable)", entitlementId, order.order.id);
        return { cfStatus: "failed", cfOrderId: order.order.id };
      }
    }
    const manual = isManualProduct || !key; // manuel ürün: key yok → pending_manual (beklenen)
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
  // Format: cf_rc_live_ + key gövdesi (yalnız güvenli karakterler), makul uzunluk sınırı.
  if (!/^cf_rc_live_[A-Za-z0-9_-]{8,160}$/.test(key)) {
    throw new CodefastError(400, "Geçersiz customer key (cf_rc_live_ formatında olmalı)");
  }
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements
    SET cf_rc_key_cipher = ${encryptApiKey(key)}, cf_status = 'provisioned', updated_at = now()
    WHERE id = ${entitlementId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}
