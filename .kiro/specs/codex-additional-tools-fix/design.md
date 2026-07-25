# Teknik Tasarım — codex-additional-tools-fix

## Overview

Kök neden tek cümle: Codex araç şemalarını `input` dizisi içinde `{type:"additional_tools", role:"developer", tools:[...]}` öğesiyle gönderiyor, bizim araç sözleşmesi katmanı bu öğeyi tanımıyor (K2: `additional_tools` kelimesi `apps/api/src` altında 0 kez geçiyor), dolayısıyla gerçek şemalar hiç okunmuyor ve sistem geçmişten şema uyduran son çare yoluna düşüyor.

Düzeltme deseni **stateless şekil-düzeltici**: gövde upstream'e gitmeden önce `additional_tools` öğesindeki araçlar üst düzey `tools`'a yükseltilir. Durum tutulmaz. Bu desen `store`/`previous_response_id` yolunun aksine Codex'in gerçek davranışıyla uyumludur (bugfix.md "Çürütülen Hipotez").

Dokunulan dosyalar (hepsi `/opt/yzlab`, yerel kopya `/Users/ufuk/yzlab-live`):

| Dosya | Değişiklik türü | Gereksinim |
|---|---|---|
| `apps/api/src/gateway/codex-tools.ts` | Yükseltme fonksiyonu + backfill'in son çareye indirilmesi | 2.1, 2.3 |
| `apps/api/src/services/spark.ts` | `ALLOWED_INPUT_ITEM_TYPES` + uygunluk sırası | 2.5 |
| `apps/api/src/gateway/routes.ts` | Araç kaynağı teşhisi + hafızaya yazma koşulu | 2.6, 2.9 |
| `apps/api/src/gateway/tool-memory.ts` | Okuma yolunda TTL tazeleme + parçalı kapı | 2.7, 2.8 |
| `apps/api/src/auth/apikey.ts` | Kalıcı `[auth-fail]` logu | EK-2 |
| `/etc/nginx/conf.d/turkapiprojesi*.conf` | Hat teşhisi logu (kalıcı) | EK-2 |

Değişmeyen alanlar (bugfix.md 3.3–3.5): spark 1-1 alternasyonu, boş `SEAT_WIRE_REMAP`, billing/kota/CF sayaçları.

### Kısıtlar ve Çalışma Yöntemi

**Build yok.** `yzlab-api` tsx ile `src`'den koşuyor. Dağıtım: zaman damgalı `.bak` → `scp` → `systemctl restart yzlab-api`. Derleme adımı olmadığı için hatalı dosya doğrudan canlıya iner; bu yüzden her `scp` öncesi yerelde `npm run typecheck` + ilgili testler zorunlu (bugfix.md 3.10).

**Kiro dosya araçları `/Users/ufuk/yzapi` dışına yazamıyor.** `yzlab-live` düzenlemeleri kabuk üzerinden yapılacak: `python3` ile hedefli `assert count == 1` + replace, sonra `md5` ile yerel↔canlı eşitlik doğrulaması. Bu yöntem bu oturumda üç kez kullanıldı ve her seferinde hash eşleşmesiyle doğrulandı.

**Bakım modu + IP muafiyeti.** Şu an nginx bakımda ama `88.228.196.57` muaf. Doğrulandı: muaf IP'den `/`, `/v1/models`, `/api/health` → 200; muaf olmayan kaynaktan aynı üç yol → 503. Yani uçtan uca canlı test yapılabilir, müşteri etkilenmez. Yedekler: `*.bak-bakim-20260725T162202Z` (muafiyetsiz), `*.bak-oncemuafiyet-*`.

**Test anahtarı.** Owner hesabında (`cix.crazy666@gmail.com`) `generateApiKey` + `prisma.apiKey.create`, test sonunda `revokedAt`. İptalin işlediği 401 ile iki kez doğrulandı.

## Glossary

