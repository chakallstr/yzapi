# Bugfix Gereksinim Dokümanı

## Introduction

_(Giriş)_

`POST /v1/responses` ucuna gelen Responses API istekleri (Codex CLI ve diğer Responses istemcileri) iki yoldan biriyle upstream'e iletilir:

- **NATIVE passthrough** — `nativeResponsesCapable(ctx)` doğruysa ham Responses gövdesi (`rawProviderBody`) olduğu gibi gider; araç (tool) sözleşmesi korunur.
- **ÇEVİRİ yolu** — diğer tüm sağlayıcılar için `responsesRequestToChat()` ile `/chat/completions` şemasına çevrilir.

Hata, **çeviri yolunda araç sözleşmesinin sessizce bozulmasıdır**. `src/server/services/responses-translation.ts` içindeki gidiş çevirisi istemcinin deklare ettiği araçların bir bölümünü düşürür, dönüş çevirisi araç çağrılarını yanlış Responses öğe tipiyle yayar, araç geçmişi öğeleri boş `user` mesajına dönüşür ve araçlar tamamen düştüğünde `tool_choice` yine gönderilerek upstream 400'e yol açar. Ayrıca `src/server/routes/proxy.ts` (`handleResponsesEndpoint`, ~1258-1655) içindeki native-degrade kapısı, pre-commit 400/404 durumunda aynı `ctx` üzerinde çeviri yoluna düşerek **tur ortasında** araç sözleşmesini değiştirir.

Müşteriye yansıması: model aracın varlığını hiç görmez (araç hiç çağrılmaz), ya da çağrı istemcinin bekledigi şemada gelmediği için istemci aracı **yürütemez**; en kötü durumda upstream 400 ile istek düşer. Codex'in freeform `apply_patch` aracı (`type: "custom"`) bu yolda tamamen işlevsizdir.

İkincil sorun: bu beş kusurun canlıda hangi sıklıkta tetiklendiğini gösteren **hiçbir log alanı yoktur**. Canlı doğrulama: journal'da 48 saatte ~74 adet `/v1/responses`; `usage_records` içinde 30 saatte 4 satır, hepsi `status=success`, `error_code` boş. Yani bugün log kanıtı üretilemiyor — teşhis alanları eklenmeden düzeltmenin canlıda işe yaradığı **doğrulanamaz**. Bu yüzden gözlemlenebilirlik bu bugfix'in kapsamındadır.

**Kapsam:** yalnızca bu repo (`/Users/ufuk/yzapi`; canlı `/opt/turkapiprojesi`, systemd `turkapiprojesi`, 127.0.0.1:4568). Düzeltme **saf çeviri katmanında** (`responses-translation.ts`) ve `proxy.ts`'in **yalnız native-degrade kapısında** yapılır.

**DOKUNULMAZ (bu bugfix hiçbirini değiştirmez):** `billing-service.ts` reserve/settle/charge ve K1 değişmezi (upstream hatasında 0 tahsil + tam iade); `resolveBilledPromptTokens` / `normalizeProviderUsage` token sayımı; `proxy.ts` içindeki paket/entitlement/CF ayna/lane-scheduler/spark alternasyon dalları; provider codename'lerinin frontend'e veya public API'ye sızmaması; MASTER_MODELS 42-kilit.

## Bug Analysis

_(Bug Analizi)_

### Current Behavior (Defect)

_(Mevcut Davranış — Kusur)_

