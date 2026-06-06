// seed-packages-trial.ts
// ─────────────────────────────────────────────────────────────────────────────
// Her 500-istek/gün API paketine bir "50 deneme" paketi ekler:
//   - 50 istek / gün, MAX 1 GÜN (sureGun = 1) — uzatma YOK, süre bitince erişim kapanır
//   - kategori "Deneme" → panelde ayrı filtre + 🔑 rozeti
//   - ₺0 = YALNIZ KOD/ANAHTAR ile verilir (doğrudan satın alınamaz). purchasePackageWithBalance
//     ₺0 paketleri reddeder; grant yalnız redeem-code (grantPackageEntitlement) ile olur.
//   - allowedModels = ana paketle aynı.
//
// ⚠️ Dağıtım: redeem_codes (tip=package, packageId=<deneme>). Tekrar-deneme'yi önlemek için
//   kodu PER_USER_ONCE üret (Faz2). Böylece "1 gün, daha fazla yok" garanti.
//
// Idempotent UPSERT: tekrar çalıştırınca süre/limit/açıklamayı GÜNCELLER (30→1 düzeltmesi gibi).
// Çalıştırma (dev): npx tsx scripts/seed-packages-trial.ts
// ─────────────────────────────────────────────────────────────────────────────

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { db, dbSql } from "../src/server/db/client.js";
import { packages } from "../src/server/db/schema.js";

const TRIAL_DAILY = 50;
const TRIAL_DAYS = 1; // max 1 gün — uzatma yok, deneme bitince abonelik biter

interface TrialPackage {
  id: string;
  ad: string;
  allowedModels: string[];
  displayOrder: number;
  note: string;
}

// Yalnız 500-istek/gün paketler (Codex, Gemini, Grok). GLM 750'lik — istenirse eklenir.
const TRIALS: TrialPackage[] = [
  {
    id: "codex-api-trial",
    ad: "Codex API — 50 Deneme",
    allowedModels: ["gpt-5.5", "gpt-5.4", "gpt-5.3-chat-latest", "gpt-5.2"],
    displayOrder: 1,
    note: "gpt-5.5 / 5.4 / 5.3 / 5.2",
  },
  {
    id: "gemini-api-trial",
    ad: "Gemini API — 50 Deneme",
    allowedModels: ["gemini-3-flash-preview", "gemini-3.1-pro-preview"],
    displayOrder: 2,
    note: "gemini-3-flash / 3.1-pro",
  },
  {
    id: "grok-api-trial",
    ad: "Grok API — 50 Deneme",
    allowedModels: ["grok-4", "grok-3"],
    displayOrder: 3,
    note: "grok-4 / grok-3 (iskele — upstream gerekir)",
  },
];

async function main() {
  for (const tr of TRIALS) {
    const aciklama = `50 istek/gün, ${TRIAL_DAYS} gün deneme (${tr.note}). Yalnız kod/anahtar ile verilir; süre bitince erişim kapanır (uzatma yok).`;
    const common = {
      ad: tr.ad,
      kategori: "Deneme",
      aciklama,
      tip: "request_limit" as const,
      gunlukIstekLimiti: TRIAL_DAILY,
      sureGun: TRIAL_DAYS,
      allowedModels: tr.allowedModels,
      fiyatTL: "0",
      fiyatUsd: null,
      enabled: true,
      displayOrder: tr.displayOrder,
    };
    await db
      .insert(packages)
      .values({ id: tr.id, ...common })
      .onConflictDoUpdate({ target: packages.id, set: { ...common, updatedAt: new Date() } });
    console.log(`✓ ${tr.id.padEnd(20)} ${TRIAL_DAILY}/gün · ${TRIAL_DAYS} gün · anahtar ile (₺0)`);
  }
  console.log(`\nÖzet: ${TRIALS.length} deneme paketi (max ${TRIAL_DAYS} gün, kod-ile) yazıldı/güncellendi.`);
  console.log("⚠️  Dağıtım: redeem_codes tip=package + per_user_once → tekrar-deneme engellenir.");
  await dbSql.end();
}

main().catch((err) => {
  console.error("seed-packages-trial HATA:", err);
  process.exit(1);
});
