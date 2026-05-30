ALTER TABLE "system_api_config"
  ADD COLUMN IF NOT EXISTS "provider_base_url" text,
  ADD COLUMN IF NOT EXISTS "provider_api_key_cipher" text,
  ADD COLUMN IF NOT EXISTS "provider_api_key_updated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "added_models" (
  "model_id" text PRIMARY KEY,
  "name" text NOT NULL,
  "provider_label" text NOT NULL DEFAULT '',
  "input_usd" numeric(14, 8) NOT NULL DEFAULT '0',
  "output_usd" numeric(14, 8) NOT NULL DEFAULT '0',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
