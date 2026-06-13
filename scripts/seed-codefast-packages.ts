/**
 * CodeFast reseller paketlerini yzapi `packages` tablosuna seed eder.
 *
 * Çalıştırma (SUNUCUDA, ayrı — deploy çalıştırmaz; env tuzağı: NODE_ENV ŞART):
 *   NODE_ENV=production CODEFAST_RESELLER_API_KEY=cf_res_live_... npx tsx scripts/seed-codefast-packages.ts
 *
 * TIER-1 (varsayılan): Claude Max + Codex + Gemini — modeller yzapi kataloğunda ZATEN var
 *   (override-chain CF'ye yönlendirir, codefast profili GEREKMEZ). Kesin id'ler doğrulandı.
 * TIER-2 (--with-new-models): GLM/Composer/Grok/Kimi/NVIDIA/görsel — yzapi'de OLMAYAN modeller.
 *   added_models + 'codefast' provider profili gerektirir. ⚠️ Model id'leri ürün açıklamalarından
 *   alındı; CANLI doğrulama için /proxy/<slug>/v1/models prob et (bir order + cf_rc_live_ gerekir).
 *   satışa açmadan ÖNCE id'leri kesinleştir.
 *
 * Hepsi ON CONFLICT'te fiyat_tl/satista/enabled'a DOKUNMAZ (admin marjını/lansman durumunu korur).
 * Yeni satırlar satista=false ("yakında satışta") — Ufuk admin panelden açana dek satılamaz.
 */
import { dbSql } from "../src/server/db/client.js";

// Reseller cost = liste × 0.90 (sabit %10 indirim).
const cost = (listTl: number) => Math.round(listTl * 0.9 * 100) / 100;

interface Tier1 {
  id: string; ad: string; cfCatalogId: string; cfApiSlug: string;
  listTl: number; gunluk: number; sureGun: number; allowedModels: string[];
  manual: boolean; tokenMillions?: number;
}

// TIER-1 — yzapi'de var olan modeller (kesin canonical id'ler, modelMap kapsıyor).
const TIER1: Tier1[] = [
  {
    id: "cf-claude-max", ad: "CodeFast Claude Max (25M token)",
    cfCatalogId: "15470f76-ba20-4818-b47b-fb8456e88f32", cfApiSlug: "claude-api",
    listTl: 172.5, gunluk: 100000, sureGun: 999, tokenMillions: 25, manual: true,
    allowedModels: [
      "claude-opus-4.8", "claude-opus-4-7", "claude-opus-4-6",
      "claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001",
    ],
  },
  {
    id: "cf-codex", ad: "CodeFast Codex API (500 istek/gün)",
    cfCatalogId: "e8c13011-6ea3-41d5-8bfe-dee06caf0f30", cfApiSlug: "codex-api",
    listTl: 1150, gunluk: 500, sureGun: 30, manual: false,
    allowedModels: ["gpt-5.5", "gpt-5.4", "gpt-5.2"],
  },
  {
    id: "cf-gemini", ad: "CodeFast Gemini API (500 istek/gün)",
    cfCatalogId: "d72359d6-2208-4bb8-9c47-d7bed8e35f49", cfApiSlug: "gemini-api",
    listTl: 500, gunluk: 500, sureGun: 30, manual: false,
    allowedModels: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
  },
];

async function upsertPackage(p: Tier1) {
  await dbSql`
    INSERT INTO packages
      (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models,
       fiyat_tl, enabled, satista, cf_catalog_id, cf_api_slug, cf_manual, cf_token_millions, cf_reseller_cost_tl)
    VALUES
      (${p.id}, ${p.ad}, 'CodeFast', ${p.ad}, 'request_limit', ${p.gunluk}, ${p.sureGun},
       ${JSON.stringify(p.allowedModels)}::jsonb, ${p.listTl}, true, false,
       ${p.cfCatalogId}, ${p.cfApiSlug}, ${p.manual}, ${p.tokenMillions ?? null}, ${cost(p.listTl)})
    ON CONFLICT (id) DO UPDATE SET
      ad = EXCLUDED.ad, aciklama = EXCLUDED.aciklama, allowed_models = EXCLUDED.allowed_models,
      gunluk_istek_limiti = EXCLUDED.gunluk_istek_limiti, sure_gun = EXCLUDED.sure_gun,
      cf_catalog_id = EXCLUDED.cf_catalog_id, cf_api_slug = EXCLUDED.cf_api_slug,
      cf_manual = EXCLUDED.cf_manual, cf_token_millions = EXCLUDED.cf_token_millions,
      cf_reseller_cost_tl = EXCLUDED.cf_reseller_cost_tl, updated_at = now()
      -- KASITLI: fiyat_tl / satista / enabled DOKUNULMAZ (admin marjı + lansman durumu korunur)
  `;
  console.log(`  ✓ ${p.id}  liste ₺${p.listTl}  alış ₺${cost(p.listTl)}  ${p.manual ? "MANUEL" : "oto"}  models=${p.allowedModels.length}`);
}

async function main() {
  console.log("CodeFast TIER-1 paketleri (Claude/Codex/Gemini) seed ediliyor...");
  for (const p of TIER1) await upsertPackage(p);
  console.log("TIER-1 tamam. satista=false → admin panelden 'Satışa Aç' ile aç.");

  if (process.argv.includes("--with-new-models")) {
    console.log("\n⚠️  --with-new-models: TIER-2 henüz id-doğrulaması bekliyor.");
    console.log("   GLM/Composer/Grok/Kimi/NVIDIA/görsel için önce /proxy/<slug>/v1/models prob et,");
    console.log("   sonra added_models + 'codefast' profilini kesin id'lerle seed et (bu blok bilerek boş).");
  }
  process.exit(0);
}

main().catch((e) => { console.error("seed-codefast-packages FAILED:", e); process.exit(1); });
