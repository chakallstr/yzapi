-- 0025_models_maintenance_notice.sql
-- Cosmetic-only admin toggle for the "only Claude works, other models under
-- maintenance" notice (panel banner + model badges + status note). Does NOT
-- gate the API — that is maintenance_mode_for_api. Deploys INERT: default false,
-- so the deploy changes nothing on the site until an admin flips it on.
ALTER TABLE system_api_config
  ADD COLUMN IF NOT EXISTS models_maintenance_active BOOLEAN NOT NULL DEFAULT false;
