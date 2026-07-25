-- Bedrock multi-lane provider profiles.
--
-- Bu migration plaintext key içermez. Mevcut bedrock-sonnet-global satırındaki
-- api_key_cipher kopyalanır.
--
-- Güvenli görünürlük:
-- - Bedrock adı yalnız internal provider_profiles label/base_url içinde kalır.
-- - Public paket/API model adlarına provider adı yazılmaz.
-- - Sonnet istekleri yalnız gerçek Sonnet lane'lerine gider.
-- - Opus/Haiku lane'leri sadece kendi gerçek model ID'lerini destekler.

WITH bedrock_key AS (
  SELECT api_key_cipher
  FROM provider_profiles
  WHERE id = 'bedrock-sonnet-global'
    AND api_key_cipher IS NOT NULL
    AND api_key_cipher <> ''
  LIMIT 1
)
INSERT INTO provider_profiles (
  id,
  label,
  base_url,
  api_key_cipher,
  enabled,
  supported_model_ids,
  model_map,
  fallback_provider_id,
  lane_model,
  lane_region,
  rpm_limit,
  lane_priority,
  updated_at
)
SELECT
  v.id,
  v.label,
  v.base_url,
  bedrock_key.api_key_cipher,
  v.enabled,
  v.supported_model_ids,
  v.model_map,
  v.fallback_provider_id,
  v.lane_model,
  v.lane_region,
  v.rpm_limit,
  v.lane_priority,
  now()
FROM (
  VALUES
    (
      'bedrock-sonnet-us',
      'Bedrock Claude Sonnet 4.6 US',
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      true,
      '["claude-sonnet-4-6","claude-sonnet-4.6"]'::jsonb,
      '{"claude-sonnet-4-6":"us.anthropic.claude-sonnet-4-6","claude-sonnet-4.6":"us.anthropic.claude-sonnet-4-6"}'::jsonb,
      null::text,
      'sonnet',
      'geo',
      10,
      1
    ),
    (
      'bedrock-sonnet-global',
      'Bedrock Claude Sonnet 4.6 Global',
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      true,
      '["claude-sonnet-4-6","claude-sonnet-4.6"]'::jsonb,
      '{"claude-sonnet-4-6":"global.anthropic.claude-sonnet-4-6","claude-sonnet-4.6":"global.anthropic.claude-sonnet-4-6"}'::jsonb,
      null::text,
      'sonnet',
      'global',
      10,
      2
    ),
    (
      'bedrock-opus-us',
      'Bedrock Claude Opus 4.6 US',
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      true,
      '["claude-opus-4-6","claude-opus-4.6"]'::jsonb,
      '{"claude-opus-4-6":"us.anthropic.claude-opus-4-6-v1","claude-opus-4.6":"us.anthropic.claude-opus-4-6-v1"}'::jsonb,
      null::text,
      'opus',
      'geo',
      5,
      3
    ),
    (
      'bedrock-opus-global',
      'Bedrock Claude Opus 4.6 Global',
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      true,
      '["claude-opus-4-6","claude-opus-4.6"]'::jsonb,
      '{"claude-opus-4-6":"global.anthropic.claude-opus-4-6-v1","claude-opus-4.6":"global.anthropic.claude-opus-4-6-v1"}'::jsonb,
      null::text,
      'opus',
      'global',
      5,
      4
    ),
    (
      'bedrock-haiku-global',
      'Bedrock Claude Haiku 4.5 Global',
      'https://bedrock-runtime.us-east-1.amazonaws.com',
      true,
      '["claude-haiku-4-5-20251001","claude-haiku-4.5"]'::jsonb,
      '{"claude-haiku-4-5-20251001":"global.anthropic.claude-haiku-4-5-20251001-v1:0","claude-haiku-4.5":"global.anthropic.claude-haiku-4-5-20251001-v1:0"}'::jsonb,
      null::text,
      'haiku',
      'global',
      5,
      5
    )
) AS v (
  id,
  label,
  base_url,
  enabled,
  supported_model_ids,
  model_map,
  fallback_provider_id,
  lane_model,
  lane_region,
  rpm_limit,
  lane_priority
)
CROSS JOIN bedrock_key
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  base_url = EXCLUDED.base_url,
  api_key_cipher = EXCLUDED.api_key_cipher,
  enabled = EXCLUDED.enabled,
  supported_model_ids = EXCLUDED.supported_model_ids,
  model_map = EXCLUDED.model_map,
  fallback_provider_id = EXCLUDED.fallback_provider_id,
  lane_model = EXCLUDED.lane_model,
  lane_region = EXCLUDED.lane_region,
  rpm_limit = EXCLUDED.rpm_limit,
  lane_priority = EXCLUDED.lane_priority,
  updated_at = now();
