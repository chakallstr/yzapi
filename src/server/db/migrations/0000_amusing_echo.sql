CREATE TABLE IF NOT EXISTS "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mesaj" text NOT NULL,
	"tip" text DEFAULT 'bilgi' NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"baslangic" timestamp with time zone NOT NULL,
	"bitis" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad" text NOT NULL,
	"masked_key" text NOT NULL,
	"key_hash" text,
	"prefix" text DEFAULT '' NOT NULL,
	"olusturma" timestamp with time zone DEFAULT now() NOT NULL,
	"son_kullanim" timestamp with time zone,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"hedef" text NOT NULL,
	"ozet" text NOT NULL,
	"actor_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kur_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"live_kur" numeric(14, 6) NOT NULL,
	"sell_kur" numeric(14, 6) NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_overrides" (
	"model_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"input_usd_override" numeric(14, 8),
	"output_usd_override" numeric(14, 8),
	"notlar" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"ad" text NOT NULL,
	"gunluk_limit_tl" numeric(14, 4),
	"aylik_limit_tl" numeric(14, 4),
	"izinli_modeller" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aciklama" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_durumlari" (
	"provider" text PRIMARY KEY NOT NULL,
	"durum" text DEFAULT 'aktif' NOT NULL,
	"gecikme_ms" integer DEFAULT 0 NOT NULL,
	"son_kontrol" timestamp with time zone DEFAULT now() NOT NULL,
	"not" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"jti" uuid NOT NULL,
	"tip" text DEFAULT 'access' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"kur" numeric(14, 6) DEFAULT '47.084289' NOT NULL,
	"live_kur" numeric(14, 6) DEFAULT '47.084289' NOT NULL,
	"kur_buffer" numeric(8, 4) DEFAULT '0.03' NOT NULL,
	"kur_source" text DEFAULT 'manual' NOT NULL,
	"auto_kur_refresh" boolean DEFAULT false NOT NULL,
	"kur_refresh_interval_dk" integer DEFAULT 60 NOT NULL,
	"last_kur_refresh" timestamp with time zone,
	"text_carpan" numeric(8, 4) DEFAULT '3.0' NOT NULL,
	"image_carpan" numeric(8, 4) DEFAULT '3.0' NOT NULL,
	"video_carpan" numeric(8, 4) DEFAULT '3.0' NOT NULL,
	"platform_adi" text DEFAULT 'YapayZekaLab' NOT NULL,
	"destek_email" text DEFAULT 'destek@yapayzekalab.com' NOT NULL,
	"max_bakiye_tl" numeric(14, 4) DEFAULT '50000' NOT NULL,
	"min_bakiye_tl" numeric(14, 4) DEFAULT '10' NOT NULL,
	"anomali_esik_tl" numeric(14, 4) DEFAULT '500' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_email" text NOT NULL,
	"tip" text NOT NULL,
	"miktar_tl" numeric(14, 4) NOT NULL,
	"onceki_bakiye" numeric(14, 4) NOT NULL,
	"sonraki_bakiye" numeric(14, 4) NOT NULL,
	"aciklama" text DEFAULT '' NOT NULL,
	"metod" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text,
	CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid,
	"model_id" text NOT NULL,
	"type" text NOT NULL,
	"input_usage" integer DEFAULT 0 NOT NULL,
	"output_usage" integer DEFAULT 0 NOT NULL,
	"units_usage" numeric(14, 6) DEFAULT '0' NOT NULL,
	"cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"cost_tl" numeric(14, 4) DEFAULT '0' NOT NULL,
	"response_ms" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ad_soyad" text NOT NULL,
	"bakiye_tl" numeric(14, 4) DEFAULT '0' NOT NULL,
	"toplam_harcama_tl" numeric(14, 4) DEFAULT '0' NOT NULL,
	"toplam_istek" integer DEFAULT 0 NOT NULL,
	"durum" text DEFAULT 'aktif' NOT NULL,
	"kayit_tarihi" timestamp with time zone DEFAULT now() NOT NULL,
	"son_aktivite" timestamp with time zone DEFAULT now() NOT NULL,
	"plan" text DEFAULT 'ucretsiz' NOT NULL,
	"api_key_count" integer DEFAULT 0 NOT NULL,
	"not" text DEFAULT '' NOT NULL,
	"gunluk_limit_tl" numeric(14, 4),
	"password_hash" text,
	"google_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_ts_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_ts_idx" ON "transactions" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_records_user_ts_idx" ON "usage_records" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
