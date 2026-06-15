# IBAN Ödeme — İki Aşamalı WhatsApp Bildirimi (tasarım)

Tarih: 2026-06-15
Proje: yzapi (yapayzekalab) — canlı ödeme sistemi
Durum: tasarım onaylandı (Ufuk, 2026-06-15)

## Amaç

IBAN ile bakiye yükleme akışında Ufuk'a (admin) giden WhatsApp bildirimini
iki aşamalı ve daha bilgili hale getirmek + müşterinin butona basıp bildirimleri
spam'lemesini önlemek.

1. **Aşama 1 — "Ödeme hazırlanıyor"**: Müşteri ödeme butonuna basınca IBAN gösterilir
   ve Ufuk'a otomatik bir "ödeme hazırlanıyor" WhatsApp gider (müşteri + tutar bilgisiyle).
2. **Aşama 2 — "Ödeme yapıldı"**: Müşteri ödedikten sonra "Ödemeyi yaptım" butonuna basar;
   kendi WhatsApp'ı hazır mesajla açılır VE sistem de Ufuk'a otomatik "ödeme yapıldı"
   bildirimi atar (çift güvence).

## Sınırlar / Kırmızı çizgiler

- Billing/kredi mantığına **dokunulmaz**. Otomatik onay/kredi **yok** — onayı Ufuk manuel verir.
- **DB şeması/migration YOK.** Aşama 2 (`/iban/confirm`) yalnızca sahiplik doğrular + bildirim
  atar; `payments`/`pendingIbanPayments` satırlarına yazmaz, `durum` değişmez. (Migration'ın
  getireceği izole-deploy/renumber riskini almamak için bilinçli karar.)
- Bildirim gönderimi **never-throw**; hata ödeme akışını bloklamaz (mevcut davranış korunur).
- Yerel kalır; deploy için çift onay + 3 QA (≥2 PASS) zorunlu.

## Mevcut durum (kod haritası)

- Frontend: `src/yapayzekalab/tab-account.jsx` — "Bakiye Yükle" formu, `onTopUp()` →
  `POST /api/payments/iban/init`, dönen `iban` paneli, mevcut `buildWhatsAppPaymentLink`.
- Backend init: `src/server/routes/payments.ts` `POST /api/payments/iban/init` — `payments`
  (durum "bekliyor") + `pendingIbanPayments` satırı yazar, `adminPaymentNotificationEmail()`
  ve `notifyAdmin({kind:"odeme_denemesi", title:"Ödeme başlatıldı (IBAN)", ...})` çağırır.
- Bildirim servisi: `src/server/services/admin-notify-service.ts` — OpenWA HTTP API
  (`POST /api/sessions/{id}/messages/send-text`, `x-api-key`), `formatAdminEvent()`.
  Prod'da etkin (Ufuk "geliyor ama yetersiz" dedi).
- Rate-limit util: `src/server/services/rate-limit-service.ts` — `consumeBucket(scope, limit)`.

## Tasarım

### Aşama 1 — init bildirim iyileştirme + 60 sn tekilleştirme

`POST /api/payments/iban/init`:

- **Satır tekilleştirme (DB hijyeni)**: init başında kullanıcının son `payments` kaydına
  bakılır (`metod='iban' AND durum='bekliyor'`, `desc(olusturma)`). < 60 sn önce oluşmuş VE
  aynı `payableTL` ise → o satır yeniden kullanılır (`reused=true`), yeni `payments`/
  `pendingIbanPayments` satırı açılmaz, aynı `paymentId` döner. Aksi halde yeni satır(lar).
- **Bildirim tekilleştirme (asıl gereksinim)**: admin WhatsApp `notifyAdmin` yalnızca
  `!reused` VE `consumeBucket('iban_notify_'+userId, 1).allowed` iken atılır → kullanıcı başına
  **en fazla 1 bildirim/dk** (tutar değişse bile). IBAN her durumda gösterilir.
