# Implementation Plan

## Overview

Hedef: Codex'in `input` içinde gönderdiği `additional_tools` öğesindeki gerçek araç şemalarını okumak, böylece uydurma şema (backfill) yolunu devreden çıkarmak ve `invalid wait cell` / `exec cell nonexistent` sınıfı hataların kaynağını kurutmak.

Yöntem: önce ölçüm (S1/S2 sondası), sonra preservation'ı golden korpusla dondurma, sonra kırmızı karşı örnek testleri, ardından yalnız bug koşulu içinde davranış değiştirme. Golden testi herhangi bir adımda kırmızıya düşerse kapsam dışına taşıldı demektir.

Dokunulan kod tabanı: `/opt/yzlab` (yerel kopya `/Users/ufuk/yzlab-live`). Build yok, tsx `src`'den koşuyor. `/Users/ufuk/yzapi` DEĞİŞMEZ.

## Tasks

- [ ] 1. S1/S2 sondası — `additional_tools` öğesi upstream'de kalabilir mi
  - `http://127.0.0.1:8317/v1/responses`'a iki istek gönder (model `gpt-5.6-sol`, anahtar `/opt/yzlab/.env` içindeki `OPENAI_API_KEY`): S1 = öğe `input`'ta DURUYOR + üst düzey `tools` dolu, S2 = öğe ÇIKARILMIŞ + üst düzey `tools` dolu
  - Her iki sonda için HTTP kodunu, `status` alanını ve modelin araç çağırıp çağırmadığını kaydet
  - S1 200 → çıkarma opsiyonel; S1 400/422 → çıkarma zorunlu. Kararı ve ham çıktıyı bu dosyaya kanıt olarak yaz
  - Bakım modu bu adımı ETKİLEMEZ (doğrudan 8317'ye gidiliyor, nginx'e uğranmıyor)
  - _Requirements: 2.2_

- [ ] 2. Golden korpus — değişiklik ÖNCESİ davranışı dondur
  - `apps/api/src/gateway/__fixtures__/codex-tools-golden.json` üret; girdi kümesi `additional_tools` İÇERMEYEN gövdeler: yalnız `tools` dolu, hiç araç yok, `type:"namespace"` konteynerli, `local_shell` geçmişli, bozuk `arguments` JSON'lu
  - Her gövde için `prepareResponsesBodyForUpstream()` çıktısı + `sparkEligibility()` sonucu dondurulur
  - `GOLDEN_WRITE=1` verilmedikçe test ASLA yazmaz, yalnız okur ve derin eşitlik doğrular
  - Korpusu almadan önce `md5` ile yerel↔canlı dosya eşitliğini doğrula (korpus canlı davranışı temsil etmeli)
  - _Requirements: 3.1, 3.2, 3.7_

- [ ] 3. Karşı örnek testlerini yaz ve KIRMIZI olduklarını kanıtla
- [ ] 3.1 `codex-tools.test.ts` içine P1/P3/P4 testleri
  - CE1: yalnız `additional_tools` → `upstream.tools` gerçek şemaları içerir, backfill çalışmaz
  - CE2: `additional_tools` + üst düzey `tools` çakışan ad → `body.tools` kazanır (P4)
  - CE3: yükseltilen araçta `namespace` alanı → ad birleştirilmez, konteynere taşınır (`execexec` üretilmez)
  - CE4: yükseltme sonrası `sparkEligibility` → `input_item:additional_tools` DÖNMEZ
  - Dördünün de fix öncesi KIRMIZI olduğunu çıktıyla kayda geç
  - _Requirements: 2.1, 2.3, 2.4, 2.5_