| Terim | Anlam |
|---|---|
| `additional_tools` | Codex'in araç şemalarını taşıdığı `input` öğesi tipi. Tetikleyici: model kataloğunda `use_responses_lite: true` |
| Yükseltme (lift) | `additional_tools` içindeki araçları üst düzey `tools` alanına taşıma işlemi |
| Backfill | Geçmiş tool call'lardan şema UYDURMA — son çare yolu (`backfillToolsFromHistory`) |
| Koltuk (seat) | cliproxy'nin OAuth ile bağlı olduğu ChatGPT/Codex abonelik hesabı |
| cliproxy | CLIProxyAPI 7.2.95, `127.0.0.1:8317`, ssh ters tüneliyle Mac'te koşuyor |
| Spark | Maliyet dağıtımı: tek/çift parite ile isteği koltuk ve `gpt-5.3-codex-spark` arasında 1-1 bölme |
| code-mode | Codex'in `exec` + `wait` araçlarına indirgenmiş protokolü; `wait` bir exec hücresini `cell_id` ile sürdürür |
| Golden korpus | Değişiklik öncesi davranışın dondurulmuş çıktısı; preservation'ın makine kontrolü |

## Bug Details

Zincir, ölçümle sıralı:

**1. Öğe tanınmıyor.** `prepareResponsesBodyForUpstream` (`codex-tools.ts:110`) `input` içindeki `additional_tools` öğesini görmez. K1: bu öğe 3 günde 5524 istekte var. K2: kelime kod tabanında 0 kez geçiyor.

**2. `clientTools` boş kalır.** `routes.ts:699-706` yalnız `body.tools`'a bakıyor; gerçek Codex gövdesinde o alan yok (K4).

**3. Şema uydurulur.** `backfillToolsFromHistory` (`:489`) geçmişten şema türetir. Üç kusuru: tüm argümanlar zorunlu olur (`required: Object.keys(properties)`, `:547`); argümanı çözülemeyen `function` araçları tamamen atlanır (boş şema upstream'de 500); açıklama "reconstructed from this conversation history" (`:474`).

**4. Model örneği kopyalar.** Kodun kendi yorumundaki canlı kanıt (`:~455-460`): açıklamaya geçmişten örnek konulduğunda model 3/3 denemede aynı `cell_id` ile `wait` çağırdı. Müşteri belirtisi: `invalid wait cell`, `exec cell nonexistent`, `tool invocation blocked`.

**5. Spark elenir.** `spark.ts:38` izinli listede `additional_tools` yok → `:83` `input_item:additional_tools` döner → 5524 istek spark'a hiç girmez (K1, K5). Müşteriye hata dönmez, yalnız pahalı bacağa gider.

**6. Hafıza dolamaz.** `routes.ts:702` yazma koşulu `clientTools.length > 0` → bu istemciden hiç yazılmaz. Yan kusurlar (K8): okuma yolunda Redis TTL tazelenmiyor (yazımda `:206` var), kapı "hepsi ya da hiç" (`:78-86`, `:236-242`). Mekanizma bozuk DEĞİL (K9: Redis PONG, 38 HIT) — aynı kök nedenin kurbanı.

**7. Teşhis yanlış yönü işaret ediyor.** `logToolNames` (`:722-735`) `tools=[]` yazıyor; bu veri kaybı değil, ölçüm noktasının eksikliği (K6).

## Expected Behavior

Kaynak öncelik sırası netleşir (bugfix.md 2.1, 2.3):

```
1. body.tools                (istemci açıkça gönderdi — OTORİTER)
2. additional_tools          (YENİ — gerçek şemalar)
3. tool-memory recall        (önceki turdan gerçek şemalar)
4. backfillToolsFromHistory  (SON ÇARE — uydurma)
```

Gerçek şemalar geldiğinde backfill çalışmaz, dolayısıyla model uydurma `cell_id` kopyalamaz ve `invalid wait cell` sınıfı hatanın kaynağı kurur.

`namespace` ile `name` asla birleştirilmez (2.4); yükseltilen araçlar bugünkü gruplama yoluna girer. Spark uygunluğu yükseltme SONRASI gövdeyle hesaplanır (2.5). Hafıza gerçek şemaları yazar, okuma TTL'i tazeler, kapı parçalı çalışır (2.6–2.8).

## Hypothesized Root Cause

Doğrulanmış kök neden (hipotez değil, üç bağımsız kaynakla ölçüldü): Codex `use_responses_lite: true` olan modellerde araç şemalarını `input` içine taşıdı; bizim katman yalnız üst düzey `tools`'a baktığı için şemalar okunmuyor.

Bayrak `gpt-5.6-sol` / `-terra` / `-luna` için açık, `gpt-5.5` / `gpt-5.4` için kapalı (K3) — sorunun yalnız 5.6 ailesinde görülmesinin nedeni bu.

**Çürütülen alternatif hipotez 1** (tekrar denenmemeli): `store` + `previous_response_id` ile stateful destek. codex #3841 (alan yok), CLIProxyAPI #1382 (bakımcı: devamlılık `prompt_cache_key` ile), OpenAI API referansı + topluluk doğrulaması (`tools` her turda zorunlu, miras alınmaz).

**Çürütülen alternatif hipotez 2 — katalog override ile `use_responses_lite: false`** (2026-07-25 ölçümü):

Repoda `model_catalog_override.json` var ve nginx bunu `/model_catalog_override.json` yolunda `dist/` alias'ıyla servis ediyor (commit `fd3635e`, bugün 11:09 — dosya bir deploy'da silinince canlıda 3 adet 404 kaydı oluşmuş, yani dosya GERÇEKTEN tüketiliyor). İlk bakışta "bayrağı kapat, Codex normal `tools` göndersin" çözümü mümkün görünüyordu. Ölçüm bunu çürüttü:

