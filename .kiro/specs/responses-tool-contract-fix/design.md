# Teknik Tasarım

## Overview

_(Genel Bakış)_

Düzeltme iki dosyaya sınırlıdır:

- `src/server/services/responses-translation.ts` — saf çeviri katmanı (ağ/DB yok). Araç eşlemesi, dönüş öğe tipi seçimi, geçmiş öğe eşlemesi, `tool_choice` kapısı.
- `src/server/routes/proxy.ts` — yalnız iki nokta: (a) `handleResponsesEndpoint` içinde salt-ek teşhis logu ve `toolKinds` üretimi, (b) native-degrade kapısı (`isNativeResponsesDegradable` / `shouldDegradeNativeResponsesForContext`).

Billing, routing, paket/entitlement, CF ayna, lane-scheduler ve spark dalları **hiç değiştirilmez**.

Onaylanan üç karar:

1. **Custom aracı eşle, native'e zorlama.** `type:"custom"` araç, çeviri yolunda tek freeform string argümanı (`input`) alan bir chat `function` sarmalına eşlenir; dönüşte aynı ad için gelen `tool_call` `custom_tool_call` olarak yayılır. Routing'e dokunulmaz.
2. **Teşhis logu yalnız pino alanı.** DB kolonu / migration yok.
3. **Sıralama zorunlu.** Golden korpus, çeviri koduna dokunmadan ÖNCE kaydedilir.

## Glossary

_(Sözlük)_

- **Çeviri yolu**: `nativeResponsesCapable(ctx)` false olduğunda Responses isteğinin `/chat/completions` şemasına çevrilerek iletilmesi.
- **Native passthrough**: ham Responses gövdesinin (`rawProviderBody`) upstream'e olduğu gibi gitmesi.
- **Degrade**: native bacak pre-commit 400/404 verdiğinde aynı `ctx` üzerinde çeviri yoluna düşülmesi.
- **toolKinds**: istek gövdesinden türetilen `araç adı → deklare edilen tip` haritası.
- **Kayıplı (lossy) araç tipi**: çeviri yolunun aslına birebir sadık taşıyamadığı tip (`custom` ve tüm built-in tipler).
- **Golden korpus**: fix'ten ÖNCE kaydedilen, sabit seed'li üretilmiş girdi/çıktı çiftleri; preservation kanıtı.

## Bug Details

_(Hata Ayrıntıları)_

Kod okumasıyla doğrulanmış, dosya/satır bazlı:

| # | Konum | Kusur |
|---|-------|-------|
| B1 | `responses-translation.ts` `convertTools()` (~148-168) | Yalnız `type:"function"` ve `type:"local_shell"` korunur; `custom`, `web_search`, `image_generation` vb. **sessizce** düşer. |
| B2 | `chatCompletionToResponses()` (~324-345) ve `ResponsesStreamTranslator.toolOutputItem()` (~440) | `local_shell` dışındaki her `tool_call` `type:"function_call"` olarak yayılır; `custom` deklare edilen araç için istemci `custom_tool_call` bekler. |
| B3 | `responsesRequestToChat()` input döngüsü (~200-240) | `custom_tool_call` / `custom_tool_call_output` tanınmaz; son `else` dalına düşüp `{role:"user", content:""}` üretir (`contentToChatContent(undefined) === ""`). |
| B4 | `responsesRequestToChat()` sonu | `if (tools) chat.tools = tools;` ama `tool_choice` koşulsuz iletilir → tüm araçlar düşerse `tools` yok + `tool_choice` var → upstream 400. |
| B5 | `proxy.ts:1535` (stream) / `proxy.ts:1582` (non-stream) | Native pre-commit 400/404 → aynı `ctx` üzerinde çeviri yoluna degrade → tur ortasında araç sözleşmesi sessizce değişir. |
| B6 | `handleResponsesEndpoint` genelinde | Hiçbir teşhis alanı yok; olay `status=success` kaydedilir, sıklık ölçülemez. |

