CREATE TABLE IF NOT EXISTS "telegram_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "telegram_id" text NOT NULL,
  "username" text,
  "first_name" text,
  "last_name" text,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_accounts_telegram_id_idx"
  ON "telegram_accounts" ("telegram_id");

CREATE INDEX IF NOT EXISTS "telegram_accounts_user_id_idx"
  ON "telegram_accounts" ("user_id");

CREATE TABLE IF NOT EXISTS "telegram_link_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "code_hash" text NOT NULL,
  "telegram_id" text,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_link_codes_code_hash_idx"
  ON "telegram_link_codes" ("code_hash");

CREATE INDEX IF NOT EXISTS "telegram_link_codes_user_id_idx"
  ON "telegram_link_codes" ("user_id");

CREATE TABLE IF NOT EXISTS "telegram_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "telegram_account_id" uuid REFERENCES "telegram_accounts"("id") ON DELETE set null,
  "payment_id" uuid REFERENCES "payments"("id") ON DELETE set null,
  "delivery_type" text DEFAULT 'api_key' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "masked_key" text,
  "message_id" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_deliveries_payment_type_idx"
  ON "telegram_deliveries" ("payment_id", "delivery_type");

CREATE INDEX IF NOT EXISTS "telegram_deliveries_user_id_idx"
  ON "telegram_deliveries" ("user_id");

CREATE INDEX IF NOT EXISTS "telegram_deliveries_status_idx"
  ON "telegram_deliveries" ("status");
