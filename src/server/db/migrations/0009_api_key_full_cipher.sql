ALTER TABLE "api_keys"
ADD COLUMN IF NOT EXISTS "full_key_cipher" text;
