# Implementation Plan: Sonnet 4.6 Sınırsız Yollarının Sertleştirilmesi

## Overview

_(Genel Bakış)_

Hedef: `claude-sonnet-4-6` sınırsız paketlerinin gittiği yolu (istemci → yzapi → lane
scheduler → Bedrock) üç uçta da doğrulamak ve kalan kusurları kapatmak.

Yöntem: diskte duran commit'siz Bedrock çeviri katmanını önce golden korpus + RED kanıtıyla
dondur; sonra gerçek streaming, lane dayanıklılığı, sızıntı kapatma, telemetri ve migration
ekle. Her adımda golden testi yeşil kalmalı.

Dokunulan dosyalar: `closerouter-service.ts`, `lane-scheduler.ts`, `proxy.ts`,
`provider-adapter.ts`, yeni `bedrock-eventstream.ts`, yeni migration `0047`.
Dokunulmayanlar: billing/K1, CF sayaçları, `usage_records` şeması, `responses-translation.ts`
golden fixture, gpt-web/kiro/vexly/cf yolları.

## Tasks

_(Görevler)_

- [x] 1. Bedrock golden korpusunu kur ve commit'siz kodun mevcut davranışını dondur
  - `src/server/services/__tests__/bedrock-translation-golden.test.ts` oluştur; `fast-check` ile sabit seed (`seed: 20260726, numRuns: 200`) kullanan üretici yaz: araçsız gövdeler, Anthropic araçlı gövdeler (`{name, input_schema}`), OpenAI araçlı gövdeler (`{type:"function"}`), hibrit gövdeler, `tool_use`/`tool_result` geçmişli gövdeler, her `tool_choice` biçimi
  - Her gövde için `buildBedrockAnthropicBody(body)` çıktısını topla; ayrıca sabit Bedrock yanıtları için `partsFromBedrockAnthropic` + `bedrockAnthropicToChatCompletion` çıktılarını topla
  - `GOLDEN_WRITE=1` verildiğinde `__fixtures__/bedrock-translation-golden.json`'a yaz; env yoksa oku ve derin eşitlik doğrula (asla yazma)
  - Korpusu ÇEVİRİ KODUNA HİÇ DOKUNMADAN üret ve testin yeşil geçtiğini doğrula
  - _Gereksinimler: 1.7, 7.1, 7.2_

- [ ] 2. Commit'siz çeviri katmanını RED→GREEN ile kanıtla
- [x] 2.1 Araç şeması çevirisi birim testleri
  - `bedrockToolsFromRequest`: Anthropic şeması dokunulmaz; OpenAI şeması `{name, description, input_schema}`'ya çevrilir; `parameters` yoksa boş şema; yerleşik tipler (`web_search`, `image_generation`, `local_shell`, `custom`) düşer; hibrit dizide her araç kendi kuralıyla işlenir
  - `bedrockToolChoiceFromRequest`: `"auto"`→`{type:"auto"}`, `"required"`/`"any"`→`{type:"any"}`, `"none"`→`undefined`, `{type:"function",function:{name}}`→`{type:"tool",name}`, Anthropic-native biçim dokunulmaz
  - RED kanıtı: fonksiyonu geçici olarak ham geçiş (`return tools`) yap, testlerin kırmızıya düştüğünü kayda geç, sonra geri al
  - _Gereksinimler: 1.1, 1.2, 1.4, 1.6_
- [ ] 2.2 Araç geçmişi ve dönüş yolu birim testleri
  - `bedrockMessagesFromRequest`: `assistant.tool_calls` → `tool_use` blokları; `role:"tool"` → eşleşen `tool_use_id` ile `tool_result`; eşleşmeyen `tool_call_id` → öğe ATILIR; `{role:"user",content:""}` üretilmez
  - `partsFromBedrockAnthropic`: `tool_use` blokları `tool_calls`'a çevrilir, `input` → `arguments` JSON string'i, `id` yoksa üretilir; metin blokları birleşir
  - `bedrockFinishReason`: `tool_use`→`tool_calls`, `end_turn`/`stop_sequence`→`stop`, `max_tokens`→`length`, araç var + `stop` → `tool_calls`
  - `firstChatToolCalls`: chat gövdesinden araç çağrılarını çıkarır
  - RED kanıtı: her fonksiyon için bozucu tek satırlık değişiklikle kırmızı olduğunu kayda geç
  - _Gereksinimler: 1.3, 1.5_
- [ ] 2.3 `tool_choice` kapısı ve gövde bütünlüğü
  - Tüm araçlar düştüğünde (`tools: [{type:"web_search"}]`) gövdede `tools` VE `tool_choice` bulunmadığını doğrula
  - Araç taşımayan gövdenin çıktısının golden ile bit-bit aynı olduğunu doğrula
  - _Gereksinimler: 1.6, 1.7_
