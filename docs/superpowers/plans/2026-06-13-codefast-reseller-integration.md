# CodeFast Reseller Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **DEPLOY GUARD:** This plan ends LOCAL + tested. NO live deploy / git push without Ufuk's explicit double-OK + 3-agent QA (≥2 PASS). See `feedback_deploy_double_approval`, `feedback_qa_gate_deploy`.

**Goal:** Sell CodeFast's AI packages on yapayzekalab.org by buying them at the reseller's 10% discount and reselling, with a per-customer provisioning + proxy passthrough so each yzapi user gets their own CodeFast customer key.

**Architecture:** Each CodeFast product becomes a yzapi `packages` row carrying CodeFast catalog metadata (`cf_catalog_id`, `cf_api_slug`, `cf_manual`). On purchase, yzapi calls the CodeFast reseller API (`/v1/customers` + `/v1/orders`) to provision a per-user customer key (`cf_rc_live_…`), stored encrypted on the `user_package_entitlements` row. At request time, the proxy builds a single-provider chain pointing at `https://reseller-api.codefast.app/proxy/<cf_api_slug>` authenticated with that entitlement's `cf_rc_live_` key — reusing yzapi's existing `packageOverrideChain` pattern, lifted to entitlement granularity. Pricing mirrors CodeFast list 1:1 by default; admin edits `fiyat_tl` per package to add markup.

**Tech Stack:** Express + TypeScript, PostgreSQL (Drizzle + raw `dbSql`), Vitest (unit `*.test.ts` + itest `*.itest.ts`), React/JSX SPA. CodeFast reseller API base `https://reseller-api.codefast.app`.

---

## Background facts (verified live 2026-06-13)

- Reseller account APPROVED. Discount **flat 10%** → reseller cost = list × 0.90 (confirmed by `/v1/orders/quote`).
- Reseller master key (SECRET, backend-only): `cf_res_live_…` — stored in `project_codefast_reseller` memory; will live in `.env.production` as `CODEFAST_RESELLER_API_KEY`. **Rotate before launch** (it was generated during inspection).
- Two key types: `cf_res_live_` (reseller management) vs `cf_rc_live_` (per-customer proxy).
- **10 of 11 products auto-fulfill** (`requires_manual_review:false`) → order returns `cf_rc_live_` instantly. **Only Claude Max is `manual_review`** → CodeFast admin delivers manually; no instant key.
- Endpoints: `GET /v1/catalog`, `POST /v1/customers`, `POST /v1/orders/quote`, `POST /v1/orders` (Idempotency-Key), `GET /v1/orders/:id`, `POST /v1/orders/:id/revoke`, `GET /v1/customers/:external_customer_id/usage`, `ANY /proxy/:api_slug/*`.
- Order item shapes: auto products `{catalog_id, limit_amount, duration_days}`; Claude `{catalog_id, claude_token_millions}`.
- Catalog IDs + slugs (from live catalog): codex `e8c13011-…` slug `codex-api`; composer `12e78870-…` slug `composer-api`; claude `15470f76-…` slug `claude-api`; gemini `d72359d6-…` `gemini-api`; glm `02bd32b5-…` `glm-api`; gpt-image-2 `7494a9ba-…` `gpt-image-2-api`; grok `a2cf1570-…` `grok-api`; grok-imagine `cb9a89c8-…` `grok-imagine-api`; nvidia `fdb8ce1b-…` `nvidia-api`; open-source `604e5207-…` `open-source-api`; kimi-unlimited `720376e2-…` `kimi-k2-6-api`. (`api_slug` = catalog `slug` left of `__`.) Full reference in `~/codefast-catalog.json` and `~/codefast-cozum.md`.

## Key reuse points (already in yzapi — do NOT rebuild)

- `packageOverrideChain(slot)` in `src/server/services/package-provider-override.ts:25` — builds a single-provider `ProviderChain` from `{baseUrl, apiKeyCipher}`, forwards verbatim model id. **CodeFast proxy URL matches exactly:** set `baseUrl = https://reseller-api.codefast.app/proxy/<slug>` and the proxy's `${baseUrl}/v1/messages` resolves to CodeFast's `/proxy/<slug>/v1/messages`, with `Authorization: Bearer cf_rc_live_…`.
- `tryReservePackageSlot(userId, modelId)` in `src/server/services/entitlement-service.ts:58` — already returns `providerBaseUrl`/`providerApiKeyCipher` from the package. We extend it to also return entitlement-level CodeFast key.
- `grantPackageEntitlement(txSql, params)` in `src/server/services/entitlement-service.ts:142` — entitlement creation seam.
- `purchasePackageWithBalance(...)` in `src/server/services/package-purchase-service.ts:78` — purchase seam. **Provisioning must run AFTER the balance transaction commits** (CodeFast call is a network side-effect; never inside the money `dbSql.begin`).
- `encryptApiKey`/`decryptApiKey` in `src/server/services/api-key-service.ts` — AES-256-GCM, reuse for `cf_rc_live_` storage.
- Proxy override swap sites: `proxy.ts` swaps to `packageOverrideChain` after `billedViaPackage` at the 3 text call-sites (chat/completions, messages, responses) per yzapi CLAUDE.md. We add entitlement-override precedence at the SAME sites.