| Bulgu | Değer |
|---|---|
| `gpt-5.6-sol` için `use_responses_lite` | **`false`** (zaten kapalı) |
| Buna rağmen gelen `additional_tools` isteği | 5524 (K1) |
| `gpt-5.6-terra` / `-luna` | `use_responses_lite: true` |
| Tüketiciyi tanımlayan referans | cliproxy config / `~/.codex/config.toml` / yzapi / yzlab → **hiçbirinde yok** |

Yani bayrak `sol` için kapalı olmasına rağmen davranış sürüyor. İki olası açıklama var, ikisi de bu spec'in kapsamını değiştirmez: (a) davranış `use_responses_lite` yerine `tool_mode: code_mode_only` üzerinden tetikleniyor, (b) dosya tüketiciye hiç ulaşmıyor. Her iki durumda da **istemcinin ne göndereceğine güvenemeyiz** → proxy tarafında yükseltme zorunlu (Yol A).

**Yan bulgu, ayrı iş kalemi:** dosyada `gpt-5.6-sol` slug'ı **iki kez** geçiyor (biri `tool_mode: code_mode_only` + `multi_agent: v2`, diğeri `tool_mode: None`). Hangisinin kazandığı belirsiz. Ayrıca bakım modu sırasında `location = /model_catalog_override.json` bloğu düştüğü için dosya şu an **404/503** dönüyor; bakım kalkınca 200 döndüğü doğrulanmalı.

### Açık soru — kod yazmadan önce ölçülecek

bugfix.md 2.2: `additional_tools` öğesi upstream'e giden `input`'ta kalmalı mı, çıkarılmalı mı? Bilinmiyor. Canlı sonda:

| Sonda | İstek | Ölçülecek |
|---|---|---|
| S1 | Öğe `input`'ta DURUYOR + üst düzey `tools` dolu | HTTP kodu, model araç çağırdı mı |
| S2 | Öğe ÇIKARILMIŞ + üst düzey `tools` dolu | HTTP kodu, model araç çağırdı mı |

Hedef `http://127.0.0.1:8317/v1/responses`, model `gpt-5.6-sol`. Emsal: `type:"namespace"` öğeleri bugün `input`'tan atılıyor (`codex-tools.ts:282-288`) — çıkarma bu kod tabanında yerleşik desen. S1 200 dönerse çıkarma opsiyonel, 400 dönerse zorunlu.

## Correctness Properties

```pascal
FUNCTION isBugCondition(X)
  RETURN (EXISTS item IN X.body.input WHERE item.type = "additional_tools")
         AND (X.body.tools IS ABSENT OR length(X.body.tools) = 0)
END FUNCTION
```

### Property 1: Fix Checking — gerçek şemalar üst düzeye yükseltilir

```pascal
FOR ALL X WHERE isBugCondition(X) DO
  upstream ← prepareResponsesBodyForUpstream'(X)
  ASSERT length(upstream.tools) = length(additionalToolsItem(X).tools)
  ASSERT upstream.tools ARE client's real schemas (backfill DEĞİL)
  ASSERT NO tool name equals namespace + name concatenation   // "execexec" yasak
  ASSERT sparkEligibility(upstream) ≠ "input_item:additional_tools"
END FOR
```

**Validates: Requirements 2.1, 2.4, 2.5**

### Property 2: Preservation Checking — bug koşulu yoksa davranış bit-bit aynı

```pascal
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)   // upstream gövdesi + istemciye dönen event dizisi özdeş
END FOR
```

**Validates: Requirements 3.1, 3.2, 3.7**

### Property 3: Kaynak önceliği — gerçek kaynak varken uydurma kullanılmaz

