/**
 * CodeFast reseller API client.
 *
 * We are an approved CodeFast reseller (flat 10% discount → cost = list × 0.90).
 * This client talks to the reseller management API with the SECRET reseller key
 * (cf_res_live_…) to read the catalog, quote/create/revoke orders, and register
 * customers. The per-customer key returned by an order (cf_rc_live_…) is what
 * actually proxies traffic — it is stored encrypted on the entitlement and used
 * by the proxy layer, never here.
 *
 * Base + key come from env (CODEFAST_RESELLER_BASE_URL / CODEFAST_RESELLER_API_KEY).
 * All calls throw CodefastError on non-2xx / success:false; callers decide policy.
 */
import { env } from "../lib/env.js";

const BASE = () => env.CODEFAST_RESELLER_BASE_URL.replace(/\/+$/, "");
const KEY = () => env.CODEFAST_RESELLER_API_KEY ?? "";

export class CodefastError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CodefastError";
  }
}

async function cf<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  if (!KEY()) throw new CodefastError(503, "CodeFast reseller key not configured");
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new CodefastError(res.status, `CodeFast ${method} ${path} → ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = (await res.json()) as { success?: boolean; data?: T };
  if (j.success === false) throw new CodefastError(502, `CodeFast ${path} returned success:false`);
  return (j.data ?? (j as unknown)) as T;
}

export interface CfCatalogItem {
  id: string;
  slug: string;
  name: string;
  currency: string;
  base_price_amount: number;
  base_duration_days: number;
  base_limit_amount: number | null;
  limit_period: string;
  requires_manual_review: boolean;
  is_resellable: boolean;
  metadata?: Record<string, unknown>;
}

export interface CfQuoteItemReq {
  catalog_id: string;
  limit_amount?: number;
  duration_days?: number;
  claude_token_millions?: number;
}

export interface CfQuoteResult {
  currency: string;
  reseller_cost_amount: number;
  original_amount: number;
  discount_percent: number;
  manual_review_required: boolean;
  items: Array<Record<string, unknown> & { reseller_cost_amount: number; fulfillment_status: string }>;
}

export interface CfOrderReq {
  external_customer_id: string;
  external_order_id: string;
  customer?: { email?: string; username?: string };
  create_customer_api_key?: boolean;
  items: CfQuoteItemReq[];
}

/**
 * Real reseller /v1/orders response shape (verified live 2026-06-13).
 * `data` = { order, customer, quote, ledger_id, idempotent, entitlement_ids,
 *            manual_review_required, customer_api_key }.
 * ⚠️ `customer_api_key` is an OBJECT ({api_key, record}) and is returned ONLY on
 * first creation — an idempotent replay omits it (capture the key on first success).
 */
export interface CfOrderResult {
  order: {
    id: string;
    status: string; // "fulfilled" | "manual_review" | …
    external_order_id?: string;
    reseller_cost_amount?: number;
  };
  customer?: { id: string; external_customer_id?: string };
  entitlement_ids?: string[];
  manual_review_required: boolean;
  idempotent?: boolean;
  /** Present only on first order creation (object form). `.api_key` = cf_rc_live_… */
  customer_api_key?: { api_key: string; record?: { id: string; key_prefix?: string } };
}

/** Extract the cf_rc_live_ string from an order result (null if absent / idempotent replay). */
export function extractCustomerKey(o: CfOrderResult): string | null {
  return o.customer_api_key?.api_key ?? null;
}

export const cfCatalog = () => cf<CfCatalogItem[]>("GET", "/v1/catalog");
export const cfQuote = (items: CfQuoteItemReq[]) => cf<CfQuoteResult>("POST", "/v1/orders/quote", { items });
export const cfCreateCustomer = (b: { external_customer_id: string; email?: string; username?: string }) =>
  cf<{ id: string; external_customer_id: string }>("POST", "/v1/customers", b);
export const cfCreateOrder = (b: CfOrderReq, idempotencyKey: string) =>
  cf<CfOrderResult>("POST", "/v1/orders", { create_customer_api_key: true, ...b }, idempotencyKey);
export const cfGetOrder = (id: string) => cf<CfOrderResult>("GET", `/v1/orders/${encodeURIComponent(id)}`);
export const cfRevokeOrder = (id: string) =>
  cf<{ id: string; status: string }>("POST", `/v1/orders/${encodeURIComponent(id)}/revoke`);
export const cfUsage = (extId: string) => cf<unknown>("GET", `/v1/customers/${encodeURIComponent(extId)}/usage`);