## File Structure

**Create:**
- `src/server/services/codefast-reseller-service.ts` — CodeFast reseller API client (catalog/quote/customer/order/revoke/usage + balance).
- `src/server/services/codefast-provisioning-service.ts` — provisioning orchestration (buy a CF order for an entitlement, store key) + manual-delivery attach.
- `src/server/db/migrations/0033_codefast_reseller.sql` — package CF metadata + entitlement CF key columns.
- `scripts/seed-codefast-packages.ts` — pull live catalog → upsert yzapi packages (1:1 price mirror).
- `src/server/services/codefast-reseller-service.test.ts` — unit (mock fetch).
- `src/server/services/codefast-provisioning-service.test.ts` — unit (mock CF client + mock DB).
- `src/server/__tests__/codefast-provisioning.itest.ts` — integration (real PG, mocked CF HTTP).
- `src/server/__tests__/codefast-contract.test.ts` — contract: secrets non-leak, slug map integrity.

**Modify:**
- `src/server/lib/env.ts` — add `CODEFAST_RESELLER_API_KEY`, `CODEFAST_RESELLER_BASE_URL`, `CODEFAST_RESELLER_ENABLED`.
- `src/server/db/schema.ts` — add columns to `packages` + `userPackageEntitlements`.
- `src/server/db/migrations/meta/_journal.json` — register 0033.
- `src/server/services/entitlement-service.ts` — `tryReservePackageSlot` returns entitlement CF override; new `entitlementOverrideChain` helper usage.
- `src/server/services/package-purchase-service.ts` — call provisioning after commit.
- `src/server/services/package-provider-override.ts` — add `entitlementOverrideChain(slot)` (mirror of `packageOverrideChain`).
- `src/server/routes/proxy.ts` — at 3 text call-sites, prefer entitlement override chain over package override.
- `src/server/routes/admin.ts` — CF balance endpoint, sync trigger, manual-deliver endpoint, margin in package list.
- `src/yapayzekalab/tab-admin.jsx` — CF section in AdminPackages (cost vs sell margin, sync button, CF balance, manual-deliver).

---

## Phase 1 — CodeFast reseller API client

### Task 1: env vars

**Files:**
- Modify: `src/server/lib/env.ts` (Zod schema block ~line 6)

- [ ] **Step 1: Add env fields**

In the Zod `schema` object add:
```ts
CODEFAST_RESELLER_ENABLED: z.coerce.boolean().default(false),
CODEFAST_RESELLER_BASE_URL: z.string().url().default("https://reseller-api.codefast.app"),
CODEFAST_RESELLER_API_KEY: z.string().optional(),
```

- [ ] **Step 2: Document** — add the three keys to `.env.example` with a comment `# CodeFast reseller (upstream). API key = cf_res_live_… (SECRET).`

- [ ] **Step 3: Commit** — `git add src/server/lib/env.ts .env.example && git commit -m "feat(codefast): add reseller env config"`

### Task 2: reseller client

**Files:**
- Create: `src/server/services/codefast-reseller-service.ts`
- Test: `src/server/services/codefast-reseller-service.test.ts`

- [ ] **Step 1: Write failing test**
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("codefast-reseller-service", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cfQuote posts items with bearer auth and parses reseller_cost_amount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: true, data: { reseller_cost_amount: 1035, currency: "TRY",
        items: [{ catalog_id: "c1", reseller_cost_amount: 1035, original_amount: 1150, discount_percent: 10 }] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { cfQuote } = await import("./codefast-reseller-service.js");
    const q = await cfQuote([{ catalog_id: "c1", limit_amount: 500, duration_days: 30 }]);
    expect(q.reseller_cost_amount).toBe(1035);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/orders/quote");
    expect(init.headers.Authorization).toMatch(/^Bearer /);
  });

  it("throws CodefastError on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => "no balance" }));
    const { cfCreateOrder, CodefastError } = await import("./codefast-reseller-service.js");
    await expect(cfCreateOrder({ external_customer_id: "u1", external_order_id: "o1",
      items: [{ catalog_id: "c1", limit_amount: 500, duration_days: 30 }] }, "idem1")).rejects.toBeInstanceOf(CodefastError);
  });
});
```

- [ ] **Step 2: Run test → FAIL** — `npx vitest run src/server/services/codefast-reseller-service.test.ts` (module not found).

- [ ] **Step 3: Implement client**
```ts
import { env } from "../lib/env.js";

