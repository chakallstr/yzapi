/**
 * Codex API (ChatGPT) configurable paketini DB'ye ekler (idempotent).
 * Çalıştır: ENV_FILE_PATH=.env.production npx tsx scripts/seed-codex-package.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { dbSql } from "../src/server/db/client.js";

async function main() {
  await dbSql`
    INSERT INTO packages (
      id, ad, kategori, aciklama, tip,
      gunluk_istek_limiti, sure_gun, allowed_models,
      fiyat_tl, fiyat_usd, enabled, display_order,
      is_configurable, min_gunluk_istek, max_gunluk_istek,
      min_sure_gun, max_sure_gun, birim_fiyat_usd_per_50,
      max_context_tokens
    )
    VALUES (
      'codex-api-chatgpt',
      'Codex API (ChatGPT)',
      'GPT/Codex',
      'Codex API (ChatGPT) ile gpt-5.5 ve gpt-5.4 Responses API modelleri kapsamında, seçtiğin istek limiti ve süreyle erişim. Her istek 1 sayılır, maks. 65k token bağlam.',
      'request_limit',
      500, 1, '["gpt-5.5","gpt-5.4"]'::jsonb,
      0, 0, true, 1,
      true, 50, 5000, 1, 30, 0.90,
      65000
    )
    ON CONFLICT (id) DO UPDATE SET
      ad                    = EXCLUDED.ad,
      aciklama              = EXCLUDED.aciklama,
      allowed_models        = EXCLUDED.allowed_models,
      is_configurable       = EXCLUDED.is_configurable,
      min_gunluk_istek      = EXCLUDED.min_gunluk_istek,
      max_gunluk_istek      = EXCLUDED.max_gunluk_istek,
      min_sure_gun          = EXCLUDED.min_sure_gun,
      max_sure_gun          = EXCLUDED.max_sure_gun,
      birim_fiyat_usd_per_50 = EXCLUDED.birim_fiyat_usd_per_50,
      max_context_tokens    = EXCLUDED.max_context_tokens,
      updated_at            = now()
  `;
  console.log("✓ codex-api-chatgpt paketi eklendi/güncellendi.");
  await dbSql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
