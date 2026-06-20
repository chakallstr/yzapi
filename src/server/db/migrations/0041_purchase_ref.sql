-- Paket satın alma takip no'su: her ödeme olayına (transactions) benzersiz YZK-YYMMDD-XXXX.
-- Inert: mevcut satırlar NULL kalır, davranış değişmez. package_id gruplama/arama içindir.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS purchase_ref text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS package_id text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_purchase_ref_uidx
  ON transactions (purchase_ref) WHERE purchase_ref IS NOT NULL;