Aşağıdaki tüm maddeler **çeviri yolu** için geçerlidir (native passthrough'da araçlar korunur).

1.1 WHEN istek `tools` listesinde `type: "custom"` bir araç içerir (Codex freeform `apply_patch`) THEN sistem `convertTools()` içinde bu aracı **sessizce düşürür** ve upstream'e ilettiği `tools` listesinde hiç yer vermez; model aracın varlığını hiç görmez.

1.2 WHEN istek `tools` listesinde `function` ve `local_shell` dışında herhangi bir Responses araç tipi içerir (`web_search`, `image_generation` vb.) THEN sistem bu araçları **sessizce düşürür** ve istemciye hiçbir uyarı/işaret vermez.

1.3 WHEN upstream, istemcinin `type: "custom"` olarak deklare ettiği bir araç için `tool_call` döndürür THEN sistem `chatCompletionToResponses()` ve `ResponsesStreamTranslator.toolOutputItem()` içinde bunu `type: "function_call"` olarak yayar; istemci `custom_tool_call` beklediği için şema uyuşmazlığı oluşur ve çağrıyı yürütemez.

1.4 WHEN istek `input` dizisinde `custom_tool_call` veya `custom_tool_call_output` geçmiş öğesi içerir THEN sistem bu öğeleri tanımaz, son `else` dalına düşürüp `{ role: "user", content: "" }` **boş user mesajına** dönüştürür; konuşma geçmişi bozulur ve bazı upstream'ler boş `content`'e 400 döner.

1.5 WHEN isteğin tüm araçları çeviride düşer (`convertTools()` `undefined` döner) ve istek `tool_choice: "required"` veya `tool_choice: { type: "function", ... }` içerir THEN sistem `tools` alanı olmayan ama `tool_choice` içeren bir gövde gönderir; upstream 400 döner ve istek başarısız olur.

1.6 WHEN native bacak pre-commit 400/404 verir ve istekte çeviri yolunda korunamayacak araç tipleri vardır THEN sistem aynı `ctx` üzerinde çeviri yoluna düşer (`proxy.ts:1535` stream / `proxy.ts:1582` non-stream) ve **tur ortasında** araç sözleşmesini sessizce değiştirir (araçlar kırpılır).

1.7 WHEN yukarıdaki kusurlardan herhangi biri canlıda tetiklenir THEN sistem hiçbir teşhis alanı üretmez (deklare edilen araç tipleri, düşürülen araç tipleri, native bacak kullanımı, degrade olup olmadığı, `tool_choice` türü); olay `status=success` olarak kaydedilir ve sorunun sıklığı ölçülemez.

### Expected Behavior (Correct)

_(Beklenen Davranış — Doğru)_

2.1 WHEN istek `tools` listesinde `type: "custom"` bir araç içerir THEN sistem bu aracı, adı ve açıklaması korunacak şekilde upstream'in anlayacağı bir chat aracına (freeform metin girdisi alan `function` sarmalı) SHALL eşlemeli ve aracı **asla sessizce düşürmemeli**.

2.2 WHEN istek `function` ve `local_shell` dışında ve desteklenen eşlemesi olmayan bir araç tipi içerir THEN sistem bu tipi düşürebilir ancak düşürdüğü tipleri teşhis alanında (`droppedToolTypes`) SHALL raporlamalı; sessiz kayıp SHALL olmamalı.

2.3 WHEN upstream, istemcinin `custom` olarak deklare ettiği bir araç adı için `tool_call` döndürür THEN sistem (non-stream ve stream yollarının **ikisinde de**) çağrıyı istemcinin deklare ettiği tipe uygun şekilde `custom_tool_call` olarak SHALL yaymalı; `function` olarak deklare edilen araçlar için `function_call`, `local_shell` için `local_shell_call` SHALL üretmeye devam etmeli.

2.4 WHEN istek `input` dizisinde `custom_tool_call` veya `custom_tool_call_output` geçmiş öğesi içerir THEN sistem bunları sırasıyla `assistant`+`tool_calls` ve `role: "tool"` mesajlarına SHALL eşlemeli; hiçbir girdi öğesi boş `content`'li `user` mesajına SHALL dönüşmemeli.

2.5 WHEN isteğin tüm araçları çeviride düşer THEN sistem `tool_choice` alanını upstream gövdesine SHALL eklememeli (araç yokken araç zorlaması gönderilmemeli), böylece upstream 400 SHALL oluşmamalı.

2.6 WHEN native bacak pre-commit 400/404 verir ve istekte çeviri yolunda korunamayacak araç sözleşmesi vardır THEN sistem aynı `ctx` üzerinde çeviri yoluna degrade **etmemeli**, hatayı `forwardWithFailover`'a SHALL yeniden fırlatmalı (mevcut spark rethrow deseninin genelleştirilmiş hâli), böylece araç sözleşmesi tur ortasında SHALL değişmemeli.

2.7 WHEN `/v1/responses` isteği çeviri yolunu veya native bacağı kullanır THEN sistem sır/PII/provider codename içermeyen teşhis alanlarını (`declaredToolTypes`, `droppedToolTypes`, `nativeLeg`, `degraded`, `toolChoiceKind`) SHALL üretmeli; böylece kusurun canlı sıklığı ve düzeltmenin etkisi ölçülebilir olmalı.

### Unchanged Behavior (Regression Prevention)

_(Değişmeyen Davranış — Regresyon Önleme)_

3.1 WHEN istek yalnızca `type: "function"` araçları içerir THEN sistem bunları bugünkü chat `{ type: "function", function: {...} }` sarmalına SHALL DEVAM ETMELİ aynı şekilde çevirmeye (mevcut `responses-translation.test.ts` beklentileri birebir geçerli kalır).

3.2 WHEN istek `type: "local_shell"` aracı ve/veya `local_shell_call` / `local_shell_call_output` geçmişi içerir THEN sistem bugünkü gidiş-dönüş eşlemesini (`local_shell` function aracı ↔ `local_shell_call` öğesi, `action` JSON sarmalı) SHALL DEVAM ETMELİ korumaya.

3.3 WHEN istek araç içermez (`tools` yok) THEN sistem ürettiği chat gövdesini bugünle **bit-bit aynı** SHALL DEVAM ETMELİ üretmeye (`tools` ve `tool_choice` alanları eklenmez).

3.4 WHEN istek araç içerir ve en az bir araç çeviriden sağ çıkar THEN sistem `tool_choice` değerini bugünkü `convertToolChoice()` semantiğiyle (`auto`/`none`/`required` string; `{type:"function", function:{name}}` objesi) SHALL DEVAM ETMELİ iletmeye.

3.5 WHEN istek düz string `input`, `instructions`, içerik parçaları (`input_text`/`input_image`/`refusal`), `developer`→`system` rol eşlemesi, `reasoning.effort`, `max_output_tokens`, `temperature`, `top_p`, `parallel_tool_calls` alanlarını içerir THEN sistem bugünkü eşlemelerini SHALL DEVAM ETMELİ aynen uygulamaya.

3.6 WHEN Codex model slug'ı gönderilir (`gpt-5.x-codex`, `codex-mini*`) THEN sistem `normalizeRequestedModel()` alias tablosunu ve MASTER_MODELS 42-kilidini SHALL DEVAM ETMELİ değişmeden uygulamaya.

3.7 WHEN stream isteği işlenir THEN sistem `sequence_number` tek-artan sıralamasını, `output_index` atama düzenini, `response.created`/`in_progress`/`output_item.added`/`output_text.delta`/`...done`/`response.completed` event sırasını, `finish()` idempotansını ve upstream `tool_call.id` yoksa sentetik `call_id` üretmeyi SHALL DEVAM ETMELİ korumaya.

3.8 WHEN `nativeResponsesCapable(ctx)` doğrudur (profileId `sub-codex`, `cf:*` veya `api.openai.com` base url) THEN sistem ham Responses gövdesini (araçlar dokunulmamış) SHALL DEVAM ETMELİ passthrough etmeye; native yol davranışı değişmez.

3.9 WHEN native bacak 401/403/429/5xx veya bağlantı hatası verir, ya da `ctx.relabelSource === "spark"`'tır THEN sistem bugünkü rethrow davranışını (failover'a devir; spark degrade edilmez) SHALL DEVAM ETMELİ aynen korumaya.

