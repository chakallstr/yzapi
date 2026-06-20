# CodeFast Müşteri Satın-Alma & Zarif Aktivasyon — Tasarım

Tarih: 2026-06-19
Durum: Onaylı (tasarım, v2 — 3 mantık hatası düzeltildi) — implementasyon planı bekliyor
İlgili: `project_codefast_reseller` memory notu, `package-purchase-service.ts`, `codefast-provisioning-service.ts`, `entitlement-service.ts`, `proxy.ts`, `tab-packages.jsx`

## 0. v2 düzeltmeleri (gerçek kodla doğrulama sonrası)
İlk taslakta 3 mantık hatası vardı; gerçek kodla kıyaslanıp düzeltildi:
1. **`expires_at` held'de NULL bırakılamaz** — tüm "aktif paket" sorguları `status='active' AND expires_at>now()` (entitlement-service.ts:42/55/169/219). `NULL>now()`=false → held GÖRÜNMEZ olurdu. → `expires_at` satın almada set edilir; held yalnız `cf_status` ile temsil edilir.
2. **Held'de `cf_api_slug` DOLU olmalı** — proxy guard'ı `pkgSlot.cfApiSlug && !cfChain` ile tetikleniyor; slug boşsa guard atlanır → Popusk-served model (Gemini vb.) bizim maliyetimize sızar. Provisioning'in hata dalı (provisioning-service.ts:93) slug YAZMIYOR → held'de yazılacak.
3. **Stacking CF order'ı orphan eder** — `grantPackageEntitlement` (entitlement-service.ts:169-175) aynı paketi tekrar alanda satır uzatıyor; provisioning aynı id'ye yeni CF order açıp eskisini ortada bırakıyor. → cf-paketler STACK'lenmez (bkz §11).

## 1. Problem / Amaç
CodeFast reseller upstream'i 2026-06-19'da canlıya açıldı (`CODEFAST_RESELLER_ENABLED=true`). Müşteri self-servis satın alma + anında başlama **zaten mevcut** (`GET /packages`, `POST /packages/:id/purchase`, `tab-packages.jsx`); cf-paket alımında CodeFast order'ı satın alma anında açılıyor (**start-at-purchase**).

**Boşluk:** CodeFast order'ı bakiye düştükten SONRA başarısız olursa kod otomatik İADE edip 503 veriyor (`refundFailedCodefastPurchase`, package-purchase-service.ts:266-268). İstenen: iade etme → paketi `hazirlaniyor` durumunda tut → admin'e WhatsApp → CF bakiyesi yüklenince tamamla → müşteri "işleminiz alındı, kısa sürede açılacak" görsün. **Yaklaşım A** seçildi.

## 2. Kapsam
Dahil: `cf_status='hazirlaniyor'` durumu; CF-fail dalı (iade→held); retry job + admin "tamamla" butonu; admin WhatsApp bildirimi; müşteri UI rozetleri; proxy guard; cf-paket stacking düzeltmesi (§11).
Hariç (YAGNI): pool/havuz (reddedildi); Claude Max manuel teslim (zaten `attachManualCustomerKey`); fiyat/marj değişikliği.

## 3. Davranış / Akış

### 3.1 Ön-quote (mevcut, korunur)
CF tamamen erişilemez (quote hatası) → **tahsilden ÖNCE** 503: müşteri "şu an müsait değil" görür, tahsil edilmez.

### 3.2 Para tx (mevcut davranış KORUNUR — expires_at deferral YOK)
`dbSql.begin`: bakiye düşer, transaction (UNIQUE `idempotency_key` → çift-tahsil yok), `grantPackageEntitlement` ile entitlement verilir: `status='active'`, `expires_at = now()+sure_gun` **tx içinde set edilir (DEĞİŞMEZ)**.
⚠️ Held'i `expires_at=NULL` ile temsil etmek YANLIŞ (v2 düzeltme #1) — held yalnız `cf_status` ile ayırt edilir, `expires_at` ile DEĞİL.

