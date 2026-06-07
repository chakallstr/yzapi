-- Faz 4a: added_models'a görsel modeli desteği (type + per-image fiyat)
ALTER TABLE "added_models"
  ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'Metin',
  ADD COLUMN IF NOT EXISTS "image_price_usd" numeric(14,8) NOT NULL DEFAULT '0';
