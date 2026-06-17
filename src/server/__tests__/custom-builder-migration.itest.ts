/**
 * Custom Package Builder migration (0035) INTEGRATION test (real Postgres).
 * `npm run itest` (db:up + db:migrate gerektirir). Migration'ın packages tablosuna
 * cf_unit_cost_tl / birim_tipi / birim_satis_override_tl kolonlarını eklediğini doğrular.
 */
import { describe, it, expect } from "vitest";
import { dbSql } from "../db/client.js";

describe("0035 custom_package_builder migration", () => {
  it("packages tablosuna 3 builder kolonu eklenmiş", async () => {
    const rows = await dbSql<{ column_name: string; column_default: string | null; data_type: string }[]>`
      SELECT column_name, column_default, data_type
      FROM information_schema.columns
      WHERE table_name = 'packages'
        AND column_name IN ('cf_unit_cost_tl', 'birim_tipi', 'birim_satis_override_tl')
      ORDER BY column_name
    `;
    const names = rows.map((r) => r.column_name);
    expect(names).toContain("cf_unit_cost_tl");
    expect(names).toContain("birim_tipi");
    expect(names).toContain("birim_satis_override_tl");
  });

  it("birim_tipi default 'istek'", async () => {
    const rows = await dbSql<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'packages' AND column_name = 'birim_tipi'
    `;
    expect(rows[0]?.column_default ?? "").toContain("istek");
  });

  it("yeni satır default birim_tipi='istek' alır", async () => {
    const id = "test-builder-migration-row";
    await dbSql`DELETE FROM packages WHERE id = ${id}`;
    await dbSql`
      INSERT INTO packages (id, ad, kategori, tip, gunluk_istek_limiti, sure_gun, fiyat_tl)
      VALUES (${id}, 'mig test', 'Test', 'request_limit', 100, 1, 10)
    `;
    const rows = await dbSql<{ birim_tipi: string; cf_unit_cost_tl: string | null }[]>`
      SELECT birim_tipi, cf_unit_cost_tl FROM packages WHERE id = ${id}
    `;
    expect(rows[0].birim_tipi).toBe("istek");
    expect(rows[0].cf_unit_cost_tl).toBeNull();
    await dbSql`DELETE FROM packages WHERE id = ${id}`;
  });
});
