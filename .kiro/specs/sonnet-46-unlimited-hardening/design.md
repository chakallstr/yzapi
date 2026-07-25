# Design Document: Sonnet 4.6 Sınırsız Yollarının Sertleştirilmesi

## Overview

_(Genel Bakış)_

Sıra: **önce dondur, sonra kanıtla, sonra değiştir.**

1. Diskte duran commit'siz Bedrock çeviri katmanını golden korpusla dondur ve RED→GREEN ile
   kanıtla (R1, R7). Kanıtlanamayan kısmı geri al.
2. Kanıtlanmış tabanın üstüne kalan kusurları ekle: gerçek streaming (R2), lane dayanıklılığı
   (R3), sızıntı kapatma (R4), telemetri (R5), migration (R6).
3. Her adımda golden testi yeşil kalmalı; kırmızıya düşerse değişiklik kapsam dışına taştı.

### Commit'siz kodun ele alınışı (ön koşul)

`closerouter-service.ts` ve `lane-scheduler.ts` diskte test edilmemiş yeni kod içeriyor
(`bedrockToolsFromRequest`, `bedrockToolChoiceFromRequest`, `bedrockMessagesFromRequest`,
`partsFromBedrockAnthropic`, `bedrockFinishReason`, `firstChatToolCalls`; lane tarafında
model-bağlı FIFO kuyruk, `releaseLane`, `backoffMsFromRetryAfter`). Bu kod başka bir oturum
tarafından yazıldı ve deploy'u bir kez zaten bloke etti.

Bu spec onu sıfırdan yazmaz — **doğrular**: her saf fonksiyon için test yazılır ve fonksiyon
geçici olarak bozulduğunda KIRMIZI olduğu kayda geçirilir. Aksi halde testin gerçekten bir
şey ölçtüğü iddiası kanıtsızdır. Gerekçe: lane RPM muhasebesi paket kotasını etkiler, yani
para yoluna komşudur.

## Architecture

_(Mimari)_

```
İstemci ──► yzapi route katmanı ──► lane scheduler ──► closerouter taşıma ──► Bedrock
            /v1/messages            RPM sliding window   gövde çevirisi        invoke
            /v1/chat/completions     backoff (Retry-After) SSE köprüsü          invoke-with-
            /v1/responses            model-bağlı kuyruk    sızıntı filtresi     response-stream
                                     failover zinciri
```

Üç katman, üç risk profili:

| Katman | Risk | Bu spec'teki müdahale |
|---|---|---|
| Route | Sözleşme ihlali (katalog streaming ilan ediyor, uç karşılamıyor) | `/v1/messages` stream dalı (R2) |
| Lane scheduler | Yanlış lane / hayalet kota / failover yok | Failover geri, kuyruk 429 (R3) |
| Taşıma | Araç düşmesi, kimlik sızıntısı, sahte streaming | Çeviri kanıtı, event-stream, maske (R1/R2/R4) |

Değişmeyen sınır: lane'i olmayan model → `resolveProviderChainForModel` (bugünkü davranış).
Bu, gpt-web/kiro/vexly/cf yollarının bu spec'ten etkilenmemesini garanti eden tek noktadır.

## Components and Interfaces

_(Bileşenler ve Arayüzler)_

### 1. Araç sözleşmesi (R1)

**Gövde şekli ayrımı — araç başına, gövde başına değil.** `isAnthropicToolSpec(t)` →
`{name, input_schema}` varsa Anthropic kabul edilip dokunulmaz; `t.type === "function"` →
çevrilir. Hibrit gövde (bazı araçlar Anthropic, bazıları OpenAI) böylece doğru çalışır.

**`tool_choice` kapısı.** `bedrockToolsFromRequest` boş dizi döndürdüyse `tool_choice`
gövdeye eklenmez. Bedrock araç listesi boşken `tool_choice` gördüğünde ValidationException
veriyor — bu kapı R1.6'nın tek uygulama noktası.

