/**
 * Paket alımı → transactions satırına purchase_ref (YZK-...) + package_id yazılır.
 * Gerçek Postgres. Ücretli alış (ref her ücretli yolda üretilir).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbSql, db } from "../db/client.js";
import { users } from "../db/schema.js";
import { purchasePackageWithBalance } from "../services/package-purchase-service.js";
import { listUserPurchaseHistory } from "../services/entitlement-service.js";

const UID = "b0000041-0000-0000-0000-0000000000a1";
const PKG = "test-ref-paid-itest";

async function cleanup() {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({ id: UID, email: "ref-itest@test.local", adSoyad: "Ref Itest", bakiyeTL: "1000.0000", durum: "aktif" } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista)
    VALUES (${PKG}, 'Ref Paid', 'NVIDIA', '', 'request_limit', 1000, 30, ${JSON.stringify(["gpt-5.5"])}::jsonb, 100, true, true)
  `;
});
afterAll(cleanup);

describe("paket alımı → purchase_ref + package_id", () => {
  it("ilk alış: transactions satırında geçerli ref ve package_id var", async () => {
    const res = await purchasePackageWithBalance(UID, PKG, "ref-1");
    expect(res.entitlementId).toBeTruthy();
    const rows = await dbSql<{ purchase_ref: string; package_id: string; tip: string }[]>`
      SELECT purchase_ref, package_id, tip FROM transactions
      WHERE user_id = ${UID}::uuid AND tip = 'paket_satin_alma' ORDER BY timestamp DESC LIMIT 1
    `;
    expect(rows[0].purchase_ref).toMatch(/^YZK-\d{6}-[A-Z2-9]{4}$/);
    expect(rows[0].package_id).toBe(PKG);
  });

  it("ikinci alış (EXTEND): yine kendi AYRI ref'ini alır", async () => {
    const before = await dbSql<{ purchase_ref: string }[]>`
      SELECT purchase_ref FROM transactions WHERE user_id = ${UID}::uuid AND tip='paket_satin_alma'
    `;
    await purchasePackageWithBalance(UID, PKG, "ref-2");
    const after = await dbSql<{ purchase_ref: string }[]>`
      SELECT purchase_ref FROM transactions WHERE user_id = ${UID}::uuid AND tip='paket_satin_alma'
    `;
    expect(after.length).toBe(before.length + 1);
    const refs = after.map((r) => r.purchase_ref);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe("listUserPurchaseHistory", () => {
  it("kullanıcının paket alımlarını ref + paket adı + tutar + tarihle döndürür", async () => {
    const hist = await listUserPurchaseHistory(UID);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    const h = hist[0];
    expect(h.ref).toMatch(/^YZK-\d{6}-[A-Z2-9]{4}$/);
    expect(h.paketAdi).toBe("Ref Paid");
    expect(h.tutarTL).toBe(100);
    expect(typeof h.tarih).toBe("string");
  });
});

describe("admin ref arama (purchase_ref → user)", () => {
  it("var olan ref user_id'ye çözülür", async () => {
    const one = await dbSql<{ purchase_ref: string }[]>`
      SELECT purchase_ref FROM transactions WHERE user_id=${UID}::uuid AND tip='paket_satin_alma' LIMIT 1
    `;
    const ref = one[0].purchase_ref;
    const found = await dbSql<{ user_id: string }[]>`
      SELECT user_id FROM transactions WHERE purchase_ref = ${ref} LIMIT 1
    `;
    expect(found[0].user_id).toBe(UID);
  });
});
