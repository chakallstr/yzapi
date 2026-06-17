# Tasarım: "Kendi Paketini Oluştur" (Self-Service Custom Package Builder)

Tarih: 2026-06-18
Proje: yzapi (yapayzekalab.org)
Durum: onaylandı (brainstorming), implementasyon planı bekliyor

## 1. Amaç

Müşterinin, Paketler sayfasında **kendi paketini yapılandırıp anlık fiyatını görerek satın
alabileceği** bir arayüz. Ürün (model ailesi) + günlük istek limiti + süre seçilir; fiyat
canlı hesaplanır; TL bakiyesinden satın alınır; CF üzerinden anında provision edilir.

## 2. Mevcut altyapı (genişletilecek — sıfırdan değil)

Sistemde hâlihazırda **configurable-package** mekanizması var:
- `packages.is_configurable` + `min_gunluk_istek`/`max_gunluk_istek` + `min_sure_gun`/`max_sure_gun` + `birim_fiyat_usd_per_50` (migration 0026).
- `previewConfigurablePrice(packageId, customLimit, customDays)` → fiyat önizleme.
- `tab-packages.jsx` → `ConfigurablePackageCard` (limit/gün seçip fiyat gösteren kart).
- Satın alma: `purchaseConfigurable...` → atomik bakiye debit → `provisionCodefastEntitlement` (CF items-flow: `{catalog_id, limit_amount, duration_days}`) → entitlement; başarısızsa otomatik iade.

Bu tasarım bu altyapıyı **genişletir**: (a) fiyat motorunu CF-maliyet bazlı + hacim-kademeli marja çevirir, (b) slider adım/taban kurallarını ekler, (c) per-ürün birim tipini (istek/kredi/lifetime/maliyet-0) yönetir, (d) builder UI'sini öne çıkarır.

## 3. Kapsam