**`tool_result` eşleştirme.** OpenAI `role:"tool"` mesajının `tool_call_id`'si aynı
konuşmadaki bir `tool_use` bloğuyla eşleşmelidir. Eşleşme yoksa öğe **atılır**; uydurma
`tool_use_id` üretilmez (Bedrock eşleşmeyen `tool_result`'ı reddeder).

### 2. `bedrock-eventstream.ts` (yeni, saf modül)

Bedrock `invoke-with-response-stream` `application/vnd.amazon.eventstream` döner — ikili
çerçeve biçimi, SSE değil. yzapi'de çözücü yok.

```
decodeEventStream(chunk: Buffer): { events: BedrockEvent[]; rest: Buffer }
```

- Yarım kalan çerçeve `rest` olarak döner, sonraki chunk'a eklenir (chunk sınırı hatası
  sınıfını kapatan tek mekanizma).
- Bedrock payload'ı `{"bytes":"<base64>"}` sarmalıdır; çözülünce Anthropic olay JSON'u çıkar.
- CRC **doğrulanır**; uyuşmazlıkta çerçeve atılır ve sayaç artırılır (sessiz bozulma yerine
  ölçülebilir arıza). Bozuk çerçeve akışı öldürmez.
- `total_length` üst sınırı 16 MB — uyumsuz veri sonsuz tampon büyütmesin.

### 3. `forwardMessagesStream` (yeni)

Bedrock zaten Anthropic olayları gönderdiği için çeviri **ince**: olayları doğrudan geçir,
yalnız `message_start.model` alanını katalog ID'sine yaz (R4.1). Blok indeksleri ve
`stop_reason` Bedrock'un kendi olaylarından gelir; biz üretmeyiz.

Adapter'a `forwardMessagesStream` eklenir. Bedrock olmayan ctx için upstream SSE'si
pass-through aktarılır — kiro/cf/vexly de streaming kazanır, gövde çevirisi yapılmaz.

### 4. Route katmanı değişikliği (dar tutulur)

`handleTextJsonEndpoint` bugün `stream`'i hiç okumuyor:

- `stream === true` VE `endpoint === "messages"` VE `endpointSupportsStreaming(model, "messages")`
  VE guard streaming'e izin veriyorsa → `forwardMessagesStream`.
- Diğer **her** durumda bugünkü non-stream yol, bit-bit aynı (R2.5).

### 5. Lane failover (R3.2)

`resolveLaneAwareChain` bugün `fallback: null` döndürüyor:

```
lane bulundu → { primary: laneCtx, fallback: resolveProviderChainForModel(id).primary }
```

`releaseLaneIfDiscarded` korunur; fallback'e geçiş `servedBy` ile ayırt edilir ve lane
kotası geri verilir.

### 6. Neden sahte-SSE köprüsü kalıyor

`writeBedrockChatCompletionAsSse` kaldırılmaz. `BEDROCK_REAL_STREAM_ENABLED=0` kaçış valfi
açıldığında geri dönüş yolu olur. Chat/responses uçlarının gerçek akışa bağlanması 2. dalga.

## Data Models

_(Veri Modelleri)_

Bu spec **hiçbir tabloya kolon eklemez/çıkarmaz**. `usage_records`, `user_package_entitlements`,
`packages` şeması değişmez (R7.3).

### `provider_profiles` lane satırları (mevcut şema, yeniden beyan)

| Kolon | Anlam | Sonnet lane değerleri |
|---|---|---|
| `lane_priority` | Deneme sırası (1 = ilk). NULL = lane değil | 1..5 |
| `lane_model` | `sonnet` \| `opus` \| `haiku` — maske sağlığı ölçümü | spillover = `!== "sonnet"` |
| `lane_region` | `geo` \| `global` | — |
| `rpm_limit` | Dakikadaki istek kotası. NULL = sınırsız | Sonnet 10+10, Opus 5+5, Haiku 5 |
| `supported_model_ids` | Katalog ID'leri | Hepsi yalnız `claude-sonnet-4-6`, `claude-sonnet-4.6` |
| `model_map` | Katalog ID → upstream inference profile ID | Görev 10'da doğrulanacak |

