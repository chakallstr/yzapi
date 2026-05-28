# YapayZekaLab API Sistemi Araştırma Özeti

Durum: kullanıcı talimatıyla erken durduruldu ve mevcut bulgular süzüldü.

Run ID: `2026-05-24T15-38-48-093Z`

## Kanıt

- Süreç durduruldu; `research-marathon` process'i artık çalışmıyor.
- Ham veri:
  - `events.jsonl`: 498 satır
  - `repos.jsonl`: 177 repo
  - `code-hits.jsonl`: 132 kod izi
  - `findings.jsonl`: 168 bulgu
- İki araştırma hattı:
  - Backend / Provider / Router: 134 döngü, 84 bulgu
  - Billing / Security / Ops / Panel: 136 döngü, 84 bulgu
- Agent hata kaydı: 0 / 0

## En Net Sonuç

Ana satış ve bakiye sistemi bizde kalmalı. 9Router, LiteLLM, Bifrost veya benzeri router/gateway çözümleri ana satış omurgası değil, `ProviderAdapter` arkasında denenebilecek iç router/fallback katmanı olmalı.

Doğru MVP akışı:

```text
Müşteri -> YapayZekaLab API Backend -> CloseRouter
```

Faz 2 POC akışı:

```text
Müşteri -> YapayZekaLab API Backend -> ProviderAdapter -> 9Router / LiteLLM / Bifrost -> Provider
```

Yapılmaması gereken akış:

```text
Müşteri -> 9Router -> Provider
```

Çünkü müşteri hesabı, TL bakiye, ödeme, KDV, API key, usage log, itiraz kanıtı ve admin fiyat kontrolü bizim sistemin asıl ürünü.

## En Değerli Kaynaklar

| Kaynak | Bize Yarayan Kısım | Karar |
| --- | --- | --- |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | OpenAI uyumlu AI gateway, provider adapter, cost tracking, load balancing, logging | POC / mimari örnek |
| [maximhq/bifrost](https://github.com/maximhq/bifrost) | Hızlı AI gateway, load balancer, çok model desteği | POC / benchmark |
| [Helicone/ai-gateway](https://github.com/Helicone/ai-gateway) | Hafif AI gateway yaklaşımı | POC |
| [tensorzero/tensorzero](https://github.com/tensorzero/tensorzero) | Gateway + observability + eval yaklaşımı | Observability fikri |
| [langfuse/langfuse](https://github.com/langfuse/langfuse) | LLM gözlemleme, metrik, prompt/usage kanıtı | Gözlemleme fikri |
| [lm-sys/RouteLLM](https://github.com/lm-sys/RouteLLM) | Kalite/maliyet router mantığı | Faz 2 router mantığı |
| [BlockRunAI/ClawRouter](https://github.com/BlockRunAI/ClawRouter) | Agent-native router, ödeme entegre router fikri | Fikir alınır, ödeme modeli alınmaz |
| [Kong/kong](https://github.com/Kong/kong), [apache/apisix](https://github.com/apache/apisix), [higress-group/higress](https://github.com/higress-group/higress) | Rate limit, gateway policy, operasyon dayanıklılığı | Büyük infra örneği, MVP'ye doğrudan alınmaz |

## Bulgu Dağılımı

| Kalıp | Adet | Bizim Karşılığımız |
| --- | ---: | --- |
| usage-metering | 115 | Token, saniye, görsel birimi ve kalan bakiye kanıtı |
| streaming | 90 | Stream cevabında usage/hata kapanışı |
| api-key-security | 83 | Hash, prefix lookup, revoke, last used |
| provider-adapter | 76 | CloseRouter/9Router/başka provider geçişi |
| admin-panel | 60 | Model aç/kapat, fiyat override, kullanıcı itirazı |
| wallet-ledger | 53 | Negatif bakiye olmadan para hareketi |
| rate-limit | 47 | Maliyet patlaması ve abuse koruması |
| openai-compatible | 47 | SDK uyumu ve endpoint contract |
| observability | 33 | Request id, upstream id, hata takibi |
| webhook-idempotency | 21 | Çift ödeme/bakiye yükleme engeli |
| image-video | 5 | Text dışı billing riski |

## Hemen Yapılacak Mimari

1. `ProviderAdapter` sınırı korunacak.
   - İlk adapter: `CloseRouterAdapter`
   - 9Router/LiteLLM/Bifrost sonra aynı arayüzle denenir.

2. Bakiye ve ücretlendirme provider'dan bağımsız olacak.
   - API key doğrula
   - Model aktif mi bak
   - Bakiye ön kontrolü yap
   - Provider'a gönder
   - Gerçek usage sonrası ledger'a TL charge yaz
   - Kalan bakiye negatif olmasın

3. Append-only ledger esas kaynak olacak.
   - Cached balance sadece hız için kullanılacak.
   - Her ödeme webhook'u idempotency key ile tek kez işlenecek.
   - Her usage kaydı request id ile bağlanacak.

4. Streaming ayrıca güvenceye alınacak.
   - Final usage gelmezse reserve + reconcile modeli kullanılacak.
   - Yarım kalan stream error usage olarak kaydedilecek.

5. Public UI sade kalacak.
   - Gizli fiyat izi yok.
   - USD ana fiyat, küçük TL karşılığı, kullanım maliyeti ve kalan bakiye var.

## POC Yapılacaklar

- 9Router adapter: sadece iç fallback/router katmanı olarak.
- LiteLLM veya Bifrost benchmark: bizim provider adapter arkasında hız, hata, usage kanıtı ile test.
- RouteLLM tarzı kalite/maliyet yönlendirme: admin ayarıyla kapalı başlasın.
- Langfuse/TensorZero tarzı observability: request trace ve kullanıcı itiraz kanıtı için değerlendirilsin.

## Şimdilik Alınmayacaklar

- 9Router'i ana satış kanalı yapmak.
- Müşteri bakiyesini veya ödeme mantığını dış router'a taşımak.
- Kendi başına dev bir Kong/APISIX benzeri gateway kurmak.
- Kripto/x402 ödeme modelini MVP'ye almak.
- Image/video billing'i canlı upstream usage doğrulanmadan production'a açmak.

## Son Karar

Bizim sistemin asıl değeri "router" değil; TL bakiyeli, kanıtlı, OpenAI uyumlu ticari API katmanı. Router değiştirilebilir parça olmalı. Para, kullanıcı, API key, fiyat, kullanım kaydı ve itiraz kanıtı bizde kalmalı.
