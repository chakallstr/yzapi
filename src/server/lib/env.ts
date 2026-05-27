import { z } from "zod";
import dotenv from "dotenv";
dotenv.config({ path: process.env.NODE_ENV === "production" ? ".env.production" : ".env" });
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4567),
  DATABASE_URL: z.string(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  GEMINI_API_KEY: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL_SEC: z.coerce.number().default(900),
  JWT_REFRESH_TTL_SEC: z.coerce.number().default(60 * 60 * 24 * 30),

  // Google OAuth (optional — graceful degrade if missing)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:4567/api/auth/google/callback"),

  // Frontend
  APP_BASE_URL: z.string().default("http://localhost:4567"),
  FRONTEND_AUTH_RETURN: z.string().default("/"),

  // CloseRouter proxy
  CLOSEROUTER_API_KEY: z.string().optional(),
  CLOSEROUTER_BASE_URL: z.string().default("https://api.closerouter.dev/v1"),
  RATE_LIMIT_PER_KEY_PER_MIN: z.coerce.number().default(60),

  // Shopier payment (optional — returns 503 when unset)
  SHOPIER_API_KEY: z.string().optional(),
  SHOPIER_API_SECRET: z.string().optional(),
  SHOPIER_RETURN_URL: z.string().optional(),
  SHOPIER_OSB_FALLBACK_URL: z.string().optional(),

  // Cryptomus payment (optional — returns 503 when unset)
  CRYPTOMUS_MERCHANT_ID: z.string().optional(),
  CRYPTOMUS_API_KEY: z.string().optional(),
  CRYPTOMUS_RETURN_URL: z.string().optional(),
  CRYPTOMUS_WEBHOOK_URL: z.string().optional(),

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
});

export const env = schema.parse(process.env);
