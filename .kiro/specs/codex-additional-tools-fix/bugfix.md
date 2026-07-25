# Bugfix Requirements Document

## Introduction

Codex istemcileri (Desktop/CLI), `POST /v1/responses` isteğinde araç şemalarını üst düzey `tools` alanında göndermiyor; şemaları `input` dizisinin içinde `{ "type": "additional_tools", "role": "developer", "tools": [...] }` biçiminde bir öğe olarak taşıyor. yzlab-api'nin araç sözleşmesi katmanı bu öğeyi tanımıyor, dolayısıyla gerçek araç şemaları hiç okunmuyor. Sonuç olarak istek `tools` alanı boş sayılıyor ve sistem geçmiş tool call'lardan şema uyduran son çare yoluna (backfill) düşüyor. Bunun müşteriye yansıyan belirtileri: `invalid wait cell`, `exec cell nonexistent`, `tool invocation blocked`, ve modelin açıklamadaki örnek `cell_id` değerini birebir kopyalaması.

**Etkilenen kod tabanı:** `/opt/yzlab` (uzak sunucu, `yzlab-api.service`, `WorkingDirectory=/opt/yzlab/apps/api`, tsx ile `src`'den koşuyor → derleme adımı yok). Yerel birebir kopya: `/Users/ufuk/yzlab-live` (üç dosyada md5 eşleşmesi doğrulandı). Trafik yolu: `https://yapayzekalab.org/v1/*` → nginx → `127.0.0.1:4100` → yzlab-api → `Provider(openai) = http://127.0.0.1:8317` (ssh ters tüneli) → Mac'te cliproxy (CLIProxyAPI 7.2.95) → OAuth ile bağlı Codex koltukları.

**Kapsam dışı kod tabanı:** `/Users/ufuk/yzapi` (= `/opt/turkapiprojesi`, port 4568, `api.yapayzekalab.org`). Bu spec o kod tabanının davranışını DEĞİŞTİRMEZ; tamamlanmış `responses-tool-contract-fix` spec'i oraya aitti. (Not: spec dokümanları workflow gereği bu workspace altında tutuluyor, düzeltme ise `/opt/yzlab` üzerinde yapılacak.)

### Kanıt Özeti

| # | Kanıt | Ölçüm |
|---|-------|-------|
| K1 | Canlı log: `journalctl -u yzlab-api --since "3 days ago" \| grep -c "input_item:additional_tools"` | **5524** istek |
| K2 | Kod: `grep -c "additional_tools" apps/api/src/gateway/codex-tools.ts` | **0** — öğe hiç tanınmıyor (doğrulandı: `apps/api/src` altında hiçbir dosyada geçmiyor) |
| K3 | Upstream: openai/codex issue #31875 ve #31870 (ham istek yakalama) | Öğe belgelenmiş; tetikleyici `use_responses_lite: true` |
| K4 | Canlı log gövde anahtarları: `keys=[client_metadata,include,input,model,parallel_tool_calls,prompt_cache_key,reasoning,store,stream,text,tool_choice]` | `tools` alanı YOK |
| K5 | Kod: `apps/api/src/services/spark.ts:38` `ALLOWED_INPUT_ITEM_TYPES` = {message, function_call, function_call_output, reasoning, item_reference} ve `:83` `input_item:${item.type}` uygunsuzluk sebebi | `additional_tools` listede yok |
| K6 | Kod: `apps/api/src/gateway/routes.ts:699-706` `clientTools` yalnız `body.tools`'tan; `:702` hafıza yazımı yalnız `clientTools.length > 0` iken; `:722-735` `logToolNames` yalnız `body.tools`'a bakıyor | Araç kaybı ve `tools=[]` logu buradan |
| K7 | Kod: `codex-tools.ts:110` `prepareResponsesBodyForUpstream`, `:489` `backfillToolsFromHistory`, `:547` `required: Object.keys(properties)`, `:474` "reconstructed from this conversation history" | Uydurma şema yolu |
| K8 | Kod: `tool-memory.ts:78-86` `usable()` ve `:236-242` `pick()` "hepsi ya da hiç" kapı; `:206` yazımda `redis.expire` var, okuma yolunda (`:234` sonrası) TTL tazelenmiyor; `TTL_MS`/`REDIS_TTL_SEC` = 6 saat | Hafıza yolunun yan kusurları |
| K9 | Redis `localhost:6380` PONG; yazma/okuma anahtarı aynı (`apiKeyId::modelId`); son 12 saatte 38 HIT | Hafıza mekanizması bozuk DEĞİL; MISS'lerin sebebi aynı kök neden |

`use_responses_lite` bayrağı `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna` için açık, `gpt-5.5` / `gpt-5.4` için kapalı (K3). Sorunun yalnız 5.6 ailesinde görülmesinin nedeni bu.

**Önemli ayrım:** Araçlar kaybolmuyor; YANLIŞ YERDE ARANIYOR. `logToolNames`'in `tools=[]` yazması bir veri kaybı göstergesi değil, ölçüm noktasının eksikliğidir (K6).

### Bug Koşulu C(X) ve Özellik P

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = { body: ResponsesRequest, coverage, model }
  OUTPUT: boolean

  RETURN (EXISTS item IN X.body.input WHERE item.type = "additional_tools")
         AND (X.body.tools IS ABSENT OR length(X.body.tools) = 0)
END FUNCTION
```

```pascal
// Property: Fix Checking — gerçek şemalar üst düzeye yükseltilir
FOR ALL X WHERE isBugCondition(X) DO
  upstream ← prepareResponsesBodyForUpstream'(X)
  ASSERT length(upstream.tools) = length(additionalToolsItem(X).tools)
  ASSERT upstream.tools ARE the client's real schemas (uydurma/backfill DEĞİL)
  ASSERT NO tool name equals namespace + name concatenation (örn. "execexec" yasak)
  ASSERT sparkEligibility(upstream) DOES NOT return "input_item:additional_tools"
END FOR
```

```pascal
// Property: Preservation Checking — bug koşulu yoksa davranış bit-bit aynı
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)   // upstream gövdesi ve istemciye dönen event dizisi özdeş
END FOR
```

**F** = düzeltme öncesi kod, **F'** = düzeltme sonrası kod.

### Çürütülen Hipotez (tekrar denenmemeli)

`store: true` + `previous_response_id` ile stateful destek eklemek bu sorunu ÇÖZMEZ:
- openai/codex #3841: Codex'in istek yapısında `previous_response_id` alanı hiç yok.
- CLIProxyAPI #1382: bakımcı, devamlılığın `prompt_cache_key` ile sağlandığını, `previous_response_id`'nin silindiğini belirtiyor.
- OpenAI API referansı ve community.openai.com/t/tools-not-working-after-first-turn-when-using-previous-response-id/1368446: `tools` HER TURDA gönderilmesi gereken alandır, önceki yanıttan miras alınmaz.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN istek `input` içinde `type: "additional_tools"` öğesi taşıyor ve üst düzey `tools` yok/boş THEN sistem bu öğeyi tanımaz ve içindeki gerçek araç şemalarını üst düzey `tools`'a yükseltmez (K2, K7 — `prepareResponsesBodyForUpstream`, `codex-tools.ts:110`).

1.2 WHEN `additional_tools` öğesi tanınmadığı için `clientTools` boş kalır THEN sistem araç şemalarını geçmiş tool call'lardan uydurur (`backfillToolsFromHistory`, `codex-tools.ts:489`) ve açıklamaya "reconstructed from this conversation history" yazar (`:474`).

1.3 WHEN şema geçmişten uydurulur THEN sistem tüm argümanları zorunlu işaretler (`required: Object.keys(properties)`, `codex-tools.ts:547`), böylece istemcinin gerçek zorunluluk kümesinden sapar.

1.4 WHEN geçmişte bir `function` aracının argümanları çözülemez THEN sistem o aracı tamamen atlar (`backfillSkipped`), çünkü boş şema upstream'de 500 döndürüyor; sonuçta model o aracı hiç göremez.

1.5 WHEN uydurulan araç açıklamasına geçmişten örnek değer konur THEN model örneği birebir kopyalar; ölçüm: 3/3 denemede aynı `cell_id` ile `wait` çağrısı (kodun kendi yorumundaki canlı kanıt, `codex-tools.ts:~455-460`). Müşteri belirtileri: `invalid wait cell`, `exec cell nonexistent`, `tool invocation blocked`.

1.6 WHEN istek `additional_tools` öğesi içerir THEN `sparkEligibility` `input_item:additional_tools` döndürür ve istek spark bacağına hiç girmez; 3 günde 5524 istek bu nedenle dışarıda kaldı (K1, K5). Bu kapı müşteriye hata döndürmez, yalnız isteği pahalı bacağa yönlendirir; yük dağıtımı çalışmaz.

1.7 WHEN istemci araçları yalnız `additional_tools` içinde gönderir THEN araç hafızasına hiçbir kayıt yazılmaz, çünkü yazım koşulu yalnız `clientTools.length > 0` (`routes.ts:702`, K6).

1.8 WHEN hatırlanan araçlar 6 saatten uzun bir oturumda sürekli okunur THEN Redis TTL yalnız yazımda tazelendiği için (`tool-memory.ts:206`; okuma yolunda tazeleme yok) kayıt süresi doldurur ve hafıza kaybolur (K8).

1.9 WHEN turun geçmişindeki çağrı adlarından yalnız bir kısmı hatırlanan listede bulunur (örn. `exec`, `wait`, `spawn_agent` adları `exec_command`, `write_stdin` … listesinde yok) THEN hafıza kapısı "hepsi ya da hiç" davrandığı için tüm hatırlanan seti reddeder (`usable()` `tool-memory.ts:78-86`, `pick()` `:236-242`, K8).

1.10 WHEN araç adları loglanır THEN `logToolNames` yalnız `body.tools`'a baktığı için `tools=[]` yazar ve teşhis yanlış yöne işaret eder (`routes.ts:722-735`, K6).

### Expected Behavior (Correct)

2.1 WHEN istek `input` içinde `type: "additional_tools"` öğesi taşıyor ve üst düzey `tools` yok/boş THEN sistem bu öğedeki araç şemalarını üst düzey `tools` alanına YÜKSELTMELİDİR (`SHALL`), sıra ve içerik korunarak.

2.2 WHEN yükseltme yapılır THEN sistem `additional_tools` öğesini upstream'e gönderilen `input` dizisinden ÇIKARMALIDIR. **DOĞRULANMALI:** upstream (cliproxy/Codex) bu öğeyi `input` içinde görmeye tolerans gösteriyor mu; çıkarma zorunlu mu yoksa yalnız güvenli mi olduğu canlı istekle ölçülmeli. Emsal davranış mevcut: `type: "namespace"` öğeleri bugün `input`'tan atılıyor (`codex-tools.ts:282-288`).

2.3 WHEN gerçek şemalar `additional_tools`'tan elde edilebilir THEN sistem geçmişten şema uyduran backfill yolunu ÇALIŞTIRMAMALIDIR; backfill yalnız hiçbir gerçek kaynak (istemci `tools`, `additional_tools`, hafıza) yokken son çare olarak kalmalıdır.

2.4 WHEN araç şemasında `namespace` ve `name` birlikte gelir THEN sistem bu iki değeri ASLA string olarak birleştirmemelidir; istek-yerel bir `flat_name → (namespace, local_name)` haritası tutmalı ve global string kırpma yapmamalıdır. `execexec` belirtisi tam olarak bu adımın atlanmasından doğuyor. Referans: vllm #46737 + birleştirilmiş PR #47024, Palantir topluluk çözümü, bharat2808/codex-ollama-proxy.

2.5 WHEN `additional_tools` öğesi içeren bir istek spark uygunluğu için değerlendirilir THEN `additional_tools` izinli girdi öğesi türleri listesinde bulunmalı ve uygunluk YÜKSELTME SONRASI gövde üzerinden hesaplanmalıdır (`spark.ts:38`).

2.6 WHEN araçlar `additional_tools`'tan yükseltilir THEN sistem bu gerçek şemaları araç hafızasına YAZMALIDIR (bugün yazılmıyor, 1.7).

2.7 WHEN hatırlanan araçlar okunur ve kullanılır THEN sistem Redis TTL'sini okuma yolunda da TAZELEMELİDİR, böylece 6 saatten uzun aktif oturumlarda hafıza düşmez.

2.8 WHEN turun geçmişindeki çağrı adlarının bir kısmı hatırlanan listede bulunur THEN hafıza kapısı PARÇALI (kesişim) çalışmalı ve bulunan araçları geri koymalıdır; eşleşmeyen adlar için hiçbir uydurma tanım eklenmemelidir.

2.9 WHEN araç teşhisi loglanır THEN log satırı araçların hangi kaynaktan geldiğini (`tools`, `additional_tools`, hafıza, backfill) ve sayısını göstermelidir; ad/şema dışı hiçbir içerik (prompt, argüman, sır) yazılmamalıdır.

2.10 WHEN düzeltme uygulanır THEN gerçek Codex istemcisiyle ardışık (multi-turn) tool çağrısı testi yapılmalı ve `invalid wait cell` / `exec cell nonexistent` / `tool invocation blocked` hatalarının oluşmadığı doğrulanmalıdır. **KISIT:** sistem şu an bakım modunda (nginx 503, yedek `/etc/nginx/conf.d/*.bak-bakim-20260725T162202Z`); bu test ancak bakımdan çıkınca veya IP muafiyeti (88.228.196.57) geri konunca yapılabilir.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN istek `additional_tools` öğesi içermez THEN sistem upstream'e gönderilen gövdeyi ve istemciye dönen event dizisini BİT-BİT AYNI üretmeye DEVAM ETMELİDİR (Preservation Checking: `F(X) = F'(X)`).

3.2 WHEN istemci araçları üst düzey `tools` alanında gönderir THEN sistem bugünkü davranışını (gruplama, sanitizasyon, konteyner koruma, hafızaya yazma) AYNEN SÜRDÜRMELİDİR.

3.3 WHEN spark yönlendirmesi yapılır THEN `SPARK_TARGETS` tablosu ve tek/çift parite ile 1-1 alternasyon mantığı AYNEN KORUNMALIDIR (kullanıcı kararı: "spark devam edecek 1e1").

3.4 WHEN `gpt-5.6-*` modelleri upstream'e gönderilir THEN `SEAT_WIRE_REMAP` BOŞ KALMAYA DEVAM ETMELİ ve model kendi adıyla gitmelidir (canlı kanıt: uçtan uca 200, `model: gpt-5.6-sol`, `[seat-remap]` logu 0 satır).

3.5 WHEN istek faturalandırma, kota ve CF sayaçlarından geçer THEN `applySeatDecrement`, paket kapsama mantığı ve tüm billing davranışı DEĞİŞMEDEN KALMALIDIR.

3.6 WHEN upstream yanıtında ikilenmiş araç adı gelir THEN mevcut ad onarımı (`createResponsesToolNameRepairer`, `codex-tools.ts:376`) ve `input` öğelerinden `namespace` alanını silme davranışı (`codex-tools.ts:294-298`) KORUNMALIDIR; yerine geçen bir çözüm önerilirse canlı kanıtla gerekçelendirilmelidir.

3.7 WHEN `type: "namespace"` öğeleri `input` içinde gelir THEN bunların atılması davranışı DEVAM ETMELİDİR (`codex-tools.ts:282-288`).

3.8 WHEN herhangi bir log satırı yazılır THEN sır, API anahtarı, PII, prompt içeriği veya araç argümanı SIZDIRILMAMAYA DEVAM ETMELİDİR (mevcut kural, `[body-shape]` yalnız anahtar adları yazıyor).

3.9 WHEN mevcut testler koşulur THEN `apps/api/src/gateway/codex-tools.test.ts`, `tool-memory.test.ts`, `tool-memory-redis.test.ts` ve `services/spark.test.ts` GEÇMEYE DEVAM ETMELİDİR. Bilinen ve bu spec'le ilgisiz başarısızlık: `apps/api/src/billing/ledger.test.ts` yerel Postgres olmadığı için `PrismaClientInitializationError` verir (değişiklik öncesinde de vardı). Not: `tool-memory-redis.test.ts` Redis'i MOCK'lar, canlı bağlantıyı kanıtlamaz.

3.10 WHEN düzeltme dağıtılır THEN dağıtım yolu bugünkü gibi kalmalıdır: dosya `/opt/yzlab/...` üzerine zaman damgalı `.bak` alındıktan sonra `scp` ile kopyalanır, `ssh vps 'systemctl restart yzlab-api'` ile servis yeniden başlatılır (derleme adımı YOK); doğrulama `journalctl -u yzlab-api | grep -E "tool-debug|tool-contract|tool-restore|body-shape"` ile yapılır.

3.11 WHEN canlı test için geçici API anahtarı üretilir THEN kanıtlanmış yöntem sürdürülmelidir: owner hesabında `generateApiKey` ile üret, test sonunda `revokedAt` set ederek iptal et (iptalin işlediği 401 ile bugün iki kez doğrulandı).