const BASE = () => env.CODEFAST_RESELLER_BASE_URL.replace(/\/+$/, "");
const KEY = () => env.CODEFAST_RESELLER_API_KEY ?? "";

export class CodefastError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "CodefastError"; }
}

async function cf<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  if (!KEY()) throw new CodefastError(503, "CodeFast reseller key not configured");
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${BASE()}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!res.ok) { const t = await res.text().catch(() => ""); throw new CodefastError(res.status, `CodeFast ${method} ${path} → ${res.status}: ${t.slice(0, 300)}`); }
  const j = (await res.json()) as { success?: boolean; data?: T };
  if (j.success === false) throw new CodefastError(502, `CodeFast ${path} returned success:false`);
  return (j.data ?? (j as unknown)) as T;
}

export interface CfCatalogItem {
  id: string; slug: string; name: string; currency: string;
  base_price_amount: number; base_duration_days: number; base_limit_amount: number | null;
  limit_period: string; requires_manual_review: boolean; is_resellable: boolean; metadata?: Record<string, unknown>;
}
export interface CfQuoteItemReq { catalog_id: string; limit_amount?: number; duration_days?: number; claude_token_millions?: number; }
export interface CfQuoteResult { currency: string; reseller_cost_amount: number; original_amount: number; discount_percent: number;
  manual_review_required: boolean; items: Array<Record<string, unknown> & { reseller_cost_amount: number; fulfillment_status: string }>; }
export interface CfOrderReq {
  external_customer_id: string; external_order_id: string;
  customer?: { email?: string; username?: string }; create_customer_api_key?: boolean;
  items: CfQuoteItemReq[];
}
export interface CfOrderResult {
  id: string; status: string; reseller_cost_amount: number; manual_review_required: boolean;
  customer_api_key?: string; // cf_rc_live_… (auto products)
  items: Array<Record<string, unknown> & { fulfillment_status: string; customer_api_key?: string }>;
}

export const cfCatalog = () => cf<CfCatalogItem[]>("GET", "/v1/catalog");
export const cfQuote = (items: CfQuoteItemReq[]) => cf<CfQuoteResult>("POST", "/v1/orders/quote", { items });
export const cfCreateCustomer = (b: { external_customer_id: string; email?: string; username?: string }) =>
  cf<{ id: string; external_customer_id: string }>("POST", "/v1/customers", b);
export const cfCreateOrder = (b: CfOrderReq, idempotencyKey: string) =>
  cf<CfOrderResult>("POST", "/v1/orders", { create_customer_api_key: true, ...b }, idempotencyKey);
export const cfGetOrder = (id: string) => cf<CfOrderResult>("GET", `/v1/orders/${encodeURIComponent(id)}`);
export const cfRevokeOrder = (id: string) => cf<{ id: string; status: string }>("POST", `/v1/orders/${encodeURIComponent(id)}/revoke`);
export const cfUsage = (extId: string) => cf<unknown>("GET", `/v1/customers/${encodeURIComponent(extId)}/usage`);
```
> Note: balance is shown in the panel, not confirmed as an API field. Add `cfBalance()` later only if `GET /v1/balance` exists (probe during Phase 6); do NOT assume.

- [ ] **Step 4: Run test → PASS**.

- [ ] **Step 5: Commit** — `git commit -m "feat(codefast): reseller API client"`

---

## Phase 2 — DB schema (migration 0033)

### Task 3: migration + Drizzle schema

**Files:**
- Create: `src/server/db/migrations/0033_codefast_reseller.sql`
- Modify: `src/server/db/schema.ts` (packages block ~609, userPackageEntitlements ~640)
- Modify: `src/server/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**
```sql
-- packages: CodeFast catalog metadata (NULL = not a CodeFast package)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cf_catalog_id text;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cf_api_slug text;            -- proxy slug, e.g. 'claude-api'
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cf_manual boolean NOT NULL DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cf_token_millions integer;   -- Claude token products
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cf_reseller_cost_tl numeric(14,4); -- our buy cost (for margin display)

-- entitlements: per-customer CodeFast provisioning
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_customer_id text;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_order_id text;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_api_slug text;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_rc_key_cipher text;     -- cf_rc_live_… (AES-GCM)
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_status text;            -- provisioned|pending_manual|failed
```

- [ ] **Step 2: Mirror in Drizzle schema.ts** — add to `packages` table: `cfCatalogId: text("cf_catalog_id")`, `cfApiSlug: text("cf_api_slug")`, `cfManual: boolean("cf_manual").notNull().default(false)`, `cfTokenMillions: integer("cf_token_millions")`, `cfResellerCostTl: numeric("cf_reseller_cost_tl", { precision: 14, scale: 4 })`. Add to `userPackageEntitlements`: `cfCustomerId: text("cf_customer_id")`, `cfOrderId: text("cf_order_id")`, `cfApiSlug: text("cf_api_slug")`, `cfRcKeyCipher: text("cf_rc_key_cipher")`, `cfStatus: text("cf_status")`.

