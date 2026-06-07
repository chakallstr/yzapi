/**
 * Codex API (ChatGPT) configurable paketini DB'ye ekler.
 * Çalıştır: ENV_FILE_PATH=.env.production npx tsx scripts/seed-codex-package.ts
 */
import { loadEnv } from "src/server/lib/env.js";
import { dbSql } from "src/server/db/client.js";

const pkg = {
  id: "codex-api-chatgpt",
  ad: "Codex API (ChatGPT)",
  kategori: "GPT/Codex",
  aciklama:
    "Codex API (ChatGPT) ile gpt-5.5, gpt-5.4, gpt-5.3-codex ve gpt-5.2 " +
    "Responses API modelleri kapsamında, seçtiğin istek limiti ve süreyle erişim.",
  tip: "request_limit",
  gunluk_istek_limiti: 500,
  sure_gun: 1,
  allowed_models: JSON.stringify(["gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gpt-5.2"]),
  fiyat_tl: 0,
  fiyat_usd: 0,
  enabled: true,
  display_order: 1,
  is_configurable: true,
  min_gunluk_istek: 50,
  max_gunluk_istek: 5000,
  min_sure_gun: 1,
  max_sure_gun: 30,
  birim_fiyat_usd_per_50: 0.90,
};

async function main() {
  await dbSql`
    INSERT INTO packages (
      id, ad, kategori, aciklama, tip,
      gunluk_istek_limiti, sure_gun, allowed_models,
      fiyat_tl, fiyat_usd, enabled, display_order,
      is_configurable, min_gunluk_istek, max_gunluk_istek,
      min_sure_gun, max_sure_gun, birim_fiyat_usd_per_50
    )
    VALUES (
      ${pkg.id}, ${pkg.ad}, ${pkg.kategori}, ${pkg.aciklama}, ${pkg.tip},
      ${pkg.gunluk_istek_limiti}, ${pkg.sure_gun}, ${pkg.allowed_models}::jsonb,
      ${pkg.fiyat_tl}, ${pkg.fiyat_usd}, ${pkg.enabled}, ${pkg.display_order},
      ${pkg.is_configurable}, ${pkg.min_gunluk_istek}, ${pkg.max_gunluk_istek},
      ${pkg.min_sure_gun}, ${pkg.max_sure_gun}, ${pkg.birim_fiyat_usd_per_50}
    )
    ON CONFLICT (id) DO UPDATE SET
      ad = EXCLUDED.ad,
      aciklama = EXCLUDED.aciklama,
      is_configurable = EXCLUDED.is_configurable,
      min_gunluk_istek = EXCLUDED.min_gunluk_istek,
      max_gunluk_istek = EXCLUDED.max_gunluk_istek,
      min_sure_gun = EXCLUDED.min_sure_gun,
      max_sure_gun = EXCLUDED.max_sure_gun,
      birim_fiyat_usd_per_50 = EXCLUDED.birim_fiyat_usd_per_50,
      updated_at = now()
  `;
  console.log("✓ codex-api-chatgpt paketi eklendi/güncellendi.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
