/**
 * Custom Package Builder şablonlarını seed eder — her ürün ailesi için BİR configurable
 * template paketi (is_configurable=true, birim-maliyet + birim-tipi + min/max). Mevcut sabit
 * paketler (cf-codex, cf-codex-500-1g, …) DURUR; bunlar builder'ın okuduğu ayrı şablonlardır.
 *
 * Çalıştırma (SUNUCUDA — deploy çalıştırmaz; NODE_ENV ŞART):
 *   NODE_ENV=production npx tsx scripts/seed-custom-builder-fields.ts
 *
 * Birim maliyet (cf_unit_cost_tl) = CF base_price / base_limit / 30 × 0.90  (TL/birim/gün;
 * lifetime'da /30 yok → TL/birim). 2026-06-18 CF quote ile doğrulandı (doğrusal).
 * NVIDIA maliyeti 0 → birim_satis_override_tl (sabit birim-satış; 750₺ ÷ (1000×30) = 0.025/istek/gün).
 *
 * Şablonlar mevcut base paketten klonlanır (allowed_models / cf_catalog_id / cf_api_slug / kategori).
 * cf_template_id = NULL (items akışı: order limit_amount + duration_days ile gider).
 */
import { dbSql } from "../src/server/db/client.js";

interface Tmpl {
  id: string; clone: string; adBase: string; unitCost: number;
  birim: "istek" | "kredi" | "lifetime" | "sabit";
  maxLimit: number; maxDays: number | null; satisOverride?: number;
}

// clone = kopyalanacak mevcut base paket id'si (allowed_models/cf_catalog_id/cf_api_slug/kategori ondan gelir)
// adBase = builder şablon adı (açıkça verilir; regex edge-case'i yok). Ad = adBase + " — Kendin Yap".
const TEMPLATES: Tmpl[] = [
  { id: "cf-codex-builder",        clone: "cf-codex",         adBase: "Codex (GPT-5.5/5.4)",      unitCost: 0.069, birim: "istek",    maxLimit: 5000, maxDays: 90 },
  { id: "cf-gemini-builder",       clone: "cf-gemini",        adBase: "Gemini (3.1 Pro / 3 Flash)", unitCost: 0.030, birim: "istek",  maxLimit: 5000, maxDays: 90 },
  { id: "cf-grok-builder",         clone: "cf-grok",          adBase: "Grok (4.3 / 4.20 / 3-mini)", unitCost: 0.030, birim: "istek",  maxLimit: 5000, maxDays: 90 },
  { id: "cf-composer-builder",     clone: "cf-composer",      adBase: "Composer 2.5 Fast",        unitCost: 0.090, birim: "istek",    maxLimit: 5000, maxDays: 90 },
  { id: "cf-glm-builder",          clone: "cf-glm",           adBase: "GLM (5.1/5-turbo/4.7)",     unitCost: 0.024, birim: "istek",    maxLimit: 5000, maxDays: 90 },
  { id: "cf-gpt-image-2-builder",  clone: "cf-gpt-image-2",   adBase: "GPT Image 2 Studio",        unitCost: 0.450, birim: "kredi",    maxLimit: 500,  maxDays: 90 },
  { id: "cf-grok-imagine-builder", clone: "cf-grok-imagine",  adBase: "Grok Imagine Studio",       unitCost: 0.150, birim: "kredi",    maxLimit: 500,  maxDays: 90 },
  { id: "cf-opensource-builder",   clone: "cf-opensource",    adBase: "Open Source API",           unitCost: 0.900, birim: "lifetime", maxLimit: 5000, maxDays: null },
  { id: "cf-kimi-k27-code-builder",clone: "cf-kimi-k27-code", adBase: "Kimi K2.7 Code",            unitCost: 0.900, birim: "lifetime", maxLimit: 5000, maxDays: null },
  { id: "cf-nvidia-builder",       clone: "cf-nvidia",        adBase: "NVIDIA",                    unitCost: 0,     birim: "sabit",    maxLimit: 5000, maxDays: 90, satisOverride: 0.025 },
];

async function upsert(t: Tmpl) {
  const ad = `${t.adBase} — Kendin Yap`;
  await dbSql`
    INSERT INTO packages
      (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models,
       fiyat_tl, enabled, satista, is_configurable, min_gunluk_istek, max_gunluk_istek,
       min_sure_gun, max_sure_gun, cf_catalog_id, cf_api_slug, cf_manual, cf_template_id,
       cf_unit_cost_tl, birim_tipi, birim_satis_override_tl)
    SELECT
      ${t.id},
      ${ad},
      kategori,
      ${ad},
      'request_limit',
      ${t.birim === "lifetime" ? t.maxLimit : 500},
      ${t.maxDays ?? 30},
      allowed_models,
      0, true, false, true,
      50, ${t.maxLimit},
      ${t.maxDays === null ? null : 1}, ${t.maxDays},
      cf_catalog_id, cf_api_slug, cf_manual, NULL,
      ${t.unitCost}, ${t.birim}, ${t.satisOverride ?? null}
    FROM packages WHERE id = ${t.clone}
    ON CONFLICT (id) DO UPDATE SET
      cf_unit_cost_tl = EXCLUDED.cf_unit_cost_tl, birim_tipi = EXCLUDED.birim_tipi,
      birim_satis_override_tl = EXCLUDED.birim_satis_override_tl,
      is_configurable = true, min_gunluk_istek = EXCLUDED.min_gunluk_istek,
      max_gunluk_istek = EXCLUDED.max_gunluk_istek, min_sure_gun = EXCLUDED.min_sure_gun,
      max_sure_gun = EXCLUDED.max_sure_gun, allowed_models = EXCLUDED.allowed_models,
      cf_catalog_id = EXCLUDED.cf_catalog_id, cf_api_slug = EXCLUDED.cf_api_slug, updated_at = now()
  `;
  console.log(`  ✓ ${t.id.padEnd(26)} birim=${t.birim} maliyet=${t.unitCost}/birim ${t.maxDays ? "günlük" : "lifetime"}`);
}

async function main() {
  console.log("Custom builder şablonları seed ediliyor (configurable, dormant)...");
  for (const t of TEMPLATES) await upsert(t);
  console.log("\nTAMAM. Hepsi enabled=true, satista=false (vitrine çıkana dek gizli satılamaz).");
  console.log("Aktive: admin → ilgili builder şablonlarını 'Satışa Aç' (satista=true).");
  process.exit(0);
}
main().catch((e) => { console.error("seed-custom-builder-fields FAILED:", e); process.exit(1); });
