ALTER TABLE "usage_records" ADD COLUMN IF NOT EXISTS "remaining_tl" numeric(14, 4);
ALTER TABLE "usage_records" ADD COLUMN IF NOT EXISTS "request_id" text;
ALTER TABLE "usage_records" ADD COLUMN IF NOT EXISTS "upstream_request_id" text;
ALTER TABLE "usage_records" ADD COLUMN IF NOT EXISTS "raw_usage_json" jsonb;
ALTER TABLE "usage_records" ADD COLUMN IF NOT EXISTS "pricing_snapshot_json" jsonb;
ALTER TABLE "usage_records" ADD COLUMN IF NOT EXISTS "error_code" text;

CREATE UNIQUE INDEX IF NOT EXISTS "usage_records_request_id_idx"
  ON "usage_records" ("request_id")
  WHERE "request_id" IS NOT NULL;
