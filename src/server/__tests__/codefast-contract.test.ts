import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * CodeFast no-leak + safety contract.
 * - CF reseller maliyeti / catalog id / customer key / customer-order id ASLA public
 *   paket serializer'ından dönmez (provider no-leak deseniyle aynı sınıf).
 * - cf_rc_live_ / cf_res_live_ literalleri frontend'de YOK (yalnız backend).
 * - reseller master key kaynak ağacında hardcode DEĞİL (env'den gelir).
 */
const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".git" || name === "dist") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("codefast no-leak contract", () => {
  it("public package serializer (package-service.ts) does not SELECT/expose CF private fields", () => {
    const src = readFileSync(join(ROOT, "server", "services", "package-service.ts"), "utf8");
    // publicShape + public SELECT'lerde CF gizli alanları geçmemeli
    for (const forbidden of ["cf_reseller_cost_tl", "cf_catalog_id", "cf_api_slug", "cf_rc_key_cipher", "cf_customer_id", "cf_order_id", "cfResellerCostTl", "cfRcKeyCipher"]) {
      expect(src.includes(forbidden), `package-service.ts must not reference ${forbidden}`).toBe(false);
    }
  });

  it("frontend (yapayzekalab/**) contains no CF key literals or reseller cost", () => {
    const feDir = join(ROOT, "yapayzekalab");
    const files = walk(feDir);
    for (const f of files) {
      const txt = readFileSync(f, "utf8");
      for (const forbidden of ["cf_rc_live_", "cf_res_live_", "cf_reseller_cost", "reseller-api.codefast.app"]) {
        expect(txt.includes(forbidden), `${f} must not contain ${forbidden}`).toBe(false);
      }
    }
  });

  it("no hardcoded reseller key anywhere in src/ (must come from env)", () => {
    const files = walk(ROOT);
    // A real reseller key: cf_res_live_ followed by >=20 key chars. Allow the prefix
    // string itself (used in validation/log), but never a full literal key.
    const fullKey = /cf_res_live_[A-Za-z0-9_-]{20,}/;
    for (const f of files) {
      if (f.endsWith("codefast-contract.test.ts")) continue;
      const txt = readFileSync(f, "utf8");
      expect(fullKey.test(txt), `${f} contains a hardcoded reseller key`).toBe(false);
    }
  });
});
