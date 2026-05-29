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
