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
  platformAdi: text("platform_adi").notNull().default("YapayZekaLab"),
  destekEmail: text("destek_email").notNull().default("destek@yapayzekalab.com"),
  paymentWhatsappNumber: text("payment_whatsapp_number").notNull().default(""),
  cryptoWalletEnabled: boolean("crypto_wallet_enabled").notNull().default(false),
  cryptoWalletAsset: text("crypto_wallet_asset").notNull().default("USDT"),
  cryptoWalletNetwork: text("crypto_wallet_network").notNull().default("TRC20"),
  cryptoWalletAddress: text("crypto_wallet_address").notNull().default(""),
  cryptoWalletMemo: text("crypto_wallet_memo").notNull().default(""),
  maxBakiyeTL: numeric("max_bakiye_tl", { precision: 14, scale: 4 }).notNull().default("50000"),
  minBakiyeTL: numeric("min_bakiye_tl", { precision: 14, scale: 4 }).notNull().default("250"),
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

// ── whatsapp OTP and verified phone records ───────────────────────────────────
export const whatsappOtpRequests = pgTable(
  "whatsapp_otp_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull().default("signup"),
    phoneE164: text("phone_e164").notNull(),
    phoneHash: text("phone_hash").notNull(),
    codeHash: text("code_hash").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    sendCount: integer("send_count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ipHash: text("ip_hash").notNull().default(""),
    userAgentHash: text("user_agent_hash").notNull().default(""),
    provider: text("provider").notNull().default("openwa"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("whatsapp_otp_user_idx").on(t.userId),
    index("whatsapp_otp_phone_hash_idx").on(t.phoneHash),
    index("whatsapp_otp_expires_at_idx").on(t.expiresAt),
  ],
);

export const whatsappVerifiedNumbers = pgTable(
  "whatsapp_verified_numbers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    phoneE164: text("phone_e164").notNull(),
    phoneHash: text("phone_hash").notNull(),
    status: text("status").notNull().default("active"), // active | inactive | account_closed | blocked
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().default(sql`now()`),
    replacedById: uuid("replaced_by_id"),
    inactiveAt: timestamp("inactive_at", { withTimezone: true }),
    inactiveReason: text("inactive_reason"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
    consentTextVersion: text("consent_text_version").notNull().default(""),
    consentIpHash: text("consent_ip_hash").notNull().default(""),
    consentUserAgentHash: text("consent_user_agent_hash").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("whatsapp_verified_phone_hash_idx").on(t.phoneHash),
    index("whatsapp_verified_user_status_idx").on(t.userId, t.status),
  ],
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
    fullKeyCipher: text("full_key_cipher"),
    prefix: text("prefix").notNull().default(""),
    olusturma: timestamp("olusturma", { withTimezone: true }).notNull().default(sql`now()`),
    sonKullanim: timestamp("son_kullanim", { withTimezone: true }),
    aktif: boolean("aktif").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index("api_keys_prefix_idx").on(t.prefix)]
);

