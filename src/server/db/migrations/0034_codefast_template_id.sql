-- CodeFast package-templates (hibrit provisioning) desteği.
-- packages.cf_template_id: CF panelinde kayıtlı paket şablonunun id'si.
--   DOLU  → order/quote `{template_id, external_customer_id}` ile yapılır (CF'nin yeni önerdiği akış).
--   NULL  → mevcut `items:[{catalog_id, duration_days, limit_amount}]` akışı (davranış DEĞİŞMEZ).
-- ⚠️ Tek-ürünlü template varsay: proxy override-chain tek cf_api_slug ile yönlenir; çok-ürünlü
--    bundle template'lerde yalnız o paketin cf_api_slug'ına giden trafik servis edilir.
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS cf_template_id text;
