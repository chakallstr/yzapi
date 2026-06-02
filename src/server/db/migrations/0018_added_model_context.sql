ALTER TABLE "added_models"
  ADD COLUMN IF NOT EXISTS "context" text,
  ADD COLUMN IF NOT EXISTS "context_tokens" integer;