3.10 WHEN `/v1/responses` isteği faturalanır THEN sistem `billing-service.ts` reserve/settle/charge mantığını, K1 değişmezini (upstream hatasında 0 tahsil + tam iade), `resolveBilledPromptTokens` / `normalizeProviderUsage` token sayımını, paket/entitlement/CF ayna/lane-scheduler/spark alternasyon dallarını SHALL DEVAM ETMELİ değiştirmeden çalıştırmaya.

3.11 WHEN yeni teşhis logu üretilir THEN sistem provider codename / base_url / API key / müşteri içeriği (prompt, argümanlar) / PII SHALL DEVAM ETMELİ sızdırmamaya; `npm run scan:public` ve `*-noleak` testleri SHALL DEVAM ETMELİ geçmeye.

3.12 WHEN mevcut test paketi koşulur THEN `npx vitest run src/server/services/responses-translation.test.ts`, `npm test`, `npm run lint` ve `npm run build && npm run scan:public` SHALL DEVAM ETMELİ hatasız geçmeye.

## Bug Koşulu C(X) ve Özellikler

Notasyon: **F** = düzeltme öncesi kod, **F'** = düzeltme sonrası kod.

Girdi uzayı: `X = { body: ResponsesRequest, ctx: ProviderContext, leg: "native" | "translation" }`.

