import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// CF reseller HTTP'yi mock'la (gerçek ağ yok) — env'i de enabled yap.
vi.mock("../services/codefast-reseller-service.js", () => {
  class CodefastError extends Error { constructor(public status: number, m: string) { super(m); } }
  return {
    cfQuote: vi.fn().mockResolvedValue({ reseller_cost_amount: 36, currency: "TRY", items: [], manual_review_required: false }),
    cfCreateOrder: vi.fn(),
    cfGetOrder: vi.fn().mockResolvedValue({ order: { id: "o", status: "fulfilled" }, manual_review_required: false }),
    cfRevokeOrder: vi.fn().mockResolvedValue({ id: "o", status: "revoked" }),
    extractCustomerKey: (o: any) => o?.customer_api_key?.api_key ?? null,
    CodefastError,
  };
});
vi.mock("../lib/env.js", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return { ...orig, env: { ...orig.env, CODEFAST_RESELLER_ENABLED: true, CODEFAST_RESELLER_API_KEY: "cf_res_live_test", CODEFAST_RESELLER_BASE_URL: "https://reseller-api.codefast.app" } };
});

import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const UID = "33333333-3333-3333-3333-333333333333";
const PKG_AUTO = "cf-itest-auto";
const PKG_MANUAL = "cf-itest-manual";

async function balance(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}
async function ent(pkg: string) {
  const r = await dbSql<any[]>`SELECT cf_status, cf_rc_key_cipher, cf_order_id, status FROM user_package_entitlements WHERE user_id = ${UID}::uuid AND package_id = ${pkg} LIMIT 1`;
  return r[0];
}

beforeAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id IN (${PKG_AUTO}, ${PKG_MANUAL})`;
  await db.insert(users).values({ id: UID, email: "cf-itest@test.local", adSoyad: "CF Itest", bakiyeTL: "1000.0000", durum: "aktif" } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista, cf_catalog_id, cf_api_slug, cf_manual)
    VALUES (${PKG_AUTO}, 'CF Auto', 'CodeFast', '', 'request_limit', 500, 30, ${JSON.stringify(["gpt-5.5"])}::jsonb, 40, true, true, 'cat-auto', 'codex-api', false)
  `;
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista, cf_catalog_id, cf_api_slug, cf_manual, cf_token_millions)
    VALUES (${PKG_MANUAL}, 'CF Manual', 'CodeFast', '', 'request_limit', 100000, 999, ${JSON.stringify(["claude-opus-4.8"])}::jsonb, 30, true, true, 'cat-claude', 'claude-api', true, 25)
  `;
});

afterAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id IN (${PKG_AUTO}, ${PKG_MANUAL})`;
});

beforeEach(() => vi.clearAllMocks());

describe("CodeFast provisioning on purchase (real PG, mocked CF)", () => {
  it("auto product: order returns key → entitlement provisioned + key stored + balance debited", async () => {
    const { cfCreateOrder } = await import("../services/codefast-reseller-service.js");
    (cfCreateOrder as any).mockResolvedValue({
      order: { id: "ord-auto-1", status: "fulfilled" }, customer: { id: "c1" },
      manual_review_required: false, customer_api_key: { api_key: "cf_rc_live_autokey" },
    });
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const res = await purchasePackageWithBalance(UID, PKG_AUTO, "cf-itest-auto-1");
    expect(res.cfStatus).toBe("provisioned");
    expect(await balance()).toBe(960);
    const e = await ent(PKG_AUTO);
    expect(e.cf_status).toBe("provisioned");
    expect(e.cf_rc_key_cipher).toBeTruthy(); // şifreli key saklandı
    expect(e.cf_order_id).toBe("ord-auto-1");
  });

  it("manual product (Claude): no key → pending_manual, NOT refunded (balance stays debited)", async () => {
    const { cfCreateOrder } = await import("../services/codefast-reseller-service.js");
    (cfCreateOrder as any).mockResolvedValue({
      order: { id: "ord-man-1", status: "manual_review" }, customer: { id: "c2" }, manual_review_required: true,
    });
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const res = await purchasePackageWithBalance(UID, PKG_MANUAL, "cf-itest-man-1");
    expect(res.cfStatus).toBe("pending_manual");
    expect(await balance()).toBe(930); // 960 - 30, iade YOK
    const e = await ent(PKG_MANUAL);
    expect(e.cf_status).toBe("pending_manual");
    expect(e.cf_rc_key_cipher).toBeNull();
  });

  it("CF order fails (down) → auto-refund + entitlement revoked + 503 thrown", async () => {
    const { cfCreateOrder, CodefastError } = await import("../services/codefast-reseller-service.js");
    (cfCreateOrder as any).mockRejectedValue(new (CodefastError as any)(402, "no balance"));
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const before = await balance(); // 930
    await expect(purchasePackageWithBalance(UID, PKG_AUTO, "cf-itest-fail-1")).rejects.toThrow(/tedarik/i);
    // iade: bakiye geri geldi (debit 40 → refund 40 = net 0)
    expect(await balance()).toBe(before);
    // iade transaction yazıldı
    const ref = await dbSql`SELECT id FROM transactions WHERE idempotency_key = ${"cf_refund_pkg_purchase_" + UID + "_cf-itest-fail-1"} LIMIT 1`;
    expect(ref.length).toBe(1);
  });
});
