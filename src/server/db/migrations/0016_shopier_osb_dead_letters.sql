-- Paket 3 (Shopier sabit-link OSB otomatik kredilendirme) — dead-letter tablosu.
-- shopier_osb_dead_letters: GEÇERLİ imzalı ama otomatik kredilendirilemeyen OSB
-- bildirimleri (bilinmeyen ürün / tutar uyuşmazlığı / bilinmeyen-çoğul email /
-- yanlış para birimi) KALICI saklanır → para Shopier'de tahsil edildi ama bakiye
-- yüklenemedi vakaları kaybolmaz; admin manuel eşleştirip kredilendirir.
-- ADDITIVE: yalnız yeni tablo + index. Mevcut tablolara DOKUNMAZ. Secret kolon
-- İÇERMEZ (imza/hash saklanmaz). idempotency: shopier_order_id UNIQUE.
-- Rollback: DROP TABLE shopier_osb_dead_letters.
CREATE TABLE IF NOT EXISTS "shopier_osb_dead_letters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shopier_order_id" text NOT NULL UNIQUE,
  "reason" text NOT NULL,
  "buyer_email" text,
  "product_id" text,
  "price_tl" numeric(14, 4),
  "payload_json" jsonb,
  "durum" text NOT NULL DEFAULT 'bekliyor',
  "cozum_notu" text,
  "cozen_admin" text,
  "transaction_id" uuid REFERENCES "transactions"("id"),
  "olusturma" timestamp with time zone NOT NULL DEFAULT now(),
  "cozum" timestamp with time zone
);

-- Admin panelinde bekleyen dead-letter'ları hızlı listelemek için.
CREATE INDEX IF NOT EXISTS "shopier_osb_dead_letters_durum_idx" ON "shopier_osb_dead_letters" ("durum");
