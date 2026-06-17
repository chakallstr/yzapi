import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("packages no-leak", () => {
  it("package-service public shape excludes provider/cost/base_url secrets", () => {
    const src = readFileSync(join(process.cwd(), "src/server/services/package-service.ts"), "utf8");
    expect(src).not.toMatch(/base_?url/i);
    expect(src).not.toMatch(/apikeycipher|api_key_cipher/i);
    // publicShape yalnız beyaz-liste alan döndürür (provider maliyeti/çarpan yok)
    expect(src).not.toMatch(/provider.{0,20}(cost|maliyet|carpan)/i);
  });

  it("public packages route does not expose admin-only fields", () => {
    const src = readFileSync(join(process.cwd(), "src/server/routes/packages.ts"), "utf8");
    // public router yalnız listPublicPackages/getPublicPackage kullanır (admin CRUD değil)
    expect(src).not.toMatch(/createPackage|updatePackage|deletePackage/);
  });

  it("custom builder: maliyet kolonları (cf_unit_cost_tl / birim_satis_override_tl) public servise SIZMAZ", () => {
    const src = readFileSync(join(process.cwd(), "src/server/services/package-service.ts"), "utf8");
    // Public liste/detay SELECT'leri ve publicShape bu maliyet kolonlarını ASLA içermemeli.
    expect(src).not.toMatch(/cf_unit_cost_tl|cfUnitCost/);
    expect(src).not.toMatch(/birim_satis_override_tl|birimSatisOverride/);
  });

  it("custom builder: fiyat motoru (geliş/marj) frontend'e taşınmaz", () => {
    const card = readFileSync(join(process.cwd(), "src/yapayzekalab/tab-packages.jsx"), "utf8");
    // Frontend yalnız /price-preview sonucunu (final TL) kullanır; maliyet/marj hesabı backend'de.
    expect(card).not.toMatch(/computeCustomPrice|volumeMarkup|cf_unit_cost|cfUnitCost/);
  });
});
