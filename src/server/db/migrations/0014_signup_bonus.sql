-- Signup bonus (yeni üye 10 TL deneme bonusu) — abuse korumalı.
-- signup_bonus_grants: hesap başına TAM 1 kez (user_id UNIQUE / PK). ip_hash +
-- phone_hash abuse sinyali; transaction_id ledger izi. Bonus parası ayrıca
-- transactions tablosuna (tip='bonus') yazılır → reconciliation drift=0 korunur.
CREATE TABLE IF NOT EXISTS "signup_bonus_grants" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "amount_tl" numeric(14, 4) NOT NULL,
  "ip_hash" text NOT NULL DEFAULT '',
  "phone_hash" text NOT NULL DEFAULT '',
  "transaction_id" uuid REFERENCES "transactions"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Aynı IP'den verilen bonus sayısını eşikle sınırlamak için hızlı arama indexi.
CREATE INDEX IF NOT EXISTS "signup_bonus_grants_ip_idx" ON "signup_bonus_grants" ("ip_hash");
CREATE INDEX IF NOT EXISTS "signup_bonus_grants_phone_idx" ON "signup_bonus_grants" ("phone_hash");

-- system_config: admin runtime aç/kapa + tutar + IP başına azami bonuslu hesap.
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "signup_bonus_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "signup_bonus_tl" numeric(14, 4) NOT NULL DEFAULT '10';
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "signup_bonus_max_per_ip" integer NOT NULL DEFAULT 3;