- [ ] 2.4 Lane scheduler eklerinin testleri
  - `backoffMsFromRetryAfter`: saniye biçimi, HTTP-date biçimi, geçersiz/boş → `DEFAULT_BACKOFF_MS`, `MAX_BACKOFF_MS` üst sınırı, geçmiş tarih → default
  - `releaseLane`: acquire edilmiş kotayı geri verir, boş listede güvenli, çift release sayacı negatife düşürmez
  - Kuyruk model-bağlılığı: A modelini bekleyen istek, B modelinin lane'iyle ÇÖZÜLMEZ
  - Kuyruk FIFO: en eski bekleyen ilk çözülür
  - RED kanıtı: kuyruk testini `modelId` filtresini kaldırarak kırmızıya düşür, kayda geç, geri al
  - _Gereksinimler: 3.4, 3.5, 3.6_
- [ ] 2.5 Taşıma katmanı entegrasyon testleri (`nock`)
  - Bedrock invoke mock'u ile: araç taşıyan `/v1/messages` gövdesinin upstream'e Anthropic şeklinde gittiğini ve dönen `tool_use` bloklarının ham korunduğunu doğrula
  - Aynısı chat için: OpenAI araçlı istek → upstream Anthropic şeması → dönüşte `tool_calls` + `finish_reason: "tool_calls"`
  - Bedrock 429 → `err.retryAfter` başlığının yakalandığını doğrula
  - Kanıtlanamayan veya hatalı çıkan dalı düzelt; düzeltme golden'ı bozarsa kapsamı daralt
  - _Gereksinimler: 1.1, 1.2, 1.3, 3.4_

- [ ] 3. Sızıntı kapatma ve kilitleme
- [ ] 3.1 Non-stream `/v1/messages` maskesi
  - `{...json, model: body.model}` + `filterIdentityLeaksInJson` davranışını property testiyle kilitle: rastgele upstream gövdesi → çıktıda `global.anthropic`, `us.anthropic`, `bedrock`, `amazonaws` dizgeleri YOK
  - _Gereksinimler: 4.1, 4.2_
