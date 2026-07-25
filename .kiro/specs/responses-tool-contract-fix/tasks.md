# Implementation Plan

> **Sıralama notu (onaylanan sıradan tek sapma):** Kullanıcının onayladığı sıra "teşhis logu → golden korpus" idi. Golden korpus **el değmemiş ağaçta** (HEAD `b6f6197`) alınırsa preservation kanıtı en güçlü olur; teşhis logu yeni export'lar eklediği için golden'ı ondan sonra almak kanıtı zayıflatır. Bu yüzden golden korpus 1. sıraya alındı. Diğer tüm sıralama aynen korundu. Bu sapma kanıt gücünü artırır, kapsamı değiştirmez.

## Overview

_(Genel Bakış)_

Hedef: `/v1/responses` çeviri yolunda bozulan araç (tool) sözleşmesini onarmak; native-degrade sırasında sözleşmenin tur ortasında değişmesini engellemek; kusurun canlı sıklığını ölçülebilir kılmak.

Yöntem: preservation'ı önce golden korpusla dondur, sonra bug koşulunu yakalayan CE1–CE5 testlerini kırmızı olarak yaz, ardından yalnız bug koşulu içinde davranış değiştir. Golden testi herhangi bir adımda kırmızıya düşerse değişiklik kapsam dışına taşmış demektir.

Dokunulan dosyalar: `src/server/services/responses-translation.ts`, `src/server/routes/proxy.ts` (yalnız teşhis logu + degrade kapısı). Billing/routing/paket/CF/lane/spark dalları değişmez.

## Tasks

- [x] 1. Golden korpus altyapısını kur ve mevcut davranışı dondur
  - `src/server/services/responses-translation-golden.test.ts` oluştur; `fast-check` ile sabit seed (`seed: 20260725, numRuns: 200`) kullanan üretici yaz: araçsız gövdeler, yalnız `type:"function"` araçlı gövdeler, `local_shell` araç + `local_shell_call`/`local_shell_call_output` geçmişli gövdeler
  - Her gövde için üç çıktıyı topla: `responsesRequestToChat(body)`, `chatCompletionToResponses(sabitChatYanıtı, meta)`, tam stream event dizisi (`start()` + `pushChatChunk()`* + `finish()`)
  - `GOLDEN_WRITE=1` env'i verildiğinde çıktıları `src/server/services/__fixtures__/responses-translation-golden.json` dosyasına yaz; env yoksa dosyayı oku ve derin eşitlik doğrula (asla yazma)
  - Golden dosyayı ÇEVİRİ KODUNA HİÇ DOKUNMADAN üret ve testin yeşil geçtiğini doğrula
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.7_

- [x] 2. CE1–CE5 karşı örnek testlerini yaz ve KIRMIZI olduklarını kanıtla
- [x] 2.1 CE1–CE4'ü `responses-translation.test.ts` içine ekle
  - Yeni `describe("araç sözleşmesi (bug koşulu C(X))")` bloğu
  - CE1: `tools:[{type:"custom",name:"apply_patch"}]` → `chat.tools` içinde `apply_patch` bulunur
  - CE2: aynı istek + upstream `tool_calls:[{function:{name:"apply_patch",arguments:"{\"input\":\"...\"}"}}]` → non-stream ve stream çıktısında `type:"custom_tool_call"`, `input` alanı doğru
  - CE3: `input:[{type:"custom_tool_call",...},{type:"custom_tool_call_output",...}]` → `assistant`+`tool_calls` ve `role:"tool"`; hiçbir `{role:"user",content:""}` yok
  - CE4: `tools:[{type:"web_search"}], tool_choice:"required"` → `chat.tools` undefined ve `chat.tool_choice` undefined
  - Testleri koştur, dördünün de KIRMIZI olduğunu kayda geç (fix öncesi kanıt)
  - _Requirements: 2.1, 2.3, 2.4, 2.5_
- [x] 2.2 CE5'i `identity-relabel.test.ts` içine ekle
  - Native 400 + `tools` içinde `custom` + `relabelSource ≠ "spark"` → `shouldDegradeNativeResponsesForContext(..., body)` false döner
  - Mevcut 3 argümanlı çağrıların davranışının değişmediğini doğrulayan testi de ekle
  - Testi koştur, KIRMIZI olduğunu kayda geç
  - _Requirements: 2.6, 3.9_

- [x] 3. Çeviri katmanı düzeltmeleri (`responses-translation.ts`)
- [x] 3.1 `deriveToolKinds()` + `ResponsesStreamMeta.toolKinds` opsiyonel alanını ekle
  - `ResponsesToolKind` tipi ve `deriveToolKinds(tools)` saf fonksiyonu; boş/geçersiz girdide `undefined`
  - `ResponsesStreamMeta`'ya `toolKinds?` alanı (opsiyonel — mevcut tüm çağrılar bozulmadan derlenir)
  - _Requirements: 2.3_
