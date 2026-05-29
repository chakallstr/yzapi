ALTER TABLE "telegram_accounts"
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "telegram_accounts"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'unlinked' NOT NULL;

ALTER TABLE "telegram_accounts"
  ADD COLUMN IF NOT EXISTS "link_method" text;

ALTER TABLE "telegram_accounts"
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;

UPDATE "telegram_accounts"
SET
  "status" = CASE
    WHEN "user_id" IS NULL THEN 'unlinked'
    ELSE 'linked'
  END,
  "link_method" = CASE
    WHEN "user_id" IS NULL THEN NULL
    ELSE COALESCE("link_method", 'telegram_only')
  END,
  "last_seen_at" = COALESCE("last_seen_at", "linked_at", "created_at", now())
WHERE
  "status" IS NULL
  OR "status" = ''
  OR "last_seen_at" IS NULL;

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "user_id"
      ORDER BY "linked_at" DESC, "created_at" DESC, "id" DESC
    ) AS "rn"
  FROM "telegram_accounts"
  WHERE "user_id" IS NOT NULL
)
UPDATE "telegram_accounts"
SET
  "user_id" = NULL,
  "status" = 'blocked',
  "link_method" = COALESCE("link_method", 'admin_merge'),
  "updated_at" = now()
WHERE "id" IN (
  SELECT "id" FROM ranked WHERE "rn" > 1
);

DROP INDEX IF EXISTS "telegram_accounts_user_id_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_accounts_user_id_linked_idx"
  ON "telegram_accounts" ("user_id")
  WHERE "user_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "telegram_accounts_status_idx"
  ON "telegram_accounts" ("status");

CREATE INDEX IF NOT EXISTS "telegram_accounts_last_seen_at_idx"
  ON "telegram_accounts" ("last_seen_at");
