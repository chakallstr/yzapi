import {
  pgTable,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── system_config (single-row, id = 1) ────────────────────────────────────────
export const systemConfig = pgTable("system_config", {
  id: integer("id").primaryKey().default(1),
  kur: numeric("kur", { precision: 14, scale: 6 }).notNull().default("47.084289"),
  liveKur: numeric("live_kur", { precision: 14, scale: 6 }).notNull().default("47.084289"),
  kurBuffer: numeric("kur_buffer", { precision: 8, scale: 4 }).notNull().default("0.03"),
  kurSource: text("kur_source").notNull().default("manual"),
  autoKurRefresh: boolean("auto_kur_refresh").notNull().default(false),
  kurRefreshIntervalDk: integer("kur_refresh_interval_dk").notNull().default(60),
  lastKurRefresh: timestamp("last_kur_refresh", { withTimezone: true }),
  textCarpan: numeric("text_carpan", { precision: 8, scale: 4 }).notNull().default("3.0"),
  imageCarpan: numeric("image_carpan", { precision: 8, scale: 4 }).notNull().default("3.0"),
  videoCarpan: numeric("video_carpan", { precision: 8, scale: 4 }).notNull().default("3.0"),
  textBillingRatio: numeric("text_billing_ratio", { precision: 8, scale: 4 }).notNull().default("0.9"),
  platformAdi: text("platform_adi").notNull().default("YapayZekaLab"),
  destekEmail: text("destek_email").notNull().default("destek@yapayzekalab.com"),
  maxBakiyeTL: numeric("max_bakiye_tl", { precision: 14, scale: 4 }).notNull().default("50000"),
  minBakiyeTL: numeric("min_bakiye_tl", { precision: 14, scale: 4 }).notNull().default("10"),
  anomaliEsikTL: numeric("anomali_esik_tl", { precision: 14, scale: 4 }).notNull().default("500"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── users ──────────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull().unique(),
    adSoyad: text("ad_soyad").notNull(),
    bakiyeTL: numeric("bakiye_tl", { precision: 14, scale: 4 }).notNull().default("0"),
    toplamHarcamaTL: numeric("toplam_harcama_tl", { precision: 14, scale: 4 }).notNull().default("0"),
    toplamIstek: integer("toplam_istek").notNull().default(0),
    durum: text("durum").notNull().default("aktif"),
    kayitTarihi: timestamp("kayit_tarihi", { withTimezone: true }).notNull().default(sql`now()`),
    sonAktivite: timestamp("son_aktivite", { withTimezone: true }).notNull().default(sql`now()`),
    plan: text("plan").notNull().default("ucretsiz"),
    apiKeyCount: integer("api_key_count").notNull().default(0),
    not: text("not").notNull().default(""),
    gunlukLimitTL: numeric("gunluk_limit_tl", { precision: 14, scale: 4 }),
    passwordHash: text("password_hash"),
    googleId: text("google_id"),
    lastLowBalanceAlert: timestamp("last_low_balance_alert", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

// ── api_keys ───────────────────────────────────────────────────────────────────
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ad: text("ad").notNull(),
    maskedKey: text("masked_key").notNull(),
    keyHash: text("key_hash"),
    prefix: text("prefix").notNull().default(""),
    olusturma: timestamp("olusturma", { withTimezone: true }).notNull().default(sql`now()`),
    sonKullanim: timestamp("son_kullanim", { withTimezone: true }),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index("api_keys_prefix_idx").on(t.prefix)]
);

// ── plans ──────────────────────────────────────────────────────────────────────
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  ad: text("ad").notNull(),
  gunlukLimitTL: numeric("gunluk_limit_tl", { precision: 14, scale: 4 }),
  aylikLimitTL: numeric("aylik_limit_tl", { precision: 14, scale: 4 }),
  izinliModeller: jsonb("izinli_modeller").notNull().default(sql`'[]'::jsonb`),
  aciklama: text("aciklama").notNull().default(""),
});

// ── model_overrides ────────────────────────────────────────────────────────────
export const modelOverrides = pgTable("model_overrides", {
  modelId: text("model_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  inputUsdOverride: numeric("input_usd_override", { precision: 14, scale: 8 }),
  outputUsdOverride: numeric("output_usd_override", { precision: 14, scale: 8 }),
  notlar: text("notlar").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── announcements ──────────────────────────────────────────────────────────────
export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  mesaj: text("mesaj").notNull(),
  tip: text("tip").notNull().default("bilgi"),
  aktif: boolean("aktif").notNull().default(true),
  baslangic: timestamp("baslangic", { withTimezone: true }).notNull(),
  bitis: timestamp("bitis", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── provider_durumlari ─────────────────────────────────────────────────────────
export const providerDurumlari = pgTable("provider_durumlari", {
  provider: text("provider").primaryKey(),
  durum: text("durum").notNull().default("aktif"),
  gecikmeMs: integer("gecikme_ms").notNull().default(0),
  sonKontrol: timestamp("son_kontrol", { withTimezone: true }).notNull().default(sql`now()`),
  not: text("not").notNull().default(""),
});

// ── transactions (bakiye_hareketleri) ──────────────────────────────────────────
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    tip: text("tip").notNull(),
    miktarTL: numeric("miktar_tl", { precision: 14, scale: 4 }).notNull(),
    oncekiBakiye: numeric("onceki_bakiye", { precision: 14, scale: 4 }).notNull(),
    sonrakiBakiye: numeric("sonraki_bakiye", { precision: 14, scale: 4 }).notNull(),
    aciklama: text("aciklama").notNull().default(""),
    metod: text("metod"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().default(sql`now()`),
    idempotencyKey: text("idempotency_key").unique(),
  },
  (t) => [index("transactions_user_ts_idx").on(t.userId, t.timestamp)]
);

// ── usage_records ──────────────────────────────────────────────────────────────
export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    modelId: text("model_id").notNull(),
    type: text("type").notNull(),
    inputUsage: integer("input_usage").notNull().default(0),
    outputUsage: integer("output_usage").notNull().default(0),
    unitsUsage: numeric("units_usage", { precision: 14, scale: 6 }).notNull().default("0"),
    costUsd: numeric("cost_usd", { precision: 14, scale: 8 }).notNull().default("0"),
    costTL: numeric("cost_tl", { precision: 14, scale: 4 }).notNull().default("0"),
    remainingTL: numeric("remaining_tl", { precision: 14, scale: 4 }),
    requestId: text("request_id"),
    upstreamRequestId: text("upstream_request_id"),
    rawUsageJson: jsonb("raw_usage_json"),
    pricingSnapshotJson: jsonb("pricing_snapshot_json"),
    errorCode: text("error_code"),
    responseMs: integer("response_ms").notNull().default(0),
    status: text("status").notNull().default("success"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("usage_records_user_ts_idx").on(t.userId, t.timestamp),
    uniqueIndex("usage_records_request_id_idx").on(t.requestId),
  ]
);

// ── audit_logs ─────────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    action: text("action").notNull(),
    hedef: text("hedef").notNull(),
    ozet: text("ozet").notNull(),
    actorId: uuid("actor_id"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index("audit_logs_ts_idx").on(t.timestamp)]
);

// ── kur_history ────────────────────────────────────────────────────────────────
export const kurHistory = pgTable("kur_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().default(sql`now()`),
  liveKur: numeric("live_kur", { precision: 14, scale: 6 }).notNull(),
  sellKur: numeric("sell_kur", { precision: 14, scale: 6 }).notNull(),
  source: text("source").notNull(),
});

// ── sessions ───────────────────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jti: uuid("jti").notNull().unique(),
  tip: text("tip").notNull().default("access"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── payments ───────────────────────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id),
  metod: text("metod").notNull(), // shopier | iban | cryptomus
  miktarTL: numeric("miktar_tl", { precision: 14, scale: 4 }).notNull(),
  kdvTL: numeric("kdv_tl", { precision: 14, scale: 4 }).notNull(),
  netTL: numeric("net_tl", { precision: 14, scale: 4 }).notNull(),
  durum: text("durum").notNull().default("bekliyor"), // bekliyor | basarili | iptal | basarisiz
  idempotencyKey: text("idempotency_key").unique(), // provider-side unique
  providerPayload: jsonb("provider_payload"), // raw webhook body
  olusturma: timestamp("olusturma").notNull().default(sql`now()`),
  tamamlanma: timestamp("tamamlanma"),
  transactionId: uuid("transaction_id").references(() => transactions.id),
});

// ── pending_iban_payments ──────────────────────────────────────────────────────
export const pendingIbanPayments = pgTable("pending_iban_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id),
  miktarTL: numeric("miktar_tl", { precision: 14, scale: 4 }).notNull(),
  kdvTL: numeric("kdv_tl", { precision: 14, scale: 4 }).notNull(),
  referansKodu: text("referans_kodu").notNull().unique(),
  durum: text("durum").notNull().default("bekliyor"), // bekliyor | onaylandi | reddedildi
  olusturma: timestamp("olusturma").notNull().default(sql`now()`),
  onay: timestamp("onay"),
  onaylayan: text("onaylayan"), // admin id
  not: text("not"),
});
