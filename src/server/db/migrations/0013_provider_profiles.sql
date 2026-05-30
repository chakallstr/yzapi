CREATE TABLE IF NOT EXISTS "provider_profiles" (
  "id" text PRIMARY KEY,
  "label" text NOT NULL DEFAULT '',
  "base_url" text NOT NULL DEFAULT '',
  "api_key_cipher" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "supported_model_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "model_map" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
