/**
 * GPT 5.5 & 5.4 istek-limitli paketleri (günlük/haftalık/aylık) DB'ye ekler (idempotent).
 * Paketler satista=false ile eklenir: katalogda "EN KISA SÜREDE SATIŞTA" görünür,
 * satın alma KAPALI. Satışa açmak: admin paneli → Paketler → "Satışa Aç"
 * (veya UPDATE packages SET satista=true WHERE id IN (...)).
 *
 * Çalıştır: ENV_FILE_PATH=.env.production npx tsx scripts/seed-gpt-istek-paketleri.ts
 *
 * NOT: ON CONFLICT güncellemesi satista'yı BİLEREK içermez — paket satışa
 * açıldıktan sonra seed yeniden koşarsa satışı geri kapatmasın.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { dbSql } from "../src/server/db/client.js";

const PAKETLER = [
  {
    id: "gpt-gunluk-1000",
    ad: "Günlük Paket — GPT 5.5 & 5.4",
    sureGun: 1,
    fiyatTL: 150,
    aciklama:
      "GPT 5.5 ve GPT 5.4 modellerinde günde 1.000 istek hakkı — 1 gün boyunca. Her istek 1 sayılır, maks. 65k token bağlam.",
    displayOrder: 1,
  },
  {
    id: "gpt-haftalik-1000",
    ad: "Haftalık Paket — GPT 5.5 & 5.4",
    sureGun: 7,
    fiyatTL: 1000,
    aciklama:
      "GPT 5.5 ve GPT 5.4 modellerinde günde 1.000 istek hakkı — 7 gün boyunca. Her istek 1 sayılır, maks. 65k token bağlam.",
    displayOrder: 2,
  },
  {
    id: "gpt-aylik-1000",
    ad: "Aylık Paket — GPT 5.5 & 5.4",
    sureGun: 30,
    fiyatTL: 3500,
    aciklama:
      "GPT 5.5 ve GPT 5.4 modellerinde günde 1.000 istek hakkı — 30 gün boyunca. Her istek 1 sayılır, maks. 65k token bağlam.",
    displayOrder: 3,
  },
];

async function main() {
  for (const p of PAKETLER) {
    await dbSql`
      INSERT INTO packages (
        id, ad, kategori, aciklama, tip,
        gunluk_istek_limiti, sure_gun, allowed_models,
        fiyat_tl, fiyat_usd, enabled, satista, display_order,
        is_configurable, max_context_tokens
      )
      VALUES (
        ${p.id},
        ${p.ad},
        'GPT/Codex',
        ${p.aciklama},
        'request_limit',
        1000, ${p.sureGun}, '["gpt-5.5","gpt-5.4"]'::jsonb,
        ${p.fiyatTL}, NULL, true, false, ${p.displayOrder},
        false, 65000
      )
      ON CONFLICT (id) DO UPDATE SET
        ad                  = EXCLUDED.ad,
        aciklama            = EXCLUDED.aciklama,
        gunluk_istek_limiti = EXCLUDED.gunluk_istek_limiti,
        sure_gun            = EXCLUDED.sure_gun,
        allowed_models      = EXCLUDED.allowed_models,
        fiyat_tl            = EXCLUDED.fiyat_tl,
        display_order       = EXCLUDED.display_order,
        max_context_tokens  = EXCLUDED.max_context_tokens,
        updated_at          = now()
    `;
    console.log(`✓ ${p.id} eklendi/güncellendi (${p.fiyatTL} TL, ${p.sureGun} gün, 1000 istek/gün, satista=false).`);
  }
  await dbSql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
