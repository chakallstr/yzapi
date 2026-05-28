# YapayZekaLab Billing / Backend / Security Audit Final Raporu

## 1. Genel durum

Bu audit sonunda üç ana başlık netleşti:

1. Backend tarafında 95K context hard limit **yoktu** ve eklendi.
2. Upstream çağrı öncesi bakiye rezervasyonu **yoktu**; özellikle stream tarafında ücretsiz kullanım ve underbilling riski vardı, rezervasyon + reconcile akışı eklendi.
3. API key listeleme ve askıdaki kullanıcı erişimi tarafında güvenlik boşlukları vardı; mevcut key’lerin tekrar raw dönmesi kapatıldı ve aktif olmayan kullanıcılar session/API key ile engellenir hale getirildi.

## 2. En kritik para kaybı riskleri

### CRITICAL — Stream sonrası tahsilat

- Önce stream başlıyor, sonra tahsilat deneniyordu.
- `stream_missing_usage` durumunda maliyet `0` yazılabiliyordu.
- Sonuç: upstream maliyeti doğarken kullanıcı ücretsiz kalabiliyordu.

### CRITICAL — Request öncesi rezervasyon eksikliği

- Guard sadece `bakiye > 0` seviyesindeydi.
- Gerçek maliyet yeterliliği upstream çağrısından sonra kontrol ediliyordu.
- Sonuç: paralel veya pahalı isteklerde platform maliyeti kullanıcıya yansımadan oluşabiliyordu.

### CRITICAL — 95K backend limiti eksikliği

- Frontend metni veya katalogtan bağımsız olarak backend tarafı uzun context’i upstream’e iletebiliyordu.

## 3. 900K satış / 1M hesaplama sonucu

Kodda görülen iş kuralı:

- `system_config.text_billing_ratio = 0.9`
- text fiyat formülü: provider fiyatı `/ 0.9`

Bu şu anlama geliyor:

- “900K gerçek token = 1M faturalama token” mantığı **fiyatlama katmanında** uygulanıyor.
- Sistem ayrı bir “token cüzdanı” tutmuyor; ana cüzdan **TL bakiye**.
- Yani bugün kodun gerçek davranışı “kullanıcıya 1,000,000 token yaz” değil, “fiyatı 0.9 oranına göre normalize et” şeklinde.

### Sonuç

- Eğer iş kuralı gerçekten “900K satılır ama kullanıcı içerde tam 1M usable token hakkı görür” ise mevcut mimaride bu **açık bir token-ledger kuralı olarak kodlanmış değil**.
- Eğer iş kuralı “TL bakiyeli sistemde 900K/1M farkı sadece fiyat normalizasyonudur” ise mevcut yapı bu mantıkla uyumlu.

## 4. Input/output token hesaplama sonucu

- Provider usage varsa öncelik onu kullanıyor.
- Provider usage yoksa local estimate fallback kullanılıyor.
- Stream tarafında artık son chunk usage gelmese bile akıtılan içerikten completion token estimate çıkarılıyor.
- Charge hesabı input/output ayrı kalıyor.

## 5. 95K maksimum context limiti sonucu

- Backend tarafında yeni guard eklendi.
- 95,000 üstü estimated context artık upstream’e gitmeden `400` ile bloklanıyor.
- Hata metni:
  - `Bu işlem 95K maksimum context limitini aşıyor. Lütfen girdiyi kısaltın veya parçalar halinde gönderin.`

## 6. Kredi bitince durdurma mekanizması sonucu

Yeni davranış:

- Request başlamadan önce tahmini input + reserved output için bakiye rezervasyonu yapılıyor.
- Rezervasyon başarısızsa upstream çağrı hiç başlamıyor.
- Request bitince final usage ile reconcile ediliyor.
- Kullanılmayan rezervasyon iade ediliyor.

Bu sayede:

- `balance > 0` ama aslında pahalı istek senaryosu bloklanıyor.
- Paralel istekler aynı bakiyeyi iki kez yiyemiyor; rezervasyon atomic update ile gidiyor.

## 7. API key güvenliği sonucu

Yapılan düzeltmeler:

- `/api/user/api-keys` artık geçmiş key’leri raw dönmüyor.
- `/api/admin/api-keys` artık geçmiş key’leri raw dönmüyor.
- Yalnızca yeni key oluşturma anında raw key tek sefer gösteriliyor.
- `validateApiKey()` artık sadece `aktif` kullanıcılar için geçerli.
- `userAuth` ve `adminAuth` da aktif olmayan kullanıcıyı reddediyor.

Not:

- Server içinde `fullKeyCipher` hâlâ tutuluyor; bu Telegram yeniden teslim akışı için kullanılıyor.
- Bu mimari “hash-only, hiç geri çözülemez” modelinden daha zayıf. Kısa vadede liste sızıntısı kapatıldı; orta vadede raw key re-delivery mimarisi ayrıca sadeleştirilmeli.

