-- CodeFast reseller entegrasyonu.
-- packages: CodeFast katalog metadatası (NULL = CodeFast paketi değil → davranış değişmez).
--   cf_catalog_id      → CodeFast catalog item id (order/quote için)
--   cf_api_slug        → proxy slug ('claude-api','codex-api'… → /proxy/<slug>/v1/*)
--   cf_manual          → CodeFast tarafında manual_review (yalnız Claude Max) — anlık key dönmez
--   cf_token_millions  → Claude token ürünleri için sipariş edilecek M token
--   cf_reseller_cost_tl→ alış maliyeti (liste×0.90) — admin panelde marj göstermek için (PUBLIC'E SIZMAZ)
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS cf_catalog_id text,
  ADD COLUMN IF NOT EXISTS cf_api_slug text,
  ADD COLUMN IF NOT EXISTS cf_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cf_token_millions integer,
  ADD COLUMN IF NOT EXISTS cf_reseller_cost_tl numeric(14,4);

-- user_package_entitlements: müşteri-başına CodeFast provisioning.
--   cf_customer_id   → external_customer_id (= yzapi userId)
--   cf_order_id      → CodeFast order id (revoke/iade için)
--   cf_api_slug      → entitlement'a sabitlenen proxy slug
--   cf_rc_key_cipher → cf_rc_live_… müşteri keyi (AES-256-GCM şifreli) — proxy bununla forward eder
--   cf_status        → provisioned | pending_manual | failed
ALTER TABLE user_package_entitlements
  ADD COLUMN IF NOT EXISTS cf_customer_id text,
  ADD COLUMN IF NOT EXISTS cf_order_id text,
  ADD COLUMN IF NOT EXISTS cf_api_slug text,
  ADD COLUMN IF NOT EXISTS cf_rc_key_cipher text,
  ADD COLUMN IF NOT EXISTS cf_status text;
