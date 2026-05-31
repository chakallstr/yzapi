import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
dotenv.config();

import * as schema from "./schema.js";

const {
  systemConfig,
  plans,
  providerDurumlari,
  announcements,
  addedModels,
} = schema;

// ── Metro yeni modelleri (additive katman) ──────────────────────────────────
// claude-opus-4.8 ve gemini-3.5-flash MASTER_MODELS'e EKLENMEZ (42-kilit korunur);
// added_models katmanından gelirler. Fiyatlar onaylı kilitli tablodan (USD/1M,
// input=output). added-model-service.addedModelToMasterModel bunları okuma anında
// type "Metin" + chat/messages uçlarıyla sentezler — burada sadece ham satır + id +
// fiyat tutulur, yeni fiyat matematiği yok. Yalnızca aktif sağlayıcı (metro) bu
// id'leri supported_model_ids ile listelediğinde görünür olurlar (Task 5).
const METRO_ADDED_MODELS = [
  { modelId: "claude-opus-4.8", name: "Claude Opus 4.8", providerLabel: "Anthropic", inputUsd: "1.40", outputUsd: "1.40" },
  { modelId: "gemini-3.5-flash", name: "Gemini 3.5 Flash", providerLabel: "Google", inputUsd: "0.90", outputUsd: "0.90" },
] as const;

// Idempotent seed: iki metro modelini added_models'a ekler (enabled=true). modelId
// primary key olduğundan onConflictDoNothing tekrar çalıştırmada no-op'tur; mevcut
// satırların fiyatını/etiketini EZMEZ.
export async function seedMetroAddedModels(db: PostgresJsDatabase<typeof schema>): Promise<void> {
  for (const m of METRO_ADDED_MODELS) {
    await db
      .insert(addedModels)
      .values({
        modelId: m.modelId,
        name: m.name,
        providerLabel: m.providerLabel,
        inputUsd: m.inputUsd,
        outputUsd: m.outputUsd,
        enabled: true,
      })
      .onConflictDoNothing();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log("Seeding database...");

  // ── system_config ────────────────────────────────────────────────────────────
  const existing = await db.select().from(systemConfig).where(eq(systemConfig.id, 1));
  if (existing.length === 0) {
    await db.insert(systemConfig).values({
      id: 1,
      kur: "47.084289",
      liveKur: "47.084289",
      kurBuffer: "0.03",
      kurSource: "manual",
      autoKurRefresh: false,
      kurRefreshIntervalDk: 60,
      lastKurRefresh: null,
      textCarpan: "3.0",
      imageCarpan: "3.0",
      videoCarpan: "3.0",
      platformAdi: "YapayZekaLab",
      destekEmail: "destek@yapayzekalab.com",
      paymentWhatsappNumber: process.env.PAYMENT_WHATSAPP_NUMBER ?? "",
      cryptoWalletEnabled: false,
      cryptoWalletAsset: process.env.CRYPTO_WALLET_ASSET ?? "USDT",
      cryptoWalletNetwork: process.env.CRYPTO_WALLET_NETWORK ?? "TRC20",
      cryptoWalletAddress: process.env.CRYPTO_WALLET_ADDRESS ?? "",
      cryptoWalletMemo: process.env.CRYPTO_WALLET_MEMO ?? "",
      maxBakiyeTL: "50000",
      minBakiyeTL: "250",
      anomaliEsikTL: "500",
    });
    console.log("  system_config inserted");
  } else {
    console.log("  system_config already exists, skipping");
  }

  // ── plans ─────────────────────────────────────────────────────────────────────
  const seedPlans = [
    {
      id: "ucretsiz",
      ad: "Ücretsiz",
      gunlukLimitTL: "5",
      aylikLimitTL: "50",
      izinliModeller: ["claude-haiku-4-5-20251001", "gpt-5.4-mini", "gemini-3.1-pro-preview"],
      aciklama: "Deneme ve düşük hacim için.",
    },
    {
      id: "gelistirici",
      ad: "Geliştirici",
      gunlukLimitTL: "50",
      aylikLimitTL: "500",
      izinliModeller: [],
      aciklama: "Tüm metin modelleri açık.",
    },
    {
      id: "pro",
      ad: "Pro",
      gunlukLimitTL: "1000",
      aylikLimitTL: "10000",
      izinliModeller: [],
      aciklama: "Tüm modeller + öncelikli routing.",
    },
    {
      id: "kurumsal",
      ad: "Kurumsal",
      gunlukLimitTL: null,
      aylikLimitTL: null,
      izinliModeller: [],
      aciklama: "Limitsiz kurumsal.",
    },
  ] as const;

  for (const plan of seedPlans) {
    await db
      .insert(plans)
      .values({ ...plan, izinliModeller: plan.izinliModeller })
      .onConflictDoNothing();
  }
  console.log("  plans upserted");

  console.log("  users skipped");

  // ── provider_durumlari ────────────────────────────────────────────────────────
  const seedProviders = [
    { provider: "Anthropic", durum: "aktif", gecikmeMs: 312, sonKontrol: new Date(), not: "" },
    { provider: "OpenAI", durum: "aktif", gecikmeMs: 280, sonKontrol: new Date(), not: "" },
    { provider: "Google", durum: "aktif", gecikmeMs: 195, sonKontrol: new Date(), not: "" },
    { provider: "DeepSeek", durum: "yavas", gecikmeMs: 890, sonKontrol: new Date(), not: "Yoğunluk nedeniyle yavaş" },
    { provider: "Moonshot", durum: "aktif", gecikmeMs: 420, sonKontrol: new Date(), not: "" },
  ];

  for (const p of seedProviders) {
    await db.insert(providerDurumlari).values(p).onConflictDoNothing();
  }
  console.log("  provider_durumlari upserted");

  // ── announcements ─────────────────────────────────────────────────────────────
  await db
    .insert(announcements)
    .values({
      id: "00000000-0000-0000-0000-000000000010",
      mesaj: "YapayZekaLab'e hoş geldiniz! Tüm yeni modeller aktif.",
      tip: "bilgi",
      aktif: true,
      baslangic: new Date("2026-05-01T00:00:00Z"),
      bitis: new Date("2026-06-01T00:00:00Z"),
    })
    .onConflictDoNothing();
  console.log("  announcements upserted");

  // ── added_models (metro yeni modelleri) ─────────────────────────────────────
  await seedMetroAddedModels(db);
  console.log("  added_models (metro) upserted");

  console.log("  api_keys skipped");
  console.log("  transactions skipped");

  console.log("Seed complete.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
