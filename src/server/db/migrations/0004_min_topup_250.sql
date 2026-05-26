ALTER TABLE "system_config" ALTER COLUMN "min_bakiye_tl" SET DEFAULT '250';
--> statement-breakpoint
UPDATE "system_config"
SET "min_bakiye_tl" = '250',
    "updated_at" = now()
WHERE "id" = 1
  AND "min_bakiye_tl"::numeric < 250;
