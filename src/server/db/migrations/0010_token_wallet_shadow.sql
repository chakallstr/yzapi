ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "token_balance" numeric(20, 0) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pending_reserved_tokens" numeric(20, 0) NOT NULL DEFAULT 0;

ALTER TABLE "transactions"
ADD COLUMN IF NOT EXISTS "token_amount" numeric(20, 0),
ADD COLUMN IF NOT EXISTS "onceki_token_balance" numeric(20, 0),
ADD COLUMN IF NOT EXISTS "sonraki_token_balance" numeric(20, 0),
ADD COLUMN IF NOT EXISTS "billing_basis" text NOT NULL DEFAULT 'tl_balance';

ALTER TABLE "usage_records"
ADD COLUMN IF NOT EXISTS "input_tokens" integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "output_tokens" integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "billable_tokens" numeric(20, 0) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "reserved_tokens" numeric(20, 0) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "settled_tokens" numeric(20, 0) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "remaining_tokens" numeric(20, 0),
ADD COLUMN IF NOT EXISTS "billing_basis" text NOT NULL DEFAULT 'tl_balance';