- **Bildirim metni**: başlık "Ödeme hazırlanıyor (IBAN)", içerik müşteri email + ad soyad +
  tutar (**USD ≈ TL**) + referans (iç `idempotencyKey`) + durum. (`formatAdminEvent`'e opsiyonel
  `amountUsd` eklenir — additive, diğer olay tiplerini etkilemez.)

### Aşama 2 — `POST /api/payments/iban/confirm` (yeni uç, DB-yazmaz)

- Auth: `userAuth`, `requireWhatsappVerified` (init ile aynı).
- Body: `{ paymentId }`. Kullanıcıya ait + `metod='iban'` ödeme satırı doğrulanır (yoksa 404).
  Spam'i bu sahiplik kontrolü + rate-limit engeller; rastgele id ile bildirim tetiklenemez.
- Rate-limit: `consumeBucket('iban_confirm_'+userId, 1)` → 1/dk. Aşıldıysa **429** + `retryAfter`.
- Etki: `notifyAdmin({kind:"odeme_yapildi", title:"Ödeme YAPILDI (müşteri bildirdi)", ...})`
  (email + ad + USD≈TL + referans). **DB'ye yazmaz, durum değişmez.**
- Yanıt: `{ ok: true }`.

### Frontend (`tab-account.jsx`)

- IBAN panelindeki mevcut WhatsApp butonu **"Ödemeyi yaptım — WhatsApp'tan bildir"** olarak
  yeniden adlandırılır ve `onConfirmIbanPaid()` handler'ına bağlanır:
  - Müşterinin WhatsApp'ını `wa.me` ile açar (backend'in döndürdüğü "Ödeme yapıldı ✅ …" mesajı).
  - Aynı anda `POST /api/payments/iban/confirm { paymentId }` çağırır (sistem de Ufuk'a bildirir).
  - Yalnızca **iban** akışında; crypto paneli mevcut düz wa.me linkini korur.
- `paymentInstruction` state'ine `paymentId` eklenir (confirm çağrısı için).
- Ödeme (init) butonu başarılı iban init'ten sonra **60 sn geri-sayımla** pasifleşir
  ("Bilgiler gönderildi · {n}s"); süre sonunda tekrar aktif. Sunucu yine tekilleştirir.
- i18n: yeni metinler TR/EN (mevcut `useT`/fragment dict desenine uygun); contract testleri
  (`payment-safety-contract`, `documents-content-contract`) PASS kalmalı.

### Backend WhatsApp mesajı (müşterinin gönderdiği)

`buildPaymentNotification` mesajının ilk satırı "Ödeme yapıldı ✅ — YapayZekaLab ödeme bildirimi"
olur (müşteri bu butona ödedikten sonra basar). Alanlar: Yöntem / Bakiye $X / Ödeme ₺Y / Hesap email.

## Test / Doğrulama

- Backend unit/itest: tekilleştirme (aynı tutar < 60sn → tek satır/tek bildirim),
  confirm rate-limit (2. çağrı 60sn içinde 429), confirm bakiyeyi/durumu değiştirmiyor,
  notify never-throw.
- Frontend: buton geri-sayım, "Ödemeyi yaptım" wa.me link + confirm çağrısı.
- 3-agent QA (≥2 PASS) deploy öncesi şart.

## Dosyalar

- `src/server/services/admin-notify-service.ts` — `AdminEventKind`'e `"odeme_yapildi"` + ✅ ikon;
  `AdminNotifyEvent.amountUsd?`; `formatAdminEvent` USD≈TL satırı.
- `src/server/routes/payments.ts` — init dedup + notify gate + metin; yeni `/iban/confirm` ucu;
  `buildPaymentNotification` mesaj başlığı.
- `src/yapayzekalab/tab-account.jsx` — `onConfirmIbanPaid()` + 60 sn cooldown + `paymentId` state.
- `src/yapayzekalab/i18n/strings/account.js` — TR/EN yeni metinler.
- Test: `admin-notify-service.test.ts` (USD render + yeni kind), payments itest (dedup + confirm).
- **Migration YOK.**
