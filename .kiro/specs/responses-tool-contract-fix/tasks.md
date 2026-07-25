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

- [x] 7. Commit ve deploy (DEPLOY EDİLDİ — release `sync-20260725T133730Z-b676ea0`; canlı doğrulama dördüncü turda tamamlandı, aşağıya bkz.)
  - ÖN KOŞUL: lokal ağaç kirli (84 dosya, HEAD `b6f6197`) → `sync-deploy.sh` clean-tree guard'ı abort eder. Yalnız bu spec kapsamındaki dosyaları ayıklayıp commit et; ilgisiz 84 dosyayı bu commit'e KARIŞTIRMA
  - Deploy: `bash scripts/sync-deploy.sh --dry-run` sonra kullanıcı onayıyla gerçek deploy
  - Deploy sonrası doğrulama: `curl -s http://127.0.0.1:4568/health` (sunucuda), `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`
  - Canlı kanıt: yeni teşhis log satırlarının journal'da göründüğünü ve `droppedToolTypes` sıklığını raporla
  - _Requirements: 2.7, 3.10_

- [x] 8. Dört hata sınıfını canlıda birbirinden ayırt et (teşhis enstrümanı)
  - Semptom: API hiçbir tool çağrısı yazmıyor/değiştirmiyor/silmiyor. Bu spec'in düzeltmesi yalnız **tool-routing** sınıfını kapsar; diğer üç sınıf (model halüsinasyonu, sandbox/environment mismatch, orkestratörün sahte başarı üretmesi) ayrı kök nedenlerdir ve aynı belirtiyi verir. Hangisinin aktif olduğunu ölçmeden fix'in işe yaradığı iddia EDİLEMEZ.
- [x] 8.1 Tool-routing sınıfı sayacı
  - Görev 5'teki `responses tool contract` logundan `droppedToolTypes` boş olmayan istek oranını ve `responses native degrade` logundan `degraded=true` oranını raporlayan tek seferlik bir analiz script'i yaz (`scripts/responses-tool-contract-report.mjs`): journalctl çıktısını stdin'den okur, JSON satırlarını ayrıştırır, sınıf başına sayı basar
  - Script sır/PII yazdırmaz; yalnız tip ve sayı toplar
  - _Requirements: 2.2, 2.7, 3.11_
