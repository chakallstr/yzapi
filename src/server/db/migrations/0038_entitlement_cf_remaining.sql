-- CF reseller mirror: müşterinin GERÇEK kalan CF kotasını (x-codefast-remaining header'ından
-- yakalanan ünite) entitlement'a yazıyoruz. Panel + gate bunu okuyunca bizim sayaç CF ile
-- BİREBİR senkron olur (CF ne düşürürse o düşer). NULL = henüz CF cevabı yakalanmadı / CF paketi değil.
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_remaining integer;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_remaining_at timestamptz;
-- Lazy provisioning: CF'den şimdiye dek SATIN ALINAN toplam ünite (peşin 500 değil, 50'şer).
-- Tüketim = cf_units_ordered - cf_remaining. "Kalan" = daily_limit_snapshot - tüketim.
-- cf_units_ordered, daily_limit_snapshot'a (paketin CF toplamı) ulaşınca top-up durur.
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS cf_units_ordered integer NOT NULL DEFAULT 0;
