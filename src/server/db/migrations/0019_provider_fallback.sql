-- 0019_provider_fallback.sql
-- Per-profile failover target (soft ref to provider_profiles.id; no hard FK).
-- Nullable: until set, behavior is unchanged (no failover). See
-- docs/superpowers/specs/2026-06-05-provider-failover-design.md §3.1.
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS fallback_provider_id text;