- [x] 8.2 Model halüsinasyonu sınıfı sayacı (araç verildi ama model çağırmadı)
  - `handleResponsesEndpoint` yanıt tarafına salt-ek alan ekle: `toolCallCount` (upstream'den dönen tool_call sayısı) ve `mappedToolCount` (upstream'e gönderilen araç sayısı)
  - `mappedToolCount > 0 && toolCallCount === 0` kombinasyonu "araç verildi, model kullanmadı" sınıfını izole eder — halüsinasyon/prompt sorununu tool-routing'den ayırır
  - Mevcut `raw_usage_json.finishReason` alanıyla birlikte raporlanır (billing'e dokunmadan, yalnız log)
  - _Requirements: 2.7, 3.10, 3.11_
- [x] 8.3 Sandbox/environment mismatch sınıfı (çağrı istemciye ulaştı mı)
  - Stream yolunda yayılan araç öğesi sayısını (`response.output_item.added` içinden `function_call`/`custom_tool_call`/`local_shell_call`) sayan salt-ek log alanı ekle: `emittedToolItems`
  - `toolCallCount > 0 && emittedToolItems === 0` → çeviri/emit hatası (bizde); `emittedToolItems > 0` ve müşteri hâlâ "dosya değişmedi" diyorsa → sorun istemci tarafında (sandbox/cwd/izin), gateway kapsamı dışında. Bu ayrımı raporla
  - _Requirements: 2.3, 2.7, 3.7_
- [x] 8.4 Sahte başarı sınıfını alarma bağla
  - `status=success` + `mappedToolCount > 0` + `toolCallCount === 0` + `droppedToolTypes` boş değil kombinasyonunu tek bir uyarı satırı olarak logla (`logger.warn`, mesaj: `responses tool contract suspicious success`)
  - Bu kombinasyon bugün `usage_records`'ta `success` olarak görünüp sorunu gizliyor; uyarı satırı onu görünür kılar. DB şeması ve billing DEĞİŞMEZ
  - _Requirements: 2.7, 3.10, 3.11_
- [x] 8.5 Doğrulama
  - `npm run lint` + `npm test` temiz; yeni log alanlarının çeviri çıktısını değiştirmediğini golden testiyle kanıtla (`npx vitest run src/server/services/responses-translation-golden.test.ts`)
  - Kablolama contract testine yeni alanlar için assertion ekle
  - _Requirements: 3.11, 3.12_

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
    { "wave": 7, "tasks": ["8.1", "8.2", "8.3", "8.4"], "note": "Dört-sınıf teşhis enstrümanı (salt-ek)" },
    { "wave": 8, "tasks": ["8.5"], "note": "Teşhis eklemelerinin doğrulaması" },
    { "wave": 9, "tasks": ["7"], "note": "Commit + deploy — yalnız açık kullanıcı onayıyla" }
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

## Görev 7 Durumu: Commit YAPILDI, Deploy BLOKE (2026-07-25)

Commit: `179c8fa` — branch `fix/responses-tool-contract` (main'e/master'a dokunulmadı, push YAPILMADI).
Index, çalışma öncesi hâline geri yüklendi (önceden staged olan 11 dosya yeniden staged edildi).

**Deploy neden durdu (kullanıcı kararı gerekiyor):**

`scripts/sync-deploy.sh` (a) tüm çalışma ağacının temiz olmasını ister, (b) temizse **tüm ağacı** rsync'ler. Yani bu fix'i deploy etmek, commit edilmemiş diğer işleri de canlıya taşır. Risk yarıçapı ölçüldü — 65 kirli kod dosyasının md5'i canlıyla karşılaştırıldı:

- 62 dosya canlıyla **byte-özdeş** (deploy hiçbir şey değiştirmez)
- 2 dosya yalnız test (`cf-gate-counter-desync.itest.ts`, `provider-config-service.test.ts`) — çalışma zamanına etkisiz
- **1 dosya çalışma zamanı: `src/server/jobs/index.ts`** — lokal sürüm canlıda BULUNMAYAN 4 CF cron job'unu başlatıyor: `startCfLedgerJob`, `startCfReconcileJob`, `startCfServedRefreshJob`, `startCfMirrorSyncJob`

Kanıt: canlı journal'da 48 saatte scheduled job listesi 8 job içeriyor ve bu 4'ü **yok** (CF job izi: 0 satır). Yani deploy, para/CF sayaçlarına dokunan 4 arka plan job'unu üretimde **yeni** başlatır. CLAUDE.md'deki ~675 TL over-order olayı da tam bu sınıfta bir job boşluğundan çıkmıştı. Bu yüzden otomatik deploy YAPILMADI.

**Seçenekler:**
1. `jobs/index.ts`'i canlı hâliyle eşitleyip (4 CF job import'unu ayırıp) sonra deploy — CF jobları kapalı kalır, yalnız bu fix gider.
2. 4 CF job'unun canlıda çalışması bilinçli bir karar ise, önce onlar ayrı ve gözetimli deploy edilir, sonra bu fix.
3. Hedefli rsync (yalnız 3 dosya) + build + restart — sunucu-taraflı gate'i atlar, CLAUDE.md bunu tuzak olarak işaretliyor; önerilmez.

## Deploy Ön Koşulları — Güncel Durum (2026-07-25, ikinci tur)

| Kontrol | Sonuç |
|---------|-------|
| Çalışma ağacı temiz mi | EVET — ama bunu ben yapmadım: `a0e1dbb` ("wip: canlı ile eşitlenmiş bekleyen çalışma ağacını commit'le") benim dışımda oluştu ve 88 dosyayı commit'ledi. Fix commit'im `179c8fa` ondan ÖNCE ve ayrı |
| Migration riski | YOK — lokal `0040`→`0046` ile canlı birebir aynı; `db:migrate` yeni migration uygulamaz |
| `package.json` | Canlıyla byte-özdeş → `npm ci` davranışı değişmez |
| Kirli dosya içerik riski | 65 kod dosyasının 62'si canlıyla byte-özdeş, 2'si yalnız test |
| **AÇIK BLOCKER** | `src/server/jobs/index.ts` — lokal sürüm canlıda ÇALIŞMAYAN 4 CF cron job'unu başlatıyor (`startCfLedgerJob`, `startCfReconcileJob`, `startCfServedRefreshJob`, `startCfMirrorSyncJob`). Canlı journal'da 48 saatte 8 scheduled job var, bu 4'ü YOK (iz: 0 satır). Deploy bunları üretimde yeni başlatır → para/CF sayaçlarına dokunan iş; CLAUDE.md'deki ~675 TL over-order olayı bu sınıftan |

