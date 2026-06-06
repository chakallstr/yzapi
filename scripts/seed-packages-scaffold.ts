// seed-packages-scaffold.ts
// ─────────────────────────────────────────────────────────────────────────────
// CodeFast'in KALAN paketlerini (Grok/GLM/görsel) yzapi'ye İSKELE olarak ekler:
//   1) eksik modelleri `added_models`'a (MASTER_MODELS 42-kilit additive katmanı)
//   2) paketleri `packages`'a (request_limit)
//
// ⚠️ BUNLAR UPSTREAM GEREKTİRİR — KULLANIMDA ÇALIŞMAZ (yalnız KATALOG/PANEL temsili):
//   - yzapi'de Grok/GLM sağlayıcısı YOK; görsel için dev'de upstream yok.
//   - Dev DB'de SIFIR provider profili olduğu için katalog "hepsini göster"
//     modunda → added_models satırları katalogda görünür (prod'da bu modelleri
//     bir provider profilinin supported_model_ids'ine koymak GEREKİR).
//   - Fiyatlar/model-id'ler PLACEHOLDER — gerçek upstream'e göre düzeltilmeli.
//   - Paketler request_limit (cost=0, kotadan düşer) → per-token fiyatı paket
//     billing'ini etkilemez; yalnız PAYG katalog gösteriminde görünür.
//
// PROD'A ALMADAN ÖNCE: ya gerçek Grok/GLM/görsel upstream provider profili bağla,
// ya da bu paketleri enabled=false yap. (Deploy zaten çift-onay arkasında.)
//
// Çalıştırma (dev): npx tsx scripts/seed-packages-scaffold.ts
// ─────────────────────────────────────────────────────────────────────────────

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { db, dbSql } from "../src/server/db/client.js";
import { addedModels, packages } from "../src/server/db/schema.js";

// ── 1) eksik modeller (added_models) ─────────────────────────────────────────
// type: "Metin" | "Görsel". Fiyatlar PLACEHOLDER (gerçek upstream'e göre düzelt).
interface SeedModel {
  modelId: string;
  name: string;
  providerLabel: string;
  inputUsd?: string;
  outputUsd?: string;
  type: "Metin" | "Görsel";
  imagePriceUsd?: string;
}

const MODELS: SeedModel[] = [
  // görsel (GPT Image 2 Studio / Grok Imagine Studio)
  { modelId: "gpt-image-2", name: "GPT Image 2", providerLabel: "OpenAI", type: "Görsel", imagePriceUsd: "0.04" },
  { modelId: "grok-imagine-image", name: "Grok Imagine", providerLabel: "xAI", type: "Görsel", imagePriceUsd: "0.02" },
  // Grok (Grok API) — model id/fiyat placeholder
  { modelId: "grok-4", name: "Grok 4", providerLabel: "xAI", inputUsd: "3.00", outputUsd: "15.00", type: "Metin" },
  { modelId: "grok-3", name: "Grok 3", providerLabel: "xAI", inputUsd: "3.00", outputUsd: "15.00", type: "Metin" },
  // GLM (GLM API) — CodeFast model id'leri, fiyat placeholder
  { modelId: "glm-5.1", name: "GLM 5.1", providerLabel: "Zhipu AI", inputUsd: "0.60", outputUsd: "2.20", type: "Metin" },
  { modelId: "glm-5-turbo", name: "GLM 5 Turbo", providerLabel: "Zhipu AI", inputUsd: "0.10", outputUsd: "0.30", type: "Metin" },
  { modelId: "glm-4.7", name: "GLM 4.7", providerLabel: "Zhipu AI", inputUsd: "0.60", outputUsd: "2.20", type: "Metin" },
  { modelId: "glm-4.5-air", name: "GLM 4.5 Air", providerLabel: "Zhipu AI", inputUsd: "0.20", outputUsd: "1.10", type: "Metin" },
];

// ── 2) paketler ──────────────────────────────────────────────────────────────
interface SeedPackage {
  id: string;
  ad: string;
  kategori: string;
  aciklama: string;
  gunlukIstekLimiti: number;
  sureGun: number;
  allowedModels: string[];
  fiyatTL: number;
  displayOrder: number;
}

