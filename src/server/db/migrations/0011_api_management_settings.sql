CREATE TABLE IF NOT EXISTS "system_api_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "active_provider_id" text NOT NULL DEFAULT 'closerouter',
  "default_context_limit_tokens" integer NOT NULL DEFAULT 95000,
  "default_output_reserve_tokens" integer NOT NULL DEFAULT 4096,
  "default_per_key_per_minute" integer NOT NULL DEFAULT 60,
  "default_per_user_per_minute" integer NOT NULL DEFAULT 120,
  "default_per_ip_per_minute" integer NOT NULL DEFAULT 240,
  "default_request_timeout_ms" integer NOT NULL DEFAULT 60000,
  "default_stream_timeout_ms" integer NOT NULL DEFAULT 120000,
  "allow_streaming" boolean NOT NULL DEFAULT true,
  "allow_responses_endpoint" boolean NOT NULL DEFAULT true,
  "allow_messages_endpoint" boolean NOT NULL DEFAULT true,
  "allow_chat_endpoint" boolean NOT NULL DEFAULT true,
  "enforce_model_allowlist" boolean NOT NULL DEFAULT false,
  "default_max_tokens_per_request" integer NOT NULL DEFAULT 4096,
  "default_temperature_min" numeric(6, 3) NOT NULL DEFAULT '0',
  "default_temperature_max" numeric(6, 3) NOT NULL DEFAULT '2',
  "default_top_p_min" numeric(6, 3) NOT NULL DEFAULT '0',
  "default_top_p_max" numeric(6, 3) NOT NULL DEFAULT '1',
  "insufficient_balance_block_enabled" boolean NOT NULL DEFAULT true,
  "stream_missing_usage_fallback_enabled" boolean NOT NULL DEFAULT true,
  "upstream_402_pass_through_enabled" boolean NOT NULL DEFAULT true,
  "maintenance_mode_for_api" boolean NOT NULL DEFAULT false,
  "maintenance_message" text NOT NULL DEFAULT 'API geçici olarak bakım modunda.',
  "strict_canonical_model_ids" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO "system_api_config" ("id")
VALUES (1)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "api_key_policies" (
  "api_key_id" uuid PRIMARY KEY REFERENCES "api_keys"("id") ON DELETE CASCADE,
  "per_key_per_minute" integer,
  "max_context_tokens" integer,
  "max_output_tokens" integer,
  "allowed_models" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "daily_spend_limit_tl" numeric(14, 4),
  "monthly_spend_limit_tl" numeric(14, 4),
  "allow_streaming" boolean,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "api_key_policies_updated_idx"
  ON "api_key_policies" ("updated_at");

CREATE TABLE IF NOT EXISTS "model_runtime_policies" (
  "model_id" text PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT true,
  "context_override_tokens" integer,
  "max_output_tokens" integer,
  "allow_streaming" boolean,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
