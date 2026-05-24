ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_low_balance_alert" timestamp with time zone;
