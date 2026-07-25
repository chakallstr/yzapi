# Requirements Document

_Sonnet 4.6 Sınırsız Yollarının Sertleştirilmesi_

## Introduction

_(Giriş)_

`claude-sonnet-4-6` bugün satışta olan tek Claude modeli. `sonnet-unlimited-1d/3d/7d/builder`
paketleri onu satıyor ve bu paketlerin **hiçbirinde** `cf_api_slug` veya `provider_base_url`
yok — yani paket dalı upstream zincirini ezmiyor, istek **lane scheduler**'ın seçtiği
Bedrock lane'ine gidiyor. Bu spec o yolu (istemci → yzapi → Bedrock) uçtan uca doğrular ve
kalan kusurları kapatır.

Kapsam, üç müşteri ucunu içerir: `/v1/messages` (Claude Code / Anthropic SDK),
`/v1/chat/completions` (OpenAI-uyumlu istemciler), `/v1/responses` (Codex sınıfı istemciler).

### Ölçülen başlangıç durumu (2026-07-25, canlı salt-okuma)

| Kanıt | Değer |
|---|---|
| Canlı lane satırı | 5 (`bedrock-sonnet-us/global`, `bedrock-opus-us/global`, `bedrock-haiku-global`), hepsi `enabled=t`, key var |
| Lane'lerin `supported_model_ids` | Hepsi yalnız `claude-sonnet-4-6` + `claude-sonnet-4.6` (maskeli spillover) |
| Bedrock'a giden gerçek istek | 21, hepsi `success`, hepsi `type=text` |
| Hangi lane'ler kullanıldı | `bedrock-sonnet-us` (14), `bedrock-sonnet-global` (7) |
| Spillover lane'leri (opus/haiku) | **0 istek — hiç denenmedi** |
| `/v1/chat/completions` üzerinden Bedrock | 0 istek |
| `/v1/messages` araç telemetrisi | Yok (tüm araç sayaçları yalnız `/v1/responses`'ı ölçüyor) |
| Aktif `sonnet-unlimited` hakkı | 0 |

### Çalışma ağacının durumu (spec'in ön koşulu)

`src/server/services/closerouter-service.ts` ve `src/server/services/lane-scheduler.ts`
diskte, **commit edilmemiş** ve **test edilmemiş** bir Bedrock araç çeviri katmanı içeriyor
(`bedrockToolsFromRequest`, `bedrockToolChoiceFromRequest`, `bedrockMessagesFromRequest`,
`partsFromBedrockAnthropic`, `bedrockFinishReason`, `firstChatToolCalls`; lane tarafında
model-bağlı FIFO kuyruk, `releaseLane`, `backoffMsFromRetryAfter`). Bu kod başka bir oturum
tarafından yazıldı. Bu spec onu **doğrulanmamış girdi** kabul eder: önce kanıtlanır, sonra
üzerine eklenir. Kanıtlanamayan kısım geri alınır.

## Glossary

_(Sözlük)_

| Terim | Anlamı |
|---|---|
| **Lane** | `lane_priority` set edilmiş bir `provider_profiles` satırı = tek bir Bedrock inference profile (model + bölge) + kendi RPM kotası |
| **Spillover lane** | `lane_model !== "sonnet"` olan lane. Sonnet isteğini alır, upstream'de Opus/Haiku'ya map eder, yanıtta "Claude Sonnet 4.6" maskesi uygulanır |
| **Maske / identity relabel** | `ctx.relabelResponseTo` ile gövdeye kimlik talimatı enjeksiyonu + yanıtta sızıntı filtreleme |
| **Golden korpus** | Değişiklik öncesi davranışın dondurulmuş anlık görüntüsü; preservation kanıtı |
| **RED kanıtı** | Düzeltme uygulanmadan testin kırmızı olduğunun kayda geçirilmesi |
| **Hayalet tüketim** | Acquire edilip kullanılmayan lane'in RPM kotasının yanmış kalması |
| **K1** | Mevcut faturalama değişmezi (bu spec ona dokunmaz) |
| **event-stream** | AWS `application/vnd.amazon.eventstream` ikili çerçeve biçimi |

## Requirements

_(Gereksinimler)_

### Gereksinim 1 — Araç sözleşmesi üç uçta da bozulmadan taşınır

**Kullanıcı hikâyesi:** Bir Claude Code / Cursor / Codex kullanıcısı olarak, Sonnet 4.6'ya
araç tanımı gönderdiğimde modelin araç çağrısının istemcime yapısal olarak ulaşmasını
istiyorum; düz metne dönüşmesini veya sessizce düşmesini istemiyorum.

#### Kabul ölçütleri

1. `/v1/messages` gövdesindeki Anthropic araç şeması (`{name, input_schema}`) Bedrock invoke gövdesine **bit-bit** aynı gider; hiçbir alan eklenmez/çıkarılmaz.
2. `/v1/chat/completions` ve `/v1/responses` çevirisinden gelen OpenAI şeması (`{type:"function", function:{name, parameters}}`) `{name, description, input_schema}`'ya çevrilir.
3. Bedrock yanıtındaki `tool_use` blokları: `/v1/messages`'ta ham korunur; chat/responses'ta `tool_calls`'a çevrilir ve `finish_reason` `tool_calls` olur.
4. `tool_choice`: `"auto"` → `{type:"auto"}`, `"required"`/`"any"` → `{type:"any"}`, `{type:"function",function:{name}}` → `{type:"tool",name}`, `"none"` → alan **gönderilmez**.
5. Araç geçmişi korunur: `assistant.tool_calls` → `tool_use` blokları, `role:"tool"` mesajı → eşleşen `tool_use_id` ile `tool_result` bloğu. Eşleşecek `tool_use_id` yoksa öğe atılır (geçersiz gövde gönderilmez).
6. Bedrock'un kabul etmediği yerleşik araç tipleri (`web_search`, `image_generation`, `local_shell`, `custom`) düşer; düştüklerinde `tool_choice` gövdeye **eklenmez** (aksi halde Bedrock 400 verir).
7. Araçsız istekler ile araç taşıyan isteklerin gövde çıktısı, bu spec öncesindeki golden korpusla karşılaştırıldığında yalnız araç alanlarında farklıdır.

### Gereksinim 2 — Streaming gerçek olur

**Kullanıcı hikâyesi:** Claude Code kullanıcısı olarak yanıtın token token akmasını
istiyorum; imlecin donup sonra tek blok gelmesini istemiyorum.

#### Kabul ölçütleri

1. Katalog `claude-sonnet-4-6` için `messages` ve `chat` uçlarında `supportsStreaming: true` **ilan ediyor**; `/v1/messages` bu ilanı karşılar (bugün karşılamıyor: `handleTextJsonEndpoint` `stream` alanını hiç okumuyor, `forwardTextEndpoint` gövdeye `stream:false` yazıyor).
2. `stream:true` ile gelen `/v1/messages` isteği `text/event-stream` döner ve Anthropic olay sırasını yayar: `message_start` → (`content_block_start`/`content_block_delta`/`content_block_stop`)* → `message_delta` → `message_stop`.
3. Araç çağrısı akışta `content_block_start` (`type:"tool_use"`, `id`, `name`) + `input_json_delta` parçaları olarak yayılır; `stop_reason` `tool_use` olur.
4. Bedrock tarafında `invoke-with-response-stream` kullanılır ve AWS event-stream çerçeveleri çözülür; ilk içerik parçası tam üretim beklenmeden istemciye gider.
5. `stream:false` (veya alan yok) davranışı **bit-bit** bugünküyle aynı kalır.
6. Akış ortasında upstream kopması: istemciye yarım JSON yazılmaz, faturalama bugünkü `stream_missing_usage` / `noCharge` kurallarını aynen uygular.

### Gereksinim 3 — Lane yönlendirmesi doğru ve dayanıklı olur

**Kullanıcı hikâyesi:** Operatör olarak Sonnet trafiği 20 RPM'i aştığında spillover
lane'lerinin gerçekten çalışmasını, tek lane arızasında isteğin ölmemesini istiyorum.

#### Kabul ölçütleri

1. Beş lane'in `model_map` değerlerinin **hepsi** hedef AWS hesabında gerçekten çağrılabilir olduğu kanıtlanır. Bugün yalnız iki Sonnet lane'i kanıtlı; `us.anthropic.claude-opus-4-6-v1` ve `global.anthropic.claude-opus-4-6-v1` sürüm eki (`:0`) taşımıyor oysa aynı migration'daki Haiku satırı `...-v1:0` biçiminde — bu tutarsızlık çözülür.
2. Geçersiz çıkan lane ya doğru ID'ye düzeltilir ya `enabled=false` yapılır. Geçersiz ID'li bir lane **enabled kalamaz**.
3. Lane zinciri failover'ı korur: lane primary olur, lane-dışı zincir (`resolveProviderChainForModel`) fallback kalır. Bugün `fallback: null` — tek lane 400/5xx verdiğinde müşteri hatayı görüyor.
4. Bir lane 429/503 verdiğinde `Retry-After` başlığına saygı gösterilir, üst sınır `MAX_BACKOFF_MS` ile kapanır ve sıradaki uygun lane denenir.
5. Acquire edilmiş ama kullanılmamış lane'in RPM kotası geri verilir (override zinciri lane'i attığında hayalet tüketim olmaz).
6. Kuyruk yalnız **aynı modeli** bekleyen isteği o modelin lane'iyle çözer ve FIFO çalışır.
7. Tüm lane'ler doluysa istek kuyrukta bekler; süre aşımında müşteriye 429 (`Retry-After` ile) döner, 500 dönmez.

