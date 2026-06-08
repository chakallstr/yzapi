/**
 * Rika ücretsiz 500 istek/gün GPT/Codex deneme paketini DB'ye ekler (idempotent).
 * Çalıştır: ENV_FILE_PATH=.env.production npx tsx scripts/seed-rika-free-package.ts
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
      is_configurable, max_context_tokens
    )
    VALUES (
      'rika-gpt-deneme',
      'GPT/Codex Deneme (500)',
      'GPT/Codex',
      'Rika AI ile gpt-5.5 ve gpt-5.4 modellerine günlük 500 istek, 30 gün, ücretsiz. Her istek 1 sayılır.',
      'request_limit',
      500, 30, '["gpt-5.5","gpt-5.4"]'::jsonb,
      0, 0, true, 0,
      false, 65000
    )
    ON CONFLICT (id) DO UPDATE SET
      ad                 = EXCLUDED.ad,
      aciklama           = EXCLUDED.aciklama,
      gunluk_istek_limiti = EXCLUDED.gunluk_istek_limiti,
      sure_gun           = EXCLUDED.sure_gun,
      allowed_models     = EXCLUDED.allowed_models,
      max_context_tokens = EXCLUDED.max_context_tokens,
      updated_at         = now()
  `;
  console.log("✓ rika-gpt-deneme paketi eklendi/güncellendi.");
  await dbSql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
