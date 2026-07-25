-- Proxy concurrent-session/in-flight request limits.
--
-- Varsayılan:
-- - Her API key için aynı anda en fazla 2 aktif session.
-- - Her API key için aynı anda en fazla 10 açık proxy isteği.
--
-- Not: Uygulama tarafındaki gate mevcut tek Node process içinde memory tabanlıdır.
-- Çoklu process/instance çalışmada dağıtık gate (Redis/Postgres lock/counter) gerekir.

ALTER TABLE system_api_config
  ADD COLUMN IF NOT EXISTS default_concurrent_sessions_per_key integer NOT NULL DEFAULT 2;

ALTER TABLE system_api_config
  ADD COLUMN IF NOT EXISTS default_concurrent_requests_per_key integer NOT NULL DEFAULT 10;

UPDATE system_api_config
SET
  default_concurrent_sessions_per_key = 2,
  default_concurrent_requests_per_key = 10,
  updated_at = now()
WHERE id = 1;
