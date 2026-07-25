-- 0045_bedrock_lane_sonnet_only.sql
--
-- 0044'ün düzeltmesi + katalogda SADECE claude-sonnet-4-6 görünmesi için
-- gerekli tüm değişiklikler. Tek idempotent migration.
--
-- Amaç (orijinal plan, bedrock-sonnet46-identity-relabel-gpt-session.md):
--   - Müşteri yalnızca claude-sonnet-4-6 görür ve ister.
--   - 5 Bedrock lane'inin hepsi claude-sonnet-4-6 isteğini alır → 35 RPM toplam
--     (20 RPM gerçek Sonnet + 10 RPM Opus maskeli + 5 RPM Haiku maskeli).
--   - Opus/Haiku lane'ine düşen Sonnet isteği upstream'de kendi gerçek
--     modeline map edilir (modelMap); identity relabel "Claude Sonnet 4.6"
--     maskesi yanıtta sızıntıyı temizler.
--   - Bedrock/provider adı public katalogda görünmez.
--   - Opus/Haiku/Fable/Sonnet-5 modelleri katalogdan tamamen kaldırılır.
--
-- Yapılanlar:
--   1. 5 Bedrock lane'inin supportedModelIds + modelMap → claude-sonnet-4-6-only
--   2. cf-claude profilini disable (8 Claude modelini katalogdan kaldırır)
--   3. wellflow profilini disable (boş zaten, ama garanti)
--   4. sub-claude profilini disable (zaten disabled, explicit garanti)
--   5. Opus/Haiku/Fable içeren enabled paketleri disable
--
-- Not: Disable (enabled=false) tercih edildi, DELETE değil. Nedeni:
--   - Reversible (geri alınabilir)
--   - Foreign-key / referential bütünlüğü korunur (usage_records, package_purchases
--     gibi tablolar profile_id/package_id referans edebilir)
--   - Katalog mantığı zaten enabled profillerin birleşimi → enabled=false
--     katalogdan kaldırmak için yeterli
--
-- Idempotent: tekrar çalıştırma aynı sonucu verir.

-- ── 1. Bedrock lane'leri: claude-sonnet-4-6-only ──────────────────────────────
UPDATE provider_profiles
SET
  supported_model_ids = '["claude-sonnet-4-6","claude-sonnet-4.6"]'::jsonb,
  model_map = CASE id
    WHEN 'bedrock-sonnet-us' THEN
      '{"claude-sonnet-4-6":"us.anthropic.claude-sonnet-4-6","claude-sonnet-4.6":"us.anthropic.claude-sonnet-4-6"}'::jsonb
    WHEN 'bedrock-sonnet-global' THEN
      '{"claude-sonnet-4-6":"global.anthropic.claude-sonnet-4-6","claude-sonnet-4.6":"global.anthropic.claude-sonnet-4-6"}'::jsonb
    WHEN 'bedrock-opus-us' THEN
      '{"claude-sonnet-4-6":"us.anthropic.claude-opus-4-6-v1","claude-sonnet-4.6":"us.anthropic.claude-opus-4-6-v1"}'::jsonb
    WHEN 'bedrock-opus-global' THEN
      '{"claude-sonnet-4-6":"global.anthropic.claude-opus-4-6-v1","claude-sonnet-4.6":"global.anthropic.claude-opus-4-6-v1"}'::jsonb
    WHEN 'bedrock-haiku-global' THEN
      '{"claude-sonnet-4-6":"global.anthropic.claude-haiku-4-5-20251001-v1:0","claude-sonnet-4.6":"global.anthropic.claude-haiku-4-5-20251001-v1:0"}'::jsonb
  END,
  updated_at = now()
WHERE id IN (
  'bedrock-sonnet-us',
  'bedrock-sonnet-global',
  'bedrock-opus-us',
  'bedrock-opus-global',
  'bedrock-haiku-global'
);

-- ── 2-4. Claude sağlayıcı profillerini disable ────────────────────────────────
-- cf-claude: 8 Claude modelini katalogdan kaldırır (asıl kataloğu kirleten).
-- wellflow:  supported_model_ids zaten boş; garanti için disable.
-- sub-claude: zaten enabled=false; explicit garanti.
UPDATE provider_profiles
SET enabled = false, updated_at = now()
WHERE id IN ('cf-claude', 'wellflow', 'sub-claude');

-- ── 5. Opus/Haiku/Fable içeren enabled paketleri disable ──────────────────────
-- Bu paketleri almış müşteriler artık Opus/Haiku/Fable çağrılamayacak (404).
-- Satışta olmayanlar (satista=f) zaten yeni satış almıyor; enabled=false
-- mevcut kullanımı da durdurur. Satışta olanlar (pool-fable/pool-opus) da
-- enabled=false → hem yeni satış hem mevcut kullanım durur.
UPDATE packages
SET enabled = false, updated_at = now()
WHERE enabled = true
  AND allowed_models ?| ARRAY[
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-opus-4-8',
    'claude-opus-4.8',
    'claude-opus-4.7',
    'claude-opus-4.6',
    'claude-haiku-4-5-20251001',
    'claude-haiku-4.5',
    'claude-fable-5',
    'claude-sonnet-5'
  ];
