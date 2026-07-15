// Proof that the opus package is visible on the public buy page — calls the
// EXACT service the catalog/pricing page uses.
import { listPublicPackages } from "../src/server/services/package-service.js";
const pkgs = await listPublicPackages();
const found: any = pkgs.find((p: any) => p.id === "beta-opus-500-24h");
console.log("public packages total:", pkgs.length);
console.log("categories present:", [...new Set(pkgs.map((p: any) => p.kategori))].join(", "));
if (found) {
  console.log(`✅ VISIBLE: id=${found.id} ad="${found.ad}" kategori=${found.kategori} fiyat_tl=${found.fiyat_tl} req=${found.gunluk_istek_limiti} saat=${found.sure_saat}`);
} else {
  console.log("❌ NOT in public list — still hidden");
}
process.exit(0);
