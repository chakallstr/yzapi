-- 0042_lane_scheduler.sql
-- Lane-based rate-limit scheduler: provider_profiles'a lane alanları ekle.
-- Her lane = bir Bedrock inference profile (model + region). Scheduler priority
-- sırasıyla lane seçer: sonnet-geo → sonnet-global → opus-geo → opus-global → haiku.
-- RPM cooldown + 429/503 backoff + queue ile 35 RPM hedefi.
-- NULL = lane DEĞİL (mevcut profiller etkilenmez — geriye dönük uyumlu).

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS lane_model text,      -- 'sonnet' | 'opus' | 'haiku' | NULL
  ADD COLUMN IF NOT EXISTS lane_region text,     -- 'geo' | 'global' | 'spillover' | NULL
  ADD COLUMN IF NOT EXISTS rpm_limit integer,    -- RPM limit (NULL = sınırsız)
  ADD COLUMN IF NOT EXISTS lane_priority integer; -- dispatch önceliği (1 = en yüksek, NULL = lane değil)
