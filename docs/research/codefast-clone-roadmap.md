# CodeFast → yzapi "Tam Klon" Yol Haritası (fazlı)

> Karar (2026-06-04): CodeFast'in tüm paket+sistem+toggle yapısı yzapi'ye sırayla uyarlanacak.
> Her faz = kendi spec → plan → uygulama döngüsü + yzapi'nin **bağlayıcı 3-QA (≥2 PASS)** kapısı.
> Referans envanter: [codefast-inventory.md]. yzapi mimari haritası: bu repodaki kaynaklar.
> **İlke:** Para-kritik DOKUNULMAZ alanlara dokunma; kota/entitlement kapısı **reserve'den ÖNCE** (request-guard).
> **İlke:** "Her şey aç/kapat" — her paket + her panel sistemi admin'den toggle edilebilir (feature flags).

## yzapi'de hazır kullanılacaklar (yeniden kullanım)
- `plans` tablosu (kullanılmıyor) → paket şemasına temel
- Bakiye + ledger (`users.bakiyeTL`, `transactions`, idempotencyKey) → "Bakiye ile al"
- Ödeme: **Shopier (kart)**, **Cryptomus (crypto)**, IBAN, Telegram top-up → paket satın almaya bağlanır (`creditUserBalance`)
- Auth: email/şifre + **Google OAuth** + Telegram + WhatsApp OTP (GitHub yok)
- API key: çok-key/kullanıcı, `yzk_live_`
- Katalog: `MASTER_MODELS` + `added_models`; fiyat `pricing-service`
- Gözcü/mali-izleme → public status board verisi
- Admin panel `ADMIN_SECTIONS`; kullanıcı SPA tab'ları (`App.jsx`)

## Fazlar

### Faz 1 — Paket Satış Çekirdeği (gelir motoru) ⭐ ilk
- **Şema (migration 0019):** `packages` (ad, kategori, tip[request-limit|token-bundle|studio-credit|account-delivery], fiyat USD/TL, süre gün, kotalar[günlük istek/token/kredi], allowedModels, **enabled toggle**, display_order, özelleştirme min/max/step), `user_package_entitlements` (aktif paket, expires_at, kullanılan kota sayaçları, last_reset, ödeme tx).
- **Admin "Paketler" section:** CRUD + aç/kapat + sıralama + kategori.
- **User `tab-packages.jsx`:** kategori filtre sekmeleri, paket kartları, "Paketi özelleştir" (limit/token slider + canlı fiyat), "Bakiye ile al" (+ Kart/Crypto mevcut sağlayıcılarla).
- **Entitlement enforcement:** yeni `entitlement-service` + `request-guard`'da **reserve ÖNCESİ** kapı (expiry, günlük istek kotası, token kotası, allowedModels). Settle sonrası sayaç güncelle. (Billing matematiğine DOKUNMA.)
- **Dashboard/Billing:** aktif paket + kalan limit gösterimi.
- **Job:** günlük/aylık kota reset + expiry tarama.

### Faz 2 — Ödeme Genişletme + Kodlar + Vitrin Parite
- Hediye/Geçiş **kodu** sistemi (admin üretir → kullanıcı kullanır → bakiye veya paket).
- **DodoPayments** entegrasyonu (kart; CodeFast'in sağlayıcısı) — mevcut webhook desenini izler.
- Min ödeme kuralı (₺45 / 1 USD), "sadece bakiye ile alınabilir" mantığı.
- Sipariş listesi + bakiye hareketleri (CodeFast billing pariteleri).

### Faz 3 — AI Chat Playground
- `tab-ai-chat.jsx`: provider/model/temperature/max-tokens/**streaming toggle**, geçmiş, dışa aktar. Kullanıcının kendi key'iyle `/v1/chat/completions`. Yeni billing yok.

### Faz 4 — Studio (Görsel/Video) + Medya Uçları  ⚠️ büyük
- yzapi medya uçları şu an **501** (CLAUDE.md). Gerekir: medya katalog şeması + medya billing (`chargeImage`/`chargeVideo`) + route wiring + Studio UI (model/oran/kalite) + **kuyruk** (max-eşzamanlı). Kendi detaylı spec'i olacak.

### Faz 5 — Public Status + Destek + Docs
- Public **uptime/status board** (Gözcü verisinden; 15dk periyot, 24s uptime%, gecikme).
- **Destek ticket** sistemi (veya CodeFast gibi WhatsApp-yönlendirmeli).
- **Docs** sayfası: paket-başı Base URL rehberi + model listeleri + kopyala.

### Faz 6 — Hesap & i18n & Cila
- **GitHub OAuth** (Google var), **hesap-teslim paket** fulfillment akışı (WhatsApp manuel), **i18n** TR/EN toggle, profil geliştirmeleri (bağlı hesaplar, şifre belirle).

## Çapraz kesit (her fazda)
- **Feature flags:** her panel sistemi (paketler, ai-chat, studio, status, destek) + her paket admin'den aç/kapat (`systemConfig` genişletme).
- **3-QA kapısı:** her faz canlıya ≥2 PASS ile çıkar.
- **No-leak:** sağlayıcı codename/base_url sızmaz (mevcut scan:public + contract testleri).