### Yardımcı yüklemler

```pascal
FUNCTION usesTranslationPath(X)
  INPUT: X
  OUTPUT: boolean
  RETURN NOT nativeResponsesCapable(X.ctx)   // veya native bacak degrade edildi
END FUNCTION

FUNCTION declaredToolTypes(X)
  RETURN { t.type FOR EACH t IN (X.body.tools OR []) }
END FUNCTION

FUNCTION survivesConvertTools(type)
  RETURN type IN { "function", "local_shell" }   // F'nin koruduğu tipler
END FUNCTION
```

### Bug koşulu

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ResponsesForwardInput
  OUTPUT: boolean

  RETURN usesTranslationPath(X) AND (
        // C1: desteklenmeyen araç tipi sessizce düşüyor (custom, web_search, image_generation, ...)
        EXISTS t IN declaredToolTypes(X) WHERE NOT survivesConvertTools(t)
        // C2: custom araç için dönen tool_call yanlış öğe tipiyle yayılıyor
     OR "custom" IN declaredToolTypes(X)
        // C3: custom araç geçmişi boş user mesajına dönüşüyor
     OR EXISTS i IN (X.body.input OR []) WHERE i.type IN { "custom_tool_call", "custom_tool_call_output" }
        // C4: tüm araçlar düştü ama tool_choice gönderiliyor
     OR ( (X.body.tools ≠ [] ) AND convertTools(X.body.tools) = undefined AND X.body.tool_choice ≠ null )
  )
END FUNCTION
```

Ek olarak degrade kapısı için ayrı koşul:

```pascal
FUNCTION isDegradeBugCondition(X, err)
  INPUT: X, err (native bacak hatası)
  OUTPUT: boolean

  RETURN X.leg = "native"
     AND err.status IN { 400, 404 }
     AND NOT res.headersSent
     AND X.ctx.relabelSource ≠ "spark"
     AND EXISTS t IN declaredToolTypes(X) WHERE NOT survivesConvertTools(t)
END FUNCTION
```

### Özellik: Fix Checking

```pascal
// P1: hiçbir deklare edilmiş araç sessizce kaybolmaz
FOR ALL X WHERE isBugCondition(X) DO
  chat ← responsesRequestToChat'(X.body)
  ASSERT FOR ALL t IN (X.body.tools) WHERE t.type = "custom":
           EXISTS c IN chat.tools WHERE toolName(c) = t.name
  ASSERT droppedToolTypes(X) IS REPORTED IN diagnostics
END FOR

// P2: dönüş yolu istemcinin deklare ettiği tipi korur (non-stream ve stream aynı)
FOR ALL X WHERE "custom" IN declaredToolTypes(X) DO
  item ← emitToolCallItem'(X, toolCallNamed(n))
  ASSERT declaredTypeOf(n, X) = "custom"      ⇒ item.type = "custom_tool_call"
  ASSERT declaredTypeOf(n, X) = "function"    ⇒ item.type = "function_call"
  ASSERT n = "local_shell"                    ⇒ item.type = "local_shell_call"
