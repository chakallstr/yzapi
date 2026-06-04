-- Faz 6: GitHub OAuth (users.github_id) + hesap-teslim paketleri (account_delivery_orders)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "github_id" text;

CREATE TABLE IF NOT EXISTS "account_delivery_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "package_id" text NOT NULL REFERENCES "packages"("id"),
  "amount_tl" numeric(14,4) NOT NULL,
  "contact" text NOT NULL DEFAULT '',
  "durum" text NOT NULL DEFAULT 'bekliyor',
  "teslim_payload" text,
  "purchase_transaction_id" uuid REFERENCES "transactions"("id"),
  "onaylayan" text,
  "olusturma" timestamptz NOT NULL DEFAULT now(),
  "teslim" timestamptz,
  "not" text
);
CREATE INDEX IF NOT EXISTS "ado_user_idx" ON "account_delivery_orders" ("user_id");
CREATE INDEX IF NOT EXISTS "ado_durum_idx" ON "account_delivery_orders" ("durum","olusturma");