- [ ] **Step 3: Register in _journal.json** — append an entry with the next `idx` and an increasing `when` (match existing format; tag `0033_codefast_reseller`).

- [ ] **Step 4: Run migration locally** — `npm run db:up && npm run db:migrate`. Expected: 0033 applies, no error.

- [ ] **Step 5: Commit** — `git commit -m "feat(codefast): migration 0033 reseller columns"`

> ⚠️ Isolated-deploy renumber trap: live migration max may differ from local. Before deploy, verify live max via `ssh yzapi-vps 'cat /opt/turkapiprojesi/.deploy/current-release.json'` and renumber if needed (yzapi CLAUDE.md isolated-deploy rule).

---

## Phase 3 — Catalog sync (1:1 price mirror + markup)

### Task 4: seed-codefast-packages script

**Files:**
- Create: `scripts/seed-codefast-packages.ts`

- [ ] **Step 1: Implement** — pull live catalog, upsert one yzapi package per resellable CF product. Default `fiyat_tl = list price (TRY)`; on conflict DO NOT overwrite `fiyat_tl`/`satista`/`enabled` (preserve admin markups/launch state — mirror `seed-gpt-istek-paketleri.ts` ON CONFLICT discipline). Store `cf_catalog_id`, `cf_api_slug`, `cf_manual`, `cf_reseller_cost_tl = list*0.9`, `gunluk_istek_limiti = base_limit_amount`, `sure_gun = base_duration_days`, `allowed_models = <canonical model ids for that product>`. New rows seed `satista=false` (coming-soon) so nothing sells until Ufuk opens it.
```ts
// Run on server: NODE_ENV=production npx tsx scripts/seed-codefast-packages.ts
import { cfCatalog } from "../src/server/services/codefast-reseller-service.js";
import { dbSql } from "../src/server/db/client.js";

// canonical yzapi model ids per CF api_slug (extend as catalog grows)
const MODELS_BY_SLUG: Record<string, string[]> = {
  "claude-api": ["claude-opus-4.8","claude-opus-4-7","claude-opus-4-6","claude-sonnet-4-6","claude-sonnet-4-5","claude-haiku-4-5"],
  "codex-api": ["gpt-5.5","gpt-5.4"],
  // composer-api, gemini-api, glm-api, grok-api, open-source-api, nvidia-api, *-studio → fill from MASTER_MODELS/added_models
};

const cat = await cfCatalog();
for (const c of cat) {
  if (!c.is_resellable) continue;
  const slug = c.slug.split("__")[0];
  const id = `cf-${slug}`;
  const listTl = c.currency === "TRY" ? c.base_price_amount : 0; // non-TRY → compute later
  const cost = Math.round(listTl * 0.9 * 100) / 100;
  const models = MODELS_BY_SLUG[slug] ?? [];
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun,
      allowed_models, fiyat_tl, enabled, satista, cf_catalog_id, cf_api_slug, cf_manual, cf_reseller_cost_tl)
    VALUES (${id}, ${c.name}, ${"CodeFast"}, ${c.name}, 'request_limit',
      ${c.base_limit_amount ?? 0}, ${c.base_duration_days}, ${JSON.stringify(models)}::jsonb,
      ${listTl}, true, false, ${c.id}, ${slug}, ${c.requires_manual_review}, ${cost})
    ON CONFLICT (id) DO UPDATE SET
      ad = EXCLUDED.ad, aciklama = EXCLUDED.aciklama,
      cf_catalog_id = EXCLUDED.cf_catalog_id, cf_api_slug = EXCLUDED.cf_api_slug,
      cf_manual = EXCLUDED.cf_manual, cf_reseller_cost_tl = EXCLUDED.cf_reseller_cost_tl,
      gunluk_istek_limiti = EXCLUDED.gunluk_istek_limiti, sure_gun = EXCLUDED.sure_gun,
      updated_at = now()  -- intentionally NOT touching fiyat_tl/satista/enabled
  `;
  console.log("upsert", id, "list", listTl, "cost", cost, c.requires_manual_review ? "MANUAL" : "auto");
}
process.exit(0);
```

- [ ] **Step 2: Dry-run locally against a test DB** — `NODE_ENV=production CODEFAST_RESELLER_API_KEY=… npx tsx scripts/seed-codefast-packages.ts` pointed at local PG; verify rows.

- [ ] **Step 3: Commit** — `git commit -m "feat(codefast): catalog sync seed script"`

> Claude token product: `base_limit_amount` is null + token-based. Handle separately — seed Claude with `cf_token_millions` default 25, `gunluk_istek_limiti` left high/ignored, and price = `25 * 0.15 * sellKur`. Mark `cf_manual=true`.

---

## Phase 4 — Provisioning on purchase

### Task 5: provisioning service

**Files:**
- Create: `src/server/services/codefast-provisioning-service.ts`
- Test: `src/server/services/codefast-provisioning-service.test.ts`

- [ ] **Step 1: Write failing test** — provisioning an auto product stores the cf_rc key on the entitlement; a manual product marks `pending_manual` with no key.
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("./codefast-reseller-service.js", () => ({
  cfCreateOrder: vi.fn(),
}));
vi.mock("../db/client.js", () => ({ dbSql: Object.assign(vi.fn(), {}) }));
vi.mock("./api-key-service.js", () => ({ encryptApiKey: (s: string) => `cipher(${s})` }));

it("auto product → stores cf_rc key + provisioned", async () => {
  const { cfCreateOrder } = await import("./codefast-reseller-service.js");
  (cfCreateOrder as any).mockResolvedValue({ id: "ord1", status: "completed", manual_review_required: false,
    reseller_cost_amount: 1035, customer_api_key: "cf_rc_live_abc",
    items: [{ fulfillment_status: "auto_fulfilled", customer_api_key: "cf_rc_live_abc" }] });
  const { dbSql } = await import("../db/client.js");
  (dbSql as any).mockResolvedValue([{}]);
  const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
  const r = await provisionCodefastEntitlement({
    entitlementId: "e1", userId: "u1", externalOrderId: "pkg_purchase_u1_x",
    pkg: { cfCatalogId: "c1", cfApiSlug: "codex-api", cfManual: false, gunlukIstekLimiti: 500, sureGun: 30 },
    email: "a@b.c", username: "u1",
  });
  expect(r.cfStatus).toBe("provisioned");
  expect(cfCreateOrder).toHaveBeenCalledWith(expect.objectContaining({ external_customer_id: "u1" }), "pkg_purchase_u1_x");
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**
```ts
import { dbSql } from "../db/client.js";
import { encryptApiKey } from "./api-key-service.js";
import { cfCreateOrder, CodefastError } from "./codefast-reseller-service.js";

