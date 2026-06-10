-- Paket-bazlı upstream override: ikisi de DOLU ise paket kapsamındaki istekler
-- bu endpoint'e gider (key AES-256-GCM şifreli, provider_profiles ile aynı cipher).
-- Boş/NULL iken davranış değişmez (normal per-model routing). Admin panelden doldurulur.
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS provider_base_url text,
  ADD COLUMN IF NOT EXISTS provider_api_key_cipher text;