### Migration `0047_lane_config_reassert.sql`

Tercih: **yeni ve journal'lı tek migration**, 0042–0046'yı journal'a geriye dönük eklemek
yerine. Gerekçe: o migration'lar canlıda elle uygulandı; journal'a eklemek drizzle'ın onları
yeniden uygulamasına yol açar ve 0042'nin `ALTER TABLE ADD COLUMN`'u `IF NOT EXISTS` olmadan
patlar.

Idempotent yazılır: kolonlar `ADD COLUMN IF NOT EXISTS`, satırlar `INSERT ... ON CONFLICT DO
UPDATE`, durumlar açık `UPDATE`. Plaintext key içermez; mevcut `api_key_cipher` korunur.

Duplicate `0045` öneki: dosya adları değiştirilmez (canlıda elle uygulanmış izler var); 0047
her ikisinin son durumunu yeniden beyan eder, sıra belirsizliği anlamsızlaşır.

`cf-claude` ve `beta-opus-500-24h` durumu migration'a **yazılmaz** — müşteri etkili iş kararı
(o paketleri almış müşteriler 404 alır), ayrı adımda kullanıcı onayıyla uygulanır.

### In-memory durum (kalıcı değil, process-scoped)

`laneDispatchTimes` (RPM sliding window), `laneBackoffUntil`, `requestQueue` (model-bağlı).
Hiçbiri müşteri içeriği taşımaz; yalnız profil ID'si, zaman damgası ve model ID'si.

## Correctness Properties

_(Doğruluk Özellikleri)_

### Property 1: Event-stream çözücü bölünme-değişmezdir

Aynı bayt dizisi rastgele noktalardan bölündüğünde çözücü her zaman aynı olay dizisini
üretir. Kanıt: `fast-check` ile rastgele bölme noktaları. Bu, chunk sınırı hatası sınıfını
kapatan tek özelliktir. **Validates: Requirements 2.4**

### Property 2: Araç çevirisi kayıpsızdır

Anthropic şemalı bir araç (`{name, input_schema}`) çeviriden geçtiğinde çıktı girdiyle
bit-bit aynıdır. Kanıt: `fast-check` ile rastgele araç şemaları. **Validates: Requirements 1.1**

### Property 3: Araçlar boşsa `tool_choice` hiç gönderilmez

Tüm araçlar düştüğünde (yalnız yerleşik tipler verildiğinde) gövdede ne `tools` ne
`tool_choice` bulunur. Kanıt: tüm yerleşik tip kombinasyonları. **Validates: Requirements 1.6**

### Property 4: Müşteri gövdesinde sağlayıcı dizgesi asla bulunmaz

Rastgele upstream gövdesi için çıktıda `bedrock`, `amazonaws`, `us.anthropic`,
`global.anthropic` dizgeleri yoktur. Kanıt: `fast-check`. **Validates: Requirements 4.1, 4.2, 4.4**

### Property 5: `stream:false` çıktısı golden ile bit-bit aynıdır

Kanıt: golden korpus karşılaştırması. **Validates: Requirements 2.5, 7.1**

### Property 6: Lane kuyruğu isteği yalnız kendi modelinin lane'iyle çözer

A modelini bekleyen bir istek, B modelinin lane'iyle çözülmez. Kanıt: birim testi, iki lane
grubu. **Validates: Requirements 3.6**

### Property 7: Lane kotası korunur

Acquire sayısı − release sayısı = gerçekten dispatch edilen istek sayısı. Hayalet tüketim
olmaz. Kanıt: birim testi, override senaryoları. **Validates: Requirements 3.5**

### Property 8: Bedrock olmayan yollar değişmez

Bedrock olmayan `ProviderContext` ile `forwardChat` / `forwardTextEndpoint` /
`forwardChatStream` çıktısı bit-bit aynı kalır. Kanıt: preservation testi.
**Validates: Requirements 7.2, 7.4**

