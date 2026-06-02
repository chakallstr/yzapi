-- Gözcü (Sentinel) — kalıcı sistem nöbetçisi tabloları.
-- ADDITIVE: yalnız yeni tablolar + index. Mevcut tablolara (transactions/usage_records/
-- users/payments/mali_izleme_taramalari) DOKUNMAZ. Gözcü motoru sinyal tablolarından
-- yalnız SELECT okur; yalnız buraya yazar. Secret kolon İÇERMEZ.
-- Rollback: DROP TABLE gozcu_llm_spend; DROP TABLE gozcu_signals; DROP TABLE gozcu_findings;

-- 1) gozcu_findings — insan-yüzlü bulgu yaşam döngüsü (dedup_key başına TEK açık bulgu).
--    Re-tespit = upsert (severity/measured/last_seen_at güncelle). Green → status='resolved'.
CREATE TABLE IF NOT EXISTS "gozcu_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain" text NOT NULL,                 -- money | uptime | provider | security
  "check_name" text NOT NULL,
  "severity" text NOT NULL,               -- green | yellow | red
  "status" text NOT NULL DEFAULT 'open',  -- open | ack | snoozed | resolved
  "dedup_key" text NOT NULL UNIQUE,       -- "<domain>:<check_name>"
  "measured" text NOT NULL,
  "threshold" text NOT NULL,
  "root_cause" text,                      -- Katman-2 (LLM) teşhisi; advisory
  "suggested_fix" text,                   -- Katman-2 çözüm önerisi; advisory metin
  "confidence" numeric(4, 3),             -- 0..1 (LLM güveni); null = deterministik
  "evidence_json" jsonb,
  "autoheal_attempted" boolean NOT NULL DEFAULT false,
  "autoheal_result_json" jsonb,
  "acked_by" text,
  "snoozed_until" timestamp with time zone,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "gozcu_findings_status_idx" ON "gozcu_findings" ("status", "last_seen_at" DESC);
CREATE INDEX IF NOT EXISTS "gozcu_findings_domain_sev_idx" ON "gozcu_findings" ("domain", "severity", "last_seen_at" DESC);

-- 2) gozcu_signals — tarama BAŞINA zaman-serisi özeti (panel grafikleri + activity-gate).
--    Per-request DEĞİL → tek-instance DB yükü kısıtını korur (dakikada birkaç satır).
CREATE TABLE IF NOT EXISTS "gozcu_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scan_at" timestamp with time zone NOT NULL DEFAULT now(),
  "verdict" text NOT NULL,
  "domain_verdicts_json" jsonb NOT NULL,
  "metrics_json" jsonb,                   -- collector window + heartbeat yaşları
  "red_count" integer NOT NULL DEFAULT 0,
  "yellow_count" integer NOT NULL DEFAULT 0,
  "last_usage_ts" timestamp with time zone,
  "last_tx_ts" timestamp with time zone,
  "scan_trigger" text NOT NULL DEFAULT 'cron',
  "duration_ms" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "gozcu_signals_scan_at_idx" ON "gozcu_signals" ("scan_at" DESC);

-- 3) gozcu_llm_spend — Katman-2 LLM çağrı defteri (aylık bütçe). usage_records'ı ASLA
--    kirletmez (billing kutsal). billing_month aylık toplam sorgusunu hızlandırır.
CREATE TABLE IF NOT EXISTS "gozcu_llm_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scan_at" timestamp with time zone NOT NULL DEFAULT now(),
  "check_name" text NOT NULL,
  "model" text NOT NULL,
  "tokens_in" integer NOT NULL DEFAULT 0,
  "tokens_out" integer NOT NULL DEFAULT 0,
  "billing_month" text NOT NULL,          -- 'YYYY-MM'
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "gozcu_llm_spend_month_idx" ON "gozcu_llm_spend" ("billing_month");