- [ ] 3.2 Request-side kimlik talimatını Bedrock dalına ekle
  - Bedrock dallarında `applyIdentityRelabelToBody(providerBody, ctx.relabelResponseTo, endpoint)` çağır; `relabelResponseTo` boşsa no-op olduğunu doğrula
  - Golden testi yeşil kalmalı (talimat yalnız relabel set'liyken eklenir)
  - _Gereksinimler: 4.3, 7.2_
- [ ] 3.3 Hata gövdesi sanitizasyonu
  - Bedrock hata gövdesi müşteriye aktarılmadan önce sağlayıcı-adı taraması: `bedrock`, `amazonaws`, `anthropic.claude-`, `inference profile` eşleşirse gövde genel mesajla değiştirilir, ham metin YALNIZ loga gider
  - Bedrock olmayan sağlayıcıların hata gövdesi davranışı DEĞİŞMEZ
  - _Gereksinimler: 4.4, 7.2_

- [ ] 4. AWS event-stream çözücü (gerçek streaming'in temeli)
- [ ] 4.1 `bedrock-eventstream.ts` saf modülünü yaz
  - `decodeEventStream(buf): { events, rest }` — prelude (12B) + header'lar + payload + mesaj CRC; yarım çerçeve `rest` olarak döner
  - Bedrock `{"bytes":"<base64>"}` sarmalını çöz, içindeki Anthropic olay JSON'unu döndür
  - CRC uyuşmazlığında çerçeveyi at ve sayaç artır (akışı öldürme); `total_length` 16 MB üst sınırı
  - _Gereksinimler: 2.4_
- [ ] 4.2 Property testi: bölünme değişmezliği
  - `fast-check` ile: aynı bayt dizisi RASTGELE noktalardan bölündüğünde çözücü HER ZAMAN aynı olay dizisini üretir (chunk sınırı hatası sınıfını kapatır)
  - Bozuk CRC'li çerçeve akışı öldürmez, sonraki çerçeve okunur
  - RED kanıtı: `rest` biriktirmeyi kaldırıp testin kırmızıya düştüğünü kayda geç
  - _Gereksinimler: 2.4_

- [ ] 5. `/v1/messages` gerçek streaming
- [ ] 5.1 Bedrock streaming taşıması
  - `invoke-with-response-stream` URL'i + `forwardMessagesStream` fonksiyonu; olayları `decodeEventStream` ile çöz, Anthropic SSE olarak yaz
  - `message_start` içindeki `model` katalog ID'sine yazılır; metin delta'ları `filterIdentityLeaksInText`'ten geçer
  - `content_block_start` (`type:"tool_use"`) + `input_json_delta` + `stop_reason: "tool_use"` zinciri korunur
  - Kaçış valfi `BEDROCK_REAL_STREAM_ENABLED=0` → mevcut sahte-SSE köprüsüne döner
  - _Gereksinimler: 2.2, 2.3, 2.4, 4.1, 4.2_
- [ ] 5.2 Adapter ve route kablolaması
  - `ProviderAdapter`'a `forwardMessagesStream` ekle; Bedrock olmayan ctx için upstream SSE'sini pass-through aktar
  - `handleTextJsonEndpoint`: `stream === true && endpoint === "messages" && endpointSupportsStreaming(...) && guard izin veriyor` → stream yolu; DİĞER HER DURUM bugünkü non-stream yol
  - Kaçış valfi `MESSAGES_STREAM_ENABLED=0` → bugünkü davranış
  - _Gereksinimler: 2.1, 2.2, 2.5_
- [ ] 5.3 Faturalama davranışının korunduğunu kanıtla
  - Stream yolunda usage son olaydan okunur; usage yoksa mevcut `stream_missing_usage` / `noCharge` kuralları AYNEN uygulanır
  - Akış ortası kopmada yarım JSON yazılmadığını ve slot iadesinin çalıştığını doğrula
  - Yeni faturalama dalı AÇILMADIĞINI kanıtla (billing çağrı noktaları diff'te değişmemiş olmalı)
  - _Gereksinimler: 2.6, 7.3_
- [ ] 5.4 `nock` ile uçtan uca stream testi
  - Mock event-stream yanıtı → istemciye yazılan SSE olay dizisi doğrulanır (sıra, `model` alanı, araç blokları)
  - `stream:false` isteğinin çıktısının golden ile bit-bit aynı kaldığını doğrula
  - _Gereksinimler: 2.2, 2.3, 2.5_

- [ ] 6. Lane dayanıklılığı
- [ ] 6.1 Failover zincirini geri getir
  - `resolveLaneAwareChain`: lane primary + `resolveProviderChainForModel` sonucunu fallback yap
  - Fallback'e geçildiğinde lane kotasının geri verildiğini (`servedBy` ile ayırt) doğrula
  - Lane'i olmayan modelde davranışın DEĞİŞMEDİĞİNİ doğrula
  - _Gereksinimler: 3.3, 7.4_
- [ ] 6.2 Kuyruk süre aşımı → 429
  - `enqueueRequest` reject'i `RateLimitError` + `Retry-After` ile 429'a çevrilir, 500 dönmez
  - Slot iadesinin mevcut `status !== "success"` dalıyla çalıştığını doğrula (billing'e dokunma)
  - _Gereksinimler: 3.7_

- [ ] 7. Telemetri (`/v1/messages` kör noktası)
  - `handleTextJsonEndpoint`'e tek `logger.info` satırı: `declaredToolTypes`, `mappedToolCount`, `droppedToolTypes`, `toolCallCount`, `emittedToolItems`, `stream`, `laneProfileId`, `laneSpillover`, `queuedMs`
  - YALNIZ tip/sayı/boolean loglanır; araç adı, argüman, prompt, key, base_url, lane etiketi loglanmaz
  - `scripts/responses-tool-contract-report.mjs`'i bu satırları da sınıflandıracak şekilde genişlet
  - Kablolama contract testi + sır/PII yazmama testi
  - _Gereksinimler: 5.1, 5.2, 5.3, 5.4, 5.5, 4.5_

- [ ] 8. Migration `0047_lane_config_reassert.sql`
  - Idempotent: lane kolonları `ADD COLUMN IF NOT EXISTS`, 5 lane satırı `INSERT ... ON CONFLICT DO UPDATE`, `supported_model_ids`/`model_map` son durumu yeniden beyan
  - `meta/_journal.json`'a EKLENİR (0042–0046 journal'a geriye dönük eklenmez — yeniden uygulanırlarsa `ADD COLUMN` patlar)
  - Plaintext key İÇERMEZ; mevcut `api_key_cipher` korunur
  - Uygulama sonrası yerel `provider_profiles` lane satırlarının canlıyla birebir aynı olduğunu doğrula
  - `cf-claude` ve `beta-opus-500-24h` durumuna DOKUNMA (müşteri etkili, ayrı karar — görev 10)
  - _Gereksinimler: 6.1, 6.2, 6.4, 6.5_

- [ ] 9. Tam doğrulama geçidi
  - `npm run lint` (tsc --noEmit) temiz
  - `npm test` tam paket yeşil (başlangıç 144 dosya / 1235 test); `responses-translation-golden.test.ts` ve yeni `bedrock-translation-golden.test.ts` yeşil
  - `npm run build` + `npm run scan:public` temiz
  - Docker varsa: `npm run db:up` → `npm run db:migrate` → `npm run itest`
  - Sonuçları kanıt olarak özetle; herhangi biri kırmızıysa DEVAM ETME
  - _Gereksinimler: 7.1, 7.5, 7.6_

## Kullanıcı onayı gerektiren adımlar (kod değil, karar)

- [ ] 10. Spillover lane model ID'lerini canlıda ölç
  - 5 `model_map` değerini hedef hesapta tek tek minimal `invoke` (`max_tokens: 1`) ile dene, sonucu tabloya yaz
  - Geçersiz çıkanı doğru ID'ye düzelt VEYA `enabled=false` yap — geçersiz ID'li lane enabled KALAMAZ
  - **Para harcar (5 istek) → onay şart**
  - _Gereksinimler: 3.1, 3.2_

- [ ] 11. `cf-claude` / `beta-opus-500-24h` kararı
  - 0045 adım 2 ve 5 canlıda tutmamış. Disable edilirse o paketleri almış müşteriler 404 alır
  - **Müşteri etkili iş kararı → onay şart**
  - _Gereksinimler: 6.3_

- [ ] 12. Commit ve deploy
  - ÖN KOŞUL: `git status --porcelain` boş olmalı. `closerouter-service.ts` ve `lane-scheduler.ts` başka bir oturumun commit'siz işini içeriyor — hunk-bazlı (`git add -p`) ayıklama şart, dosya-bazlı ekleme kontaminasyon yaratır
  - `bash scripts/sync-deploy.sh --dry-run` → onayla gerçek deploy
  - Deploy sonrası: `curl -s http://127.0.0.1:4568/health`, `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`
  - Canlı kanıt: yeni telemetri satırlarının journal'da göründüğünü ve `laneSpillover` oranını raporla
  - **Deploy tüm ağacı rsync'ler → onay şart**
  - _Gereksinimler: 5.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "note": "Bedrock golden korpusu — commit'siz koda dokunmadan alınmalı" },
    { "wave": 2, "tasks": ["2.1", "2.2", "2.3", "2.4"], "note": "Saf fonksiyon RED→GREEN kanıtı, paralel" },
    { "wave": 3, "tasks": ["2.5"], "note": "Taşıma entegrasyonu — 2.x saf kanıtı gerektirir" },
    { "wave": 4, "tasks": ["3.1", "3.2", "3.3", "4.1"], "note": "Sızıntı kapatma + event-stream çözücü, paralel" },
    { "wave": 5, "tasks": ["4.2"], "note": "Çözücü property testi" },
    { "wave": 6, "tasks": ["5.1"], "note": "Bedrock streaming taşıması — 4.x gerektirir" },
    { "wave": 7, "tasks": ["5.2", "5.3"], "note": "Route + faturalama koruması" },
    { "wave": 8, "tasks": ["5.4", "6.1", "6.2", "7"], "note": "Stream e2e, lane failover, telemetri, paralel" },
    { "wave": 9, "tasks": ["8"], "note": "Migration" },
    { "wave": 10, "tasks": ["9"], "note": "Tam doğrulama geçidi" },
    { "wave": 11, "tasks": ["10", "11", "12"], "note": "Yalnız açık kullanıcı onayıyla" }
  ]
}
```

Kurallar:
- 1, 2.x'ten önce bitmek ZORUNDA (golden yalnız el değmemiş davranıştan alınabilir).
- Her testin RED kanıtı, ilgili düzeltmeden önce kayda geçilmeli.
- 4.1 → 4.2 → 5.1 zorunlu sıra (çözücü olmadan streaming yazılamaz).
- 9, 10/11/12'den önce tamamen yeşil olmalı.
- 10, 11, 12 kullanıcı onayı olmadan BAŞLAMAZ.

## Notes

_(Notlar)_

- Golden fixture'lar (`responses-translation-golden.json`, `bedrock-translation-golden.json`) düzeltmeden sonra YENİDEN ÜRETİLMEZ; `GOLDEN_WRITE` olmadan test asla yazmaz.
- Stream'de kimlik sızıntısı filtresi chunk sınırında yakalayamaz (bir delta "glob" ile bitip sonraki "al.anthropic" ile başlayabilir). Bilinen ve bilinçli sınırlama — `responses-translation.ts`'teki aynı sınıf. `message_start.model` yeniden yazımı bundan bağımsız ve kesindir.
- `/v1/chat/completions` ve `/v1/responses` için Bedrock gerçek streaming 2. dalgaya bırakıldı (bugün Sonnet trafiğinin tamamı `type=text`).
- Hiçbir adım "tamam" ilan edilmeden önce ilgili doğrulama komutu koşulur ve çıktısı kanıt olarak sunulur.