## Error Handling

_(Hata Yönetimi)_

| Durum | Davranış |
|---|---|
| Bedrock 400 (ValidationException) | Gövde sanitize edilir (sağlayıcı dizgeleri müşteriye geçmez), ham metin loga; failover fallback bacağını dener |
| Bedrock 429/503 | `Retry-After` okunur (`MAX_BACKOFF_MS` üst sınır), lane backoff'a alınır, sıradaki lane denenir |
| Tüm lane'ler dolu + kuyruk süre aşımı | `RateLimitError` → **429 + `Retry-After`** (bugün 500 dönüyor); slot iadesi mevcut `status !== "success"` dalıyla |
| Bozuk event-stream çerçevesi (CRC) | Çerçeve atılır, sayaç artar, akış devam eder |
| Akış ortasında upstream kopması | Yarım JSON yazılmaz; faturalama mevcut `stream_missing_usage` / `noCharge` kurallarını **aynen** uygular |
| Geçersiz `tool_call_id` (eşleşen `tool_use` yok) | Öğe atılır; uydurma ID üretilmez |
| Geçersiz lane model ID'si | Lane `enabled=false` — geçersiz ID'li lane enabled **kalamaz** (R3.2) |

Yeni faturalama dalı **açılmaz**. Stream yolunda usage son olaydan okunur; yoksa mevcut
kurallar uygulanır. Bu, diff'te billing çağrı noktalarının değişmemiş olmasıyla kanıtlanır.

## Testing Strategy

_(Test Stratejisi)_

| Katman | Yöntem |
|---|---|
| Saf fonksiyonlar (araç çevirisi, event-stream, backoff) | Birim + property-based (`fast-check`) — P1, P2, P3 |
| Preservation | Mevcut `responses-translation-golden.json` + yeni `bedrock-translation-golden.json` — P5, P8 |
| Taşıma katmanı | `nock` ile `invoke` ve `invoke-with-response-stream` mock'ları |
| Kablolama | `handleTextJsonEndpoint` stream dalı + telemetri alanları contract testi |
| Sızıntı | Property testi — P4; ayrıca sır/PII loglanmadığı testi |
| Lane | Birim: model-bağlılık, FIFO, kota muhasebesi — P6, P7 |
| Uçtan uca | `itest` (Docker gerekir) + canlıda tek gerçek istek (onaylı) |

Her testin **RED kanıtı** ilgili düzeltmeden önce kayda geçilir. Golden fixture'lar
düzeltmeden sonra yeniden üretilmez; `GOLDEN_WRITE` olmadan test asla yazmaz.

## Bilinçli kapsam dışı

- `/v1/chat/completions` ve `/v1/responses` için Bedrock **gerçek** streaming → 2. dalga
  (bugün Sonnet trafiğinin tamamı `type=text`).
- Opus/Haiku modellerinin müşteriye tekrar satılması — iş kararı.
- 501 fırtınası, gpt-web koltuk kapasitesi, `/v1/messages` dışı istemci uyumu.
- nginx `gw_trial_` backend seçimi — ayrı güvenlik işi, ayrı onay.
- Stream'de chunk sınırına denk gelen kimlik sızıntısı (bir delta `glob` ile bitip sonraki
  `al.anthropic` ile başlarsa regex yakalamaz). Bilinen sınırlama;
  `message_start.model` yeniden yazımı bundan bağımsız ve kesindir.

## Geri alma

Her dalga tek commit. İki env anahtarı riski kapatır:
`BEDROCK_REAL_STREAM_ENABLED` (varsayılan açık; kapatınca sahte-SSE köprüsüne döner) ve
`MESSAGES_STREAM_ENABLED` (varsayılan açık; kapatınca `/v1/messages` bugünkü non-stream
davranışına döner). İkisi kapalıyken sistem bu spec öncesi davranışa döner.
