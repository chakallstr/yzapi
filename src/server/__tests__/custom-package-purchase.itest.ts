import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// CF reseller HTTP'yi mock'la + env enabled.
vi.mock("../services/codefast-reseller-service.js", () => {
  class CodefastError extends Error { constructor(public status: number, m: string) { super(m); } }
  return {
    cfQuote: vi.fn().mockResolvedValue({ reseller_cost_amount: 36, currency: "TRY", items: [], manual_review_required: false }),
    cfQuoteTemplate: vi.fn().mockResolvedValue({ reseller_cost_amount: 36, currency: "TRY", items: [], manual_review_required: false }),
    cfCreateOrder: vi.fn().mockResolvedValue({
      order: { id: "ord-custom-1", status: "fulfilled" }, customer: { id: "c1" },
      manual_review_required: false, customer_api_key: { api_key: "cf_rc_live_customkey" },
    }),
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

const UID = "f4b00044-0000-0000-0000-0000000c0de1";
const PKG = "cf-codex-builder-itest";

async function balance(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}

beforeAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
  await db.insert(users).values({ id: UID, email: "custom-itest@test.local", adSoyad: "Custom Itest", bakiyeTL: "5000.0000", durum: "aktif" } as any);
  // Builder şablonu: configurable + cf_unit_cost_tl (codex birim) + birim_tipi istek.
  await dbSql`
    INSERT INTO packages
      (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl,
       enabled, satista, is_configurable, min_gunluk_istek, max_gunluk_istek, min_sure_gun, max_sure_gun,
       cf_catalog_id, cf_api_slug, cf_manual, cf_unit_cost_tl, birim_tipi)
    VALUES
      (${PKG}, 'Codex Kendin Yap', 'GPT/Codex', '', 'request_limit', 500, 30, ${JSON.stringify(["gpt-5.5"])}::jsonb, 0,
       true, true, true, 50, 5000, 1, 90,
       'cat-codex', 'codex-api', false, 0.069, 'istek')
  `;
});

afterAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
});

beforeEach(() => vi.clearAllMocks());

describe("Custom package builder — preview + purchase (real PG, mocked CF)", () => {
  it("preview: fiyat hacim-marjla hesaplanır, geliş/maliyet/marj SIZMAZ", async () => {
    const { previewConfigurablePrice } = await import("../services/package-purchase-service.js");
    const p = await previewConfigurablePrice(PKG, 500, 30); // 0.069×500×30=1035 ×2.5 → 2600
    expect(p.fiyatTL).toBe(2600);
    // Leak yok: yalnız satış-tarafı alanlar (fiyatTL/fiyatUsd/birimFiyatUsd); geliş/cost/markup YOK.
    expect(Object.keys(p).sort()).toEqual(["birimFiyatUsd", "fiyatTL", "fiyatUsd"]);
    const json = JSON.stringify(p).toLowerCase();
    expect(json).not.toContain("gelis");
    expect(json).not.toContain("unitcost");
    expect(json).not.toContain("markup");
  });

  it("preview: 1000 limit düşük marj (2.0×)", async () => {
    const { previewConfigurablePrice } = await import("../services/package-purchase-service.js");
    const p = await previewConfigurablePrice(PKG, 1000, 30); // 0.069×1000×30=2070 ×2.0=4140 → 4150
    expect(p.fiyatTL).toBe(4150);
  });

  it("purchase: bakiye sunucu-hesaplı fiyatla düşer (UI'ye güvenmez)", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const res = await purchasePackageWithBalance(UID, PKG, "custom-buy-1", undefined, 500, 30);
    expect(res.cfStatus).toBe("provisioned");
    expect(await balance()).toBe(2400); // 5000 - 2600
  });

  it("purchase: geçersiz adım (523) reddedilir, bakiye değişmez", async () => {
    const before = await balance();
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    await expect(purchasePackageWithBalance(UID, PKG, "custom-buy-bad", undefined, 523, 30)).rejects.toThrow();
    expect(await balance()).toBe(before); // tahsil yok
  });

  it("purchase: min altı limit (40) reddedilir, bakiye değişmez", async () => {
    const before = await balance();
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    await expect(purchasePackageWithBalance(UID, PKG, "custom-buy-min", undefined, 40, 30)).rejects.toThrow();
    expect(await balance()).toBe(before); // tahsil yok
  });
});