Canlı gözlem (kanıt): journal'da 48 saatte ~74 adet `/v1/responses`; `usage_records`'ta 30 saatte 4 satır, hepsi `success`, `error_code` boş → mevcut telemetriyle bu kusurların sıklığı **ölçülemiyor**.

## Expected Behavior

_(Beklenen Davranış)_

| # | Beklenen |
|---|----------|
| E1 | `type:"custom"` araç upstream'e taşınır (ad + description korunur); taşınamayan tipler teşhis alanında raporlanır, sessiz kayıp olmaz. |
| E2 | Dönen `tool_call`, istemcinin deklare ettiği tipe uygun öğeyle yayılır: `custom` → `custom_tool_call`, `function` → `function_call`, `local_shell` → `local_shell_call`. Stream ve non-stream aynı. |
| E3 | `custom_tool_call` → `assistant`+`tool_calls`, `custom_tool_call_output` → `role:"tool"`. Hiçbir girdi öğesi boş içerikli `user` mesajına dönüşmez. |
| E4 | `body.tools` dolu ama çeviride hepsi düşerse `tool_choice` gövdeye eklenmez. |
| E5 | Native pre-commit 400/404 + kayıplı araç tipi varsa degrade edilmez, hata `forwardWithFailover`'a rethrow edilir. |
| E6 | Sır/PII/codename içermeyen teşhis alanları üretilir. |

Değişmeyecekler (regresyon kilidi): `function`/`local_shell` gidiş-dönüşü, araçsız isteklerde bit-bit aynı gövde, `tool_choice` semantiği, içerik/rol eşlemeleri, model alias tablosu, stream `sequence_number`/sıra/idempotans/sentetik `call_id`, native passthrough, 401/403/429/5xx + spark rethrow, billing K1 ve token sayımı, codename non-leak.

## Hypothesized Root Cause

_(Varsayılan Kök Neden)_

Çeviri katmanı **araç tipini ada göre tahmin eden, tek yönlü ve kayıplı** bir tasarımla yazılmış:

1. Gidişte `convertTools()` bir **allowlist** uygular (`function`, `local_shell`) ve listede olmayanı **sessizce atar** — hata sinyali veya rapor yok.
2. Dönüşte istek bağlamı hiç taşınmaz; `ResponsesStreamMeta` yalnız `{id, model, createdAt}` içerir. Tip bilgisi olmadığı için dönüş çevirisi `name === "local_shell"` heuristiğine mecbur kalır ve geri kalan her şeyi `function_call` sayar. **Kök neden budur:** gidişte kaybedilen "deklare edilen tip" bilgisi dönüşte yeniden inşa edilemez.
3. Girdi döngüsü de aynı allowlist mantığıyla yazılmış; bilinmeyen öğe tipi için "güvenli" varsayılan olarak seçilen generic `message` dalı, tipsiz/rolsüz öğeleri boş `user` mesajına çevirerek sessiz veri bozulması üretir.
4. `tool_choice`, `tools`'tan bağımsız iletildiği için allowlist'in yan etkisi upstream 400'e dönüşür.
5. Degrade kapısı yalnız HTTP statüsüne bakar; isteğin araç sözleşmesini hiç dikkate almaz.

Yani kusurlar tek bir tasarım boşluğunun beş belirtisidir: **istek araç sözleşmesi çeviri boyunca taşınmıyor.** Düzeltme bu bilgiyi taşıyan bir kanal (`toolKinds`) ekleyip allowlist'i eşlemeye çevirmektir.

## Fix Implementation

_(Düzeltme Uygulaması)_

### Araç sözleşmesi akışı (çeviri yolu)

```
İstek (Responses)                                     Yanıt (Responses)
  tools:[{type:"custom",name:"apply_patch"}]            output:[{type:"custom_tool_call",
        │                                                        name:"apply_patch", input:"..."}]
        │ convertTools()                                          ▲
        ▼                                                         │ toolKinds[name] === "custom"
  chat.tools:[{type:"function",                          chatCompletionToResponses() /
    function:{name:"apply_patch",                        ResponsesStreamTranslator
      parameters:{properties:{input:{type:"string"}}}}}]           ▲
        │                                                         │
        └──────────────── upstream /chat/completions ─────────────┘
                          tool_calls:[{function:{name:"apply_patch",
                                        arguments:"{\"input\":\"...\"}"}}]
```

