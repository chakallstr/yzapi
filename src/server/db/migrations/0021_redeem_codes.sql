-- Faz 2: hediye/geçiş kodları (balance veya package grant)
CREATE TABLE IF NOT EXISTS "redeem_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL UNIQUE,
  "tip" text NOT NULL,
  "amount_tl" numeric(14,4),
  "package_id" text REFERENCES "packages"("id"),
  "max_uses" integer NOT NULL DEFAULT 1,
  "used_count" integer NOT NULL DEFAULT 0,
  "per_user_once" boolean NOT NULL DEFAULT true,
  "expires_at" timestamptz,
  "enabled" boolean NOT NULL DEFAULT true,
  "aciklama" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "redeem_codes_enabled_idx" ON "redeem_codes" ("enabled","expires_at");

CREATE TABLE IF NOT EXISTS "redeem_code_uses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_id" uuid NOT NULL REFERENCES "redeem_codes"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redeemed_at" timestamptz NOT NULL DEFAULT now(),
  "transaction_id" uuid REFERENCES "transactions"("id"),
  "entitlement_id" uuid REFERENCES "user_package_entitlements"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "redeem_code_uses_code_user_idx" ON "redeem_code_uses" ("code_id","user_id");