```pascal
FOR ALL X WHERE hasRealTools(X) DO      // tools | additional_tools | hafiza
  ASSERT toolSource(X) ≠ "backfill"
END FOR
```

**Validates: Requirements 2.3, 2.6**

### Property 4: Otoriterlik — üst düzey `tools` ezilmez

```pascal
FOR ALL X WHERE X.body.tools ≠ [] AND hasAdditionalTools(X) DO
  ASSERT FOR ALL t IN X.body.tools: t SURVIVES in upstream.tools
END FOR
```

**Validates: Requirements 3.2**

### `liftAdditionalTools(body)` — yeni saf fonksiyon

Girdi mutasyona uğratılmaz; değişiklik yoksa `body`'nin KENDİSİ döner (bit-özdeşlik garantisi — mevcut `prepareResponsesBodyForUpstream` deseninin aynısı).

```
GİRDİ: body
1. items ← body.input (dizi değilse → body'yi aynen döndür)
2. found ← items'ta type === "additional_tools" olan öğeler
3. found boşsa → body'yi AYNEN döndür        (P2 preservation)
4. lifted ← found içindeki tüm tools[] birleştir, sıra korunur
5. yeni body:
     tools ← body.tools varsa onunla birleştir, ÇAKIŞMADA body.tools KAZANIR   (P4)
     input ← items − found                   (S1/S2 sonda sonucuna bağlı)
6. summary ← { lifted: n, source: "additional_tools" }
```

Yükseltilen araçlar mevcut `prepareResponsesBodyForUpstream` zincirine **girdi** olur; namespace gruplama, ad sanitizasyonu ve konteyner koruma bugünkü mantıkla aynen uygulanır. Yeni bir araç işleme yolu yazılmıyor — var olanın önüne besleme yapılıyor.

## Fix Implementation

### Adım sırası

1. **S1/S2 sondası** (kod yazmadan) — `input`'tan çıkarma kararı ölçülür.
2. **Golden korpus** — değişiklik ÖNCESİ el değmemiş koddan alınır.
3. **Karşı örnek testleri** — P1/P3/P4 için kırmızı testler yazılır, kırmızı oldukları kayda geçer.
4. **`liftAdditionalTools`** + zincire bağlama (`codex-tools.ts`).
5. **Backfill son çareye indirme** — kod silinmez, yalnız 1–3 boşken çalışır.
6. **Spark** — `ALLOWED_INPUT_ITEM_TYPES` + uygunluk sırası (yükseltme sonrası gövde).
7. **Hafıza** — yazma koşulu, okuma TTL tazeleme, parçalı kapı.
8. **Gözlemlenebilirlik katmanı** (aşağıda).
9. **Doğrulama geçidi** — typecheck + testler + golden.
10. **Dağıtım + 24 senaryoluk canlı test matrisi.**

### Gözlemlenebilirlik katmanı (EK-2)

Gerekçe — bugün yaşanan teşhis maliyeti:

| Olay | Kaybedilen zaman / yöntem |
|---|---|
| Müşteri 401 alıyor, hangi anahtarı gönderdiği bilinmiyor | Başarısız auth hiç loglanmıyordu (`grep -c invalid_api_key` → 0); DB elle kurcalandı |
| Log satırı hangi müşteriye ait | `[body-shape]` `apiKeyId` içermiyor; atıf `UsageRecord.createdAt` ile ±10sn zaman eşleştirmesiyle yapıldı — ajan raporu bunu "güvenilmez" işaretledi |
| Araçlar nerede | `logToolNames` yalnız `body.tools`'a bakıyor → `tools=[]` yazıp teşhisi yanlış yöne sürükledi; kök neden 5524 satırda gizliydi |
| İstek hangi hatta gitti | nginx logu `$host`/`$upstream_addr` yazmıyor; üç hat (4100/4568/3181) ayırt edilemedi, bir 401 bilmecesi saatler aldı |