- [x] 3.2 `convertToolsDetailed()` ile custom eşlemesi ve drop raporunu ekle
  - `custom` → tek `input: string` parametreli chat `function` sarmalı (ad + description korunur)
  - `function` ve `local_shell` dalları BİT-BİT değişmez
  - `declaredTypes` / `mappedTypes` / `droppedTypes` döndür; `responsesRequestToChat` mevcut `convertTools` davranışını bu fonksiyon üzerinden sürdürür
  - _Requirements: 2.1, 2.2, 3.1, 3.2_
- [x] 3.3 `custom_tool_call` / `custom_tool_call_output` geçmiş eşlemesi + boş user mesajı guard'ı
  - `custom_tool_call` → `pendingToolCalls` (arguments `JSON.stringify({input})`)
  - `custom_tool_call_output` → mevcut output dalına eklenir (`role:"tool"`)
  - Guard: `item.role === undefined && type !== "message" && item.content == null` → öğeyi atla
  - _Requirements: 2.4, 3.5_
- [x] 3.4 `tool_choice` kapısı
  - `body.tools` dolu bir dizi VE dönüştürülmüş `tools` yoksa `tool_choice` gövdeye eklenmez; diğer tüm durumlar bugünkü davranış
  - _Requirements: 2.5, 3.3, 3.4_
- [x] 3.5 Dönüş öğe tipi seçimini `responsesToolItemKind()` ile birleştir
  - `chatCompletionToResponses()` ve `ResponsesStreamTranslator.toolOutputItem()` bu fonksiyonu kullanır; `toolKinds` yoksa bugünkü sonuç
  - `custom` → `{type:"custom_tool_call", call_id, name, input}`; `input` çıkarımı JSON `.input` → yoksa ham argüman string'i (kayıpsız fallback)
  - _Requirements: 2.3, 3.2, 3.7_
- [x] 3.6 Doğrulama: golden + CE + hedefli testler
  - `npx vitest run src/server/services/responses-translation.test.ts src/server/services/responses-translation-golden.test.ts`
  - CE1–CE4 YEŞİL, golden testi YEŞİL (preservation), mevcut testlerin tamamı YEŞİL olmalı
  - Golden testi kırmızıya düşerse: değişiklik bug koşulu dışına taşmış demektir → geri al ve daralt
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

- [x] 4. Native-degrade kapısı rethrow'u (`proxy.ts`)
  - `translationLossyToolTypes(body)` yardımcısı: `declaredTypes − {function, local_shell}`
  - `isNativeResponsesDegradable(err, res, body?)` ve `shouldDegradeNativeResponsesForContext(ctx, err, res, body?)` imzalarına OPSİYONEL `body` ekle; kayıplı tip varsa `false` (rethrow)
  - İki çağrı noktasını (`~1535` stream, `~1582` non-stream) `rawResponsesBody` ile besle
  - Mevcut 401/403/429/5xx ve spark rethrow davranışına DOKUNMA
  - Doğrulama: `npx vitest run src/server/routes/identity-relabel.test.ts` → CE5 YEŞİL, mevcut 3 test YEŞİL
  - _Requirements: 2.6, 3.9_

- [x] 5. Teşhis logu (salt-ek, `proxy.ts`)
  - `handleResponsesEndpoint` içinde çeviriden sonra tek `logger.info` satırı: `declaredToolTypes`, `mappedToolTypes`, `droppedToolTypes`, `toolChoiceKind`, `toolCount`, `stream`
  - Degrade kararında ikinci satır: `degraded`, `lossyToolTypes`
  - YALNIZ tip string'leri / sayı / boolean loglanır; araç adı, argüman, prompt, key, base_url, provider codename, PII loglanmaz — native bacak bilgisi boolean olarak yazılır
  - Doğrulama: `npm run lint` + `npx vitest run src/server/services/responses-translation-golden.test.ts` (log eklemesi çeviri çıktısını değiştirmemeli)
  - _Requirements: 2.2, 2.7, 3.11_

