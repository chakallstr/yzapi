-- Token Saver kill-switch: tool/araç çıktılarını upstream'e gitmeden sıkıştırma anahtarı.
-- Default KAPALI → deploy INERT (davranış değişmez); sağlık doğrulanınca DB'den açılır
-- (UPDATE system_api_config SET token_saver_enabled=true) — deploy GEREKMEZ, anında etki.
ALTER TABLE system_api_config ADD COLUMN IF NOT EXISTS token_saver_enabled boolean NOT NULL DEFAULT false;