**Builder'a giren ürünler** (her CF ürünü `is_configurable=true` + uygun min/max + birim-maliyet ile):
- **Metin aileleri** (birim = istek/gün, slider'lı): Codex (GPT-5.5/5.4), Gemini, Grok, Composer, GLM.
- **Görsel** (birim = kredi/gün, slider'lı): GPT Image 2 Studio, Grok Imagine Studio.
- **NVIDIA** (maliyet ₺0 → sabit birim-satış fiyatı, hacim-marj uygulanmaz): istek/gün slider'lı.
- **Lifetime/bakiye** (Open Source API, Kimi K2.7 Code): tek bakiye-limit seçimi, **süre slider'ı yok** (ömür-boyu).

**Kapsam dışı:** Sınırsız Kimi K2.6 (limitsiz — yapılandırılacak limit yok; sabit paket kalır).

Custom paketler **katalogda görünmez**; yalnız müşterinin entitlement (aktif hak) listesinde yer alır. Katalog şişmez.

## 4. Slider / sınır kuralları

**Günlük limit (metin & görsel):**
- Minimum: **50**.
- 50 → 500 arası: **5'er** adım (50, 55, 60 … 495, 500).
- 500 üstü: **50'şer** adım (500, 550, 600 …).
- Maksimum: ürün-bazlı `max_gunluk_istek` (varsayılan 5000; görselde daha düşük, ör. 500 kredi/gün).

**Süre:** 1 → 90 gün **serbest**, 1'er gün adım (üst sınır `max_sure_gun`, ayarlanabilir).
Lifetime ürünlerde süre seçimi gizli.

## 5. Fiyat motoru (backend — `previewConfigurablePrice` genişletilir)

Tüm hesap backend'de; **frontend yalnız final TL fiyatı görür** (geliş/marj/maliyet ASLA sızmaz — provider-leak kuralı).

**Adım 1 — Geliş (CF maliyeti):**
Her ürün için DB'de saklı **birim maliyet** `cf_unit_cost_tl` = `base_price_amount / base_limit / 30 × 0.90` (CF quote'tan türetilir, deploy/CF-çağrısı gerektirmez — anlık).
- `geliş = cf_unit_cost_tl × limit × gün` (metin/görsel/NVIDIA).
- Lifetime: `geliş = cf_unit_cost_tl × limit` (birim "birim/ömür" yorumlanır; gün çarpanı yok).
- (Doğrulama: günde bir / değişiklikte CF quote ile `cf_unit_cost_tl` tazelenebilir; canlı değerler 2026-06-18 itibarıyla doğrusal doğrulandı.)

**Adım 2 — Hacim-kademeli marj** `m(L)` (L = günlük limit):
```
L ≤ 500           : 2.50
500 < L ≤ 1000    : 2.50 − 0.50·(L−500)/500       // 2.50 → 2.00
1000 < L ≤ 2000   : 2.00 − 0.30·(L−1000)/1000     // 2.00 → 1.70
L > 2000          : max(1.70 − 0.20·(L−2000)/2000, 1.50)   // 1.70 → taban 1.50
```
**Adım 3 — Fiyat:** `fiyat_tl = round(geliş × m(L))` (temiz pazarlama yuvarlaması: <200 → 10'a, <2000 → 25'e, üstü 50'ye).

**Özel kurallar:**
- **NVIDIA** (geliş 0): hacim-marj yerine sabit `birim_satis_tl/istek/gün` (admin belirler); `fiyat = birim_satis × limit × gün`.
- **Görsel:** aynı formül, birim "kredi/gün"; `cf_unit_cost_tl` görsel başına maliyetten.
- **Lifetime:** `fiyat = round(geliş × m(limit))`, gün yok.

Fiyat motoru **server-side**; UI her slider değişiminde hafif bir `POST /api/packages/:id/preview {limit, days}` çağrısıyla fiyatı alır (debounce'lu) — ya da birim-maliyet + marj eğrisi *katsayı olarak* değil, fiyat *sonucu* olarak döner (sızıntı yok).

## 6. Satın alma & provisioning (mevcut akış)

1. `POST /api/packages/:id/purchase-configurable {limit, days, Idempotency-Key}`.
2. Backend fiyatı **yeniden hesaplar** (UI'ye güvenmez), atomik bakiye debit (`bakiye_tl >= fiyat`), yetersizse 402.
3. Commit sonrası `provisionCodefastEntitlement({catalog_id, limit_amount: limit, duration_days: days})` → CF order + customer api key → entitlement satırı (kişiye özel limit/gün).
4. Provision `failed` ise otomatik iade (mevcut mantık). `pending_manual` desteklenmez (custom = sadece otomatik-provision ürünler).

## 7. UI (tab-packages.jsx)

Paketler sayfasının üstünde belirgin bir bölüm: **"⚙️ Kendi Paketini Oluştur"**.
- Ürün/model seçici (kapsamdaki ürünler; ikon + kısa açıklama).
- Birim-uygun limit slider'ı (kademeli adım), süre slider'ı (lifetime'da gizli).
- Anlık fiyat kartı (büyük TL rakamı) + "ne aldığın" özeti (limit/gün × süre).
- "Oluştur ve Satın Al" → bakiye yeterliyse satın alır, değilse "Bakiye Yükle"ye yönlendirir.
- i18n (TR/EN), mevcut `useT` deseni.

## 8. Güvenlik & sınırlar

- Fiyat **her zaman** backend'de yeniden hesaplanır (UI fiyatı bağlayıcı değil).
- `cf_unit_cost_tl`, marj eğrisi, geliş **frontend'e/public API'ye sızmaz**; `scan:public` + noleak contract'larına tabi.
- Ürün-bazlı max limit/gün cap'leri (kötüye kullanım/aşırı CF maliyeti önlenir).
- `enabled`/`satista` gate'i: builder yalnız satışa açık ürünleri listeler.
- Min tutar / min bakiye kontrolü mevcut akıştan miras.
- Idempotency-Key ile çift-çekim önlenir (mevcut).

## 9. Veri modeli değişiklikleri

- `packages`: `cf_unit_cost_tl numeric` (birim maliyet/istek/gün), `birim_tipi text` ('istek'|'kredi'|'lifetime'|'sabit'), `birim_satis_override_tl numeric NULL` (maliyet-0 ürünler için sabit birim-satış, ör. NVIDIA; doluysa hacim-marj yerine bu kullanılır). Lifetime ürünlerde `cf_unit_cost_tl` "birim/ömür" olarak yorumlanır (gün çarpanı yok), ayrı kolon gerekmez. Migration sıralı (canlı sıraya göre numara).
- Hacim-marj eğrisi: kod-sabiti (basit) veya `system_config` alanları (ayarlanabilir). v1: **kod-sabiti** (YAGNI), admin-ayarı sonraya.
- Her builder-ürünü için `is_configurable=true` + min/max + `cf_unit_cost_tl` seed/script ile doldurulur.

## 10. Test

- Birim: `m(L)` eğrisi sınır değerleri (500/1000/2000/2001), fiyat yuvarlama, lifetime (gün yok), NVIDIA (maliyet 0 → sabit birim).
- Sözleşme: geliş/maliyet/marj public bundle'a sızmıyor (noleak).
- Itest: preview → purchase-configurable → bakiye debit → entitlement (gerçek Postgres); provision mock.
- Adım kuralı: limit 50/55/495/500/550 geçerli; 52/501 reddedilir.

## 11. v1 dışı (sonraya)

- Hacim-marj eğrisinin admin panelinden ayarlanması.
- Görsel/lifetime için süre varyantı nüansları (gerekirse).
- `cf_unit_cost_tl`'nin otomatik (cron) CF-quote tazelemesi.