END FOR

// P3: hiçbir girdi öğesi boş user mesajına dönüşmez
FOR ALL X WHERE isBugCondition(X) DO
  chat ← responsesRequestToChat'(X.body)
  ASSERT NOT EXISTS m IN chat.messages WHERE m.role = "user" AND m.content = ""
END FOR

// P4: araç yoksa araç zorlaması da yok
FOR ALL X WHERE isBugCondition(X) DO
  chat ← responsesRequestToChat'(X.body)
  ASSERT chat.tools = undefined ⇒ chat.tool_choice = undefined
END FOR

// P5: araç sözleşmesi tur ortasında kırpılmaz
FOR ALL X, err WHERE isDegradeBugCondition(X, err) DO
  ASSERT shouldDegradeNativeResponsesForContext'(X.ctx, err, res, X.body) = false   // rethrow
END FOR
```

### Özellik: Preservation Checking

```pascal
// Karşılaştırma alanı: upstream'e giden gövde + istemciye dönen Responses öğeleri/eventleri.
// Yeni teşhis log alanları bu alanın DIŞINDADIR (gözlemlenebilirlik eklemesi, davranış değişikliği değil).
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT responsesRequestToChat(X.body)        = responsesRequestToChat'(X.body)
  ASSERT chatCompletionToResponses(R, meta)    = chatCompletionToResponses'(R, meta)
  ASSERT streamEvents(X)                       = streamEvents'(X)      // tip, sıra, sequence_number dahil
END FOR

FOR ALL X, err WHERE NOT isDegradeBugCondition(X, err) DO
  ASSERT shouldDegradeNativeResponsesForContext(X.ctx, err, res)
       = shouldDegradeNativeResponsesForContext'(X.ctx, err, res, X.body)
END FOR
```

### Karşı örnekler (fix öncesi KIRMIZI olmalı)

| # | Girdi | F (bugünkü) davranış | F' (beklenen) |
|---|-------|----------------------|---------------|
| CE1 | `tools: [{ type: "custom", name: "apply_patch" }]`, çeviri yolu | `chat.tools = undefined` | `apply_patch` chat aracı olarak var |
| CE2 | Yukarıdaki + upstream `tool_calls: [{ function: { name: "apply_patch" } }]` | `type: "function_call"` | `type: "custom_tool_call"` |
| CE3 | `input: [{ type: "custom_tool_call", call_id: "c1", name: "apply_patch", input: "..." }, { type: "custom_tool_call_output", call_id: "c1", output: "ok" }]` | `{ role: "user", content: "" }` × 2 | `assistant`+`tool_calls`, ardından `role: "tool"` |
| CE4 | `tools: [{ type: "web_search" }], tool_choice: "required"` | `tools` yok + `tool_choice: "required"` → upstream 400 | `tool_choice` gönderilmez |
| CE5 | native bacak 400, `tools` içinde `custom`, `relabelSource ≠ "spark"` | çeviri yoluna degrade (araçlar kırpılır) | rethrow → failover |

## Doğrulama Araçları (bu repoda mevcut)

- Unit: `npx vitest run src/server/services/responses-translation.test.ts` (DB gerektirmez)
- Property-based: `fast-check` kurulu (devDependencies) — C(X) sınıfı üzerinden fix + preservation
- Tip: `npm run lint` (`tsc --noEmit`)
- Build + sızıntı: `npm run build`, ardından `npm run scan:public`
- Integration: `src/server/__tests__/responses-endpoint.itest.ts` (`npm run db:up` → `npm run db:migrate` → `npm run itest`)
- Deploy: `bash scripts/sync-deploy.sh` — **ön koşul:** clean-tree guard var, lokal ağaç şu an kirli (84 dosya, HEAD `b6f6197`) → deploy öncesi commit şart
