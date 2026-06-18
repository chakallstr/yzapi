-- Redeem code "kopyalandı/dağıtıldı" işareti. Key sistemde kalır; admin 'Kopyala' deyince
-- copied_at set edilir → admin panelde kararır (kullanılınca da used_count ile kararır).
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS copied_at timestamptz;