Kilit fikir: ad → deklare edilen tip haritası (`toolKinds`) istek gövdesinden bir kez türetilir ve dönüş çevirisine taşınır. Dönüş çevirisi önce `toolKinds`'e bakar, orada yoksa **bugünkü davranışa** düşer. Preservation'ın mekanik garantisi budur.

### 1. `toolKinds` türetimi (yeni, saf fonksiyon)

```ts
export type ResponsesToolKind = "function" | "custom" | "local_shell";
export function deriveToolKinds(tools: unknown): Record<string, ResponsesToolKind> | undefined;
```

- `{type:"function", name}` ve chat-şekilli `{type:"function", function:{name}}` → `"function"`
- `{type:"custom", name}` → `"custom"`
- `{type:"local_shell"}` → `"local_shell": "local_shell"` (adsız tip, sabit ada bağlanır)
- Boş/geçersiz → `undefined` (alan hiç eklenmez → mevcut çağrılar bit-bit aynı)

### 2. `ResponsesStreamMeta` genişletmesi (opsiyonel alan)

```ts
export interface ResponsesStreamMeta {
  id: string;
  model: string;
  createdAt: number;
  toolKinds?: Record<string, ResponsesToolKind>;   // YENİ, opsiyonel
}
```

Opsiyonel olması zorunlu: `responses-translation.test.ts` içindeki mevcut çağrılar ve `proxy.ts`'teki iki çağrı noktası imza değiştirmeden derlenir.

### 3. `convertTools()` — custom eşlemesi + rapor

```ts
interface ToolConversion {
  tools?: unknown[];        // chat.tools (bugünkü şekil)
  declaredTypes: string[];
  mappedTypes: string[];
  droppedTypes: string[];   // teşhis logu için
}
function convertToolsDetailed(tools: unknown): ToolConversion;
```

`custom` için üretilen chat aracı:

```ts
{
  type: "function",
  function: {
    name: <t.name>,
    description: <t.description ?? "Freeform tool. Pass the full payload as a single string in `input`.">,
    parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"], additionalProperties: false },
  },
}
```

`function` ve `local_shell` dalları **bit-bit değişmez** (mevcut testler kilitli).

### 4. `tool_choice` kapısı

```
body.tools boş/yok            → bugünkü davranış (tool_choice neyse iletilir)
body.tools dolu + tools var   → bugünkü davranış
body.tools dolu + tools yok   → tool_choice EKLENMEZ            ← tek davranış değişikliği
```

Koşul `body.tools`'un **dolu bir dizi** olmasına bağlanır; "araçsız ama tool_choice'lu" istek (bug koşulu dışında) bugünkü çıktısını korur.

### 5. Geçmiş öğe eşlemesi

```
custom_tool_call         → pendingToolCalls += { id: call_id, type:"function",
                              function:{ name, arguments: JSON.stringify({ input: <item.input> }) } }
custom_tool_call_output  → flushToolCalls(); { role:"tool", tool_call_id: call_id, content: <output> }
```

`function_call_output` / `local_shell_call_output` dalına `custom_tool_call_output` eklenir (aynı gövde).

Boş user mesajı guard'ı (dar kapsamlı):

```ts
if (item.role === undefined && typeof type === "string" && type !== "message" && item.content == null) continue;
```

Üç koşul birlikte: rol yok **ve** tip `message` değil **ve** içerik yok. Bugün test edilen her yol bu guard'a hiç girmez → preservation mekanik olarak garanti.

### 6. Dönüş öğe tipi seçimi (tek ortak fonksiyon)

