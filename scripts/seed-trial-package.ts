/**
 * 25-istek deneme paketini DB'ye ekler (idempotent).
 * Çalıştır: NODE_ENV=production npx tsx scripts/seed-trial-package.ts
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
      is_configurable
    )
    VALUES (
      'deneme-25-istek',
      'Deneme Paketi (25 İstek)',
      'Deneme',
      '25 günlük API isteği hakkı. Yalnızca özel davet koduyla edinilir.',
      'request_limit',
      25, 1, '["gpt-5.5","gpt-5.4","gpt-5.3-codex","gpt-5.2","claude-opus-4.8","claude-sonnet-4.6","claude-haiku-4.5"]'::jsonb,
      0, 0, true, 99,
      false
    )
    ON CONFLICT (id) DO UPDATE SET
      ad                    = EXCLUDED.ad,
      aciklama              = EXCLUDED.aciklama,
      gunluk_istek_limiti   = EXCLUDED.gunluk_istek_limiti,
      sure_gun              = EXCLUDED.sure_gun,
      allowed_models        = EXCLUDED.allowed_models,
      enabled               = EXCLUDED.enabled,
      updated_at            = now()
  `;
  console.log("✓ deneme-25-istek paketi eklendi/güncellendi.");
  await dbSql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