Sınır bazlı log sözleşmesi — her sınırda tek satır, sabit önek, `key=değer` (grep'lenebilir):

| Sınır | Önek | Alanlar |
|---|---|---|
| Auth başarısız | `[auth-fail]` | `reason` (header_yok / anahtar_bulunamadi / anahtar_iptal_edilmis / hesap_askida), `last4`, `len`, `bicim`, `ip`, `url` |
| Auth başarılı (örneklemli) | `[auth-ok]` | `key` (id ilk 8), `tier`, `url` |
| Model çözümleme | `[model]` | `istenen`, `cozulen`, `provider`, `coverage`, `wire` |
| Araç sözleşmesi | `[tool-contract]` | `kaynak` (tools / additional_tools / hafiza / backfill), `adet`, `tipler`, `konteyner`, `sanitize`, `atlanan` |
| Upstream forward | `[upstream]` | `host:port`, `model`, `stream`, `deneme`, `sure_ms`, `status` |
| Yanıt | `[response]` | `status`, `tool_call_adet`, `emitted_item_adet`, `finish_reason`, `onarim` |
| Billing/kota | `[billing]` | `mod`, `input_tok`, `output_tok`, `maliyet`, `kalan` |
| Hata | `[error]` | `sinif`, `status`, `upstream_status`, `model`, `key` |

**Yasak alanlar, istisnasız:** ham anahtar, API key, prompt/mesaj içeriği, araç argümanları, patch/kod içeriği, e-posta, telefon, IBAN, provider codename, base_url. İzinli: tip, sayı, boolean, kısaltılmış id (8 karakter), `last4` (DB'de zaten açık sütun).

Gürültü kontrolü: `[tool-debug]` kaldırılır (bugün her istekte iki satır ve yüzlerce öğe listeliyor, journal'ı boğuyor), yerine `[tool-contract]` tek satır. Başarılı yol `info`, başarısızlık `warn`, sistemsel `error`. `[auth-ok]` gibi yüksek hacimli satırlar oransal örneklem (1/100) veya `LOG_VERBOSE` env kapısı arkasında. **Hata satırları asla örneklenmez.**

nginx hat teşhisi kalıcılaştırılır: `/var/log/nginx/yzapi-v1-olcum.log`, format `$time_iso8601 ip=$remote_addr host=$host "$request" status=$status anahtar=$yz_anahtar_tipi upstream=$upstream_addr ua="$http_user_agent"`. Anahtar TİPİ loglanır (gw_trial / diger / yok), anahtarın kendisi asla.

### Dağıtım ve geri alma

Sıra: yerel `npm run typecheck` → ilgili birim testler → golden testi → `.bak` al → `scp` → `md5` karşılaştır → `systemctl restart yzlab-api` → başlangıç hatası kontrolü → iç sağlık (`127.0.0.1:4100/v1/models`) → uçtan uca test matrisi → log kanıtı.

Geri alma tek komut: `.bak` geri kopyala + restart. Bu oturumda dört kez uygulandı, her seferinde md5 ile doğrulandı.

## Testing Strategy

### Preservation

Golden korpus değişiklik ÖNCESİ el değmemiş koddan alınır. İçerik: `additional_tools` İÇERMEYEN gövdeler (yalnız `tools` dolu, hiç araç yok, `namespace` konteynerli, `local_shell` geçmişli, bozuk argüman). Her gövde için `prepareResponsesBodyForUpstream` çıktısı ve `sparkEligibility` sonucu dondurulur.

Kural: golden testi herhangi bir adımda kırmızıya düşerse değişiklik bug koşulu dışına taşmış demektir → geri al ve daralt. Bu, bugfix.md 3.1'in makine kontrolü.

### Test matrisi — 24 senaryo, 6 bağımsız ajan grubu

Her senaryo: ön koşul, komut, beklenen sonuç, kanıt log satırı. Gruplar birbirinden bağımsız; her grup tek ajana verilebilir.

**Grup A — Araç kaynağı (5)**

| # | Senaryo | Beklenen | Kanıt |
|---|---|---|---|
| A1 | Yalnız `additional_tools` | Araçlar yükseltilir, backfill ÇALIŞMAZ | `[tool-contract] kaynak=additional_tools` |
| A2 | Yalnız üst düzey `tools` | Bugünkü davranış bit-bit aynı | golden yeşil |
| A3 | İkisi birlikte, çakışan ad | `body.tools` kazanır | `kaynak=tools` |
| A4 | Hiçbiri, geçmişte tool call var | backfill son çare | `kaynak=backfill` |
| A5 | Hiçbiri, geçmiş de boş | Araç gönderilmez, hata yok | `adet=0` |

**Grup B — Çok turlu zincir (4) — asıl bozulma**

| # | Senaryo | Beklenen | Kanıt |
|---|---|---|---|
| B1 | Tek tur, tek tool çağrısı | 200, çağrı istemciye ulaşır | `[response] tool_call_adet=1` |
| B2 | İki tur (çağrı → sonuç → devam) | İkinci turda araçlar hâlâ tam | `kaynak≠backfill` |
| B3 | 5+ ardışık `exec`/`wait` zinciri | `invalid wait cell` YOK, `exec cell nonexistent` YOK | istemci hatasız |
| B4 | Zincir ortasında bozuk `arguments` JSON | O araç atlanır, diğerleri çalışır, 500 YOK | `atlanan=[...]` |

**Grup C — Araç tipleri (4)**

| # | Senaryo | Beklenen |
|---|---|---|
| C1 | `type:"function"` düz araç | Bugünkü eşleme korunur |
| C2 | `type:"custom"` (apply_patch) | Kayıpsız taşınır |
| C3 | `type:"namespace"` konteyneri (collaboration) | Konteyner korunur, silinmez |
| C4 | `exec` + `wait` (code-mode) | İkisi de modele ulaşır |

**Grup D — Akış ve model (4) — regresyon**

| # | Senaryo | Beklenen |
|---|---|---|
| D1 | `gpt-5.6-sol`, stream=true | 200, event sırası bozulmaz |
| D2 | `gpt-5.6-sol`, stream=false | 200, tek JSON gövde |
| D3 | `gpt-5.5` (bayrak kapalı) | Davranış değişmemiş |
| D4 | `gpt-5.6-terra` / `-luna` | `SEAT_WIRE_REMAP` boş, kendi adıyla gider |

**Grup E — Spark ve hafıza (4)**

| # | Senaryo | Beklenen | Kanıt |
|---|---|---|---|
| E1 | Çift parite | Koltuğa gider | gate-block YOK |
| E2 | Tek parite | Spark'a girer, 1-1 korunur | `leg=spark` |
| E3 | Hafıza HIT (ikinci tur) | Gerçek şemalar hafızadan | `kaynak=hafiza` |
| E4 | 6 saat sonrası okuma (TTL) | Hafıza hâlâ var | `HIT` |

**Grup F — Dayanıklılık ve negatif kontrol (3)**

| # | Senaryo | Beklenen |
|---|---|---|
| F1 | cliproxy DURDURULMUŞ | İstek başarısız → bağımlılık kanıtı (bu yöntem bugün kullanıldı ve çalıştı) |
| F2 | Geçersiz/iptal anahtar | 401 + `[auth-fail]` doğru `reason` ile |
| F3 | Muaf olmayan IP | 503 bakım sayfası (müşteri izolasyonu kanıtı) |

Toplam **24 senaryo**; kullanıcının istediği asgari 20 aşıldı. Fazlalık B ve E gruplarında, çünkü asıl bozulma çok turlu zincirde ve hafıza yolunda.

### Doğrulama komutları

```
cd /Users/ufuk/yzlab-live && npm run typecheck          # 4 workspace, tsc --noEmit
npm run test --workspaces --if-present                  # vitest
npx vitest run apps/api/src/gateway/codex-tools.test.ts
npx vitest run apps/api/src/gateway/tool-memory.test.ts
```

Bilinen ve ilgisiz başarısızlık: `apps/api/src/billing/ledger.test.ts` yerel Postgres olmadığı için `PrismaClientInitializationError` verir; değişiklik öncesinde de vardı (bugfix.md 3.9). `tool-memory-redis.test.ts` Redis'i MOCK'lar, canlı bağlantıyı kanıtlamaz.

### Riskler

| Risk | Yarıçap | Azaltma |
|---|---|---|
| `additional_tools` çıkarılması upstream'i kırar | Tüm Codex trafiği | S1/S2 sondası kod yazmadan önce ölçer |
| Yükseltme üst düzey `tools`'u ezer | Bugün çalışan istemciler | P4 + golden testi kilitler |
| Spark uygunluk sırası yanlış | Yük dağıtımı / maliyet | Sıra tasarımda açık; E1/E2 kanıtlar |
| Log gürültüsü journal'ı boğar | Teşhis yeteneği | Örneklem + `[tool-debug]` kaldırma |
| **Claude auth bozuk (kapsam dışı, AÇIK)** | Claude modelleri = en çok kullanılanlar | cliproxy 7.2.95 sonrası `auth_unavailable`, 10 hata logu, hepsi güncellemeden sonra. **Bakımdan çıkmadan önce çözülmeli.** Yamalı binary yedeği hazır |
| Build olmadığı için hatalı dosya doğrudan canlıda | yzlab-api tamamı | typecheck + test zorunlu |