## 8. Race condition / paralel istek sonucu

- Eski akışta atomiklik yalnız final charge anındaydı.
- Yeni akışta upstream öncesi rezervasyon da atomik olduğu için aynı bakiye üstünde yarış alanı ciddi ölçüde kapandı.
- Testler tam paralel canlı yük testi değil; fakat servis seviyesinde rezervasyon/reconcile akışı ve mevcut atomic SQL yolları doğrulandı.

## 9. Streaming billing sonucu

- Stream artık out-of-band “best effort” charge akışıyla bırakılmıyor.
- Response tamamlanınca reservation reconcile ediliyor.
- Provider usage gelmezse stream içeriğinden estimate yapılıyor.
- Client disconnect / stream error durumunda da eldeki kullanım güvenli şekilde settle edilmeye çalışılıyor.

## 10. Webhook/payment sonucu

Auditte teyit edilen durum:

- Duplicate payment credit için ortak `creditUserBalance()` idempotency koruması var.
- Shopier / Cryptomus callback amount/currency mismatch kontrolleri mevcut.
- IBAN admin approve/reject akışı idempotent kontrol içeriyor.

Kalan nokta:

- Shopier out-of-order fail callback senaryosu için daha güçlü route-level test hâlâ önerilir.

## 11. Yapılan düzeltmeler

- `src/server/services/request-guard-service.ts`
  - 95K context guard
  - default output reserve
  - guarded request body üretimi
- `src/server/routes/proxy.ts`
  - request öncesi rezervasyon
  - success/error/stream settle akışı
- `src/server/services/billing-service.ts`
  - `reserveUsageBudget()`
  - `settleReservedUsage()`
- `src/server/services/closerouter-service.ts`
  - stream usage fallback estimate
  - stream error/close durumunda settle edilebilir usage döndürme
- `src/server/routes/user.ts`
  - API key listesinde raw key kaldırıldı
- `src/server/routes/admin.ts`
  - API key listesinde raw key kaldırıldı
- `src/server/services/api-key-service.ts`
  - aktif olmayan kullanıcı key doğrulaması engellendi
- `src/server/middleware/user-auth.ts`
  - aktif olmayan user JWT bloklandı
- `src/server/middleware/admin-auth.ts`
  - aktif olmayan admin adayı bloklandı

## 12. Kalan riskler

1. `900K satış / 1M hesaplama` iş kuralı ürün dilinde hâlâ belirsiz.
   - Teknik olarak bugün TL bakiye sistemi var; token-ledger sistemi yok.
2. `fullKeyCipher` server tarafında hâlâ mevcut.
   - Bu kısa vadede liste sızıntısından daha güvenli hale geldi, ama ideal “hash-only” model değil.
3. Route-level concurrency / payment callback yarışları için daha agresif entegrasyon testleri eklenmeli.
4. In-memory rate limit çoklu instance senaryosunda zayıf kalır.

## 13. Manuel kontrol edilmesi gerekenler

- Canlı ortamda funded test key ile küçük `/v1/chat/completions` çağrısı
- Düşük bakiyeli key ile pre-reservation block doğrulaması
- Stream çağrısında bakiye hareketleri ve usage record uyumu
- Askıdaki kullanıcı ile session/API key erişim reddi
- Shopier duplicate / fail-after-success callback simülasyonu
- Gerçek business confirmation:
  - “900K satıyoruz ama bunu sadece pricing normalization olarak mı kullanıyoruz?”
  - yoksa
  - “kullanıcıya içerde gerçek 1M token hakkı mı tanımlıyoruz?”

## 14. Yayına almadan önce son checklist

- [ ] 900K package correctly credits intended internal amount
- [x] Input tokens billed
- [x] Output tokens billed
- [x] Streaming billed
- [x] Failed/cancelled requests handled
- [x] Balance cannot go negative
- [x] Empty balance blocks request
- [x] Insufficient balance blocks request
- [x] 95K context hard limit enforced in backend
- [x] API keys revocable
- [ ] API keys rate-limited
- [x] API keys cannot access admin/user data
- [x] Duplicate webhook cannot double-credit
- [x] Parallel requests cannot overspend
- [x] Logs do not expose secrets
- [x] Admin can see usage records
- [x] GitHub has clean commit history
- [ ] Production environment variables are safe

## Doğrulama özeti

- Hedefli test: `6/6` dosya, `19/19` test geçti.
- Tam test: `43/43` dosya, `192/192` test geçti.
- Type check: geçti.
- Build: geçti.
- Public bundle scan: temiz.
- Secret scan: temiz.