```ts
function responsesToolItemKind(name: string, toolKinds?: Record<string, ResponsesToolKind>): ResponsesToolKind {
  const declared = toolKinds?.[name];
  if (declared) return declared;
  return name === LOCAL_SHELL_TOOL_NAME ? "local_shell" : "function";   // bugünkü davranış
}
```

`chatCompletionToResponses()` ve `toolOutputItem()` bunu kullanır. `toolKinds` yoksa sonuç bugünküyle aynıdır.

`custom` öğesi: `{ id, type:"custom_tool_call", status, call_id, name, input: <string> }`

`input` çıkarımı: argüman JSON parse edilir, `.input` string ise o kullanılır; parse edilemezse veya `.input` yoksa **ham argüman string'i** kullanılır (kayıpsız fallback).

### 7. Stream'de tip seçimi zamanlaması (bilinen sınırlama)

`toolOutputItem` öğe tipini açılış anında seçer ve ad ilk delta'da gelmemiş olabilir (`t.name === ""`). Bu durumda `toolKinds[""]` yok → `function` (bugünkü davranış). Ad sonradan gelirse `output_item.done` ve `response.completed` doğru tiple yayılır; `added` ile `done` arasında tip farkı oluşabilir. Bugünkü sentetik `call_id` tuzağıyla aynı sınıfta bilinen sınırlama; istemciler öğe tipini `done`'dan okur. Kapsam dışı, bilinçli.

### 8. Teşhis logu (salt-ek)

`handleResponsesEndpoint` içinde çeviriden hemen sonra tek satır:

```ts
logger.info({
  requestId, endpoint: "responses", stream: isStream,
  declaredToolTypes, mappedToolTypes, droppedToolTypes, toolChoiceKind, toolCount,
}, "responses tool contract");
```

Degrade kararında ikinci satır: `logger.info({ requestId, degraded, lossyToolTypes }, "responses native degrade")`.

Loglanan: yalnız tip string'leri (`function`/`custom`/`web_search`...), sayılar, boolean'lar, `toolChoiceKind` (`none`/`string`/`function`). Loglanmayan: araç adları, argümanlar, prompt, API key, base_url, provider codename, PII. Native bacak bilgisi `profileId` yerine **boolean** yazılır → codename sızıntısı imkânsız.

### 9. Degrade kapısı imza genişletmesi

```ts
export function isNativeResponsesDegradable(err, res, body?): boolean
export function shouldDegradeNativeResponsesForContext(ctx, err, res, body?): boolean
```

`body` opsiyonel → `identity-relabel.test.ts` içindeki mevcut 3 argümanlı çağrılar derlenir ve geçer. Yeni mantık:

```ts
const lossy = translationLossyToolTypes(body);   // declaredTypes − {function, local_shell}
if (lossy.length > 0) return false;              // rethrow → failover
```

Degrade kararında `custom` "kayıplı" sayılır (birincil çeviri yolunda eşlenmesine rağmen). Çelişki değil, bilinçli asimetri:

| Durum | Karar | Gerekçe |
|-------|-------|---------|
| Yalnız `function`/`local_shell` (veya araçsız) | Bugün gibi degrade et | Çeviri bu tipleri kayıpsız taşır |
| `custom` veya başka built-in tip | Rethrow | Elimizde native bacak VARDI; kayıplı çeviriye düşmek yerine failover'daki native bacağı denemek doğru |

Birincil çeviri yolunda başka seçenek yoktur (model native olmayan bir profile pinli) → en iyi çaba eşleme. Degrade'de daha iyi bir seçenek vardır → failover.

## Data Models

Yeni kalıcı veri yok. DB şeması, migration ve `usage_records` kolonları **değişmez**.

## Correctness Properties

_(Doğruluk Özellikleri — bugfix.md C(X) tanımının çalıştırılabilir karşılığı)_

### Property 1: Deklare edilen araç kaybolmaz

`isBugCondition(X)` iken, `X.body.tools` içindeki her `type:"custom"` araç için `responsesRequestToChat'(X.body).tools` içinde aynı adı taşıyan bir chat aracı bulunur. Taşınamayan tipler `droppedTypes` içinde raporlanır. Test: CE1.

