-- Canlı Mali İzleme (canli-mali-izleme spec, Task 1).
-- mali_izleme_taramalari: deterministik mali denetim servisinin TEK yazdığı tablo.
-- APPEND-ONLY tarama özeti — her tarama bir satır (verdict + kontrol değerleri + bulgular).
-- ADDITIVE: yalnız yeni tablo + index. Mevcut tablolara (transactions/usage_records/
-- users/payments) DOKUNMAZ. Servis para tablolarından yalnız SELECT okur; yalnız buraya yazar.
-- Secret kolon İÇERMEZ (yalnız özet/jsonb). Rollback: DROP TABLE mali_izleme_taramalari.
CREATE TABLE IF NOT EXISTS "mali_izleme_taramalari" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scan_at" timestamp with time zone NOT NULL DEFAULT now(),
  "verdict" text NOT NULL,
  "checks_json" jsonb NOT NULL,
  "findings_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_processed_usage_ts" timestamp with time zone,
  "last_processed_tx_ts" timestamp with time zone,
  "scan_trigger" text NOT NULL DEFAULT 'cron',
  "duration_ms" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- En son taramayı (ORDER BY scan_at DESC LIMIT 1) ve trend sorgularını hızlandırır.
CREATE INDEX IF NOT EXISTS "mali_izleme_scan_at_idx" ON "mali_izleme_taramalari" ("scan_at");