const PACKAGES: SeedPackage[] = [
  {
    id: "gpt-image-2-studio",
    ad: "GPT Image 2 Studio",
    kategori: "Görsel Oluşturma",
    aciklama: "GPT Image 2 ile text-to-image / image-to-image üretimi. Günde 80 istek, 1 gün erişim.",
    gunlukIstekLimiti: 80,
    sureGun: 1,
    allowedModels: ["gpt-image-2"],
    fiyatTL: 40,
    displayOrder: 60,
  },
  {
    id: "grok-imagine-studio",
    ad: "Grok Imagine Studio",
    kategori: "Görsel Oluşturma",
    aciklama: "Grok Imagine görsel üretimi (text→image 1, image→image 2 kredi). Günde 100 kredi, 1 gün erişim.",
    gunlukIstekLimiti: 100,
    sureGun: 1,
    allowedModels: ["grok-imagine-image"],
    fiyatTL: 16.67,
    displayOrder: 70,
  },
  {
    id: "grok-api",
    ad: "Grok API",
    kategori: "Grok",
    aciklama: "Grok modelleri için OpenAI uyumlu chat/completions erişimi. Günde 500 istek, 1 gün erişim.",
    gunlukIstekLimiti: 500,
    sureGun: 1,
    allowedModels: ["grok-4", "grok-3"],
    fiyatTL: 16.67,
    displayOrder: 80,
  },
  {
    id: "glm-api",
    ad: "GLM API",
    kategori: "GLM",
    aciklama: "glm-5.1, glm-5-turbo, glm-4.7, glm-4.5-air kodlama odaklı modeller. Günde 750 istek, 1 gün erişim.",
    gunlukIstekLimiti: 750,
    sureGun: 1,
    allowedModels: ["glm-5.1", "glm-5-turbo", "glm-4.7", "glm-4.5-air"],
    fiyatTL: 20,
    displayOrder: 90,
  },
];

async function main() {
  console.log("── added_models (eksik modeller) ──");
  let mAdded = 0;
  for (const m of MODELS) {
    const res = await db
      .insert(addedModels)
      .values({
        modelId: m.modelId,
        name: m.name,
        providerLabel: m.providerLabel,
        inputUsd: m.inputUsd ?? "0",
        outputUsd: m.outputUsd ?? "0",
        type: m.type,
        imagePriceUsd: m.imagePriceUsd ?? "0",
        enabled: true,
      })
      .onConflictDoNothing({ target: addedModels.modelId })
      .returning();
    if (res.length) {
      mAdded++;
      console.log(`+ model: ${m.modelId.padEnd(20)} ${m.type}`);
    } else {
      console.log(`= model zaten var: ${m.modelId}`);
    }
  }

  console.log("\n── packages (iskele) ──");
  let pAdded = 0;
  for (const p of PACKAGES) {
    const res = await db
      .insert(packages)
      .values({
        id: p.id,
        ad: p.ad,
        kategori: p.kategori,
        aciklama: p.aciklama,
        tip: "request_limit",
        gunlukIstekLimiti: p.gunlukIstekLimiti,
        sureGun: p.sureGun,
        allowedModels: p.allowedModels,
        fiyatTL: String(p.fiyatTL),
        fiyatUsd: null,
        enabled: true,
        displayOrder: p.displayOrder,
      })
      .onConflictDoNothing({ target: packages.id })
      .returning();
    if (res.length) {
      pAdded++;
      console.log(`+ paket: ${p.id.padEnd(20)} ₺${p.fiyatTL}`);
    } else {
      console.log(`= paket zaten var: ${p.id}`);
    }
  }

  console.log(`\nÖzet: ${mAdded}/${MODELS.length} model, ${pAdded}/${PACKAGES.length} paket eklendi.`);
  console.log("⚠️  Bu paketler UPSTREAM GEREKTİRİR — kullanımda çalışmaz (katalog/panel temsili).");
  await dbSql.end();
}

main().catch((err) => {
  console.error("seed-packages-scaffold HATA:", err);
  process.exit(1);
});
