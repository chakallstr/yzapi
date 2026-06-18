/**
 * Test key (redeem code) üreteci — 'Deneme' kategorili redeem-only test paketi için.
 * Çalıştırma (SUNUCUDA — NODE_ENV ŞART):
 *   NODE_ENV=production npx tsx scripts/gen-test-keys.ts [packageId] [count] [prefix]
 * Varsayılan: cf-test-codex-50 · 50 adet · TEST  (her kod tek kullanım, kişi başı 1 kez).
 * Üretilen kodlar stdout'a basılır — kopyalayıp dağıt.
 */
import { generateRedeemCodes } from "../src/server/services/redeem-code-service.js";

async function main() {
  const packageId = process.argv[2] || "cf-test-codex-50";
  const count = Math.min(Math.max(parseInt(process.argv[3] || "50", 10) || 50, 1), 500);
  const prefix = process.argv[4] || "TEST";
  const { codes } = await generateRedeemCodes({
    tip: "package",
    packageId,
    count,
    prefix,
    maxUses: 1,
    perUserOnce: true,
    aciklama: `${packageId} test key`,
  });
  console.log(`# ${codes.length} test key üretildi (paket: ${packageId})`);
  console.log(codes.join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error("gen-test-keys FAILED:", e); process.exit(1); });
