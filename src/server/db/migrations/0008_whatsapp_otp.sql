CREATE TABLE IF NOT EXISTS "whatsapp_otp_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "purpose" text DEFAULT 'signup' NOT NULL,
  "phone_e164" text NOT NULL,
  "phone_hash" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "send_count" integer DEFAULT 1 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "ip_hash" text DEFAULT '' NOT NULL,
  "user_agent_hash" text DEFAULT '' NOT NULL,
  "provider" text DEFAULT 'openwa' NOT NULL,
  "provider_message_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "whatsapp_otp_user_idx" ON "whatsapp_otp_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "whatsapp_otp_phone_hash_idx" ON "whatsapp_otp_requests" ("phone_hash");
CREATE INDEX IF NOT EXISTS "whatsapp_otp_expires_at_idx" ON "whatsapp_otp_requests" ("expires_at");

CREATE TABLE IF NOT EXISTS "whatsapp_verified_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "phone_e164" text NOT NULL,
  "phone_hash" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "replaced_by_id" uuid,
  "inactive_at" timestamp with time zone,
  "inactive_reason" text,
  "marketing_consent" boolean DEFAULT false NOT NULL,
  "marketing_consent_at" timestamp with time zone,
  "consent_text_version" text DEFAULT '' NOT NULL,
  "consent_ip_hash" text DEFAULT '' NOT NULL,
  "consent_user_agent_hash" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_verified_phone_hash_idx" ON "whatsapp_verified_numbers" ("phone_hash");
CREATE INDEX IF NOT EXISTS "whatsapp_verified_user_status_idx" ON "whatsapp_verified_numbers" ("user_id", "status");