### Gereksinim 4 — Sağlayıcı kimliği ve kod adı sızmaz

**Kullanıcı hikâyesi:** İşletme sahibi olarak müşterinin Bedrock'u, AWS bölgesini veya
isteğinin Opus/Haiku lane'ine düştüğünü görmemesini istiyorum.

#### Kabul ölçütleri

1. Müşteriye dönen gövdedeki `model` alanı her zaman istenen katalog ID'sidir (`claude-sonnet-4-6`); upstream inference profile ID'si (`global.anthropic.*`) hiçbir uçta görünmez — non-stream ve stream dahil.
2. Yanıt metni `filterIdentityLeaksInJson` / `filterIdentityLeaksInText` süzgecinden geçer; spillover Opus/Haiku lane'inde de "Claude Sonnet 4.6" maskesi korunur.
3. Kimlik talimatı (`applyIdentityRelabelToBody`) Bedrock dalında da gövdenin doğru alanına enjekte edilir.
4. Hata gövdeleri (`forwardUpstreamError`) Bedrock ValidationException metnini müşteriye olduğu gibi yansıtmaz — `bedrock`, `anthropic.claude-*`, `amazonaws` dizgeleri müşteri gövdesine geçmez.
5. Loglarda araç adı, argüman, prompt, key veya base_url yazılmaz; yalnız tip/sayı/boolean.