export interface CfPkgMeta {
  cfCatalogId: string; cfApiSlug: string; cfManual: boolean;
  gunlukIstekLimiti: number; sureGun: number; cfTokenMillions?: number | null;
}
export interface ProvisionResult { cfStatus: "provisioned" | "pending_manual" | "failed"; cfOrderId?: string; }

/** Buy a CodeFast order for this entitlement and persist the customer key. Runs AFTER the money tx commits. Never throws to caller — records 'failed' on error (a follow-up job can retry). */
export async function provisionCodefastEntitlement(args: {
  entitlementId: string; userId: string; externalOrderId: string;
  pkg: CfPkgMeta; email?: string; username?: string;
}): Promise<ProvisionResult> {
  const { entitlementId, userId, externalOrderId, pkg } = args;
  const item = pkg.cfTokenMillions
    ? { catalog_id: pkg.cfCatalogId, claude_token_millions: pkg.cfTokenMillions }
    : { catalog_id: pkg.cfCatalogId, limit_amount: pkg.gunlukIstekLimiti, duration_days: pkg.sureGun };
  try {
    const order = await cfCreateOrder({
      external_customer_id: userId, external_order_id: externalOrderId,
      customer: { email: args.email, username: args.username }, create_customer_api_key: true, items: [item],
    }, externalOrderId);
    const key = order.customer_api_key ?? order.items?.find(i => i.customer_api_key)?.customer_api_key;
    const manual = order.manual_review_required || pkg.cfManual || !key;
    const status = manual ? "pending_manual" : "provisioned";
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_customer_id = ${userId}, cf_order_id = ${order.id}, cf_api_slug = ${pkg.cfApiSlug},
          cf_rc_key_cipher = ${key ? encryptApiKey(key) : null}, cf_status = ${status}, updated_at = now()
      WHERE id = ${entitlementId}::uuid`;
    return { cfStatus: status, cfOrderId: order.id };
  } catch (e) {
    const msg = e instanceof CodefastError ? e.message : String(e);
    await dbSql`UPDATE user_package_entitlements SET cf_status = 'failed', updated_at = now() WHERE id = ${entitlementId}::uuid`.catch(() => {});
    console.error("[codefast] provisioning failed", entitlementId, msg);
    return { cfStatus: "failed" };
  }
}
```

- [ ] **Step 4: Run → PASS. Commit** — `git commit -m "feat(codefast): provisioning service"`

### Task 6: hook provisioning into purchase

**Files:**
- Modify: `src/server/services/package-purchase-service.ts` (after the `dbSql.begin` returns, ~line 175)

- [ ] **Step 1:** Read the current `purchasePackageWithBalance` return path. Load CF metadata in the package SELECT (add `cf_catalog_id, cf_api_slug, cf_manual, cf_token_millions` to the `SELECT` at line 96-101).

- [ ] **Step 2:** After the transaction commits and you have `entitlementId`, if `pkg.cf_catalog_id` is set AND `env.CODEFAST_RESELLER_ENABLED`, call provisioning OUTSIDE the tx:
```ts
// after: const result = await dbSql.begin(...)  (request_limit branch only)
if (env.CODEFAST_RESELLER_ENABLED && pkg.cf_catalog_id && result.entitlementId) {
  const { provisionCodefastEntitlement } = await import("./codefast-provisioning-service.js");
  const prov = await provisionCodefastEntitlement({
    entitlementId: result.entitlementId, userId, externalOrderId: txKey,
    pkg: { cfCatalogId: pkg.cf_catalog_id, cfApiSlug: pkg.cf_api_slug, cfManual: pkg.cf_manual,
           gunlukIstekLimiti: effectiveLimit, sureGun: effectiveDays, cfTokenMillions: pkg.cf_token_millions },
    email: undefined, username: userId,
  });
  (result as any).cfStatus = prov.cfStatus; // surface to caller for UI ("teslim ediliyor" if pending_manual)
}
return result;
```
> Idempotency: `external_order_id = txKey` (the same idempotency key used for the balance tx). A retried purchase reuses the same CF order — `Idempotency-Key` prevents double CF charge.

- [ ] **Step 3:** Extend `PurchaseResult` interface with `cfStatus?: "provisioned"|"pending_manual"|"failed"`.

- [ ] **Step 4: itest** — `src/server/__tests__/codefast-provisioning.itest.ts`: real PG, mock `codefast-reseller-service` HTTP (vi.mock), buy a CF-backed package, assert entitlement row has `cf_rc_key_cipher` + `cf_status='provisioned'`; buy a `cf_manual` package, assert `cf_status='pending_manual'` + null key.

- [ ] **Step 5: Commit** — `git commit -m "feat(codefast): provision on purchase"`

---

## Phase 5 — Proxy routing to CodeFast

### Task 7: entitlement override chain

**Files:**
- Modify: `src/server/services/package-provider-override.ts` (add helper)
- Modify: `src/server/services/entitlement-service.ts` (`tryReservePackageSlot` returns CF fields)

- [ ] **Step 1:** Extend `PackageCoverage` (entitlement-service.ts:4) with `cfApiSlug?: string; cfRcKeyCipher?: string;`. In `tryReservePackageSlot` add `upe.cf_api_slug, upe.cf_rc_key_cipher` to the `RETURNING` (line 77-78) and map them into the result (line 82-90).

- [ ] **Step 2:** Add `entitlementOverrideChain` to package-provider-override.ts:
```ts
export interface EntitlementProviderSlot { entitlementId?: string; cfApiSlug?: string | null; cfRcKeyCipher?: string | null; }
/** CodeFast per-customer chain: forwards to /proxy/<slug> with the cf_rc_live_ key. */
export function entitlementOverrideChain(slot: EntitlementProviderSlot, base: string): ProviderChain | null {
  const slug = (slot.cfApiSlug ?? "").trim();
  const cipher = (slot.cfRcKeyCipher ?? "").trim();
  if (!slug || !cipher) return null;
  const apiKey = decryptApiKey(cipher);
  if (!apiKey) return null;
  const baseUrl = `${base.replace(/\/+$/, "")}/proxy/${slug}`;
  return { primary: { profileId: `cf:${slot.entitlementId ?? "?"}`, baseUrl, apiKey, modelMap: {},
    source: { baseUrl: "db", apiKey: "db" } }, fallback: null };
}
```

- [ ] **Step 3: unit test** both helpers return null on empty/undecryptable and a correct chain on valid input (slug → `/proxy/<slug>` URL).

- [ ] **Step 4: Commit** — `git commit -m "feat(codefast): entitlement override chain"`

### Task 8: wire proxy call-sites

**Files:**
- Modify: `src/server/routes/proxy.ts` (3 text call-sites where `packageOverrideChain` is applied after `billedViaPackage`)

- [ ] **Step 1:** Read each of the 3 sites (chat/completions, messages, responses) where the code currently does `const overrideChain = packageOverrideChain({...slot})`. CONFIRM the exact variable names from `tryReservePackageSlot` result (`pkgSlot`).

- [ ] **Step 2:** At each site, prefer the entitlement (CodeFast per-customer) chain, falling back to package override, then normal routing:
```ts
import { entitlementOverrideChain } from "../services/package-provider-override.js";
import { env } from "../lib/env.js";
// ...
const cfChain = entitlementOverrideChain(
  { entitlementId: pkgSlot.entitlementId, cfApiSlug: pkgSlot.cfApiSlug, cfRcKeyCipher: pkgSlot.cfRcKeyCipher },
  env.CODEFAST_RESELLER_BASE_URL,
);
const overrideChain = cfChain ?? packageOverrideChain({ packageId: pkgSlot.packageId,
  providerBaseUrl: pkgSlot.providerBaseUrl, providerApiKeyCipher: pkgSlot.providerApiKeyCipher });
```
> If `pkgSlot.cf_status === 'pending_manual'` (Claude not yet delivered) `cfChain` is null (no key) → request must NOT silently fall to normal routing for a CF-only model. Add a guard: if the package is CF-backed (`cfApiSlug` present on package) but no key yet → release slot + HTTP 409 `{code:'codefast_pending_delivery', message:'Paket teslim ediliyor, birkaç dakika içinde aktif olacak.'}`. (Pull `cfApiSlug` from package into `pkgSlot` for this check.)

- [ ] **Step 3:** Billing stays `billed_via='package'` cost=0 (CF cost already paid at purchase). No change to reserve/settle for CF packages — `recordPackageUsage` path unchanged.

- [ ] **Step 4: itest** — `codefast-provisioning.itest.ts` extend: seed an entitlement with a fake cf_rc cipher + slug, mock CF `/proxy/claude-api/v1/messages` (nock/vi), POST `/v1/messages` with that user's yzk key, assert request forwarded to `…/proxy/claude-api/v1/messages` with `Bearer cf_rc_live_…`.

- [ ] **Step 5: Commit** — `git commit -m "feat(codefast): proxy routes CF packages to reseller proxy"`

---

## Phase 6 — Admin panel

### Task 9: admin endpoints

**Files:**
- Modify: `src/server/routes/admin.ts` (near package routes ~1375-1468)

- [ ] **Step 1:** `POST /api/admin/packages/codefast-sync` (owner-only) → runs the catalog upsert (import the seed logic as a function) → returns `{upserted: n}`.
- [ ] **Step 2:** `GET /api/admin/codefast/balance` (owner-only) → probe CF for balance; if no balance API, return reseller-side computed `{provisioned, failed, pending_manual}` counts from entitlements + last sync time. (Decide after probing — see Phase 1 note.)
- [ ] **Step 3:** `POST /api/admin/packages/entitlement/:id/deliver-manual` (owner-only) → body `{customerApiKey: "cf_rc_live_…"}` → encrypt + set `cf_rc_key_cipher`, `cf_status='provisioned'`. For Claude manual fulfillment after CodeFast admin delivers.
- [ ] **Step 4:** Add `cf_reseller_cost_tl` + `cf_manual` + `cf_api_slug` to the admin package list response so the UI can show margin. (NEVER expose to public routes — contract test in Task 11.)
- [ ] **Step 5: Commit.**

### Task 10: admin UI

**Files:**
- Modify: `src/yapayzekalab/tab-admin.jsx` (`AdminPackages` ~1045-1142)

- [ ] **Step 1:** In the package list, for CF packages (cf_api_slug set) show a column: `Alış ₺{cf_reseller_cost_tl} → Satış ₺{fiyatTL} (marj %{((fiyatTL-cost)/fiyatTL*100)})`. Editing `fiyatTL` (existing edit modal) IS the markup control — Ufuk sets sell price; default seeded 1:1.
- [ ] **Step 2:** Add a "CodeFast Senkronize" button → `POST /api/admin/packages/codefast-sync` → toast result.
- [ ] **Step 3:** Add a "Manuel Teslim" action on entitlements with `cf_status='pending_manual'` (or a small admin sub-view) → input cf_rc_live_ key → `deliver-manual`. (Minimal: a section listing pending_manual entitlements.)
- [ ] **Step 4: Commit.**

---

## Phase 7 — Contracts, safety, docs

### Task 11: contract test (secrets non-leak + slug integrity)

**Files:**
- Create: `src/server/__tests__/codefast-contract.test.ts`

- [ ] **Step 1:** Assert the public package serializer (`listPublicPackages` shape) does NOT include `cf_reseller_cost_tl`, `cf_catalog_id`, `cf_api_slug`, `cf_rc_key_cipher`, `provider_api_key_cipher`. (Mirror existing `packages-noleak` contract.)
- [ ] **Step 2:** Assert `cf_rc_live_`/`cf_res_live_` literals never appear in any `src/yapayzekalab/**` file (static scan) — keys are backend-only.
- [ ] **Step 3:** Run `npm run build && npm run scan:public` — confirm no CF secret/codename in the built bundle.
- [ ] **Step 4: Commit.**

### Task 12: full verification

- [ ] **Step 1:** `npm run lint` (tsc --noEmit) → 0 errors.
- [ ] **Step 2:** `npm test` → all unit + contract pass.
- [ ] **Step 3:** `npm run db:up && npm run db:migrate && npm run itest` → provisioning + proxy itests pass.
- [ ] **Step 4:** `npm run build && npm run scan:public` → clean.
- [ ] **Step 5: Commit** — `git commit -m "test(codefast): contracts + full verification green"`

---

## Out of scope / follow-ups (note, don't silently skip)
- **Claude full automation:** impossible — CodeFast-side `manual_review`. Phase 7 manual-deliver is the workaround; or pre-buy Claude token inventory (separate plan).
- **Provisioning retry job:** a cron to retry `cf_status='failed'` entitlements (Idempotency-Key makes it safe). Add after launch if failures observed.
- **CF balance auto-top-up alerting:** we pre-fund CF balance; add a low-balance check (Gözcü domain) so sales don't fail on empty CF balance.
- **Pooled-customer model (Option B):** for unlimited products (Kimi ₺900/mo) a single CF customer reused across users via the existing 0032 package override is cheaper — revisit per-product.
- **Revoke on refund:** if a yzapi package purchase is refunded, call `cfRevokeOrder(cf_order_id)`. Wire into the refund path (separate task).
- **Margin reality:** flat 10% wholesale; ensure sell price (after Shopier fees) clears cost. Admin sees margin per Task 10.

## ⚠️ ARCHITECTURE UPDATE (2026-06-13, after added_models/allowlist research)

Selling **all** CodeFast models requires three corrections to Phases 3 & 5:

1. **Catalog 404 gate is union of `provider_profiles.supportedModelIds` ONLY.** `resolveEnabledModel` (proxy.ts:134-162) 404s a model that is in no enabled profile — and this happens BEFORE package coverage (proxy.ts:179 before :205). So CF-only models (Composer/Grok/GLM/Kimi/NVIDIA/images) must be made catalog-visible:
   - Add each as an `added_models` row (`scripts/seed-codefast-models.ts`): `{modelId(dot form), name, providerLabel, inputUsd/outputUsd(display), type, imagePriceUsd}`. 42-lock untouched (added_models never counted).
   - Create ONE enabled `provider_profiles` row `id='codefast'` whose `supportedModelIds` = ALL CF model ids (so they pass the 404 union gate + show in catalog). `modelMap={}` (verbatim wire). Add dash aliases to `ADDED_MODEL_DASH_TO_DOT` (master-models.ts) if Cursor/Claude-Code send dash forms.
2. **Package-only enforcement (HOT PATH → 3-QA).** Because a `codefast` profile exists, `resolveProviderForModel` would route a NON-package (PAYG) request for a CF model to that profile — which has no usable per-customer key. Add a guard at the 3 proxy text call-sites: if the resolved model belongs to the `codefast` profile AND `!billedViaPackage` → `releasePackageSlot`(n/a) + HTTP 402 `{code:'codefast_package_required', message:'Bu model yalnız ilgili paket ile kullanılabilir.'}`. Detect via `ctx.profileId === 'codefast'` (or a `cf_only` set). This is the new Task 8b. Do NOT let CF models fall to PAYG token billing.
3. **Exact CF wire model ids are NOT in the reseller catalog** (only `claude-api` lists them). Codex=gpt-5.5/5.4/5.3-codex/5.2, GLM=glm-5.1/5-turbo/4.7/4.5-air, Gemini=gemini-3-flash-preview/3.1-flash-lite-preview/3.1-pro-preview are known from product descriptions; **Composer/Grok/Kimi/NVIDIA/image exact ids are UNCONFIRMED**. To finalize: fund CF balance, create one order per product to get a `cf_rc_live_`, then probe `GET /proxy/<slug>/v1/models` for the authoritative id list. **External dependency: CF balance funding (money) — Ufuk action.**

Revised Phase 3 = `seed-codefast-models.ts` (added_models + `codefast` profile) THEN `seed-codefast-packages.ts`. Revised Phase 5 adds Task 8b (package-only guard, 3-QA).

## Self-review notes
- Spec coverage: buy (Phase 4) ✓, sell/markup (Phase 3 seed 1:1 + Phase 10 admin edit) ✓, proxy passthrough (Phase 5) ✓, per-customer keys (Phase 4 entitlement storage) ✓, Claude manual (Phase 7) ✓, secrets safety (Phase 11) ✓.
- Type consistency: `cfApiSlug`/`cfRcKeyCipher` used identically in entitlement-service `PackageCoverage`, `entitlementOverrideChain` slot, and proxy site. `external_order_id`=`txKey` consistent between purchase hook and provisioning. `cf_status` enum identical across migration, provisioning, proxy guard, admin.
- Money safety: CF network call is OUTSIDE `dbSql.begin`; balance tx unchanged; CF packages bill cost=0 via existing package path; refund→revoke noted.
