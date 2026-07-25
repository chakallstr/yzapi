# AWS Bedrock Claude Sonnet 4.6: 10 RPM ile müşteri kapasitesi

Tarih: 2026-07-20  
Kapsam: Salt-okunur kapasite tasarımı. Kota artışı, hesap/API anahtarı döndürme ve kota/ToS aşma yöntemi yoktur.

## Sonuç

Yaklaşık **10 istek/dakika (RPM)** uygulanmış kotada güvenli sürekli hedef **8 RPM** olmalıdır. Bu, bir Bedrock çağrısının yaklaşık her **7,5 saniyede** kabul edilmesi ve kalan %20'nin zamanlama sapması, kısa patlamalar ve yeniden denemeler için tutulması demektir.

Önerilen sıra:

1. Uygulama seviyesinde global kuyruk + tenant adaleti kur.
2. Aynı Region için Sonnet 4.6'nın **cross-region/global cross-region applied RPM ve TPM** satırlarını salt-okunur kontrol et. Uygulanmış değer 10'dan yüksekse resmî inference profile kullan.
3. Tekrarlanan uzun prefix'lerde prompt caching; aynı sonucu isteyen güvenli/eşdeğer isteklerde response cache ve single-flight coalescing uygula.
4. Gecikme toleranslı işleri Sonnet 4.6 batch inference'a ayır.
5. Düşük karmaşıklıklı işleri, kendi model kotası kontrol edilmiş uyumlu bir fallback modele yönlendir.
6. Sürekli yüksek talep oluşursa Sonnet 4.6'nın desteklediği **Reserved tier** ekonomik olarak değerlendirilir. Bu not hiçbir satın alma veya AWS değişikliği yapmaz.

## Doğrulanmış AWS davranışı

### Bedrock Runtime ve Mantle

- Sonnet 4.6 model kartı programatik erişim için `bedrock-runtime` ve model kimliği `anthropic.claude-sonnet-4-6` gösterir. Geo kimlikleri `us.`, `eu.`, `au.`, `jp.` önekli; global kimlik `global.anthropic.claude-sonnet-4-6` şeklindedir.
- Güncel model kartı Sonnet 4.6 için `bedrock-mantle` kimliği/uç noktası göstermiyor. Bu kapasite planı bu nedenle `bedrock-runtime` kota davranışına dayanır.
- Runtime kotaları model ve Region bazında RPM, TPM ve günlük token sınırlarıyla uygulanır. Kullanıcının Service Quotas ekranındaki **Applied quota value** kamuya açık varsayılan değerden daha düşük olabilir; planlama için applied değer esastır.

