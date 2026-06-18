-- Paket başına "kişi başı 1 kez" satın alma limiti (özellikle ücretsiz/free tier suistimalini önler).
-- per_user_once=true ise: kullanıcının o paket için zaten bir entitlement'ı varsa yeniden alamaz.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS per_user_once boolean NOT NULL DEFAULT false;
