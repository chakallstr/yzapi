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

---

# Live Cost/Budget Update — 2026-05-27 02:50 TRT

## Direct Provider Budget Evidence

- CloseRouter `/credits` returned approximately `$1.99998845` remaining and `$0.00001155` total usage.
- No paid image/video calls were made.
- Tiny text inference attempts failed upstream with `502` before successful generation; `/credits` was unchanged after the diagnostic group.
- Safe reserve requirement still holds: do not continue billable tests below `$0.25` reserve.

## Token Plan Status

- 100k-token target is still not approved for execution.
- Current safe plan is limited to tiny text calls only after CloseRouter inference route is fixed.
- With listed text pricing around `$0.08` to `$0.30` per 1M tokens, a successful 100k-token test could be cost-safe in theory, but it must not run until a small success call proves headers, deduction, and usage records first.

## Next Cost Gate

1. Fix or restore CloseRouter upstream inference route/account/provider availability.
2. Run exactly one tiny success call first (`max_tokens <= 8`).
3. Verify cost headers, balance decrement, transaction, and `usage_records`.
4. Only then consider a small batch; keep total planned spend under `$0.10` unless separately approved.

---

# Cost Recheck — 2026-05-27 10:20 TRT

- `/credits` still reports approximately `$1.99998845` remaining.
- Tiny direct inference recheck timed out before a successful billable response.
- No image/video generation was attempted.
- Keep current rule: do not attempt 100k-token plan until one tiny success call proves the provider route and YapayZekaLab billing headers.