Kaynaklar: [Sonnet 4.6 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html), [runtime quotas](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html), [scaling best practices](https://docs.aws.amazon.com/bedrock/latest/userguide/scaling-throughput-best-practices.html).

### RPM dışındaki bağlayıcı kotalar

Sonnet 4.6 için kontrol edilmesi gereken satırlar:

- On-demand RPM.
- On-demand TPM.
- Günlük model invocation token sınırı.
- Geo cross-region RPM ve TPM.
- Global cross-region RPM, TPM ve günlük token sınırı.
- Batch job, dosya boyutu ve kayıt sayısı sınırları.

AWS genel referansındaki 2026-07-20 görünümünde kamu varsayılanları on-demand için 5.000 RPM / 3.000.000 TPM; geo ve global cross-region için 10.000 RPM / 6.000.000 TPM'dir. Bunlar **hesabın gerçek applied kotası değildir**. Kullanıcının doğruladığı yaklaşık 10 RPM gerçek planlama sınırıdır; cross-region satırları ayrıca kontrol edilmeden daha yüksek kapasite varsayılmaz.

Anthropic 4.7 ve altı modellerde output token kota burndown oranı 5x'tir. Tamamlanan isteğin kota tüketimi yaklaşık:

`uncached_input + cache_write_input + 5 × output`

AWS, isteğin başında `total input + max_tokens` kadar kapasite ayırır. Gereksiz yüksek `max_tokens`, gerçek çıktı kısa olsa bile eşzamanlı kapasiteyi geçici olarak düşürür. Cache read tokenları TPM/TPD hesabına katılmaz; cache write tokenları katılır.

Kaynaklar: [Bedrock service quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html#limits_bedrock), [token quota counting](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html), [viewing applied quotas](https://docs.aws.amazon.com/servicequotas/latest/userguide/gs-request-quota.html).

## Resmî kapasite mekanizmaları

### 1. Cross-region inference

- Geo profil, isteği seçilen coğrafya içindeki AWS Region'larına yönlendirir. Global profil, en yüksek erişilebilir kapasite için ticari Region'lar arasında yönlendirebilir.
- AWS hedef Region'ı otomatik seçer. Ek routing ücreti yoktur; fiyat kaynak Region'a göre hesaplanır.
- CloudTrail kaydındaki `additionalEventData.inferenceRegion`, işlemin gerçekleştiği Region'ı gösterir.
- Geo/global cross-region kotaları on-demand satırlarından ayrıdır. Ancak hesabın applied değerleri kontrol edilmeden kapasite artışı kabul edilmez.
- Inference profile'lar klasik Provisioned Throughput ile birlikte kullanılamaz.
- Veri yerleşimi zorunluluğu varsa uygun geo profil; küresel yönlendirme yalnız politika izin veriyorsa kullanılmalıdır.

Kaynaklar: [cross-region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html), [inference profile support](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html), [Sonnet 4.6 regional availability](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html#model-card-anthropic-claude-sonnet-4-6-regional-availability).

### 2. Prompt caching

- Sonnet 4.6 prompt caching destekler.
- Minimum cache checkpoint: **1.024 token**.
- En fazla **4 checkpoint**.
- `system`, `messages` ve `tools` alanlarında kullanılabilir.
- Model kartı 5 dakika ve 1 saat TTL seçenekleri gösterir. En muhafazakâr tasarım, 5 dakikalık tekrar penceresine dayanmalıdır ve kullanılacak TTL API entegrasyonunda doğrulanmalıdır.
- Prefix birebir sabit kalmalıdır; prefix değişirse cache miss oluşur.
- Cache read tokenları token kotasından düşmez. Fakat her çağrı hâlâ bir RPM tüketir. Prompt caching **10 RPM'yi büyütmez**; TPM, gecikme ve maliyeti azaltır.

Örnek: 10.000 token sabit prefix + 1.000 token değişken giriş + 500 output için yaklaşık kota tüketimi:

- Cache yok: `11.000 + 5 × 500 = 13.500` token birimi/istek.
- Cache hit: `1.000 + 5 × 500 = 3.500` token birimi/istek.
- Yaklaşık %74 daha az token-kota tüketimi; RPM değişmez.

Kaynaklar: [prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html), [Sonnet 4.6 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html), [token counting](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html).

### 3. Batch inference

- Sonnet 4.6 batch inference desteklenen modeller listesindedir.
- İşler asenkrondur: JSONL giriş S3'e yüklenir, sonuç S3'ten alınır.
- Her kayıt bağımsızdır. Tool/function calling, structured output ve etkileşimli çok turlu akış desteklenmez.
- Batch, müşteri sohbetinin gecikme sorununu çözmez; raporlama, sınıflandırma, özetleme ve gece işleri gibi ertelenebilir yükü interaktif RPM havuzundan çıkarır.
- Genel referansta Sonnet 4.6 için en az 100 kayıt/job; en fazla 100.000 kayıt/dosya ve job; 1 GB/dosya; 5 GB/job ve aynı anda toplam 100 submitted + in-progress job listelenir. Hesap applied değerleri yine kontrol edilmelidir.
- Batch inference provisioned modellerle kullanılamaz.

Kaynaklar: [batch inference](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html), [supported batch models](https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-supported.html), [Bedrock quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html#limits_bedrock).

### 4. Flex, Priority, Reserved ve klasik Provisioned Throughput

Sonnet 4.6 güncel model kartı:

- Standard: destekleniyor.
- Reserved: destekleniyor.
- Priority: desteklenmiyor.
- Flex: desteklenmiyor.

Bu nedenle Sonnet 4.6 için Flex/Priority kapasite planına yazılmamalıdır.

Reserved tier, on-demand kotadan ayrı kapasitedir. AWS belgesine göre 1 veya 3 aylık rezervasyon; en az 100.000 input TPM ve 10.000 output TPM gerektirir. Rezervasyonu aşan trafik Standard tier'a taşabilir. Erişim AWS account team üzerinden sağlanır. Bu, kısa süreli 10 RPM kuyruğuna ilk çözüm değil; sürekli ve öngörülebilir kurumsal trafik için ticari seçenektir.

Klasik Model Unit tabanlı Provisioned Throughput genel Bedrock özelliğidir; inference profile'lar bunu desteklemez. Güncel klasik PT destek listesinde Sonnet 4.6 yer almaz; Sonnet 4.6 model kartı bunun yerine Reserved tier desteğini gösterir. Bu nedenle Sonnet 4.6 planında klasik PT kapasitesi varsayılmamalıdır.

Kaynaklar: [service tiers](https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html), [Provisioned Throughput](https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html), [PT supported models](https://docs.aws.amazon.com/bedrock/latest/userguide/prov-thru-supported.html), [Sonnet 4.6 service tiers](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html#model-card-anthropic-claude-sonnet-4-6-tiers).

## Throttling ve retry semantiği

- HTTP **429 / ThrottlingException**: hesap/model kotası aşıldı. Retry yeni kapasite oluşturmaz; gönderim hızı düşürülmeli ve istek uygulama kuyruğunda bekletilmelidir.
- `ModelNotReadyException` da HTTP 429 olabilir; hata tipi kontrol edilmeden her 429 RPM aşımı sayılmamalıdır.
- HTTP **503 / ServiceUnavailable**: Region'da yüksek talep veya geçici servis kapasitesi. Hesap kotasından farklıdır. Exponential backoff + random jitter ve uygun cross-region profil kullanımı anlamlıdır.
- Streaming çağrı ilk HTTP 200 yanıtından sonra event stream içinde 429, 503, 424 veya 408 hata olayı üretebilir; stream tüketicisi bu olayları da sınıflandırmalıdır.
- AWS SDK standard retry modu exponential backoff ve full jitter kullanır. Multi-tenant gateway için uygulama seviyesinde limiter yine gereklidir.
- Adaptive retry tek kaynaklı, throttling-heavy akışa uygundur; aynı SDK client'ındaki bütün tenantları yavaşlatabileceği için ortak multi-tenant client üzerinde genel varsayılan yapılmamalıdır.

Uygulama kuralı:

- 429: aynı isteği anında tekrar gönderme; kuyruğa geri koy, tenant sırasını koru.
- 503/500: en fazla sınırlı retry; 1 saniyeden başlayan üstel backoff + jitter.
- Deadline geçmişse retry etme. İdempotent olmayan yan etkileri model çağrısından ayır.

Kaynaklar: [Converse errors](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html#API_runtime_Converse_Errors), [Bedrock error troubleshooting](https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html), [AWS SDK retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html), [scaling best practices](https://docs.aws.amazon.com/bedrock/latest/userguide/scaling-throughput-best-practices.html).

## 10 RPM için nicel senaryolar

### Varsayımlar

- Applied on-demand Sonnet 4.6 kotası: 10 RPM.
- Applied TPM/TPD'nin aşağıdaki örnekleri taşıdığı varsayılır; canlı Service Quotas/CloudWatch ile ayrıca doğrulanmalıdır.
- Bir müşteri aksiyonu normalde bir Sonnet çağrısı üretir.
- Güvenli scheduler hedefi 8 RPM; 2 RPM operasyonel pay.
- RPM penceresinin AWS iç algoritması belgelenmediği için istekler dakikanın başında patlatılmaz, zamana eşit yayılır.

### Kuyruk kapasitesi

- 8 RPM = her 7,5 saniyede 1 çağrı.
- Saatlik güvenli kapasite: 480 çağrı. Teorik 10 RPM: 600 çağrı/saat.
- Günlük güvenli üst sınır: 11.520 çağrı; TPM/TPD veya maliyet daha düşük sınır oluşturabilir.
- Aynı anda 10 istek gelirse ilk çağrı hemen gönderildiğinde son çağrı yaklaşık 67,5 saniyede başlar.
- Aynı anda 20 istek gelirse son çağrı yaklaşık 142,5 saniyede başlar.
- 16 bekleyen istek, 8 RPM'de yaklaşık 2 dakikalık servis kuyruğudur. İnteraktif SLA 2 dakikaysa bu eşik sonrası istek fallback, async veya kontrollü `429` cevabına gitmelidir.

### Sürekli geliş hızı

| Geliş | 8 RPM scheduler sonucu |
| --- | --- |
| 6 istek/dk | Stabil; 2 RPM boş güvenli kapasite |
| 8 istek/dk | Tam hedef; yeni burst için kuyruk payı sınırlı |
| 9 istek/dk | Kuyruk dakikada 1 büyür; en az 1 RPM cache/fallback/async gerekir |
| 12 istek/dk | Kuyruk dakikada 4 büyür; trafik ayrıştırılmadan stabil değil |

### Tenant adaleti

Örnek 10 aktif tenant:

- Tenant başına taban 0,5 RPM: toplam 5 RPM; tenant başına ortalama 2 dakikada 1 garanti slot.
- Ortak burst havuzu: 3 RPM; boş taban slotlarını aktif tenantlar weighted-fair queue ile kullanır.
- Operasyonel pay: 2 RPM.
- Tenant başına hem request token-bucket hem token-maliyet bütçesi tutulur. Token payı: `usable_TPM × tenant_weight / toplam_weight`.
- Büyük tenant tek başına kuyruğu kaplayamaz; her tenant için eşzamanlı istek sınırı ve maksimum kuyruk derinliği olmalıdır.

### Cache ve request coalescing

- 10 müşteri aksiyonu/dk ve %20 güvenli response-cache/coalescing hit: Bedrock'a 8 RPM gider; hedefe uyar.
- 12 aksiyon/dk ve %20 hit: 9,6 Bedrock RPM kalır; tek başına yetmez.
- 12 aksiyon/dk, %20 hit ve 2 RPM düşük karmaşıklıklı fallback: Sonnet yükü yaklaşık 7,6 RPM olur.
- Single-flight sadece aynı model, parametre, sistem politikası ve aynı güvenlik/tenant kapsamındaki eşdeğer isteklerde kullanılır. Tenant verisi ortak cache anahtarına karıştırılmaz.

### Karma interaktif + batch senaryosu

15 aksiyon/dk örneği:

1. %20 response-cache/coalescing: 12 model işi/dk kalır.
2. 4 gecikme toleranslı iş batch kuyruğuna ayrılır.
3. 8 interaktif iş/dk Sonnet scheduler'a kalır.

Bu senaryo 10 RPM'yi aşmadan kullanıcı yükünü taşır; batch sonuçları anlık dönmez.

### Token bağlayıcılığı örnekleri

- İstek başına 2.000 uncached input + 500 output: yaklaşık `2.000 + 5 × 500 = 4.500` token-kota birimi. 8 RPM'de yaklaşık 36.000 TPM.
- İstek başına 100.000 input + 10.000 output: yaklaşık 150.000 token-kota birimi. 8 RPM'de yaklaşık 1.200.000 TPM.
- RPM uygun görünse bile uzun-context trafik TPM'yi önce doldurabilir.
- 2.000 token girişte `max_tokens=64.000`, başlangıçta istek başına yaklaşık 66.000 kapasite ayırır. `max_tokens=2.000` yaklaşık 4.000 ayırır. Çıktı ihtiyacına yakın sınır seçmek concurrency'yi korur.

## Uygulanabilir yol haritası

1. Salt-okunur envanter: Region, on-demand/cross-region/global RPM-TPM-TPD applied değerleri, CloudWatch `Invocations`, throttles, input/output/cache token metrikleri.
2. 8 RPM global Sonnet limiter; istekleri 7,5 saniyeye yay.
3. Weighted-fair tenant queue; maksimum 16 interaktif backlog; deadline ve iptal desteği.
4. Prompt sınıfları: interaktif, düşük karmaşıklık/fallback, async/batch.
5. Cache checkpoint'leri: sabit system/tools/reference prefix; hit/write metriklerini ölç.
6. Response cache ve single-flight: yalnız semantik ve tenant izolasyonu güvenliyse.
7. Geo/global inference profile'ı staging yük testiyle dene; yalnız applied cross-region kotası ve veri politikası uygunsa aç.
8. 429 ve 503'ü ayrı ölç; 429'da admission azalt, 503'te backoff/cross-region uygula.
9. Sürekli talep güvenli 8 RPM'yi aşıyorsa Reserved tier için maliyet/SLA çalışması yap. Bu adım ayrı insan onayı ve AWS ticari süreci gerektirir.

## Güvenlik sınırı

Bu çalışma hiçbir AWS ayarını değiştirmedi. Kota artışı talebi, Reserved satın alma, hesap oluşturma, hesap/API anahtarı rotasyonu veya kota aşma düzeni uygulanmadı ve önerilmedi.
