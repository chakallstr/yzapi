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
});
