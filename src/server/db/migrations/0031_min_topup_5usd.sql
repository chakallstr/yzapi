-- Minimum yükleme 5 USD'ye çıkarıldı (panel: MIN_TOPUP_USD=5 USD-bazlı).
-- Telegram/TL yolu tabanı: 225 TL (~$4.7-5 bandı; $5'lik ödemeyi kur oynamasında bloklamasın diye 238 değil 225).
UPDATE system_config SET min_bakiye_tl = 225 WHERE id = 1 AND min_bakiye_tl < 225;
