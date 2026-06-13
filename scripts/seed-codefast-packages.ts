/**
 * CodeFast reseller AYLIK paketlerini (30 günlük) yzapi'ye seed eder.
 *
 * Çalıştırma (SUNUCUDA — deploy çalıştırmaz; env tuzağı: NODE_ENV ŞART):
 *   NODE_ENV=production CODEFAST_RESELLER_API_KEY=cf_res_live_... npx tsx scripts/seed-codefast-packages.ts
 *
 * Fiyat: satış = alış × MARKUP (alış = CF liste × 0,90). MARKUP=5 (Ufuk kararı, 1:1 değil).
 *        Admin panelden paket başına değiştirilebilir; ON CONFLICT fiyat_tl'ye DOKUNMAZ
 *        (sadece İLK oluşturmada yazar) → sonraki re-run admin marjını korur.
 *
 * Ürünler: Codex + Gemini (TIER-1: modeller yzapi'de VAR, hazır) +
 *   GLM/Composer/Grok/Kimi/NVIDIA (TIER-2: yzapi'de YOK → added_models + 'codefast' profili).
 *
 * DORMANT KURULUM (ADR-tarzı "inert deploy"): TIER-2 added_models + codefast profili
 *   enabled=FALSE, TÜM paketler satista=FALSE. Hiçbir şey görünmez/satılmaz. CF proxy
 *   aktive olunca + model id'leri /proxy/<slug>/v1/models ile DOĞRULANINCA:
 *     1) added_models.enabled=true  2) provider_profiles['codefast'].enabled=true
 *     3) packages.satista=true (admin "Satışa Aç")
 *
 * ⚠️ TIER-2 model id'leri açıklama-bazlı TAHMİN (VERIFY işaretli) — CF proxy açılınca kesinleştir.
 */
import { dbSql } from "../src/server/db/client.js";
import { encryptApiKey } from "../src/server/services/api-key-service.js";

const MARKUP = 5;
const alis = (listTl: number) => Math.round(listTl * 0.9 * 100) / 100;
const satis = (listTl: number) => Math.round(listTl * 0.9 * MARKUP * 100) / 100;

interface Prod {
  id: string; ad: string; cfCatalogId: string; cfApiSlug: string;
  listTl: number; gunluk: number; sureGun: number; manual: boolean;
  tier2: boolean; models: string[]; modelsVerified: boolean;
}

