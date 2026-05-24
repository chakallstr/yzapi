import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
dotenv.config();

import * as schema from "./schema.js";

const {
  systemConfig,
  users,
  plans,
  providerDurumlari,
  announcements,
  apiKeys,
  transactions,
} = schema;

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
      textBillingRatio: "0.9",
      platformAdi: "YapayZekaLab",
      destekEmail: "destek@yapayzekalab.com",
      maxBakiyeTL: "50000",
      minBakiyeTL: "10",
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
      izinliModeller: ["anthropic/claude-haiku-4.5", "openai/gpt-5.4-mini", "google/gemini-3.1-flash-lite-preview"],
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
      gunlukLimitTL: "200",
      aylikLimitTL: "2000",
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

  // ── users ─────────────────────────────────────────────────────────────────────
  const seedUsers = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      email: "ali.yilmaz@ornek.com",
      adSoyad: "Ali Yılmaz",
      bakiyeTL: "250.50",
      toplamHarcamaTL: "892.30",
      toplamIstek: 1240,
      durum: "aktif",
      kayitTarihi: new Date("2026-01-15"),
      sonAktivite: new Date("2026-05-23T14:22:00Z"),
      plan: "gelistirici",
      apiKeyCount: 2,
      not: "",
      gunlukLimitTL: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      email: "zeynep.kaya@ornek.com",
      adSoyad: "Zeynep Kaya",
      bakiyeTL: "18.00",
      toplamHarcamaTL: "1240.00",
      toplamIstek: 3870,
      durum: "aktif",
      kayitTarihi: new Date("2026-02-08"),
      sonAktivite: new Date("2026-05-23T16:05:00Z"),
      plan: "pro",
      apiKeyCount: 3,
      not: "Aylık yükleme yapıyor",
      gunlukLimitTL: "50",
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      email: "mehmet.demir@ornek.com",
      adSoyad: "Mehmet Demir",
      bakiyeTL: "0",
      toplamHarcamaTL: "5.20",
      toplamIstek: 18,
      durum: "askida",
      kayitTarihi: new Date("2026-04-20"),
      sonAktivite: new Date("2026-05-01T09:10:00Z"),
      plan: "ucretsiz",
      apiKeyCount: 1,
      not: "Deneme aşamasında",
      gunlukLimitTL: "5",
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      email: "ayse.celik@firma.com",
      adSoyad: "Ayşe Çelik",
      bakiyeTL: "5000.00",
      toplamHarcamaTL: "12400.00",
      toplamIstek: 28900,
      durum: "aktif",
      kayitTarihi: new Date("2025-11-01"),
      sonAktivite: new Date("2026-05-23T17:48:00Z"),
      plan: "kurumsal",
      apiKeyCount: 8,
      not: "Kurumsal müşteri, öncelikli destek",
      gunlukLimitTL: null,
    },
  ];

  for (const user of seedUsers) {
    await db.insert(users).values(user).onConflictDoNothing();
  }
  console.log("  users upserted");

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

  // ── api_keys ──────────────────────────────────────────────────────────────────
  // NOTE (Phase B): These seed keys have keyHash=null and prefix="".
  // They are display-only and will NOT authenticate via the new api-key-auth middleware.
  // Real keys are created by users via POST /api/user/api-keys which bcrypt-hashes them.
  const seedApiKeys = [
    {
      id: "00000000-0000-0000-0000-000000000021",
      userId: "00000000-0000-0000-0000-000000000001",
      ad: "production",
      maskedKey: "yzk_live_••••a3f2",
      keyHash: null,
      prefix: "yzk_live_",
      olusturma: new Date("2026-02-10T09:00:00Z"),
      sonKullanim: new Date("2026-05-23T14:22:00Z"),
      aktif: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000022",
      userId: "00000000-0000-0000-0000-000000000001",
      ad: "staging",
      maskedKey: "yzk_test_••••8b1c",
      keyHash: null,
      prefix: "yzk_test_",
      olusturma: new Date("2026-03-05T11:30:00Z"),
      sonKullanim: null,
      aktif: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000023",
      userId: "00000000-0000-0000-0000-000000000002",
      ad: "main",
      maskedKey: "yzk_live_••••f44e",
      keyHash: null,
      prefix: "yzk_live_",
      olusturma: new Date("2026-02-15T15:00:00Z"),
      sonKullanim: new Date("2026-05-23T16:05:00Z"),
      aktif: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000024",
      userId: "00000000-0000-0000-0000-000000000004",
      ad: "kurumsal-1",
      maskedKey: "yzk_live_••••c0d8",
      keyHash: null,
      prefix: "yzk_live_",
      olusturma: new Date("2025-11-02T10:00:00Z"),
      sonKullanim: new Date("2026-05-23T17:48:00Z"),
      aktif: true,
    },
  ];

  for (const key of seedApiKeys) {
    await db.insert(apiKeys).values(key).onConflictDoNothing();
  }
  console.log("  api_keys upserted");

  // ── transactions ──────────────────────────────────────────────────────────────
  const seedTransactions = [
    {
      id: "00000000-0000-0000-0000-000000000031",
      userId: "00000000-0000-0000-0000-000000000001",
      userEmail: "ali.yilmaz@ornek.com",
      tip: "yukleme",
      miktarTL: "200",
      oncekiBakiye: "50.50",
      sonrakiBakiye: "250.50",
      aciklama: "Kredi kartı yükleme",
      timestamp: new Date("2026-05-20T10:00:00Z"),
    },
    {
      id: "00000000-0000-0000-0000-000000000032",
      userId: "00000000-0000-0000-0000-000000000002",
      userEmail: "zeynep.kaya@ornek.com",
      tip: "kullanim",
      miktarTL: "-32.00",
      oncekiBakiye: "50.00",
      sonrakiBakiye: "18.00",
      aciklama: "claude-sonnet-4.6 kullanımı",
      timestamp: new Date("2026-05-23T16:05:00Z"),
    },
  ];

  for (const tx of seedTransactions) {
    await db.insert(transactions).values(tx).onConflictDoNothing();
  }
  console.log("  transactions upserted");

  console.log("Seed complete.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