### 3.3 Provisioning (satın almadan hemen sonra, tx dışında)
`provisionCodefastEntitlement`:
- **Başarılı** → `cf_status='provisioned'`, `cf_api_slug` + `cf_rc_key_cipher` saklanır. `expires_at` zaten 3.2'de set. Müşteri: 🟢 aktif + key + kalan süre.
- **Başarısız** → `cf_status='hazirlaniyor'`, **`cf_api_slug` pakettan MUTLAKA yazılır** (v2 #2 — yoksa proxy guard atlanır, Popusk sızar), `cf_rc_key_cipher=NULL`, **iade YOK**, admin'e WhatsApp, müşteri 🟡 "hazırlanıyor".
  - `expires_at` 3.2'de set olduğu için süre held boyunca işler; **retry tamamlanınca, held'de geçen süre `expires_at`'e geri eklenir** (müşteri zaman kaybetmez). Held başlangıcı `updated_at`/ayrı `cf_held_since` ile ölçülür.

### 3.4 Tamamlama (held → hazır)
- **Retry job** (cron ~10 dk): `cf_status='hazirlaniyor'` için `provisionCodefastEntitlement` tekrar dener. `externalOrderId` = orijinal `txKey` (stabil → CF Idempotency-Key → çift order AÇMAZ). Başarılı → `provisioned` + key + `expires_at += held_süresi` + müşteriye "paketiniz hazır" (panel + opsiyonel e-posta).
- **Admin butonu** (CodeFast admin sekmesi, owner-only): "Bekleyenleri şimdi tamamla" — CF bakiyesi yüklenince anında tetikler (retry mantığını çağırır).

### 3.5 Admin bildirimi
CF order fail → mevcut openwa bridge ile yeni notify kind: *"⚠️ {email} {paket} aldı, CF order açılamadı (bakiye?). Bekleyen: N. CF'e yükleme yap."* Mevcut rate-limit/dedup helper'larıyla.

## 4. Veri modeli
- `user_package_entitlements.cf_status`: yeni değer `hazirlaniyor` (metin; şema değişikliği yok). Opsiyonel `cf_held_since timestamptz` (süre telafisi için; yoksa `updated_at` kullanılır).
- `expires_at`: **her zaman** satın almada set (held dahil). Held ayrımı `cf_status` ile yapılır, `expires_at` ile DEĞİL.
- Held entitlement profili: `status='active'` + `cf_status='hazirlaniyor'` + `cf_rc_key_cipher=NULL` + `cf_api_slug=DOLU`.

## 5. Proxy guard (`proxy.ts`)
Held istek (cf_api_slug DOLU, cf_rc_key NULL):
- Mevcut `pkgSlot.cfApiSlug && !cfChain` guard'ı **TETİKLENİR** (slug dolu) → HTTP 425 *"Paketiniz hazırlanıyor, birazdan tekrar deneyin"*, slot release, kota tüketmez, **Popusk'a DÜŞMEZ**.
- ⚠️ KRİTİK bağımlılık: held'de `cf_api_slug` MUTLAKA dolu (3.3) — boşsa guard atlanır, per-model routing'e düşer, Popusk-served model (Gemini) bizim maliyetimize sızar.
- PAYG→codefast 402 guard'ı (proxy.ts:415/619/915) aynen kalır.

## 6. Müşteri UI (`tab-packages.jsx`)
- 🟢 **Aktif** (`provisioned`): kalan süre + API key (görünür/kopyalanabilir).
- 🟡 **Hazırlanıyor** (`hazirlaniyor`): "İşleminiz alındı, kısa sürede açılacak." Periyodik yenileme; hazır olunca yeşile döner.
- pending_manual / failed: mevcut davranış.

## 7. Para güvenliği özeti
Ön-quote → tam outage'da tahsil yok. Held'de iade yok ama müşteri parasını kaybetmez (teslim edilir; istenirse manuel iade). Çift-tahsil yok (UNIQUE idempotency_key); çift CF order yok (stabil externalOrderId). Held asla Popusk'a sızmaz (cf_api_slug dolu + guard). Süre held'de telafi edilir.

## 8. Bileşenler (izole, tek-sorumluluk)
| Birim | Sorumluluk | Bağımlılık |
|---|---|---|
| `package-purchase-service` (değişiklik) | CF-fail dalı refund→held | provisioning, notify |
| `codefast-provisioning-service` (değişiklik) | held'de cf_api_slug yaz + cf_status='hazirlaniyor'; başarıda expires_at telafi | reseller-service, db |
| `entitlement-service` (değişiklik) | cf-pakette stacking YOK (§11) | db |
| `codefast-retry-job` (yeni, cron) | held'leri tamamla + süre telafi + müşteri bildir | provisioning |
| admin "tamamla" endpoint (yeni, owner-only) | held'leri elle tamamla | provisioning |
| notify (yeni kind) | admin WhatsApp held bildirimi | openwa bridge |
| `proxy.ts` (küçük) | held → 425, Popusk'a düşme | — |
| `tab-packages.jsx` (UI) | durum rozetleri + yenileme | /packages API |

## 9. Test (özet)
- Birim: CF-fail → held (iade yok, cf_api_slug dolu, expires_at korunur); retry → provisioned + key + süre telafi; çift retry → tek CF order (idempotent).
- Proxy: held istek → 425, Popusk'a düşmez, kota tüketmez; slug-boş held REGRESYON testi (Popusk'a düşmediğini ispatla); PAYG→codefast 402 korunur.
- Çoklu-alım (§11): aynı cf-paketi 2× al → 2 ayrı entitlement + 2 ayrı CF order/key, orphan/ezme yok; proxy 1. entitlement kotası dolunca 2.'ye düşer (kota toplanır); CF 429'da graceful fallthrough. Non-cf stacking regresyonsuz korunur.
- Para: tam outage → tahsil yok; held → çift-tahsil yok; non-cf paket regresyon yok (expires_at tx'te).
- 3-QA (≥2 PASS) + çift onay → deploy (money-path).

## 10. Açık varsayımlar / kararlar
- `expires_at` her zaman satın almada set; held `cf_status` ile ayrılır (NULL-expires_at tuzağı KULLANILMAZ).
- Held'de cf_api_slug zorunlu (Popusk sızıntısını önler).
- Retry aralığı ~10 dk (ayarlanabilir). Süre telafisi `cf_held_since`/`updated_at` ile.
- Müşteriye "hazır" bildirimi panel + opsiyonel e-posta.

## 11. Müşteri aynı paketi İSTEDİĞİ KADAR alabilir (stack YOK, çoklu-entitlement)

**Gereksinim (Ufuk):** Müşteri aynı paketi istediği kadar satın alabilsin, ASLA sorun olmasın.

**Kanıtlanmış CF davranışı (2026-06-18, ₺0 NVIDIA çift-order testi, aynı `external_customer_id`):**
CF aynı müşteriye aynı ürünü tekrar satınca → **müşteriyi tek tutar** (aynı `customer_id`), her satış için **AYRI order + AYRI cf_rc key + AYRI entitlement** verir, reddetmez. Kotalar bağımsız (toplanır). (Test order'ları revoke edildi.) → CF tarafı sınırsız tekrar-alımı destekliyor.

**Mevcut BOZUK nokta:** `grantPackageEntitlement` (entitlement-service.ts:169-175) aynı paketi tekrar alanda yeni satır açmaz, mevcut entitlement'ın `expires_at`'ini uzatır; provisioning aynı `entitlementId`'ye yeni CF order açıp `cf_order_id`/`cf_rc_key`'i ezerek eski CF order'ı orphan eder (ödenmiş, kullanılamaz).

**Karar (CF davranışıyla hizalı):** cf-paketler (cf_catalog_id/template DOLU) **stack'lenmez**.
1. `grantPackageEntitlement` cf-pakette mevcut entitlement'ı uzatmak yerine **HER ZAMAN yeni satır** açar → 1 yzapi entitlement ↔ 1 CF order/key (CF'in modeliyle birebir). Ezme/orphan YOK.
2. **Proxy çoklu-entitlement seçimi (kota toplama):** İstek geldiğinde, o modele uyan TÜM aktif cf-entitlement'lar arasından `cf_status='provisioned'` + key-geçerli + **günlük kotası dolmamış** (`requests_today < gunluk_istek_limiti`) olanı seçer (en erken biten önce, FIFO). Biri dolarsa SONRAKİNE düşer → müşteri toplam kotayı (örn. 2 paket = 2×limit/gün) kullanır. Held/keysiz olanlar serve edilmez (§5).
3. CF-tarafı kota da bağımsız (her key kendi limiti) → yzapi-fallthrough ile CF-limiti uyumlu; bir keyde CF 429 gelirse proxy sonraki entitlement'a düşer (graceful).
- Non-cf paketler için stacking AYNEN korunur (upstream order yok, süre uzar — regresyon yok).

Sonuç: müşteri N kez alır → N bağımsız entitlement+order+key → kotalar toplanır, süreler paralel/sıralı tüketilir, orphan/ezme/leak YOK. "Asla sorun olmasın" sağlanır.