// ── system_api_config (single-row, id = 1) ───────────────────────────────────
export const systemApiConfig = pgTable("system_api_config", {
  id: integer("id").primaryKey().default(1),
  activeProviderId: text("active_provider_id").notNull().default("closerouter"),
  defaultContextLimitTokens: integer("default_context_limit_tokens").notNull().default(95_000),
  defaultOutputReserveTokens: integer("default_output_reserve_tokens").notNull().default(4_096),
  defaultPerKeyPerMinute: integer("default_per_key_per_minute").notNull().default(60),
  defaultPerUserPerMinute: integer("default_per_user_per_minute").notNull().default(120),
  defaultPerIpPerMinute: integer("default_per_ip_per_minute").notNull().default(240),
  defaultRequestTimeoutMs: integer("default_request_timeout_ms").notNull().default(60_000),
  defaultStreamTimeoutMs: integer("default_stream_timeout_ms").notNull().default(120_000),
  allowStreaming: boolean("allow_streaming").notNull().default(true),
  allowResponsesEndpoint: boolean("allow_responses_endpoint").notNull().default(true),
  allowMessagesEndpoint: boolean("allow_messages_endpoint").notNull().default(true),
  allowChatEndpoint: boolean("allow_chat_endpoint").notNull().default(true),
  enforceModelAllowlist: boolean("enforce_model_allowlist").notNull().default(false),
  defaultMaxTokensPerRequest: integer("default_max_tokens_per_request").notNull().default(4_096),
  defaultTemperatureMin: numeric("default_temperature_min", { precision: 6, scale: 3 }).notNull().default("0"),
  defaultTemperatureMax: numeric("default_temperature_max", { precision: 6, scale: 3 }).notNull().default("2"),
  defaultTopPMin: numeric("default_top_p_min", { precision: 6, scale: 3 }).notNull().default("0"),
  defaultTopPMax: numeric("default_top_p_max", { precision: 6, scale: 3 }).notNull().default("1"),
  insufficientBalanceBlockEnabled: boolean("insufficient_balance_block_enabled").notNull().default(true),
  streamMissingUsageFallbackEnabled: boolean("stream_missing_usage_fallback_enabled").notNull().default(true),
  upstream402PassThroughEnabled: boolean("upstream_402_pass_through_enabled").notNull().default(true),
  maintenanceModeForApi: boolean("maintenance_mode_for_api").notNull().default(false),
  maintenanceMessage: text("maintenance_message").notNull().default("API geçici olarak bakım modunda."),
  strictCanonicalModelIds: boolean("strict_canonical_model_ids").notNull().default(true),
  providerBaseUrl: text("provider_base_url"),
  providerApiKeyCipher: text("provider_api_key_cipher"),
  providerApiKeyUpdatedAt: timestamp("provider_api_key_updated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── added_models (additive catalog layer on top of MASTER_MODELS) ─────────────
export const addedModels = pgTable("added_models", {
  modelId: text("model_id").primaryKey(),
  name: text("name").notNull(),
  providerLabel: text("provider_label").notNull().default(""),
  inputUsd: numeric("input_usd", { precision: 14, scale: 8 }).notNull().default("0"),
  outputUsd: numeric("output_usd", { precision: 14, scale: 8 }).notNull().default("0"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// ── api_key_policies ──────────────────────────────────────────────────────────
export const apiKeyPolicies = pgTable(
  "api_key_policies",
  {
    apiKeyId: uuid("api_key_id").primaryKey().references(() => apiKeys.id, { onDelete: "cascade" }),
    perKeyPerMinute: integer("per_key_per_minute"),
    maxContextTokens: integer("max_context_tokens"),
    maxOutputTokens: integer("max_output_tokens"),
    allowedModels: jsonb("allowed_models").notNull().default(sql`'[]'::jsonb`),
    dailySpendLimitTL: numeric("daily_spend_limit_tl", { precision: 14, scale: 4 }),
    monthlySpendLimitTL: numeric("monthly_spend_limit_tl", { precision: 14, scale: 4 }),
    allowStreaming: boolean("allow_streaming"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index("api_key_policies_updated_idx").on(t.updatedAt)],
);

// ── model_runtime_policies ────────────────────────────────────────────────────
export const modelRuntimePolicies = pgTable("model_runtime_policies", {
  modelId: text("model_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  contextOverrideTokens: integer("context_override_tokens"),
  maxOutputTokens: integer("max_output_tokens"),
  allowStreaming: boolean("allow_streaming"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

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
  metod: text("metod").notNull(), // shopier | iban | cryptomus | crypto_bot
  miktarTL: numeric("miktar_tl", { precision: 14, scale: 4 }).notNull(),
  kdvTL: numeric("kdv_tl", { precision: 14, scale: 4 }).notNull(),
  netTL: numeric("net_tl", { precision: 14, scale: 4 }).notNull(),
  amountUsd: numeric("amount_usd", { precision: 14, scale: 4 }),
  payableTL: numeric("payable_tl", { precision: 14, scale: 4 }),
  creditTL: numeric("credit_tl", { precision: 14, scale: 4 }),
  kurAtPayment: numeric("kur_at_payment", { precision: 14, scale: 6 }),
  roundingTL: numeric("rounding_tl", { precision: 14, scale: 4 }),
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
  amountUsd: numeric("amount_usd", { precision: 14, scale: 4 }),
  payableTL: numeric("payable_tl", { precision: 14, scale: 4 }),
  creditTL: numeric("credit_tl", { precision: 14, scale: 4 }),
  kurAtPayment: numeric("kur_at_payment", { precision: 14, scale: 6 }),
  roundingTL: numeric("rounding_tl", { precision: 14, scale: 4 }),
  referansKodu: text("referans_kodu").notNull().unique(),
  durum: text("durum").notNull().default("bekliyor"), // bekliyor | onaylandi | reddedildi
  olusturma: timestamp("olusturma").notNull().default(sql`now()`),
  onay: timestamp("onay"),
  onaylayan: text("onaylayan"), // admin id
  not: text("not"),
});

// ── telegram bot identity and delivery ────────────────────────────────────────
export const telegramAccounts = pgTable(
  "telegram_accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    telegramId: text("telegram_id").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    status: text("status").notNull().default("unlinked"),
    linkMethod: text("link_method"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().default(sql`now()`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("telegram_accounts_telegram_id_idx").on(t.telegramId),
    index("telegram_accounts_user_id_idx").on(t.userId),
  ],
);

export const telegramLinkCodes = pgTable(
  "telegram_link_codes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    telegramId: text("telegram_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("telegram_link_codes_code_hash_idx").on(t.codeHash),
    index("telegram_link_codes_user_id_idx").on(t.userId),
  ],
);

export const telegramDeliveries = pgTable(
  "telegram_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    telegramAccountId: uuid("telegram_account_id").references(() => telegramAccounts.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    deliveryType: text("delivery_type").notNull().default("api_key"),
    status: text("status").notNull().default("pending"), // pending | delivered | failed
    maskedKey: text("masked_key"),
    messageId: text("message_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex("telegram_deliveries_payment_type_idx").on(t.paymentId, t.deliveryType),
    index("telegram_deliveries_user_id_idx").on(t.userId),
    index("telegram_deliveries_status_idx").on(t.status),
  ],
);