- [ ] 3.2 Hafıza testleri (`tool-memory.test.ts`)
  - Okuma yolunda TTL tazelendiğini doğrulayan test (Redis mock'u `expire` çağrısını yakalar)
  - Parçalı kapı: kesişim varken kapsanan araçlar döner, kapsanmayan için uydurma tanım EKLENMEZ
  - İkisinin de KIRMIZI olduğunu kayda geç
  - _Requirements: 2.7, 2.8_

- [ ] 4. `liftAdditionalTools()` — yükseltme fonksiyonu (`codex-tools.ts`)
  - Saf fonksiyon: girdiyi mutasyona uğratmaz; `additional_tools` öğesi yoksa `body`'nin KENDİSİNİ döndürür (bit-özdeşlik)
  - Çoklu `additional_tools` öğesi varsa hepsinin `tools`'unu sıra korunarak birleştirir
  - Üst düzey `body.tools` varsa OTORİTER — çakışan adlarda o kazanır
  - `input`'tan öğe çıkarma davranışı görev 1'in sonucuna göre ayarlanır
  - `summary` alanına `kaynak` ve `adet` yazar (teşhis için)
  - `prepareResponsesBodyForUpstream` zincirine GİRDİ olarak bağlanır — mevcut gruplama/sanitizasyon/konteyner koruma bugünkü mantıkla çalışır, yeni araç işleme yolu YAZILMAZ
  - _Requirements: 2.1, 2.4, 3.2_

- [ ] 5. Backfill'i son çareye indir
  - Kaynak öncelik sırası: `body.tools` → `additional_tools` → hafıza recall → backfill
  - `backfillToolsFromHistory` KODU SİLİNMEZ; yalnız ilk üç kaynak boşken çalışır
  - `routes.ts` içindeki `clientTools` hesabı yükseltme sonrası gövdeyi kullanır
  - _Requirements: 2.3_

- [ ] 6. Spark uygunluğu (`services/spark.ts`)
  - `ALLOWED_INPUT_ITEM_TYPES`'a `additional_tools` ekle
  - Uygunluk YÜKSELTME SONRASI gövdeyle hesaplanacak şekilde çağrı sırasını düzelt
  - `SPARK_TARGETS` ve tek/çift parite mantığına DOKUNMA (1-1 alternasyon korunur)
  - Doğrulama: 5524 gate-block'un kalktığını gösteren birim test + canlı log kontrolü
  - _Requirements: 2.5, 3.3_

- [ ] 7. Hafıza düzeltmeleri (`tool-memory.ts`, `routes.ts`)
  - `routes.ts` yazma koşulunu yükseltme sonrası araç listesini kapsayacak şekilde genişlet
  - Okuma yolunda dönüşten önce `redis.expire(REDIS_PREFIX + apiKeyId, REDIS_TTL_SEC)`
  - `usable()` / `pick()` kesişim mantığı: kesişim boşsa reddet, varsa kapsananları döndür, kapsanmayan için uydurma EKLEME
  - _Requirements: 2.6, 2.7, 2.8_

- [ ] 8. Gözlemlenebilirlik katmanı
- [ ] 8.1 Auth sınırı (`apps/api/src/auth/apikey.ts`)
  - `[auth-fail]` kalıcı log: `reason` (header_yok / anahtar_bulunamadi / anahtar_iptal_edilmis / hesap_askida), `last4`, `len`, `bicim`, `ip`, `url`
  - HAM ANAHTAR ASLA yazılmaz; `last4` DB'de zaten açık sütun
  - Not: bu log bugün geçici olarak eklenip test edildi (canlıda 15 kayıt üretti ve müşterinin bozuk formatlı anahtarını ilk seferde yakaladı), sonra rollback'te geri alındı — burada kalıcılaştırılıyor
  - _Requirements: EK-2_
- [ ] 8.2 Araç sözleşmesi sınırı (`routes.ts`, `codex-tools.ts`)
  - `[tool-debug]` KALDIRILIR (her istekte iki satır + yüzlerce öğe listeliyor, journal'ı boğuyor)
  - Yerine `[tool-contract]` tek satır: `kaynak` (tools/additional_tools/hafiza/backfill), `adet`, `tipler`, `konteyner`, `sanitize`, `atlanan`
  - `[body-shape]` satırına `key=${auth.apiKeyId.slice(0,8)}` eklenir — bugün log→müşteri atfı `UsageRecord.createdAt` ile ±10sn zaman eşleştirmesiyle yapılmak zorunda kaldı, bu güvenilmez
  - _Requirements: 2.9, EK-2_
- [ ] 8.3 Kalan sınırlar
  - `[model]`, `[upstream]`, `[response]`, `[billing]`, `[error]` satırları design.md'deki alan tablosuna göre eklenir
  - Yasak alanlar: ham anahtar, prompt, argüman, patch içeriği, PII, provider codename, base_url
  - Gürültü kontrolü: başarı `info` / başarısızlık `warn` / sistemsel `error`; `[auth-ok]` gibi yüksek hacimli satırlar 1/100 örneklem veya `LOG_VERBOSE` kapısı arkasında; HATA SATIRLARI ASLA ÖRNEKLENMEZ
  - _Requirements: EK-2_
- [ ] 8.4 nginx hat teşhisi (kalıcı)
  - `/var/log/nginx/yzapi-v1-olcum.log` + `yzapi_olcum` formatı kalıcı hale getirilir: `$host`, `$upstream_addr`, anahtar TİPİ (gw_trial/diger/yok), `$status`, `ua`
  - Gerekçe: bugün bir 401 bilmecesi, üç hat (4100 / 4568 / 3181) ayırt edilemediği için saatler aldı
  - Bakım config'i bu bloğu düşürmemeli — bakım şablonuna da eklenir
  - _Requirements: EK-2_

- [ ] 9. Katalog override yan işi (`model_catalog_override.json`)
  - Dosyada `gpt-5.6-sol` slug'ı İKİ KEZ geçiyor (biri `tool_mode: code_mode_only` + `multi_agent: v2`, diğeri `tool_mode: None`) — hangisinin kazandığı belirsiz, tekilleştirilmeli
  - Bakım kalktıktan sonra `https://api.yapayzekalab.org/model_catalog_override.json` → 200 döndüğü doğrulanmalı (şu an 503; bakım config'i `location` bloğunu düşürdü, commit `fd3635e` dosyanın gerçekten tüketildiğini kanıtlıyor: silindiğinde 3 adet 404 kaydı oluşmuş)
  - Bu adım kök nedeni ÇÖZMEZ (bkz design.md "Çürütülen alternatif hipotez 2"), yalnız bilinen bir tutarsızlığı kapatır
  - _Requirements: 3.4_

- [ ] 10. Yerel doğrulama geçidi
  - `cd /Users/ufuk/yzlab-live && npm run typecheck` (4 workspace) temiz
  - `npm run test --workspaces --if-present` — CE testleri YEŞİL, golden YEŞİL
  - Bilinen ilgisiz başarısızlık: `billing/ledger.test.ts` (yerel Postgres yok, değişiklik öncesinde de vardı)
  - Golden kırmızıya düşerse DEVAM ETME → geri al ve daralt
  - _Requirements: 3.1, 3.9_

- [ ] 11. Canlıya alma
  - Her dosya için zaman damgalı `.bak` → `scp` → `md5` yerel↔canlı eşitlik doğrulaması
  - `ssh vps 'systemctl restart yzlab-api'` → `is-active` + başlangıç hatası kontrolü
  - İç sağlık: `curl http://127.0.0.1:4100/v1/models` → 200
  - Geri alma tek komut olarak hazır tutulur (`.bak` geri kopyala + restart)
  - _Requirements: 3.10_

- [ ] 12. Canlı doğrulama — 24 senaryo, 6 ajan grubu
  - Ön koşul: IP muafiyeti aktif (88.228.196.57 → 200, diğer her yer → 503; bugün doğrulandı) + geçici test anahtarı (owner hesabında üret, test sonunda `revokedAt`)
  - Her grup bağımsız, tek ajana verilebilir. Grup tanımları design.md "Test matrisi" bölümünde
- [ ] 12.1 Grup A — Araç kaynağı (A1–A5): additional_tools / tools / ikisi / backfill / hiçbiri
  - _Requirements: 2.1, 2.3, 3.2_
- [ ] 12.2 Grup B — Çok turlu zincir (B1–B4): tek tur, iki tur, 5+ ardışık `exec`/`wait`, bozuk argüman
  - B3 asıl kabul kriteri: `invalid wait cell` ve `exec cell nonexistent` OLUŞMAMALI
  - _Requirements: 2.10_
- [ ] 12.3 Grup C — Araç tipleri (C1–C4): `function`, `custom`, `namespace` konteyneri, `exec`+`wait`
  - _Requirements: 2.4, 3.6, 3.7_
- [ ] 12.4 Grup D — Akış ve model (D1–D4): stream aç/kapa, `gpt-5.6-sol`, `gpt-5.5` regresyonu, terra/luna
  - _Requirements: 3.1, 3.4_
- [ ] 12.5 Grup E — Spark ve hafıza (E1–E4): çift parite, tek parite, hafıza HIT, TTL
  - _Requirements: 2.6, 2.7, 3.3_
- [ ] 12.6 Grup F — Dayanıklılık ve negatif kontrol (F1–F3): cliproxy durdurulmuş, iptal anahtar, muaf olmayan IP
  - F1 bağımlılık kanıtı: bu yöntem bugün kullanıldı ve çalıştı (cliproxy durdurulunca istek 503, geri açılınca 200)
  - _Requirements: EK-1_
- [ ] 12.7 Sonuçları kanıt tablosu olarak bu dosyaya yaz
  - Her senaryo için: beklenen, gözlenen, kanıt log satırı. Herhangi biri kırmızıysa TAMAM İLAN ETME
  - _Requirements: 2.10_

- [ ] 13. Bakımdan çıkış ön koşulları
  - Claude hattı: `127.0.0.1:8320` (`vexly-model-router`) şu an 509 `Service temporarily restricted for this key` dönüyor. Claude bugünün en çok kullanılan ailesi (bakımdan önceki 3 saatte 106 istek) → çıkmadan önce çözülmeli. NOT: bu cliproxy güncellemesiyle ilgili DEĞİL, ölçümle doğrulandı (Claude 8320'ye gidiyor, güncellenen cliproxy 8317'de)
  - Katalog override 200 dönüyor mu (görev 9)
  - Muafiyet kaldırılıp normal bakım config'ine mi, yoksa tam açılışa mı geçileceği kullanıcı kararı
  - _Requirements: 2.10_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "note": "Ölçüm + golden korpus — kod değişmeden önce" },
    { "wave": 2, "tasks": ["3.1", "3.2"], "note": "Kırmızı karşı örnek kanıtı" },
    { "wave": 3, "tasks": ["4"], "note": "Yükseltme fonksiyonu — 5 ve 6'nın ön koşulu" },
    { "wave": 4, "tasks": ["5", "6", "7"], "note": "Backfill sırası, spark, hafıza — paralel" },
    { "wave": 5, "tasks": ["8.1", "8.2", "8.3", "8.4", "9"], "note": "Gözlemlenebilirlik + katalog yan işi — paralel" },
    { "wave": 6, "tasks": ["10"], "note": "Yerel doğrulama geçidi" },
    { "wave": 7, "tasks": ["11"], "note": "Canlıya alma" },
    { "wave": 8, "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6"], "note": "6 grup paralel — her biri ayrı ajana verilebilir" },
    { "wave": 9, "tasks": ["12.7", "13"], "note": "Kanıt tablosu + bakımdan çıkış" }
  ]
}
```

Kurallar:
- Görev 1 (S1/S2 sondası), görev 4'ten ÖNCE bitmeli — `input`'tan çıkarma kararı ona bağlı.
- Görev 2 (golden), hiçbir kod değişmeden alınmalı; sonradan alınan korpus preservation kanıtı sayılmaz.
- Görev 3.x, ilgili fix görevlerinden önce yazılıp kırmızı olduğu kanıtlanmalı.
- Görev 10 tamamen yeşil olmadan 11'e geçilmez (build yok → hatalı dosya doğrudan canlıya iner).
- Görev 12 grupları birbirinden bağımsız; 6 ajana paralel dağıtılabilir.
- Görev 13, kullanıcı onayı olmadan uygulanmaz (bakımdan çıkış müşteri trafiğini etkiler).

## Notes

- Yerel düzenleme yöntemi: Kiro dosya araçları `/Users/ufuk/yzapi` dışına yazamıyor → `yzlab-live` değişiklikleri kabuk üzerinden `python3` ile hedefli `assert count == 1` + replace, ardından `md5` doğrulaması. Bu oturumda üç kez kullanıldı, her seferinde hash eşleşti.
- Golden fixture fix'ten sonra YENİDEN ÜRETİLMEZ.
- Hiçbir adım "tamam" ilan edilmeden önce ilgili doğrulama komutu koşulur ve çıktısı kanıt olarak sunulur.
- Yedekler hazır: DB `/opt/ops-backups/acil-20260725/` (yzlab 22MB, turkapi 32MB, `pg_restore --list` ile doğrulandı), cliproxy yamalı binary `~/cliproxy-yedek/`, nginx `*.bak-bakim-*` ve `*.bak-oncemuafiyet-*`.
