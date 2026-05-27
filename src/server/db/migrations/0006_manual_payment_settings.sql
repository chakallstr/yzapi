ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "payment_whatsapp_number" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "crypto_wallet_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "crypto_wallet_asset" text NOT NULL DEFAULT 'USDT';
--> statement-breakpoint
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "crypto_wallet_network" text NOT NULL DEFAULT 'TRC20';
--> statement-breakpoint
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "crypto_wallet_address" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "system_config" ADD COLUMN IF NOT EXISTS "crypto_wallet_memo" text NOT NULL DEFAULT '';
