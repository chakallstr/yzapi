-- 0026_configurable_packages.sql
-- Configurable (dinamik fiyatlı) paketler: kullanıcı satın alma sırasında
-- limit ve süreyi kendisi seçer; fiyat sunucuda hesaplanır.
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS is_configurable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_gunluk_istek integer,
  ADD COLUMN IF NOT EXISTS max_gunluk_istek integer,
  ADD COLUMN IF NOT EXISTS min_sure_gun integer,
  ADD COLUMN IF NOT EXISTS max_sure_gun integer,
  ADD COLUMN IF NOT EXISTS birim_fiyat_usd_per_50 numeric(10, 4);
