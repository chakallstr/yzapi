-- Faz 1: prepaid request-limit packages + entitlements (PAYG ile birlikte)
CREATE TABLE IF NOT EXISTS "packages" (
  "id" text PRIMARY KEY,
  "ad" text NOT NULL,
  "kategori" text NOT NULL,
  "aciklama" text NOT NULL DEFAULT '',
  "tip" text NOT NULL DEFAULT 'request_limit',
  "gunluk_istek_limiti" integer NOT NULL,
  "sure_gun" integer NOT NULL,
  "allowed_models" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fiyat_tl" numeric(14,4) NOT NULL,
  "fiyat_usd" numeric(14,4),
  "enabled" boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_package_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "package_id" text NOT NULL REFERENCES "packages"("id"),
  "daily_limit_snapshot" integer NOT NULL,
  "allowed_models_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "activated_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "requests_today" integer NOT NULL DEFAULT 0,
  "last_reset_date" date NOT NULL DEFAULT CURRENT_DATE,
  "purchase_transaction_id" uuid REFERENCES "transactions"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "upe_user_status_idx" ON "user_package_entitlements" ("user_id","status");
CREATE INDEX IF NOT EXISTS "upe_status_expires_idx" ON "user_package_entitlements" ("status","expires_at");

ALTER TABLE "usage_records"
  ADD COLUMN IF NOT EXISTS "billed_via" text NOT NULL DEFAULT 'balance',
  ADD COLUMN IF NOT EXISTS "entitlement_id" uuid;

ALTER TABLE "system_config"
  ADD COLUMN IF NOT EXISTS "packages_enabled" boolean NOT NULL DEFAULT true;
