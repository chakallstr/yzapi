-- Custom Package Builder (self-service) — birim maliyet + birim tipi + maliyet-0 sabit-satış override.
-- cf_unit_cost_tl: TL/birim/gün (lifetime ürünlerde TL/birim, gün çarpanı yok). Geliş = cf_unit_cost_tl × limit × gün.
-- birim_tipi: 'istek' | 'kredi' | 'lifetime' | 'sabit'. UI birimi + fiyat kuralı bunu okur.
-- birim_satis_override_tl: maliyet-0 ürünler (ör. NVIDIA) için hacim-marj yerine kullanılan sabit birim-satış.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cf_unit_cost_tl numeric(14,6);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS birim_tipi text NOT NULL DEFAULT 'istek';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS birim_satis_override_tl numeric(14,4);
