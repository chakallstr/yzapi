-- "Paketlerim" sekmesi: paket duraklatma (per-paket) + "kullandığın kadar öde" modu (per-kullanıcı).
-- paused=true → entitlement istek tüketmez (süre işlemeye DEVAM eder; selection'da AND NOT paused).
-- payg_mode=true → kullanıcının istekleri paket kotası yerine TL bakiyeden token-bazlı düşer.
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payg_mode boolean NOT NULL DEFAULT false;
