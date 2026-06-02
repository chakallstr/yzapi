import { z } from "zod";
import dotenv from "dotenv";
dotenv.config({ path: process.env.NODE_ENV === "production" ? ".env.production" : ".env" });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4567),
  // Listen interface. Default 127.0.0.1: the app is reached only via the nginx
  // reverse proxy (which proxies to 127.0.0.1), so binding to loopback keeps the
  // Node port off the public interface. This prevents bypassing nginx and the
  // X-Forwarded-For trust-proxy assumption (no public access to the raw port).
  // Set HOST=0.0.0.0 only if the app must be reached directly (not recommended).
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // Dedicated secret for encrypting stored full API keys. Required in production
  // (must differ from JWT_SECRET) so a JWT_SECRET leak cannot also decrypt API
  // keys. In dev/test it falls back to JWT_SECRET.
  API_KEY_ENCRYPTION_SECRET: z.string().min(32).optional(),
  // Previous API key encryption secret, kept only during a rotation window so
  // ciphers written under the old key can still be decrypted until
  // `rotate-api-key-cipher` re-encrypts them.
  API_KEY_ENCRYPTION_SECRET_OLD: z.string().min(32).optional(),
  JWT_ACCESS_TTL_SEC: z.coerce.number().default(900),
  JWT_REFRESH_TTL_SEC: z.coerce.number().default(60 * 60 * 24 * 30),
  WHATSAPP_PENDING_TTL_SEC: z.coerce.number().default(10 * 60),

  // Billing: minutes before an unsettled usage reservation is treated as orphan
  // and refunded by the reaper job.
  ORPHAN_RESERVATION_GRACE_MIN: z.coerce.number().default(15),

  // Google OAuth (optional — graceful degrade if missing)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:4567/api/auth/google/callback"),

  // WhatsApp OTP after Google auth. Disabled by default until OpenWA is configured.
  WHATSAPP_OTP_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  WHATSAPP_OTP_PROVIDER: z.enum(["openwa", "meta", "dry_run"]).default("dry_run"),
  WHATSAPP_OTP_DRY_RUN: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  WHATSAPP_OTP_HASH_SECRET: z.string().min(32).optional(),
  WHATSAPP_OTP_TTL_SEC: z.coerce.number().default(5 * 60),
  WHATSAPP_OTP_RESEND_COOLDOWN_SEC: z.coerce.number().default(60),
  WHATSAPP_OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  WHATSAPP_OTP_MAX_SENDS_PER_PHONE_HOUR: z.coerce.number().default(5),
  WHATSAPP_OTP_MAX_SENDS_PER_IP_HOUR: z.coerce.number().default(20),
  OPENWA_API_URL: z.string().optional(),
  OPENWA_API_KEY: z.string().optional(),
  OPENWA_SESSION_ID: z.string().optional(),

  // Admin operasyon bildirimleri (yeni üye / ödeme denemesi / ödeme sorunu).
  // OpenWA üzerinden admin'in WhatsApp numarasına gönderilir. Numara/OpenWA
  // env'i yoksa sessiz no-op (akışı bloklamaz). Numara TR formatı (5xx... veya 90...).
  ADMIN_WHATSAPP_NUMBER: z.string().optional(),
  ADMIN_NOTIFY_WHATSAPP_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),

  // Frontend
  APP_BASE_URL: z.string().default("http://localhost:4567"),
  FRONTEND_AUTH_RETURN: z.string().default("/"),

  // AI provider proxy
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_PROVIDER_BASE_URL: z.string().optional(),
  // Backward-compatible legacy names.
  CLOSEROUTER_API_KEY: z.string().optional(),
  CLOSEROUTER_BASE_URL: z.string().optional(),
  RATE_LIMIT_PER_KEY_PER_MIN: z.coerce.number().default(60),

  // Shopier payment (optional — returns 503 when unset)
  SHOPIER_API_KEY: z.string().optional(),
  SHOPIER_API_SECRET: z.string().optional(),
  SHOPIER_RETURN_URL: z.string().optional(),
  SHOPIER_OSB_FALLBACK_URL: z.string().optional(),
  // Shopier OSB (Sipariş Bildirimi / notificationaccess.php) — sabit-link otomatik
  // kredilendirme (Paket 3). Bunlar checkout API_KEY/SECRET'tan AYRIDIR; Shopier
  // panelinden alınır ve YALNIZ server-side tutulur. İkisi de boşsa OSB uç pasif.
  SHOPIER_OSB_USERNAME: z.string().optional(),
  SHOPIER_OSB_PASSWORD: z.string().optional(),
  // productId → { priceTL, creditTL } JSON eşlemesi. Örn:
  // {"47233749":{"priceTL":899,"creditTL":899}}  — boş/hatalı JSON → OSB kredi vermez.
  SHOPIER_OSB_PRODUCT_MAP: z.string().optional(),

  // Cryptomus payment (optional — returns 503 when unset)
  CRYPTOMUS_MERCHANT_ID: z.string().optional(),
  CRYPTOMUS_API_KEY: z.string().optional(),
  CRYPTOMUS_RETURN_URL: z.string().optional(),
  CRYPTOMUS_WEBHOOK_URL: z.string().optional(),

  // Telegram + Crypto Pay bot channel (optional — endpoints return 503 when unset)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_LOGIN_MAX_AGE_SEC: z.coerce.number().default(15 * 60),
  TELEGRAM_SUPPORT_URL: z.string().default(""),
  CRYPTO_PAY_API_TOKEN: z.string().optional(),
  CRYPTO_PAY_API_BASE_URL: z.string().optional(),
  CRYPTO_PAY_WEBHOOK_SECRET: z.string().optional(),
  CRYPTO_PAY_RETURN_URL: z.string().optional(),
  CRYPTO_PAY_ACCEPTED_ASSETS: z.string().optional(),
  CRYPTO_PAY_INVOICE_EXPIRES_SEC: z.coerce.number().default(60 * 60),

  // IBAN info (display only)
  IBAN_BANK_NAME: z.string().default(""),
  IBAN_NUMBER: z.string().default(""),
  IBAN_OWNER: z.string().default(""),
  PAYMENT_WHATSAPP_NUMBER: z.string().default(""),

  // Manual crypto wallet instructions (non-secret display config)
  CRYPTO_WALLET_ENABLED: z.coerce.boolean().default(false),
  CRYPTO_WALLET_ASSET: z.string().default("USDT"),
  CRYPTO_WALLET_NETWORK: z.string().default("TRC20"),
  CRYPTO_WALLET_ADDRESS: z.string().default(""),
  CRYPTO_WALLET_MEMO: z.string().default(""),

  // KDV rate (default 20%)
  KDV_RATE: z.coerce.number().default(0.20),

  // Email (optional — both modes degrade gracefully)
  EMAIL_PROVIDER: z.enum(["resend", "smtp"]).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  PAYMENT_NOTIFICATION_EMAIL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // ── Gözcü (Sentinel) — sistem nöbetçisi ───────────────────────────────────────
  // Katman-2 LLM teşhis: boşsa aiProviderBaseUrl/Key fallback kullanılır (kendi gateway).
  GOZCU_LLM_BASE_URL: z.string().optional(),
  GOZCU_LLM_API_KEY: z.string().optional(),
  // OmniRoute (VPS yerel router) model ID'leri — antigravity family çalışıyor + JSON döndürüyor.
  GOZCU_LLM_TRIAGE_MODEL: z.string().default("antigravity/gemini-3-flash-preview"),
  GOZCU_LLM_DEEP_MODEL: z.string().default("antigravity/claude-opus-4-6-thinking"),
  GOZCU_LLM_MONTHLY_TOKENS: z.coerce.number().default(2_000_000),
  GOZCU_ESCALATE_CONFIDENCE: z.coerce.number().default(0.6),
  GOZCU_DIAGNOSE_COOLDOWN_HOURS: z.coerce.number().default(6),
  // Katman-6 oto-müdahale: varsayılan KAPALI (kill-switch).
  GOZCU_AUTOHEAL_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  GOZCU_HEAL_MAX_AFFECTED: z.coerce.number().default(50),
  GOZCU_IBAN_STALE_DAYS: z.coerce.number().default(14),
  // Kod dilimi okuma kökü (deploy: /opt/yapayzekalab; dev: cwd).
  GOZCU_REPO_ROOT: z.string().default(process.cwd()),
  // Dış heartbeat (scripts/gozcu-heartbeat.mjs okur; burada doğrulama amaçlı).
  GOZCU_HEARTBEAT_URL: z.string().optional(),
  GOZCU_HEARTBEAT_FAIL_THRESHOLD: z.coerce.number().default(3),
}).superRefine((val, ctx) => {
  // Production-only secret-separation requirements. In dev/test we allow the
  // JWT_SECRET fallback so local setups stay frictionless.
  if (val.NODE_ENV !== "production") return;

  if (!val.API_KEY_ENCRYPTION_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["API_KEY_ENCRYPTION_SECRET"],
      message:
        "Production'da zorunlu — JWT_SECRET'a fallback, tek secret sızıntısında tüm API anahtarlarının çözülmesine yol açar.",
    });
  } else if (val.API_KEY_ENCRYPTION_SECRET === val.JWT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["API_KEY_ENCRYPTION_SECRET"],
      message: "JWT_SECRET ile aynı olamaz (secret ayrımı).",
    });
  }

  if (val.WHATSAPP_OTP_ENABLED) {
    if (!val.WHATSAPP_OTP_HASH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WHATSAPP_OTP_HASH_SECRET"],
        message: "WhatsApp OTP açıkken production'da zorunlu.",
      });
    } else if (val.WHATSAPP_OTP_HASH_SECRET === val.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WHATSAPP_OTP_HASH_SECRET"],
        message: "JWT_SECRET ile aynı olamaz (secret ayrımı).",
      });
    }
  }
});

export const envSchema = schema;
export const env = schema.parse(process.env);

export function aiProviderApiKey(): string | undefined {
  return env.AI_PROVIDER_API_KEY || env.CLOSEROUTER_API_KEY;
}

export function aiProviderBaseUrl(): string {
  return env.AI_PROVIDER_BASE_URL || env.CLOSEROUTER_BASE_URL || "https://api.claude-popusk.shop/v1";
}