Deploy, bu blocker bir karara bağlanmadan yapılmayacak. Seçenekler görev 7 notunda.

## Görev 7 — Üçüncü Tur (2026-07-25, kullanıcı onaylı: "jobs/index.ts'i canlıyla eşitleyip deploy")

| Kontrol | Sonuç |
|---------|-------|
| **CF cron blocker** | **KAPANDI — kendiliğinden.** Lokal ve canlı `src/server/jobs/index.ts` md5 = `97dea45da6a1cbaf2ecb1ff118d70281` → **byte-özdeş** (`sync-20260725T103130Z-095b468` deploy'u dosyayı çoktan taşımış). Checksum'lı rsync dry-run'da dosya listede YOK. Deploy job davranışını sıfır değiştirir → env kapısı EKLENMEDİ |
| 4 CF job'unun canlı durumu (12:42 restart journal'ı) | `cf-ledger-job` skipped (CF key yok) · `cf-reconcile-job` skipped (CF key yok) · `cf-mirror-sync` disabled (`CF_MIRROR_SYNC_ENABLED=false`) · `cf-served-refresh-job` **scheduled** `*/15 * * * *` (kendi env kapısı yok, zaten canlıda dönüyor) |
| Neden `CF_JOBS_ENABLED` kapısı eklenmedi | Varsayılanı-kapalı kapı, canlıda ŞU AN çalışan `cf-served-refresh-job`'ı susturacaktı → `cf_served` snapshot bayatlar, over-serve cap etkilenir = CF sayaç yolunda davranış değişikliği. "Canlı davranış birebir aynı kalsın" kuralıyla çelişti; kullanıcı "kapıyı ekleme, olduğu gibi deploy et" dedi. GAP-10 sözleşmesi (`missing-unit-coverage.test.ts`, 14 starter + kendi-kendini koruyan tarama) hiç riske girmedi |
| Migration | Lokal `0037`→`0046` ile canlı **birebir aynı** (`diff` boş) → `db:migrate` yeni migration uygulamaz |
| `package.json` | Canlıyla byte-özdeş (`1a5bf4084acccf2a5510b543515073ba`) |
| **İkinci beklenmedik fark** | `src/server/services/claude-cloak-route.ts` — canlıda lokalde OLMAYAN `KIRO OVERRIDE` bloğu var (`kiro`/`cf-claude` profili + key varsa Vexly cloak'a sapmadan doğrudan geç). Kanıt: canlı dosya mtime 12:42:09 UTC, `dist/server.js` 12:42:26, yanında `dist/server.js.bak-kiro-20260725` (12:37:35), `.deploy/releases`'te 10:31'den sonra manifest YOK → sunucuda **elle** yama. rsync bunu ezip Claude yönlendirmesini sessizce geri alacaktı → blok kullanıcı onayıyla repoya alındı (`defb61e`), lokal artık canlıyla byte-özdeş, `claude-cloak-route.test.ts` 10/10 yeşil |
| Lokal tam kapı | `npm run lint` temiz · `npm test` **144 dosya / 1235 test yeşil** · `npm run build` başarılı · `npm run scan:public` `{"scanned":3,"hits":[]}` · dist imzaları: `emittedToolItems`, `mappedToolCount`, `responses tool call outcome`, `suspicious success`, `model_catalog_override.json` mevcut |
| Commit'ler | `90c2cde` (görev 8 telemetrisi, 7 dosya +961/−23) · `defb61e` (canlı KIRO OVERRIDE yaması, 1 dosya +6). Branch `fix/responses-tool-contract`; `main`/`master` dokunulmadı, `git push` YAPILMADI |
| **DEPLOY DURUMU: YAPILMADI** | `sync-deploy.sh` clean-tree guard'ı abort etti: `M src/server/services/closerouter-service.ts` — Bedrock Anthropic araç çeviri katmanı (~180 satır, `bedrockToolsFromRequest` / `bedrockToolChoiceFromRequest`). Bu spec'e ait DEĞİL ve **aktif yazılıyor** (mtime 16:08:10 → 25sn sonra 16:08:28). `sync-deploy.sh` tüm ağacı rsync'lediği için deploy, başka bir oturumun yarı bitmiş provider kodunu canlıya taşırdı. Kullanıcı kararı: **DUR, diğer oturum bitince deploy** |

Sonraki oturum için deploy ön koşulu: `git status --porcelain` boş olmalı (yalnız `closerouter-service.ts` bekliyor). Temizlendiğinde `bash scripts/sync-deploy.sh` yeterli — diğer tüm ön kontroller (migration, package.json, jobs/index.ts, claude-cloak-route.ts) bu turda doğrulandı.

## Kapsam Uyarısı — Dört Hata Sınıfı

Kullanıcının tarif ettiği "hiçbir tool çağrısı yazmıyor/değiştirmiyor/silmiyor" belirtisi dört farklı kök nedenden gelebilir ve bu spec yalnız birini düzeltir:

| Sınıf | Bu spec kapsıyor mu | Ayırt edici ölçüm |
|-------|---------------------|-------------------|
| Tool-routing (araç düşüyor / yanlış öğe tipi / tool_choice 400 / degrade kırpması) | EVET — görev 1-6 | `droppedToolTypes` boş değil, `degraded=true`, `custom` deklare + `function_call` yayımı |
| Model halüsinasyonu (araç verildi, model çağırmadı/uydurdu) | HAYIR | `mappedToolCount > 0 && toolCallCount === 0` (görev 8.2) |
| Sandbox/environment mismatch (çağrı istemciye ulaştı, istemci yürütemedi) | HAYIR — gateway dışı | `emittedToolItems > 0` ama müşteri tarafında değişiklik yok (görev 8.3) |
| Orkestratörün sahte başarı üretmesi | HAYIR — ama görünür kılınır | `status=success` + araç var + çağrı yok (görev 8.4) |

## Görev 8.1 / 8.5 Kanıtları (2026-07-25)

| Adım | Kanıt |
|------|-------|
| 8.1 RED | `scripts/responses-tool-contract-report.mjs` geçici olarak kaldırıldı → `npx vitest run src/server/routes/responses-tool-contract-report.test.ts`: **10 fail / 1 pass** (ENOENT + `--json` çıkış kodu 1). Script yokken sınıflandırma iddiası doğrulanamıyor kanıtı. |
| 8.1 GREEN | Script geri kondu → aynı komut **11/11 yeşil**. Dört sınıf sayacı, journal ön-ekli satır ayrıştırma, bozuk/boş satır dayanıklılığı, `--help`, boş girdi ve sır/PII yazmama testleri dahil. |
| 8.5 lint | `npm run lint` (tsc --noEmit) temiz. |
| 8.5 tam paket | `npm test` → **144 dosya / 1235 test yeşil** (öncesi 143/1220; +1 dosya script testi, +15 test). |
| 8.5 golden | `npx vitest run src/server/services/responses-translation-golden.test.ts` → 3/3 yeşil (salt-okuma; `GOLDEN_WRITE` kullanılmadı, fixture değişmedi). |
| 8.5 kablolama | `responses-tool-contract-wire.test.ts` → 17/17. Eksik olan tek köprü eklendi: rapor script'inin okuduğu log alanları (`status`, `native`, degrade satırındaki `degraded` + `lossyToolTypes`) artık assertion altında. |
| 8.5 build/scan | `npm run build` başarılı · `npm run scan:public` → `{"scanned":3,"hits":[]}`. |
| Canlı koşu (salt-okuma) | `ssh yzapi-vps 'journalctl -u turkapiprojesi --since "2 days ago" --no-pager -o cat' \| node scripts/responses-tool-contract-report.mjs` → 36 `/v1/responses` isteği (stream=35, non-stream=1), araç deklare eden 1 istek (`custom`+`function`), **droppedToolTypes 0/36**, degrade kararı 0. Sonuç kaydı 0 — çünkü `responses tool call outcome` / `suspicious success` / `native degrade` satırları canlıda HENÜZ YOK (grep: 0/0/0); 8.2–8.4 kodu deploy edilmedi (görev 7 bloke). Yani sınıf 2/3/4 canlıda ölçülemez durumda, sınıf 1 için kanıt: fix'ten sonra araç düşüşü gözlenmiyor. |

Dokunulmayan alanlar: billing/K1, CF sayaçları, provider routing, DB şeması/migration, paket/lane/spark dalları, `responses-translation.ts`, `proxy.ts` (bu görevde hiç değişmedi), golden fixture. Commit/push/deploy/restart YAPILMADI.

## Görev 7 — Dördüncü Tur: DEPLOY EDİLDİ (başka oturum tarafından) + canlı doğrulama (2026-07-25)

**Sonuç: Bu oturum deploy KOŞMADI — gerek kalmadı, çünkü görev 7 yükü zaten canlıda. Yapılan iş: ölçüm + salt-okuma canlı doğrulama.**

### Ağaç durumu ölçümü (iki kez, ~95 sn arayla)

| Ölçüm | 16:45 | 16:47 | 16:49 |
|-------|-------|-------|-------|
| `git status --porcelain` | `?? .kiro/specs/sonnet-46-unlimited-hardening/` | aynı | aynı |
| `closerouter-service.ts` mtime / md5 | 16:28:05 / `2ce7a82b…` | değişmedi | değişmedi |
| `lane-scheduler.ts`, `proxy.ts` | 16:16:10 | değişmedi | değişmedi |
| `sonnet-46-unlimited-hardening/requirements.md` | 16:43:20 | **16:47:38 (değişti)** | — |
| `…/tasks.md` | yok | **16:47:23 (yeni oluştu)** | — |

Yorum: önceki turu bloke eden `closerouter-service.ts` / `lane-scheduler.ts` yazımı **bitmiş ve commit'lenmiş** (`234819a`, `3de6297` — başka oturum, aynı branch). Ama başka oturum **hâlâ aktif**: yeni bir spec (`sonnet-46-unlimited-hardening`) canlı canlı yazılıyor (3 dosya, ölçüm penceremde 2 kez değişti). Bu untracked dizin `sync-deploy.sh:29` clean-tree guard'ını (`git status --porcelain` boş olmalı) hâlâ tetikliyor → script bugün de abort ederdi. **Başka oturumun dosyalarına dokunulmadı** (commit/stash/silme/geri alma YOK).

### Deploy neden koşulmadı: yük zaten canlıda

| Kanıt | Değer |
|-------|-------|
| Canlı release (en üstte) | `sync-20260725T133730Z-b676ea0.json` — `local_commit: b676ea0`, `health: 200`, `migration: applied`, dist hash `c5690b23a5f2865e…` |
| `b676ea0` içeriği | `90c2cde` (görev 8 telemetrisi) + `defb61e` (KIRO OVERRIDE) + `4f8b950` + başka oturumun `234819a` bedrock düzeltmesi → görev 7'nin deploy etmesi gereken her şey |
| Servis | `active`, `ActiveEnterTimestamp = 2026-07-25 13:38:59 UTC` (deploy 13:39:03Z manifest'iyle tutarlı) |
| Lokal ↔ canlı runtime md5 | `closerouter-service.ts`, `lane-scheduler.ts`, `proxy.ts`, `responses-translation.ts`, `claude-cloak-route.ts`, `jobs/index.ts`, `package.json` → **7/7 byte-özdeş** |
| rsync `--dry-run` deltası (salt-okuma, manuel; script guard'a takıldığı için) | Yalnız mtime farkları (`<f..T....`) + **2 gerçek yenilik**: `scripts/verify-sonnet-tools-live.sh` (başka oturumun canlı doğrulama script'i, runtime dışı) ve `sonnet-46-unlimited-hardening/*.md` (başka oturumun yarı yazılmış spec'i). **Silinen dosya yok, yeni servis yok, `.env` yok** |

Yani bugün deploy koşmanın tek etkisi, başka oturumun **yarı yazılmış spec dokümanlarını** canlıya taşımak olurdu. Runtime deltası sıfır. Deploy koşulmadı.

### Başka oturumun HEAD'e giren provider kodu — çalışma zamanı riski ölçümü

`234819a` (`proxy.ts` +85, `closerouter-service.ts` +328, `lane-scheduler.ts` +87, 2 test dosyası) **zaten canlıda** (13:37 deploy'uyla gitti). Yarı bitmişlik ölçümü:

- `npm run lint` (tsc --noEmit) → **temiz**
- `npm test` → **145 dosya / 1284 test yeşil** (önceki tur 144/1235; +1 dosya `bedrock-tool-contract.test.ts`, +49 test)
- `npm run build` / `npm run scan:public` KOŞULMADI — bilinçli: lokal `dist/`'i başka oturum çalışırken ezmemek için. Canlı `dist` imzaları doğrudan sunucuda doğrulandı (aşağıda)

Derlenmiyor / test kırmızısı / yarı bitmiş görünen provider kodu **bulunmadı**.

### Canlı doğrulama (görev 7 şartı)

| Kontrol | Sonuç |
|---------|-------|
| `systemctl is-active` | `active` |
| `curl http://127.0.0.1:4568/health` | `{"status":"ok","checks":{"db":"ok","kurAge":"535s","aiProvider":"ok",…}}` |
| Yeni release en üstte | `sync-20260725T133730Z-b676ea0.json` (evet) |
| **CF job tablosu (restart 13:38:59 sonrası journal)** | `cf-ledger-job` **skipped** (CF key yok) · `cf-reconcile-job` **skipped** · `cf-mirror-sync` **disabled** (`CF_MIRROR_SYNC_ENABLED=false`) · `cf-served-refresh-job` **scheduled `*/15 * * * *`** → deploy ÖNCESİ (12:42 restart) tablosuyla **birebir aynı**. Rollback gerekmedi |
| `dist/server.js` imzaları | `emittedToolItems` 4 · `mappedToolCount` 6 · `responses tool call outcome` 1 · `suspicious success` 1 · `responses tool contract` 2 · `dist/model_catalog_override.json` mevcut (288 KB, 13:38:57). `KIRO OVERRIDE` string'i dist'te 0 — beklenen: yorum satırı, bundle'da soyulur; kaynak `claude-cloak-route.ts` lokalle byte-özdeş |
| `smoke:vps` | `SMOKE_BASE_URL=https://yapayzekalab.org` **başarısız** — kök alan `/health`'te 404 + HTML döndürüyor (API `api.` alt alanında; script beklentisi bayat). `https://api.yapayzekalab.org` ile: `/health ok db:ok`, `/status ok`, `/api/models`, unauth `401`, iki `json_404` → **tümü yeşil**. İki bayat sabit beklenti override edildi: `SMOKE_EXPECTED_MODEL_COUNT` 33→42, `SMOKE_EXPECTED_API_MODEL_COUNT` 33→62. Katalog dosyaları lokal↔canlı byte-özdeş ve deploy edilen commit'lerin hiçbiri katalog dosyasına dokunmadı → sayı farkı deploy kaynaklı DEĞİL, script varsayılanı bayat |
| Teşhis raporu (`responses-tool-contract-report.mjs`, restart'tan beri) | 0 `/v1/responses` isteği · dört sınıfın hepsi `n/a` · 6 ayrıştırılamayan satır (skipped). **Yeni kod ayakta, tetikleyici trafik gelmedi** — sınıf dağılımı hakkında iddia üretilemez |
| Billing (salt-okuma, 24 saat) | **44 success / 7 error** (deploy öncesi referans 40/7 → +4 success, **yeni error 0**). Son 5 kayıt: 13:41:42–13:41:47 UTC, 4× `claude-sonnet-4-6` success (`error_code` boş) + 13:01 `claude-opus-5` success. Restart'tan sonraki ilk faturalandırılan istekler hatasız |

Dokunulmayan alanlar: `git push` yok, `main`/`master` yok, canlı `.env` yok, nginx/üretim config yok, DB şeması/migration yazma yok, billing/CF sayaç mantığı yok, başka oturumun dosyaları (commit/stash/revert) yok, gpt-web ve yzlab yok. Rollback gerekmedi (`.deploy/predeploy-backups` kullanılmadı).