### Gereksinim 5 — Sonnet yolu ölçülebilir olur

**Kullanıcı hikâyesi:** Operatör olarak "araç çağrısı çalışmıyor" şikâyeti geldiğinde
kusurun bizde mi istemcide mi olduğunu logdan ayırt etmek istiyorum.

#### Kabul ölçütleri

1. `/v1/messages` için `/v1/responses`'takiyle eşdeğer araç telemetrisi eklenir: `declaredToolTypes`, `mappedToolCount`, `droppedToolTypes`, `toolCallCount`, `emittedToolItems`, `stream`.
2. `mappedToolCount > 0 && toolCallCount === 0` (araç verildi, model çağırmadı) ayırt edilebilir.
3. `toolCallCount > 0 && emittedToolItems === 0` (bizde emit hatası) ayırt edilebilir.
4. Lane kararı loglanır: `laneProfileId`, `laneSpillover` (boolean: gerçek Sonnet lane'i mi yoksa maskeli mi), `queuedMs`. Lane etiketi/base_url loglanmaz, yalnız profil ID'si.
5. `scripts/responses-tool-contract-report.mjs` bu satırları da sınıflandırır.

### Gereksinim 6 — Şema ve migration tutarlılığı

**Kullanıcı hikâyesi:** Geliştirici olarak `npm run db:migrate` sonrası yerel ortamın
canlıyla aynı lane yapılandırmasına sahip olmasını istiyorum.

#### Kabul ölçütleri

1. `meta/_journal.json` 0041'de bitiyor; `0042`–`0046` journal'da yok, yani `db:migrate` bunları **hiç uygulamıyor** (yerelde `lane_model` kolonu yok, `provider_profiles` boş). Bu kapatılır.
2. `0045` önekini iki dosya paylaşıyor (`0045_bedrock_lane_sonnet_only.sql`, `0045_sonnet_package_pricing_and_rate.sql`); sıra belirsizliği giderilir.
3. Eksik uygulanan adımlar tamamlanır veya bilinçli karar olarak kaydedilir: canlıda `cf-claude` hâlâ `enabled=t` (0045 adım 2 tutmamış) ve `beta-opus-500-24h` hâlâ `enabled=t, satista=t` (adım 5 tutmamış).
4. Yeni migration **idempotent** olur ve mevcut canlı satırları bozmaz; uygulandıktan sonra canlı ile yerel `provider_profiles` lane satırları birebir aynı olur.
5. Migration hiçbir plaintext key içermez.

### Gereksinim 7 — Sonnet dışı hiçbir yol değişmez (preservation)

**Kullanıcı hikâyesi:** İşletme sahibi olarak bu çalışmanın GPT, Kiro, CF, Vexly ve
faturalama yollarına dokunmamasını istiyorum.

#### Kabul ölçütleri

1. `responses-translation.ts` golden korpusu (`__fixtures__/responses-translation-golden.json`) **yeniden üretilmez** ve testi yeşil kalır.
2. Bedrock olmayan bir `ProviderContext` ile `forwardChat` / `forwardTextEndpoint` / `forwardChatStream` çıktısı bit-bit değişmez.
3. Billing K1 sözleşmesi, CF sayaçları, paket slot muhasebesi ve `usage_records` şeması değişmez.
4. `gpt-web`, `kiro`, `vexly-*`, `cf-*` profillerine giden istekler etkilenmez; lane'i olmayan modelde `resolveLaneAwareChain` bugünkü zinciri döndürür.
5. `npm run scan:public` sızıntı bulmaz.
6. `npm test` tam paket yeşil kalır (başlangıç: 144 dosya / 1235 test).