**Validates: Requirements 2.1, 2.2**

### Property 2: Dönen öğe tipi deklare edilen tipe eşittir

Her araç adı `n` için: `toolKinds[n] = "custom" ⇒ item.type = "custom_tool_call"`, `"function" ⇒ "function_call"`, `"local_shell" ⇒ "local_shell_call"`. Non-stream (`chatCompletionToResponses`) ve stream (`toolOutputItem`) yolları aynı sonucu verir. Test: CE2.

**Validates: Requirements 2.3**

### Property 3: Boş user mesajı üretilmez

`isBugCondition(X)` iken `responsesRequestToChat'(X.body).messages` içinde `role = "user"` ve `content = ""` olan hiçbir mesaj bulunmaz. Test: CE3.

**Validates: Requirements 2.4**

### Property 4: Araç yoksa araç zorlaması da yok

`X.body.tools` dolu bir dizi iken: `chat.tools = undefined ⇒ chat.tool_choice = undefined`. Test: CE4.

**Validates: Requirements 2.5**

### Property 5: Araç sözleşmesi tur ortasında kırpılmaz

`isDegradeBugCondition(X, err) ⇒ shouldDegradeNativeResponsesForContext'(X.ctx, err, res, X.body) = false` (rethrow). Test: CE5.

**Validates: Requirements 2.6**

### Property 6: Preservation (golden eşitlik)

`NOT isBugCondition(X)` iken `responsesRequestToChat'`, `chatCompletionToResponses'` ve stream event dizisi çıktıları, fix'ten önce kaydedilmiş golden korpusla **derin eşittir**. Karşılaştırma alanı: upstream'e giden gövde + istemciye dönen öğeler/eventler (tip, sıra, `sequence_number` dahil). Yeni teşhis log alanları bu alanın dışındadır. Test: golden korpus testi.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Testing Strategy

### Katman 1 — Golden korpus (preservation, koddan ÖNCE)

`src/server/services/__fixtures__/responses-translation-golden.json` + `responses-translation-golden.test.ts`.

- `fast-check` ile **sabit seed** (`{ seed: 20260725, numRuns: 200 }`): araçsız / yalnız-`function` / `local_shell` gövdeleri.
- Her gövde için `responsesRequestToChat`, `chatCompletionToResponses` ve tam stream event dizisi çıktıları golden dosyaya yazılır (`GOLDEN_WRITE=1` ile).
- Fix sonrası test golden ile derin eşitlik karşılaştırır. Golden dosya fix'ten ÖNCE oluşturulur; `GOLDEN_WRITE` olmadan asla yazılmaz.

### Katman 2 — CE1–CE5 (fix checking)

`responses-translation.test.ts` içine yeni `describe` bloğu; CE5 için `identity-relabel.test.ts`'e ek. Her biri fix'ten önce KIRMIZI olduğu kanıtlanır.

### Katman 3 — Mevcut paket (regresyon)

Hedefli: `npx vitest run src/server/services/responses-translation.test.ts src/server/routes/identity-relabel.test.ts`. Ardından `npm test`, `npm run lint`, `npm run build && npm run scan:public`.

Etki riski taranacak dosyalar: `responses-translation.test.ts`, `identity-relabel.test.ts`, `spark-tool-gate-wire.test.ts`, `public-config-contract.test.ts`, `rejected-template-guard.test.ts`.

### Katman 4 — Integration (opsiyonel, DB gerekir)

`src/server/__tests__/responses-endpoint.itest.ts` — `npm run db:up` → `npm run db:migrate` → `npm run itest`. Billing K1'in bozulmadığını uçtan uca doğrular.

## Rollout

Deploy `bash scripts/sync-deploy.sh` ile. **Ön koşul:** clean-tree guard; lokal ağaç şu an kirli (84 dosya, HEAD `b6f6197`). Deploy ayrı ve açık kullanıcı onayı gerektirir; bu spec otomatik deploy YAPMAZ.
