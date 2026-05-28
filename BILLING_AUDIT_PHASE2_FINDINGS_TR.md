# YapayZekaLab Billing Audit — Phase 2/3/4/5 Ara Bulgular

## 1. Text fiyat normalizasyonu

- Kodda görülen net kural `textBillingRatio = 0.9`.
- Bu oran `src/server/services/pricing-service.ts` üzerinden `system_config.text_billing_ratio` alanından okunuyor.
- `src/pricing.ts` içindeki text fiyat hesaplaması provider fiyatını `0.9` oranına bölerek müşteri satış fiyatını üretiyor.
- Sonuç: text normalizasyonu **fiyatlama katmanında** uygulanıyor.
- Aynı oran `src/server/services/billing-service.ts` içindeki gerçek kullanım sayımında ikinci kez uygulanmıyor; charge doğrudan `promptTokens / 1_000_000` ve `completionTokens / 1_000_000` üstünden gidiyor.

### Ara karar

- Eğer ürün dili ile teknik muhasebe ayrışıyorsa, bu kural bugün **dolaylı**, fiyat formülü içinde yaşıyor.
- Eğer bu kuralın ödeme/paket diliyle de açık olması isteniyorsa ayrıca ürün kuralı olarak sabitlenmeli.
- Şu aşamada aynı repo içinde “paket token bakiyesi” diye ayrı bir token cüzdanı yok; sistem TL bakiye düşüyor.

## 2. En kritik finansal açıklar

### CRITICAL-1 — 95K backend hard limit yok

- `/v1` backend tarafında 95K context limiti uygulayan guard bulunmadı.
- İstek gövdesi yalnızca global `10mb` JSON limitiyle korunuyor.
- Bu, frontend veya katalog metninden bağımsız olarak backend’in uzun context isteklerini upstream’e iletebildiği anlamına geliyor.

### CRITICAL-2 — Upstream öncesi rezervasyon yok

- `/v1` guard bugün sadece `bakiye > 0` kontrol ediyor.
- Tahmini maliyet rezervasyonu yapılmadan upstream çağrı başlatılıyor.
- Gerçek tahsilat upstream cevabından sonra `chargeUsage()` içinde deneniyor.
- Bu yüzden kullanıcı bakiyesi yetersiz olsa bile upstream maliyeti doğabilir; negatif bakiye engellense de **platform maliyeti** oluşabilir.

### CRITICAL-3 — Stream usage kaybolursa ücretsiz kullanım oluşabiliyor

- Stream akışında usage provider event içinde gelirse okunuyor.
- Gelmezse route `stream_missing_usage` durumuna düşüyor.
- Billing servisi bu durumda `cost=0` usage kaydı yazıp bakiyeyi düşmüyor.
- Sonuç: cevap üretilmiş olabilir, upstream maliyeti doğmuş olabilir, kullanıcıya ücret yansımayabilir.

## 3. Yüksek önem düzeyi açıklar

### HIGH-1 — Askıdaki/engelli kullanıcı key ile devam edebilir

- `validateApiKey()` aktif key hash’ini doğruluyor ama kullanıcı `durum` alanını zorlamıyor.
- Bu yüzden askıya alınmış kullanıcıların aktif key ile devam etme riski var.

### HIGH-2 — Mevcut raw API key listeleme

- `/api/user/api-keys` ve `/api/admin/api-keys` mevcut key’leri decrypt edip geri döndürüyor.
- “Sadece oluşturulurken bir kez göster” güvenlik prensibiyle çelişiyor.

### HIGH-3 — Admin manuel bakiye düzenleme ödeme muhasebesinden ayrı

- `/api/admin/users/:id/bakiye` route’u ödeme quote/helper yolunu kullanmıyor.
- Bu kasıtlı yönetim aracı olabilir; ama metinsel satış dili veya USD→TL yuvarlama iş kuralı burada otomatik korunmuyor.

## 4. Test boşlukları

- 95K hard limit için route-level test yok.
- Stream reserve/reconcile testi yok.
- Paralel aynı bakiye ile iki veya daha fazla `/v1` isteğinin upstream öncesi durdurulduğunu kanıtlayan test yok.
- Shopier duplicate/out-of-order callback davranışı contract seviyesinde güçlü ama route-level eşzamanlı test zayıf.

## 5. Uygulanacak dar fix paketi

1. Proxy guard içine 95K hard limit ekle.
2. Proxy guard içine tahmini token/cost hesabı ekle.
3. Upstream öncesi rezervasyon ekle, final usage sonrası reconcile et.
4. Stream usage yoksa local estimate fallback ile ücretlendir.
5. API key listelerinden geçmiş raw key dönüşünü kaldır.
6. API key doğrulamada kullanıcı durumunu backend’de zorunlu kıl.
