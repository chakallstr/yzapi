CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metod" text NOT NULL,
	"miktar_tl" numeric(14, 4) NOT NULL,
	"kdv_tl" numeric(14, 4) NOT NULL,
	"net_tl" numeric(14, 4) NOT NULL,
	"durum" text DEFAULT 'bekliyor' NOT NULL,
	"idempotency_key" text,
	"provider_payload" jsonb,
	"olusturma" timestamp DEFAULT now() NOT NULL,
	"tamamlanma" timestamp,
	"transaction_id" uuid,
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pending_iban_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"miktar_tl" numeric(14, 4) NOT NULL,
	"kdv_tl" numeric(14, 4) NOT NULL,
	"referans_kodu" text NOT NULL,
	"durum" text DEFAULT 'bekliyor' NOT NULL,
	"olusturma" timestamp DEFAULT now() NOT NULL,
	"onay" timestamp,
	"onaylayan" text,
	"not" text,
	CONSTRAINT "pending_iban_payments_referans_kodu_unique" UNIQUE("referans_kodu")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_iban_payments" ADD CONSTRAINT "pending_iban_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