- [x] 6. Tam doğrulama geçidi
  - `npm run lint` (tsc --noEmit) temiz
  - `npm test` (tüm paket) temiz — özellikle `spark-tool-gate-wire.test.ts`, `public-config-contract.test.ts`, `rejected-template-guard.test.ts`
  - `npm run build` ardından `npm run scan:public` temiz (codename sızıntısı yok)
  - Opsiyonel/DB varsa: `npm run db:up` → `npm run db:migrate` → `npm run itest` (`responses-endpoint.itest.ts` billing K1'i doğrular)
  - Sonuçları kanıt olarak özetle; herhangi biri kırmızıysa DEVAM ETME
  - _Requirements: 3.10, 3.11, 3.12_

- [ ] 7. Commit ve deploy (açık kullanıcı onayı şart)
  - ÖN KOŞUL: lokal ağaç kirli (84 dosya, HEAD `b6f6197`) → `sync-deploy.sh` clean-tree guard'ı abort eder. Yalnız bu spec kapsamındaki dosyaları ayıklayıp commit et; ilgisiz 84 dosyayı bu commit'e KARIŞTIRMA
  - Deploy: `bash scripts/sync-deploy.sh --dry-run` sonra kullanıcı onayıyla gerçek deploy
  - Deploy sonrası doğrulama: `curl -s http://127.0.0.1:4568/health` (sunucuda), `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`
  - Canlı kanıt: yeni teşhis log satırlarının journal'da göründüğünü ve `droppedToolTypes` sıklığını raporla
  - _Requirements: 2.7, 3.10_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "note": "Golden korpus — el değmemiş ağaçta alınmalı" },
    { "wave": 2, "tasks": ["2.1", "2.2"], "note": "CE1–CE5 kırmızı kanıtı" },
    { "wave": 3, "tasks": ["3.1"], "note": "toolKinds tipi/alanı: 3.2 ve 3.5'in ön koşulu" },
    { "wave": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "4", "5"], "note": "Fix ve salt-ek log; 4 ve 5 paralel" },
    { "wave": 5, "tasks": ["3.6"], "note": "Golden + CE doğrulaması" },
    { "wave": 6, "tasks": ["6"], "note": "Tam doğrulama geçidi (lint/test/build/scan)" },
    { "wave": 7, "tasks": ["7"], "note": "Commit + deploy — yalnız açık kullanıcı onayıyla" }
  ]
}
```

Kurallar:
- 1 numaralı görev, 3.x'ten önce bitmiş OLMAK ZORUNDA (golden yalnız el değmemiş davranıştan alınabilir).
- 2.1/2.2, ilgili fix görevlerinden (3.x / 4) önce yazılıp kırmızı olduğu kanıtlanmalı.
- 3.1, 3.2 ve 3.5'ten önce gelir (`toolKinds` tipi ve alanı gerekir).
- 4 ve 5, 3.x'ten bağımsız paralel yürütülebilir; ikisi de 6'dan önce bitmeli.
- 7, yalnız 6 tamamen yeşilken ve kullanıcı açık onay verdiğinde başlar.

## Notes

_(Notlar)_

- Golden dosya (`__fixtures__/responses-translation-golden.json`) fix'ten sonra YENİDEN ÜRETİLMEZ; `GOLDEN_WRITE` env'i olmadan test asla yazmaz.
- Stream'de ad ilk delta'da gelmezse `output_item.added` tipi `function_call` kalır, `output_item.done` doğru tiple yayılır. Bilinen ve bilinçli sınırlama (bugünkü sentetik `call_id` tuzağıyla aynı sınıf).
- Degrade kararında `custom` "kayıplı" sayılır; birincil çeviri yolunda ise eşlenir. Bilinçli asimetri — gerekçe design.md §9'da.
- Hiçbir adım "tamam" ilan edilmeden önce ilgili doğrulama komutu koşulur ve çıktısı kanıt olarak sunulur.

## Uygulama Kanıtları (2026-07-25)

| Adım | Kanıt |
|------|-------|
| 1 | Golden korpus: 120 senaryo, seed 20260725, `sha256:6a917bb7415fe09e`, 1.5 MB. Salt-okuma koşusu 3/3 yeşil. Korpus, canlıyla **byte-özdeş** koddan alındı (deneyden önce `responses-translation.ts` + `proxy.ts` md5'leri lokal ↔ `/opt/turkapiprojesi` aynıydı). |
| 2.1 | CE1–CE4 fix öncesi KIRMIZI: 8 fail / 28 pass. |
| 2.2 | CE5, CE5b fix öncesi KIRMIZI: 2 fail / 22 pass. |
| 3.x | Fix sonrası `responses-translation.test.ts` + golden: 39/39 yeşil (CE yeşil **ve** golden yeşil → bug koşulu dışı davranış bit-bit korundu). |
| 4 | `identity-relabel.test.ts`: 24/24 yeşil. |
| 5 | Kablolama contract testi (`responses-tool-contract-wire.test.ts`): 8/8 yeşil; teşhis özetinin araç adı/prompt sızdırmadığı ayrıca test edildi. |
| 6 | `npm run lint` temiz · `npm test` 143 dosya / 1199 test yeşil · `npm run build` başarılı · `npm run scan:public` `{"scanned":3,"hits":[]}`. |
| 4. katman | `itest` KOŞULMADI — Docker daemon kapalı (opsiyonel adım). Billing K1'in uçtan uca doğrulaması bu yüzden eksik; K1'e dokunan kod değişmedi. |

## Kontaminasyon Uyarısı (görev 7 için)

`git diff --stat` bu iki dosyada ~1200 satır gösteriyor; bunların **büyük kısmı bu bugfix'e ait DEĞİL** — `proxy.ts` ve `responses-translation.ts` çalışma başlamadan önce de kirliydi (84 dosyalık kirli ağaç). `git add src/server/routes/proxy.ts` demek, bu spec'e ait olmayan ~800 satırı da commit'e sokar (CLAUDE.md'deki kontaminasyon tuzağı). Görev 7'de dosya-bazlı değil **hunk-bazlı** (`git add -p`) ayıklama şart.
