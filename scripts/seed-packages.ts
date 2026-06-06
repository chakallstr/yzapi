// seed-packages.ts
// ─────────────────────────────────────────────────────────────────────────────
// CodeFast referans paketlerini (docs/research/codefast-inventory.md) yzapi
// `packages` tablosuna basar. SADECE sistemimizin DESTEKLEDİĞİ paketler:
//   - tip = request_limit | account_delivery (token_bundle/studio tip'i YOK → AppError 400)
//   - allowedModels = yalnız KATALOĞUMUZDA olan modeller (Grok/GLM/görsel modeli YOK)
// Idempotent: id çakışırsa atlanır (onConflictDoNothing) — mevcut fiyatı EZMEZ.
//
// Çalıştırma (dev):       npx tsx scripts/seed-packages.ts
// Çalıştırma (prod):      ENV_FILE_PATH=.env.production NODE_ENV=production npx tsx scripts/seed-packages.ts
//
// EKLENMEYENLER (ve nedeni) — bilerek dışarıda:
//   - Claude Max API   → tip=token_bundle DESTEKLENMİYOR (backend AppError 400)
//   - GPT Image 2 / Grok Imagine Studio → görsel modeli kataloğumuzda yok (Faz4a görsel
//                        added_models seed'lenmemiş); eklenince request_limit olarak girer
//   - Grok API / GLM API → yzapi'de Grok/GLM sağlayıcısı/modeli HİÇ yok
// ─────────────────────────────────────────────────────────────────────────────

import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { db, dbSql } from "../src/server/db/client.js";
import { packages } from "../src/server/db/schema.js";

interface SeedPackage {
  id: string;
  ad: string;
  kategori: string;
  aciklama: string;
  tip: "request_limit" | "account_delivery";
  gunlukIstekLimiti: number;
  sureGun: number;
  allowedModels: string[];
  fiyatTL: number;
  fiyatUsd?: number | null;
  displayOrder: number;
}

// Fiyatlar CodeFast envanterinden (TL). Modeller /v1/models kataloğundan doğrulandı.
const PACKAGES: SeedPackage[] = [
  // ── request_limit (modelleri kataloğumuzda VAR) ──────────────────────────────
  {
    id: "codex-api",
    ad: "Codex API (ChatGPT)",
    kategori: "GPT/Codex",
    aciklama:
      "gpt-5.5, gpt-5.4, gpt-5.3 ve gpt-5.2 modelleri (Responses API uyumlu, Codex CLI). Günde 500 istek, 1 gün erişim.",
    tip: "request_limit",
    gunlukIstekLimiti: 500,
    sureGun: 1,
    allowedModels: ["gpt-5.5", "gpt-5.4", "gpt-5.3-chat-latest", "gpt-5.2"],
    fiyatTL: 38.33,
    displayOrder: 10,
  },
  {
    id: "gemini-api",
    ad: "Gemini API",
    kategori: "Gemini",
    aciklama:
      "gemini-3-flash-preview ve gemini-3.1-pro-preview modelleri. Günde 500 istek, 1 gün erişim.",
    tip: "request_limit",
    gunlukIstekLimiti: 500,
    sureGun: 1,
    allowedModels: ["gemini-3-flash-preview", "gemini-3.1-pro-preview"],
    fiyatTL: 16.67,
    displayOrder: 20,
  },

  // ── account_delivery (model gerektirmez; manuel WhatsApp teslim) ──────────────
  {
    id: "claude-team-seat",
    ad: "Claude Max 6.25x — Team Seat",
    kategori: "Claude",
    aciklama:
      "Kendi Claude hesabınıza resmi Team daveti (hesap paylaşımı yok). 30 gün. Satın alma sonrası WhatsApp üzerinden Gmail ile teslim.",
    tip: "account_delivery",
    gunlukIstekLimiti: 0,
    sureGun: 30,
    allowedModels: [],
    fiyatTL: 2068,
    displayOrder: 30,
  },
  {
    id: "google-ai-ultra",
    ad: "Google AI Ultra (Antigravity)",
    kategori: "Hesaplar",
    aciklama:
      "Google AI Ultra Business hesabı + Antigravity Ultra erişimi + 25.000 AI kredi. 7 gün. WhatsApp ile teslim.",
    tip: "account_delivery",
    gunlukIstekLimiti: 0,
    sureGun: 7,
    allowedModels: [],
    fiyatTL: 700,
    displayOrder: 40,
  },
  {
    id: "cursor-pro",
    ad: "Cursor Pro",
    kategori: "Hesaplar",
    aciklama:
      "1 ay geçerli Cursor Pro (Composer 2.5) aktivasyon kodu + Windows/Mac kurulum desteği. Normal ₺911 yerine.",
    tip: "account_delivery",
    gunlukIstekLimiti: 0,
    sureGun: 30,
    allowedModels: [],
    fiyatTL: 450,
    displayOrder: 50,
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const p of PACKAGES) {
    const res = await db
      .insert(packages)
      .values({
        id: p.id,
        ad: p.ad,
        kategori: p.kategori,
        aciklama: p.aciklama,
        tip: p.tip,
        gunlukIstekLimiti: p.gunlukIstekLimiti,
        sureGun: p.sureGun,
        allowedModels: p.allowedModels,
        fiyatTL: String(p.fiyatTL),
        fiyatUsd: p.fiyatUsd != null ? String(p.fiyatUsd) : null,
        enabled: true,
        displayOrder: p.displayOrder,
      })
      .onConflictDoNothing({ target: packages.id })
      .returning();
    if (res.length) {
      inserted++;
      console.log(`+ eklendi : ${p.id.padEnd(18)} ${p.tip.padEnd(16)} ₺${p.fiyatTL}`);
    } else {
      skipped++;
      console.log(`= zaten var: ${p.id}`);
    }
  }
  console.log(`\nÖzet: ${inserted} eklendi, ${skipped} atlandı (toplam ${PACKAGES.length}).`);
  await dbSql.end();
}

main().catch((err) => {
  console.error("seed-packages HATA:", err);
  process.exit(1);
});
