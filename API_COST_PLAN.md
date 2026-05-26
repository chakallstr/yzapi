# API COST PLAN

## Başlangıç Kısıtları

- CloseRouter/Router budget limiti: `$2.00`
- Zorunlu rezerv: `$0.25`
- Maksimum planlanan harcama: `$1.75`
- Paid image generation/edit: SKIPPED, kullanıcı açık izin vermedi.
- Video generation: SKIPPED, sadece 501/safe error kontrolü yapılacak.
- Geçerli `yzk_live_` kullanıcı API key henüz yok; başarılı billable YapayZekaLab `/v1` çağrıları bu key olmadan yapılamaz.
- Kullanıcı tarafından verilen router/upstream key dosyaya yazılmadı ve raporda maskeli tutulacak.
# API Cost Plan

## Durum
- Gerçek ücretli text inference testi çalıştırılmadı.
- Sebep: geçerli `yzk_live_*` kullanıcı anahtarı yok ve local `/health` içinde `closerouter: unknown`.
- Paid image/video endpointleri kullanıcı talimatı gereği atlandı.

## Güvenli Plan
- Önce `/v1/models` ve `/v1/providers` çalışır hale getirilmeli.
- Sonra test kullanıcısı için düşük bakiyeli/funded `yzk_live_*` anahtar oluşturulmalı.
- İlk koşu: 5-10 tiny text request, toplam hedef harcama `< $0.10`.
- Üst limit: `$1.75`; `$0.25` reserve korunmalı.
- Her grup sonrası `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`, `X-YZ-Request-Id`, `usage_records`, kullanıcı bakiyesi doğrulanmalı.
