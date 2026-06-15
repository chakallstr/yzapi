// Integration-test env. Uses the REAL local Postgres (docker compose) but
// pins the upstream provider config so nock can intercept it deterministically.
import dotenv from "dotenv";
dotenv.config();

process.env.NODE_ENV = "test";
// Use the real local DB. dotenv already loaded DATABASE_URL from .env (the same
// one `npm run db:migrate` used); only fall back if it is somehow missing.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.ITEST_DATABASE_URL ||
  "postgres://yzapi:yzapi_dev_pw@localhost:5432/yzapi";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-at-least-32-chars-long!";
process.env.KDV_RATE = process.env.KDV_RATE || "0.20";
process.env.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:4567";
// Pin upstream so requireProxy passes and nock can intercept this origin.
process.env.CLOSEROUTER_API_KEY = "closerouter_test_key";
process.env.CLOSEROUTER_BASE_URL = "https://api.closerouter.dev/v1";
process.env.WHATSAPP_OTP_ENABLED = "false";
// IBAN ödeme yöntemi itest fixtures (iban/init dedup testleri için).
process.env.IBAN_BANK_NAME = process.env.IBAN_BANK_NAME || "Test Bank";
process.env.IBAN_NUMBER = process.env.IBAN_NUMBER || "TR000000000000000000000000";
process.env.IBAN_OWNER = process.env.IBAN_OWNER || "Test Owner";
// Shopier OSB (Paket 3) — fixed-link auto-credit itest fixtures.
process.env.SHOPIER_OSB_USERNAME = process.env.SHOPIER_OSB_USERNAME || "osb_itest_user";
process.env.SHOPIER_OSB_PASSWORD = process.env.SHOPIER_OSB_PASSWORD || "osb_itest_pass";
process.env.SHOPIER_OSB_PRODUCT_MAP =
  process.env.SHOPIER_OSB_PRODUCT_MAP ||
  JSON.stringify({ "47233749": { priceTL: 899, creditTL: 899 } });
