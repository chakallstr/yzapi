-- Sonnet package pricing/rate setup.
--
-- İstek:
-- - 1 günlük Sonnet paketi satışta: 150 TL.
-- - Kendin Yap Sonnet paketi: en fazla haftalık, günlük 150 TL.
-- - Her API key için hazır rate alanı: default_per_key_per_minute = 10.
--
-- Not:
-- - Session/concurrent-session için mevcut şemada paket/API-key kolonu yok.
-- - Bedrock/provider adı public paket metnine yazılmaz.

UPDATE packages
SET
  ad = 'Sonnet 4.6 Sınırsız — 1 Gün',
  kategori = 'Claude',
  aciklama = 'Sonnet 4.6 erişimi. 24 saat geçerli. Günlük kota sınırsız olarak tanımlıdır; yoğunluk durumunda adil kullanım hız kuyruğu uygulanır.',
  tip = 'request_limit',
  gunluk_istek_limiti = 1000000,
  sure_gun = 1,
  sure_saat = 24,
  allowed_models = '["claude-sonnet-4-6"]'::jsonb,
  fiyat_tl = 150,
  fiyat_usd = 0,
  enabled = true,
  satista = true,
  display_order = 3,
  is_configurable = false,
  min_gunluk_istek = null,
  max_gunluk_istek = null,
  min_sure_gun = null,
  max_sure_gun = null,
  birim_fiyat_usd_per_50 = null,
  cf_unit_cost_tl = null,
  birim_tipi = 'istek',
  birim_satis_override_tl = null,
  saatlik_limit = null,
  max_context_tokens = 1000000,
  tpm_limit = null,
  provider_base_url = null,
  provider_api_key_cipher = null,
  cf_catalog_id = null,
  cf_api_slug = null,
  cf_manual = false,
  is_token_pool = false,
  token_pool_amount = null,
  premium_model_id = 'claude-sonnet-4-6',
  updated_at = now()
WHERE id = 'sonnet-unlimited-1d';

INSERT INTO packages (
  id,
  ad,
  kategori,
  aciklama,
  tip,
  gunluk_istek_limiti,
  sure_gun,
  sure_saat,
  allowed_models,
  fiyat_tl,
  fiyat_usd,
  enabled,
  satista,
  display_order,
  is_configurable,
  min_gunluk_istek,
  max_gunluk_istek,
  min_sure_gun,
  max_sure_gun,
  birim_fiyat_usd_per_50,
  cf_unit_cost_tl,
  birim_tipi,
  birim_satis_override_tl,
  saatlik_limit,
  max_context_tokens,
  tpm_limit,
  provider_base_url,
  provider_api_key_cipher,
  cf_catalog_id,
  cf_api_slug,
  cf_manual,
  is_token_pool,
  token_pool_amount,
  premium_model_id,
  updated_at
) VALUES (
  'sonnet-unlimited-builder',
  'Sonnet 4.6 Sınırsız — Kendin Yap',
  'Claude',
  'Sonnet 4.6 erişimi. Süreyi 1-7 gün arasında seçebilirsiniz. Günlük fiyat 150 TL; yoğunluk durumunda adil kullanım hız kuyruğu uygulanır.',
  'request_limit',
  750000,
  7,
  168,
  '["claude-sonnet-4-6"]'::jsonb,
  1050,
  0,
  true,
  true,
  4,
  true,
  750000,
  750000,
  1,
  7,
  null,
  null,
  'sabit',
  0.0002,
  null,
  1000000,
  null,
  null,
  null,
  null,
  null,
  false,
  false,
  null,
  'claude-sonnet-4-6',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  ad = EXCLUDED.ad,
  kategori = EXCLUDED.kategori,
  aciklama = EXCLUDED.aciklama,
  tip = EXCLUDED.tip,
  gunluk_istek_limiti = EXCLUDED.gunluk_istek_limiti,
  sure_gun = EXCLUDED.sure_gun,
  sure_saat = EXCLUDED.sure_saat,
  allowed_models = EXCLUDED.allowed_models,
  fiyat_tl = EXCLUDED.fiyat_tl,
  fiyat_usd = EXCLUDED.fiyat_usd,
  enabled = EXCLUDED.enabled,
  satista = EXCLUDED.satista,
  display_order = EXCLUDED.display_order,
  is_configurable = EXCLUDED.is_configurable,
  min_gunluk_istek = EXCLUDED.min_gunluk_istek,
  max_gunluk_istek = EXCLUDED.max_gunluk_istek,
  min_sure_gun = EXCLUDED.min_sure_gun,
  max_sure_gun = EXCLUDED.max_sure_gun,
  birim_fiyat_usd_per_50 = EXCLUDED.birim_fiyat_usd_per_50,
  cf_unit_cost_tl = EXCLUDED.cf_unit_cost_tl,
  birim_tipi = EXCLUDED.birim_tipi,
  birim_satis_override_tl = EXCLUDED.birim_satis_override_tl,
  saatlik_limit = EXCLUDED.saatlik_limit,
  max_context_tokens = EXCLUDED.max_context_tokens,
  tpm_limit = EXCLUDED.tpm_limit,
  provider_base_url = EXCLUDED.provider_base_url,
  provider_api_key_cipher = EXCLUDED.provider_api_key_cipher,
  cf_catalog_id = EXCLUDED.cf_catalog_id,
  cf_api_slug = EXCLUDED.cf_api_slug,
  cf_manual = EXCLUDED.cf_manual,
  is_token_pool = EXCLUDED.is_token_pool,
  token_pool_amount = EXCLUDED.token_pool_amount,
  premium_model_id = EXCLUDED.premium_model_id,
  updated_at = now();

UPDATE packages
SET
  satista = false,
  enabled = true,
  display_order = CASE id
    WHEN 'sonnet-unlimited-3d' THEN 90
    WHEN 'sonnet-unlimited-7d' THEN 91
    ELSE display_order
  END,
  updated_at = now()
WHERE id IN ('sonnet-unlimited-3d', 'sonnet-unlimited-7d');

UPDATE system_api_config
SET
  default_per_key_per_minute = 10,
  updated_at = now()
WHERE id = 1;
