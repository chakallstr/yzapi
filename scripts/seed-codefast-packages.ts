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
 * MODEL ID DOĞRULAMA (2026-06-15, CF proxy açıldıktan sonra canlı + katalog metadata ile):
 *   ✓ codex/gemini (T1): order+proxy çalışıyor — lansman-hazır.
 *   ✓ composer: katalog public_model_id="composer-2.5-fast" (upstream "grok-composer-2.5-fast").
 *   ✓ kimi: canlı /proxy/kimi-k2-6-api/v1/models = ["kimi-k2.6"] (tam eşleşme).
 *   ✓ nvidia: gerçek id'ler NAMESPACE'li (z-ai/…, nvidia/…) — aşağıda düzeltildi; canlı + katalog example_models ile doğrulandı.
 *   ✓ glm + grok (2026-06-16, CF worker bug'ı DÜZELDİKTEN sonra): order 201 + proxy doğrulandı.
 *      glm: /proxy/glm-api/v1/models = [glm-4.5, glm-4.5-air, glm-4.6, glm-4.7, glm-5, glm-5-turbo, glm-5.1]
 *           (seed'deki 4 id bu listede VAR → doğru). grok: 8 grok-family id chat'te 200 OK → seed grok-4/grok-3
 *           YANLIŞTI, gerçeklerle değiştirildi (grok-4.3 / grok-4.20-0309-(non-)reasoning / grok-3-mini(-fast)).
 *      (Eski not: 16-06 öncesi glm/grok order'ı 500 "Unexpected reseller worker error" veriyordu — CF düzeltti.)
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
  satisTl?: number; // düz satış fiyatı override (liste×5 yerine — ör. NVIDIA bedava ama ücretli satılır)
}

const PRODUCTS: Prod[] = [
  // ── TIER-1 (modeller yzapi'de VAR, id'ler doğrulandı) ──
  { id: "cf-codex", ad: "Codex (GPT-5.5/5.4) — Aylık", cfCatalogId: "e8c13011-6ea3-41d5-8bfe-dee06caf0f30", cfApiSlug: "codex-api",
    listTl: 1150, gunluk: 500, sureGun: 30, manual: false, tier2: false, modelsVerified: true,
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.2"] },
  { id: "cf-gemini", ad: "Gemini (3.1 Pro / 3 Flash) — Aylık", cfCatalogId: "d72359d6-2208-4bb8-9c47-d7bed8e35f49", cfApiSlug: "gemini-api",
    listTl: 500, gunluk: 500, sureGun: 30, manual: false, tier2: false, modelsVerified: true,
    models: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"] },
  // ── TIER-2 (yzapi'de YOK → added_models + codefast profili; id'ler VERIFY) ──
  { id: "cf-glm", ad: "GLM (5.1/5-turbo/4.7) — Aylık", cfCatalogId: "02bd32b5-7f1b-4ab3-83c7-3a57dc3c71b5", cfApiSlug: "glm-api",
    listTl: 600, gunluk: 750, sureGun: 30, manual: false, tier2: true, modelsVerified: true,
    models: ["glm-5.1", "glm-5-turbo", "glm-4.7", "glm-4.5-air"] }, // ✓ canlı /proxy/glm-api/v1/models (2026-06-16)
  { id: "cf-composer", ad: "Composer 2.5 Fast — Aylık", cfCatalogId: "12e78870-bf25-417d-a41f-18ce43576379", cfApiSlug: "composer-api",
    listTl: 1500, gunluk: 500, sureGun: 30, manual: false, tier2: true, modelsVerified: true,
    models: ["composer-2.5-fast"] }, // ✓ katalog public_model_id (2026-06-15)
  { id: "cf-grok", ad: "Grok (4.3 / 4.20 / 3-mini) — Aylık", cfCatalogId: "a2cf1570-7d1b-4f8d-a67f-40245935e43e", cfApiSlug: "grok-api",
    listTl: 500, gunluk: 500, sureGun: 30, manual: false, tier2: true, modelsVerified: true,
    // ✓ 2026-06-16 canlı: 8 grok-family id chat 200; seed grok-4/grok-3 (mevcut değildi) gerçeklerle değiştirildi
    models: ["grok-4.3", "grok-4.20-0309-reasoning", "grok-4.20-0309-non-reasoning", "grok-3-mini", "grok-3-mini-fast"] },
  { id: "cf-kimi", ad: "Sınırsız Kimi K2.6 — Aylık", cfCatalogId: "720376e2-bd07-4fe4-9cc1-25b084c38cdd", cfApiSlug: "kimi-k2-6-api",
    listTl: 900, gunluk: 100000, sureGun: 30, manual: false, tier2: true, modelsVerified: true,
    models: ["kimi-k2.6"] }, // ✓ canlı /proxy/kimi-k2-6-api/v1/models (2026-06-15)
  // NVIDIA: CF maliyeti 0 (bedava) ama ücretli satılır (Ufuk 2026-06-16): günlük 30₺ / aylık 750₺, 1000 istek/gün.
  { id: "cf-nvidia", ad: "NVIDIA Aylık", cfCatalogId: "fdb8ce1b-9114-4945-b331-6f948d8681ce", cfApiSlug: "nvidia-api",
    listTl: 0, gunluk: 1000, sureGun: 30, manual: false, tier2: true, modelsVerified: true, satisTl: 750,
    // ✓ canlı /proxy/nvidia-api/v1/models + katalog example_models (2026-06-15) — NAMESPACE'li gerçek id'ler
    models: ["deepseek-ai/deepseek-v4-flash", "moonshotai/kimi-k2.6", "stepfun-ai/step-3.7-flash", "z-ai/glm-5.1", "nvidia/nemotron-3-ultra-550b-a55b", "minimaxai/minimax-m2.7"] },
  { id: "cf-nvidia-gunluk", ad: "NVIDIA Günlük", cfCatalogId: "fdb8ce1b-9114-4945-b331-6f948d8681ce", cfApiSlug: "nvidia-api",
    listTl: 0, gunluk: 1000, sureGun: 1, manual: false, tier2: true, modelsVerified: true, satisTl: 30,
    models: ["deepseek-ai/deepseek-v4-flash", "moonshotai/kimi-k2.6", "stepfun-ai/step-3.7-flash", "z-ai/glm-5.1", "nvidia/nemotron-3-ultra-550b-a55b", "minimaxai/minimax-m2.7"] },
  // ── DORMANT PLACEHOLDER (2026-06-16, Ufuk "seedleri oluştur") — items[] akışı (template YOK, cfCatalogId ile order) ──
  // ⚠️ Bunlar kanıtlanmamış: balance-tipi (Open Source/Kimi) request_limit modeline gunluk=limit ile sığdırıldı;
  //    görsel stüdyolar (GPT Image 2/Grok Imagine) CF görsel-proxy yolu HENÜZ test edilmedi. Hepsi satista=false.
  //    Aktive etmeden ÖNCE: gerçek model id'lerini /proxy/<slug>/v1/models ile DOĞRULA (modelsVerified=false olanlar).
  { id: "cf-opensource", ad: "Open Source API (Bakiye)", cfCatalogId: "604e5207-084f-44cb-a3f8-f432ddb9d5b5", cfApiSlug: "open-source-api",
    listTl: 500, gunluk: 500, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: [] }, // ⚠️ katalog example_models=null → model id'leri VERIFY-bekler (bakiye-tipi: limit=500 TL/ömür)
  { id: "cf-kimi-k27-code", ad: "Kimi K2.7 Code (Bakiye)", cfCatalogId: "d306f9ef-acfc-483a-a369-71fb0db71324", cfApiSlug: "kimi-k2-7-code-api",
    listTl: 500, gunluk: 500, sureGun: 30, manual: false, tier2: true, modelsVerified: true,
    models: ["kimi-k2.7-code"] }, // ✓ katalog public_model_id="kimi-k2.7-code" (bakiye-tipi: limit=500 TL/ömür)
  { id: "cf-gpt-image-2", ad: "GPT Image 2 Studio (Görsel)", cfCatalogId: "7494a9ba-4dbf-4266-bf99-77d6ba709247", cfApiSlug: "gpt-image-2-studio",
    listTl: 1200, gunluk: 80, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: [] }, // ⚠️ GÖRSEL üretim (80/gün); CF görsel-proxy yolu test edilmedi → model id'leri VERIFY-bekler
  { id: "cf-grok-imagine", ad: "Grok Imagine Studio (Görsel)", cfCatalogId: "cb9a89c8-1057-47f9-9ff4-08295e9ad0b8", cfApiSlug: "grok-imagine-studio",
    listTl: 500, gunluk: 100, sureGun: 30, manual: false, tier2: true, modelsVerified: false,
    models: [] }, // ⚠️ GÖRSEL üretim (100 kredi/gün); CF görsel-proxy yolu test edilmedi → model id'leri VERIFY-bekler
];

// TIER-2 modellerinin gösterim adları (added_models.name).
const MODEL_NAMES: Record<string, string> = {
  // glm/grok/composer/kimi ürün id'leri
  "glm-5.1": "GLM 5.1", "glm-5-turbo": "GLM 5 Turbo", "glm-4.7": "GLM 4.7", "glm-4.5-air": "GLM 4.5 Air",
  "composer-2.5-fast": "Composer 2.5 Fast", "kimi-k2.6": "Kimi K2.6",
  "grok-4.3": "Grok 4.3", "grok-4.20-0309-reasoning": "Grok 4.20 (reasoning)",
  "grok-4.20-0309-non-reasoning": "Grok 4.20", "grok-3-mini": "Grok 3 Mini", "grok-3-mini-fast": "Grok 3 Mini Fast",
  "kimi-k2.7-code": "Kimi K2.7 Code",
  // nvidia ürünü — NAMESPACE'li gerçek id'ler (2026-06-15 canlı doğrulama)
  "deepseek-ai/deepseek-v4-flash": "DeepSeek V4 Flash", "moonshotai/kimi-k2.6": "Kimi K2.6",
  "stepfun-ai/step-3.7-flash": "Step 3.7 Flash", "z-ai/glm-5.1": "GLM 5.1",
  "nvidia/nemotron-3-ultra-550b-a55b": "Nemotron 3 Ultra 550B", "minimaxai/minimax-m2.7": "MiniMax M2.7",
};

// CF package-template id'leri (2026-06-16 API'den oluşturuldu; tek-ürünlü, seed konfigiyle: 30 gün).
// DOLU → provisioning order'ı template_id ile yapar (hibrit, commit 72ace0a); admin'den de değiştirilebilir.
// ⚠️ Bu id'ler reseller HESABINA özel (cix.crazy666@…); şablon silinir/yeniden oluşturulursa güncelle.
const CF_TEMPLATE_IDS: Record<string, string> = {
  "cf-codex": "61ac5f41-db26-4ff0-a1b4-d147b7724213",
  "cf-gemini": "208c6825-5db2-4241-95bc-1e05dbbb8294",
  "cf-glm": "bc639441-f252-415e-aa5f-dca1395a23a6",
  "cf-grok": "c5179ee7-1c71-47f0-bdfa-2d676efec400",
  "cf-composer": "699ca8cd-93ce-4f56-94c4-f229a84d31f9",
  "cf-kimi": "9b838e4d-956f-4719-805f-4843c74d7ef1",
  "cf-nvidia": "89583a03-12fc-455d-9934-3b53f25625aa",
  "cf-nvidia-gunluk": "89583a03-12fc-455d-9934-3b53f25625aa",
};

// Müşteri-görünür kategori (panel filtre çipi + kart rozeti). Model ailesine göre ayrılır.
// (Composer = grok-composer ailesi → Grok; görsel stüdyolar → Görsel Oluşturma.)
const CATEGORY: Record<string, string> = {
  "cf-codex": "GPT/Codex",
  "cf-gemini": "Gemini",
  "cf-glm": "GLM",
  "cf-composer": "Grok",
  "cf-grok": "Grok",
  "cf-kimi": "Kimi",
  "cf-kimi-k27-code": "Kimi",
  "cf-nvidia": "NVIDIA",
  "cf-nvidia-gunluk": "NVIDIA",
  "cf-gpt-image-2": "Görsel Oluşturma",
  "cf-grok-imagine": "Görsel Oluşturma",
  "cf-opensource": "Açık Kaynak",
};

async function upsertPackage(p: Prod) {
  await dbSql`
    INSERT INTO packages
      (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models,
       fiyat_tl, enabled, satista, cf_catalog_id, cf_api_slug, cf_manual, cf_reseller_cost_tl, cf_template_id)
    VALUES
      (${p.id}, ${p.ad}, ${CATEGORY[p.id] ?? 'YapayZekaLab'}, ${p.ad}, 'request_limit', ${p.gunluk}, ${p.sureGun},
       ${JSON.stringify(p.models)}::jsonb, ${p.satisTl ?? satis(p.listTl)}, true, false,
       ${p.cfCatalogId}, ${p.cfApiSlug}, ${p.manual}, ${alis(p.listTl)}, ${CF_TEMPLATE_IDS[p.id] ?? null})
    ON CONFLICT (id) DO UPDATE SET
      ad = EXCLUDED.ad, aciklama = EXCLUDED.aciklama, allowed_models = EXCLUDED.allowed_models,
      gunluk_istek_limiti = EXCLUDED.gunluk_istek_limiti, sure_gun = EXCLUDED.sure_gun,
      cf_catalog_id = EXCLUDED.cf_catalog_id, cf_api_slug = EXCLUDED.cf_api_slug,
      cf_manual = EXCLUDED.cf_manual, cf_reseller_cost_tl = EXCLUDED.cf_reseller_cost_tl,
      cf_template_id = EXCLUDED.cf_template_id, updated_at = now()
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
      VALUES (${mid}, ${MODEL_NAMES[mid] ?? mid}, 'YapayZekaLab', 0, 0, 'Metin', 0, false)
      ON CONFLICT (model_id) DO UPDATE SET name = EXCLUDED.name, provider_label = EXCLUDED.provider_label, updated_at = now()
      -- enabled'a DOKUNMA (yanlışlıkla açmayı önle)
    `;
  }
  // 'codefast' provider profili (enabled=FALSE) — yalnız 404-gate için katalog üyeliği;
  // gerçek trafik entitlement override-chain ile /proxy/<slug>'a gider, PAYG package-only guard'la engellenir.
  const cipher = encryptApiKey("codefast-catalog-placeholder-unused");
  await dbSql`
    INSERT INTO provider_profiles (id, label, base_url, api_key_cipher, enabled, supported_model_ids, model_map, fallback_provider_id)
    VALUES ('codefast', 'YapayZekaLab (katalog)', 'https://reseller-api.codefast.app', ${cipher}, false,
            ${JSON.stringify(allModels)}::jsonb, '{}'::jsonb, NULL)
    ON CONFLICT (id) DO UPDATE SET
      supported_model_ids = EXCLUDED.supported_model_ids, base_url = EXCLUDED.base_url, updated_at = now()
      -- enabled'a DOKUNMA
  `;
  console.log(`  ✓ added_models (${allModels.length}, enabled=false) + provider_profiles['codefast'] (enabled=false)`);
}

async function main() {
  console.log("YapayZekaLab (CodeFast reseller) AYLIK paketleri seed ediliyor (satış = alış × 5, dormant)...");
  await seedTier2Models();
  for (const p of PRODUCTS) await upsertPackage(p);
  console.log("\nTAMAM (hepsi DORMANT). Aktive sırası (CF proxy + id-doğrulama sonrası):");
  console.log("  1) TIER-2 id'lerini /proxy/<slug>/v1/models ile DOĞRULA, yanlışları düzelt+re-seed");
  console.log("  2) UPDATE added_models SET enabled=true WHERE provider_label='YapayZekaLab'");
  console.log("  3) UPDATE provider_profiles SET enabled=true WHERE id='codefast'");
  console.log("  4) Admin panel → ilgili paketleri 'Satışa Aç' (satista=true)");
  process.exit(0);
}

main().catch((e) => { console.error("seed-codefast-packages FAILED:", e); process.exit(1); });
