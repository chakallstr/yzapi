ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "amount_usd" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payable_tl" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "credit_tl" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "kur_at_payment" numeric(14, 6);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "rounding_tl" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "pending_iban_payments" ADD COLUMN IF NOT EXISTS "amount_usd" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "pending_iban_payments" ADD COLUMN IF NOT EXISTS "payable_tl" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "pending_iban_payments" ADD COLUMN IF NOT EXISTS "credit_tl" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "pending_iban_payments" ADD COLUMN IF NOT EXISTS "kur_at_payment" numeric(14, 6);
--> statement-breakpoint
ALTER TABLE "pending_iban_payments" ADD COLUMN IF NOT EXISTS "rounding_tl" numeric(14, 4);