const PRODUCTS: Prod[] = [
  // ── TIER-1 (modeller yzapi'de VAR, id'ler doğrulandı) ──
  { id: "cf-codex", ad: "CodeFast Codex (GPT-5.5/5.4) — Aylık", cfCatalogId: "e8c13011-6ea3-41d5-8bfe-dee06caf0f30", cfApiSlug: "codex-api",
    listTl: 1150, gunluk: 500, sureGun: 30, manual: false, tier2: false, modelsVerified: true,
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.2"] },
  { id: "cf-gemini", ad: "CodeFast Gemini (3.1 Pro / 3 Flash) — Aylık", cfCatalogId: "d72359d6-2208-4bb8-9c47-d7bed8e35f49", cfApiSlug: "gemini-api",
    listTl: 500, gunluk: 500, sureGun: 30, manual: false, tier2: false, modelsVerified: true,
    models: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"] },
  // ── TIER-2 (yzapi'de YOK → added_models + codefast profili; id'ler VERIFY) ──
  { id: "cf-glm", ad: "CodeFast GLM (5.1/5-turbo/4.7) — Aylık", cfCatalogId: "02bd32b5-7f1b-4ab3-83c7-3a57dc3c71b5", cfApiSlug: "glm-api",
    listTl: 600, gunluk: 750, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: ["glm-5.1", "glm-5-turbo", "glm-4.7", "glm-4.5-air"] },
  { id: "cf-composer", ad: "CodeFast Composer 2.5 Fast — Aylık", cfCatalogId: "12e78870-bf25-417d-a41f-18ce43576379", cfApiSlug: "composer-api",
    listTl: 1500, gunluk: 500, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: ["composer-2.5-fast"] },
  { id: "cf-grok", ad: "CodeFast Grok — Aylık", cfCatalogId: "a2cf1570-7d1b-4f8d-a67f-40245935e43e", cfApiSlug: "grok-api",
    listTl: 500, gunluk: 500, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: ["grok-4", "grok-3"] }, // VERIFY: CF Grok wire id'leri
  { id: "cf-kimi", ad: "CodeFast Sınırsız Kimi K2.6 — Aylık", cfCatalogId: "720376e2-bd07-4fe4-9cc1-25b084c38cdd", cfApiSlug: "kimi-k2-6-api",
    listTl: 900, gunluk: 100000, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: ["kimi-k2.6"] },
  { id: "cf-nvidia", ad: "CodeFast NVIDIA (Bedava) — Aylık", cfCatalogId: "fdb8ce1b-9114-4945-b331-6f948d8681ce", cfApiSlug: "nvidia-api",
    listTl: 0, gunluk: 1500, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: ["deepseek-v4-flash", "kimi-k2.6", "step-3.7-flash", "glm-5.1", "nemotron-3-ultra-550b", "minimax-m2.7"] }, // VERIFY
];

// TIER-2 modellerinin gösterim adları (added_models.name).
const MODEL_NAMES: Record<string, string> = {
  "glm-5.1": "GLM 5.1", "glm-5-turbo": "GLM 5 Turbo", "glm-4.7": "GLM 4.7", "glm-4.5-air": "GLM 4.5 Air",
  "composer-2.5-fast": "Composer 2.5 Fast", "grok-4": "Grok 4", "grok-3": "Grok 3", "kimi-k2.6": "Kimi K2.6",
  "deepseek-v4-flash": "DeepSeek V4 Flash", "step-3.7-flash": "Step 3.7 Flash",
  "nemotron-3-ultra-550b": "Nemotron 3 Ultra 550B", "minimax-m2.7": "MiniMax M2.7",
};

async function upsertPackage(p: Prod) {
  await dbSql`
    INSERT INTO packages
      (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models,
       fiyat_tl, enabled, satista, cf_catalog_id, cf_api_slug, cf_manual, cf_reseller_cost_tl)
    VALUES
      (${p.id}, ${p.ad}, 'CodeFast', ${p.ad}, 'request_limit', ${p.gunluk}, ${p.sureGun},
       ${JSON.stringify(p.models)}::jsonb, ${satis(p.listTl)}, true, false,
       ${p.cfCatalogId}, ${p.cfApiSlug}, ${p.manual}, ${alis(p.listTl)})
    ON CONFLICT (id) DO UPDATE SET
      ad = EXCLUDED.ad, aciklama = EXCLUDED.aciklama, allowed_models = EXCLUDED.allowed_models,
      gunluk_istek_limiti = EXCLUDED.gunluk_istek_limiti, sure_gun = EXCLUDED.sure_gun,
      cf_catalog_id = EXCLUDED.cf_catalog_id, cf_api_slug = EXCLUDED.cf_api_slug,
      cf_manual = EXCLUDED.cf_manual, cf_reseller_cost_tl = EXCLUDED.cf_reseller_cost_tl, updated_at = now()
      -- KASITLI: fiyat_tl/satista/enabled DOKUNULMAZ (admin marjı + lansman durumu korunur)
  `;
  console.log(`  ✓ ${p.id.padEnd(12)} alış ₺${alis(p.listTl)}  satış ₺${satis(p.listTl)} (5x)  ${p.tier2 ? "TIER2" : "ready"}${p.modelsVerified ? "" : " ⚠VERIFY-ids"}`);
}

async function seedTier2Models() {
  const tier2 = PRODUCTS.filter((p) => p.tier2);
  const allModels = [...new Set(tier2.flatMap((p) => p.models))];
  // added_models (enabled=FALSE — CF proxy + id-doğrulamasına dek gizli)
  for (const mid of allModels) {
    await dbSql`
      INSERT INTO added_models (model_id, name, provider_label, input_usd, output_usd, type, image_price_usd, enabled)
      VALUES (${mid}, ${MODEL_NAMES[mid] ?? mid}, 'CodeFast', 0, 0, 'Metin', 0, false)
      ON CONFLICT (model_id) DO UPDATE SET name = EXCLUDED.name, provider_label = EXCLUDED.provider_label, updated_at = now()
      -- enabled'a DOKUNMA (yanlışlıkla açmayı önle)
    `;
  }
  // 'codefast' provider profili (enabled=FALSE) — yalnız 404-gate için katalog üyeliği;
  // gerçek trafik entitlement override-chain ile /proxy/<slug>'a gider, PAYG package-only guard'la engellenir.
  const cipher = encryptApiKey("codefast-catalog-placeholder-unused");
  await dbSql`
    INSERT INTO provider_profiles (id, label, base_url, api_key_cipher, enabled, supported_model_ids, model_map, fallback_provider_id)
    VALUES ('codefast', 'CodeFast (katalog)', 'https://reseller-api.codefast.app', ${cipher}, false,
            ${JSON.stringify(allModels)}::jsonb, '{}'::jsonb, NULL)
    ON CONFLICT (id) DO UPDATE SET
      supported_model_ids = EXCLUDED.supported_model_ids, base_url = EXCLUDED.base_url, updated_at = now()
      -- enabled'a DOKUNMA
  `;
  console.log(`  ✓ added_models (${allModels.length}, enabled=false) + provider_profiles['codefast'] (enabled=false)`);
}

async function main() {
  console.log("CodeFast AYLIK paketleri seed ediliyor (satış = alış × 5, dormant)...");
  await seedTier2Models();
  for (const p of PRODUCTS) await upsertPackage(p);
  console.log("\nTAMAM (hepsi DORMANT). Aktive sırası (CF proxy + id-doğrulama sonrası):");
  console.log("  1) TIER-2 id'lerini /proxy/<slug>/v1/models ile DOĞRULA, yanlışları düzelt+re-seed");
  console.log("  2) UPDATE added_models SET enabled=true WHERE provider_label='CodeFast'");
  console.log("  3) UPDATE provider_profiles SET enabled=true WHERE id='codefast'");
  console.log("  4) Admin panel → ilgili paketleri 'Satışa Aç' (satista=true)");
  process.exit(0);
}

main().catch((e) => { console.error("seed-codefast-packages FAILED:", e); process.exit(1); });
