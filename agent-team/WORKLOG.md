# YapayZekaLab Worklog

## 2026-05-24 — Router kararı ve 10 agent takım kaydı

### Yapılan

- 10 kişilik Ruflo agent takımı kuruldu: `yz-01-incident-lead`, `yz-02-router-architect`, `yz-03-billing-ledger`, `yz-04-api-proxy`, `yz-05-db-migrations`, `yz-06-security-ops`, `yz-07-frontend-panel`, `yz-08-deploy-live`, `yz-09-docs-github`, `yz-10-qa-gate`.
- Swarm doğrulandı: `swarm-1779630543667-6yjn0j`, `agentCount: 10`, `healthy: true`.
- Native agent açma denendi; sonuç: `agent thread limit reached`.
- Ruflo agent yürütme denendi; sonuç: LLM provider anahtarı yok. Bu nedenle yürütme koordinatör tarafından 10 iş hattı olarak sürdürülüyor.
- Router kararı kod ve dokümana işlendi: ana satış/billing YapayZekaLab backendinde, MVP upstream `CloseRouter`, 9Router Faz-2 POC/fallback.
- Backend proxy için `ProviderAdapter` sınırı eklendi; aktif adapter `CloseRouterAdapter`.

### Neden

- 9Router routing/fallback için faydalı olabilir, fakat müşteri hesabı, TL bakiye, ödeme/KDV, usage log, API key ve admin fiyat kontrolü bizim backendde kalmak zorunda.
- Adapter sınırı, bugünkü MVP'yi bozmadığı halde yarın 9Router veya başka sağlayıcı eklemeyi kontrollü hale getirir.

### Kanıt

- Agent kayıt kanıtı: `agent_list` toplam `10` agent döndürdü.
- Swarm sağlık kanıtı: `swarm_health` sonucu `healthy: true`, `agentCount: 10`.
- Kod değişikliği: `src/server/services/provider-adapter.ts` eklendi; `src/server/routes/proxy.ts` aktif provider adapter üzerinden çağrı yapıyor.

### Doğrulama

- `npm run lint` geçti (`tsc --noEmit`).
- `npm test` geçti: 6 test dosyası, 41 test.
- `npm run build` geçti; Vite frontend ve Node backend bundle üretildi.
- Local production smoke geçti:
  - `GET http://127.0.0.1:4583/health` → 200, `db: "ok"`
  - `GET http://127.0.0.1:4583/api/models` → 200, 33 model

### Kalan Risk

- Canlı `yapayzekalab.org` bu değişiklikle deploy edilmedi; canlı 503 ayrı deploy/cPanel işi olarak kalır.
- 9Router canlıya alınmadı; sadece adapter sınırı açıldı. 9Router POC ancak aynı billing/test kapılarından geçerse production adayı olur.

## 2026-05-24 — VPS kurulum planı backend uygulaması

### Yapılan

- `/v1/responses` ve `/v1/messages` proxy endpointleri eklendi.
- Text proxy forwarding `CloseRouterAdapter` üzerinden `/responses` ve `/messages` pathlerine bağlandı.
- Proxy guard genişledi: model var mı, endpoint destekli mi, admin override ile disabled mı, rate limit ve bakiye kontrolü provider'a gitmeden yapılır.
- VPS hedefi için `deploy/vps/yapayzekalab.service`, `deploy/vps/nginx-yapayzekalab.conf`, `scripts/vps-setup.sh`, `scripts/vps-deploy.sh`, `docs/vps-deploy.md` eklendi.
- Production env için `.env.production` desteği eklendi; dosya `.gitignore` içinde kalır.
- CloseRouter text endpoint forwarding için unit test eklendi.

### Neden

- Claude/OpenAI uyumu için `/responses` ve `/messages` gerekli.
- VPS'e geçişte cPanel Passenger 503 riskini bypass etmek için systemd + Nginx deploy yolu netleşmeli.
- 9Router canlıya alınmadan önce adapter sınırı ve billing guard sağlam kalmalı.

### Kanıt

- Test agent team kayıtlandı: `verify-01-api-proxy`, `verify-02-billing-security`, `verify-03-deploy-smoke`, `verify-04-independent-qa`; swarm `swarm-1779631208686-4otxtn`, `agentCount: 4`, `healthy: true`.
- Native agent açma denemesi yine `agent thread limit reached` verdi; Ruflo orchestration kayıtlandı ama executor yok. Bu yüzden doğrulama komutlarını koordinatör çalıştıracak.

### Doğrulama

- Test Agent 1 - API/Proxy: `npm run lint` geçti; `/v1/responses` ve `/v1/messages` forwarder testleri eklendi.
- Test Agent 2 - Billing/Security: `npm test` geçti; 7 test dosyası, 43 test. `src/App.tsx` ve `dist/assets` içinde public formül/çarpan/billing ratio izi bulunmadı. Secret scan gerçek production key/parola yakalamadı.
- Test Agent 3 - Deploy/Smoke: `npm run build` geçti; `bash -n scripts/vps-setup.sh` ve `bash -n scripts/vps-deploy.sh` geçti; local production smoke `/health` 200 `db:"ok"`, `/api/models` 33 model, `/v1/chat/completions` auth yokken 401.
- Independent QA: `git diff --check` temiz. Canlı VPS deploy yapılmadığı için canlı `https://yapayzekalab.org` smoke bu turda kapsam dışı kaldı.

## 2026-05-24 — ByteDance çözünürlük fiyat farkı güncellemesi

### Yapılan

- Ekran görüntüsündeki ByteDance Seedance fiyatları sisteme işlendi.
- 480p, 720p ve 1080p farkları `pricing/fiyat-master.md` içinde kenara not edildi.
- Dört ByteDance video modeli aynı fiyat setine uyarlandı: `seedance-2.0`, `seedance-2.0-edit`, `seedance-2.0-extend`, `seedance-2.0-i2v`.

### Kanıt

- Yeni provider fiyatları:
  - 480p: `$0.016815/sn`
  - 720p: `$0.0378/sn`
  - 1080p: `$0.08505/sn`
- Eski sistem farkları:
  - 480p: `+0.000515 $/sn`
  - 720p: `+0.0011 $/sn`
  - 1080p: `+0.00245 $/sn`

### Doğrulama

- Agent takım kaydı: `swarm-1779631208686-4otxtn` sağlıklı; 4 kayıtlı ajan var. Gerçek test kanıtı koordinatör tarafından üretildi, çünkü Ruflo worker execution daha önce LLM provider olmadan çalışmamıştı.
- Kayıt kontrolü: `rg -n "seedance-2.0|0\.016815|0\.0378|0\.08505|0\.000515|0\.0011|0\.00245" src/master-models.ts pricing/fiyat-master.md agent-team/WORKLOG.md -S` yeni fiyatları ve fark notlarını buldu.
- `npm run lint` geçti.
- `npm test` geçti: 7 test dosyası, 43 test.
- `npm run build` geçti.
- Local production smoke geçti: `/health` 200 ve `db:"ok"`, `/api/models` 200 ve 33 model.
- `/api/models` cevabında dört ByteDance modeli yeni fiyatları döndürdü:
  - `480p`: `0.016815`, sistem TL karşılığı `2.37511557482355`
  - `720p`: `0.0378`, sistem TL karşılığı `5.339242862226`
  - `1080p`: `0.08505`, sistem TL karşılığı `12.0132964400085`
- Public formül sızıntısı kontrolü geçti: `src/App.tsx` ve `dist/assets` içinde `textCarpan`, `imageCarpan`, `videoCarpan`, `textBillingRatio`, `çarpan`, `billing ratio` izi bulunmadı.
- `git diff --check` temiz.

## 2026-05-24 — 2 saatlik GitHub araştırma maratonu başlatma

### Yapılan

- 2 normal agent açma denendi; ortam `agent thread limit reached` döndürdüğü için sahte agent sonucu üretilmedi.
- `scripts/research-marathon.mjs` eklendi.
- İki yerel araştırma hattı kuruldu:
  - `agent-backend-provider`: OpenAI-compatible proxy, provider adapter, streaming, catalog sync, image/video task flow.
  - `agent-billing-security`: prepaid wallet, ledger, API key güvenliği, webhook idempotency, rate limit, panel/ops.
- Localhost canlı izleme paneli başlatıldı: `http://127.0.0.1:4599`.
- İlk canlı kontrolde repo taraması çalıştı ancak code-search sorguları fazla dar kaldı; koşu kalite için durdurulup sorgular genişletildi.
- Genişletilmiş kısa test: 24 repo, 19 code hit, 23 bulgu.
- 120 dakikalık asıl koşu yeniden başlatıldı: `2026-05-24T15-31-28-732Z`.
- 2 saat sonrası kontrol için thread heartbeat otomasyonu oluşturuldu: `ara-t-rma-maratonu-sonucu`.

### Kanıt

- Kısa test koşusu: 26 saniyede 20 repo ve 19 bulgu topladı.
- Genişletilmiş test koşusu: 24 repo, 19 code hit, 23 bulgu topladı.
- Canlı rapor dosyası: `agent-team/research-marathon/live/API_SYSTEM_RESEARCH_REPORT.md`.
- Run raporu: `agent-team/research-marathon/2026-05-24T15-31-28-732Z/API_SYSTEM_RESEARCH_REPORT.md`.

### Doğrulama

- `node --check scripts/research-marathon.mjs` geçti.
- `git diff --check` temiz.
- Panel tarayıcıda açıldı.
- Süreç 2 saat dolmadan tamamlandı sayılmayacak; nihai özet bitişte eklenecek.

## 2026-05-24 — CloseRouter canlı katalog derin taraması

### Yapılan

- CloseRouter hesabına giriş yapıldı ve tek seferlik katalog tarama API key'i oluşturuldu.
- Tarama API key'i veri çekimi sonrası CloseRouter panelinden revoke edildi; pano temizlendi.
- `GET /v1/models`, `GET /v1/models/count`, `GET /v1/providers` ve 33 modelin tamamı için `GET /v1/models/{provider}/{model}/endpoints` çekildi.
- Ham katalog, özet JSON, CSV, video çözünürlük fiyatları, görsel ilişkili fiyatlar ve local diff dosyaları `pricing/closerouter-scan/` altına kaydedildi.
- Bizim statik katalogdaki iki güncel fiyat farkı sisteme işlendi:
  - `anthropic/claude-sonnet-4.6`: `0.25` → `0.255`
  - `moonshotai/kimi-k2.5` output: `0.37` → `0.38`
- `pricing/fiyat-master.md` içinde görsel fiyat birimi düzeltildi: CloseRouter görsel modelleri de `usd_per_million_tokens` döndürüyor; "$/image" varsayımı risk olarak not edildi.

### Kanıt

- Çekilen dosyalar:
  - `pricing/closerouter-scan/models-full-2026-05-24.json`
  - `pricing/closerouter-scan/models-summary-2026-05-24.json`
  - `pricing/closerouter-scan/models-pricing-2026-05-24.csv`
  - `pricing/closerouter-scan/video-pricing-2026-05-24.json`
  - `pricing/closerouter-scan/image-related-pricing-2026-05-24.json`
  - `pricing/closerouter-scan/local-diff-2026-05-24.json`
  - `pricing/closerouter-scan/REPORT-2026-05-24.md`
- Canlı API sayımı: `/v1/models/count` → `33`.
- Video fiyatları: ByteDance `480p=0.016815`, `720p=0.0378`, `1080p=0.08505`; Google/Kwaivgi video default `0.03`.

### Doğrulama

- Normal agent açma denemesi `agent thread limit reached` ile başarısız oldu.
- İki WASM researcher agent açıldı ancak gerçek araştırma yerine echo döndürdü; bu nedenle sahte agent raporu üretilmedi.
- Katalog çekimi koordinatör tarafından yapıldı; API sonuçları dosyaya yazıldı ve local diff üretildi.
- Fiyat düzeltmesi sonrası `local-diff-2026-05-24.json` tekrar üretildi; `localDiffCount=0`.
- `npm run lint` geçti.
- `npm test` geçti: 7 test dosyası, 43 test.
- `npm run build` geçti.
- Local production smoke geçti: `/health` 200 `db:"ok"`, `/api/models` 33 model.
- `/api/models` örnek kontrolü: `claude-sonnet-4.6` input/output `0.255`, `kimi-k2.5` output `0.38`, `seedance-2.0` `480p=0.016815`, `720p=0.0378`, `1080p=0.08505`.
- Secret taraması geçti: tarama API key'i, verilen parola ve e-posta `src`, `pricing`, `docs`, `agent-team`, `README.md`, `CLAUDE.md`, `.env.example` içinde bulunmadı.
- Public bundle formül sızıntısı kontrolü geçti: `src/App.tsx` ve `dist/assets` içinde public formül/çarpan/billing ratio izi bulunmadı.
- `git diff --check` temiz.

## 2026-05-24 — CloseRouter karşılaştırma sonrası eksik metadata güncellemesi

### Yapılan

- Bizim `MASTER_MODELS` kataloğu CloseRouter canlı snapshot dosyasıyla sadece fiyat olarak değil, metadata olarak da karşılaştırıldı.
- `src/master-models.ts` genişletildi ve eksik CloseRouter alanları eklendi:
  - `providerSlug`
  - `contextTokens`
  - `maxOutputTokens`
  - `aliases`
  - `inputModalities`
  - `outputModalities`
  - `supportedParameters`
  - `endpointDetails`
  - `pricingUnit`
- `src/server/services/model-catalog.test.ts` eklendi; bundan sonra katalog snapshot ile uyuşmazsa test gate hata verecek.
- `pricing/closerouter-scan/local-metadata-diff-2026-05-24.json` üretildi.

### Kanıt

- Metadata karşılaştırma çıktısı: `metadataDiffCount=0`, `missingFieldCount=0`.
- Fiyat karşılaştırma çıktısı önceki güncellemeden sonra `localDiffCount=0`.

### Doğrulama

- `npm run lint` geçti.
- `npm test` geçti: 8 test dosyası, 46 test. Yeni `model-catalog.test.ts` canlı snapshot ile id, fiyat, provider, context, max output, aliases, modalities, supported params, endpoint detail ve pricing unit alanlarını doğruladı.
- `npm run build` geçti.
- Local production smoke geçti: `/health` 200 `db:"ok"`, `/api/models` 33 model.
- `/api/models` örnek metadata kontrolü: `seedance-2.0` için `providerSlug=bytedance`, `inputModalities=audio,image,text,video`, `outputModalities=video`, `supportedParameters=14`, `endpointDetails=3`, `pricingUnit=usd_per_second`, pixel fiyatları `480p=0.016815`, `720p=0.0378`, `1080p=0.08505`.
- `/api/models` örnek fiyat kontrolü: `claude-sonnet-4.6` input/output `0.255`, alias sayısı `2`.
- Diff kontrolü: `localDiffCount=0`, `metadataDiffCount=0`, `missingFieldCount=0`.
- Secret taraması geçti: tarama API key'i, verilen parola ve e-posta `src`, `pricing`, `docs`, `agent-team`, `README.md`, `CLAUDE.md`, `.env.example` içinde bulunmadı.
- Public bundle formül sızıntısı kontrolü geçti: `src/App.tsx` ve `dist/assets` içinde public formül/çarpan/billing ratio izi bulunmadı.
- `git diff --check` temiz.

## 2026-05-24 — API sistemi GitHub araştırması erken durdurma ve özet

### Yapılan

- Kullanıcı talimatıyla 2 saatlik araştırma maratonu erken durduruldu.
- Normal agent havuzu daha önce thread limitine takıldığı için araştırma iki yerel araştırma hattı olarak yürütüldü:
  - Backend / Provider / Router
  - Billing / Security / Ops / Panel
- Ham GitHub repo, code hit ve bulgu kayıtları `agent-team/research-marathon/2026-05-24T15-38-48-093Z/` altında bırakıldı.
- Uygulanabilir karar özeti `agent-team/research-marathon/API_SYSTEM_RESEARCH_DECISIONS.md` içine işlendi.

### Kanıt

- Process kontrolü: `research-marathon` süreci durdu; sadece kontrol komutu göründü.
- Ham veri satırları:
  - `events.jsonl`: 498
  - `repos.jsonl`: 177
  - `code-hits.jsonl`: 132
  - `findings.jsonl`: 168
- Son status snapshot:
  - `uniqueRepos=177`
  - `codeHits=132`
  - `findings=168`
  - `agent-backend-provider=134 cycle / 0 error`
  - `agent-billing-security=136 cycle / 0 error`

### Karar

- Ana satış, TL bakiye, ödeme, KDV, API key, usage log ve admin fiyat kontrolü YapayZekaLab backend içinde kalacak.
- 9Router/LiteLLM/Bifrost gibi çözümler ana satış omurgası değil, `ProviderAdapter` arkasında POC/fallback seçeneği olacak.
- İlk MVP akışı `Müşteri -> YapayZekaLab API Backend -> CloseRouter` olarak korunacak.

## 2026-05-24 — Faz 0 baseline gate

### Yapılan

- Plan uygulaması `phase/00-baseline` branch'i üzerinde başlatıldı.
- Mevcut geniş dirty state korunarak baseline doğrulama kapıları çalıştırıldı.
- Bu fazda kod davranışı değiştirilmedi; amaç sonraki fazlar için temiz kanıt almaktı.

### Kanıt

- Branch: `phase/00-baseline`
- `git diff --check`: çıktı yok, whitespace/diff format hatası yok.
- `npm run lint`: `tsc --noEmit` exit code 0.
- `npm test`: 8 test dosyası, 46 test geçti.
- `npm run build`: Vite build, server bundle, migrate bundle ve seed bundle üretildi.

### Sonuç

- Faz 1 ledger/metering sertleştirmesine geçmek için baseline kapısı açıldı.

## 2026-05-24 — Faz 1 ledger/metering sertleştirme

### Yapılan

- `usage_records` kanıt alanlarıyla genişletildi:
  - `request_id`
  - `upstream_request_id`
  - `raw_usage_json`
  - `pricing_snapshot_json`
  - `remaining_tl`
  - `error_code`
- `0003_usage_record_evidence.sql` migration dosyası eklendi.
- `chargeUsage` başarılı usage için bakiye düşümü, `transactions` ledger kaydı ve `usage_records` kaydını tek DB transaction içine aldı.
- `requestId` idempotency eklendi; aynı request id ikinci kez gelirse çift bakiye düşmez.
- Streaming usage yoksa `stream_missing_usage` status ile cost `0` kayıt yolu eklendi.
- Proxy route'ları `requestId`, raw usage ve upstream error code bilgisini billing servisine taşır hale getirildi.

### Kanıt

- Targeted test: `npm test -- src/server/services/billing-service.test.ts` geçti: 1 dosya, 4 test.
- `npm run lint` geçti.
- `npm test` geçti: 8 dosya, 48 test.
- `npm run build` geçti.
- `git diff --check` temiz.

### Sonuç

- V1 ledger olarak `transactions` korunuyor.
- Usage kanıt zinciri request id ve pricing snapshot ile güçlendi.
- Bakiye düşümü ve kullanım kaydı artık aynı transaction sınırında.

## 2026-05-24 — Faz 2 proxy/provider production gate

### Yapılan

- API key middleware contract testleri eklendi:
  - eksik/yanlış prefix `401`
  - invalid veya revoked key `401`
  - valid key `req.user` ve `req.apiKey` bağlar
- Error handler contract testleri eklendi:
  - yetersiz bakiye `402`
  - disabled model `403`
  - rate limit `429` + `Retry-After`
- CloseRouter upstream error test edildi; status/body korunuyor.
- Production static servis güvenliği düzeltildi:
  - sadece `/assets` statik servis edilir.
  - `dist/server.js`, `.env.example`, migration dosyaları public static altında servis edilmez.
  - bilinmeyen `/api` ve `/v1` route'ları SPA HTML yerine JSON `404` döner.

### Kanıt

- Targeted test: `npm test -- src/server/middleware/api-key-auth.test.ts src/server/middleware/error-handler.test.ts src/server/services/closerouter-service.test.ts` geçti: 3 dosya, 9 test.
- `npm run lint` geçti.
- `npm test` geçti: 10 dosya, 55 test.
- `npm run build` geçti.
- Public bundle scan: `dist/index.html` ve `dist/assets` içinde `CLOSEROUTER_API_KEY`, test key, carpan/formül/billing ratio izi yok.
- `git diff --check` temiz.

### Sonuç

- Text proxy production contract daha net.
- API hata standardı testle kilitlendi.
- Server bundle ve env örnekleri public static servis yüzeyinden çıkarıldı.

## 2026-05-24 — Faz 3 IBAN ve müşteri usage görünümü

### Yapılan

- IBAN ödeme onayı için mevcut `creditUserBalance` davranışı testle netleştirildi.
- 120 TL ödeme alan müşterinin kullanılabilir bakiyesine 120 TL geçtiği, KDV ayrımının rapor/metadata tarafında kaldığı doğrulandı.
- Aynı başarılı ödeme tekrar işlenirse ikinci kez bakiye yazılmaması test edildi.
- Müşteri paneli için `GET /api/user/usage-records` endpoint'i eklendi.
- Usage endpoint'i son 100 kaydı request id, model, token/unit, TL cost, kalan bakiye, status, latency ve hata koduyla döndürür hale getirildi.

### Kanıt

- Targeted test: `npm test -- src/server/services/payment-common.test.ts` geçti: 1 dosya, 9 test.
- `npm run lint` geçti.
- `npm test` geçti: 10 dosya, 57 test.
- `npm run build` geçti.
- `git diff --check` temiz.

### Sonuç

- IBAN-first ödeme kararının kritik bakiye davranışı testle kilitlendi.
- Müşteri panelinin gerçek usage tablosunu API'den besleyeceği yol hazırlandı.

## 2026-05-24 — Faz 4 admin/security audit sıkılaştırma

### Yapılan

- Müşteri self-service API key oluşturma aksiyonu audit log'a yazılır hale getirildi.
- Müşteri self-service API key iptal aksiyonu audit log'a yazılır hale getirildi.
- Admin ve ödeme tarafında mevcut audit kayıtlarının korunduğu doğrulandı.
- README ve CLAUDE.md güncel faz durumu ve güvenlik kararlarıyla güncellendi.

### Kanıt

- `npm run lint` geçti.
- `npm test` geçti: 10 dosya, 57 test.
- `npm run build` geçti.
- Public bundle scan geçti: `dist/index.html` ve `dist/assets` içinde upstream secret, çarpan/formül/billing ratio izi yok.
- `git diff --check` temiz.

### Sonuç

- API key yaşam döngüsünde müşteri kaynaklı güvenlik olayları artık audit zincirinde izlenebilir.

## 2026-05-24 — Faz 5 VPS production deploy hazırlığı

### Yapılan

- `scripts/vps-deploy.sh` health kontrolü güçlendirildi.
- Deploy smoke artık sadece HTTP 200 değil, `/health` içinde `checks.db = "ok"` şartını arıyor.
- `/api/models` için 33 model kontrolü korunuyor.
- Bilinmeyen `/v1/*` route'unun HTML yerine JSON `404` döndüğü deploy smoke'a eklendi.
- `docs/vps-deploy.md` aynı smoke kriterleriyle güncellendi.

### Kanıt

- `bash -n scripts/vps-setup.sh scripts/vps-deploy.sh` geçti.
- `npm run lint` geçti.
- `npm test` geçti: 10 dosya, 57 test.
- `npm run build` geçti.
- `git diff --check` temiz.

### Sonuç

- VPS deploy scripti canlıya alınmadan önce DB, model katalog ve API hata davranışını doğrulayan daha sıkı bir kapıya sahip.

## 2026-05-24 — Faz 6 router POC kapısı

### Yapılan

- `docs/router-poc.md` eklendi.
- 9Router/LiteLLM/Bifrost benzeri routerların ana satış katmanı olmadığı tekrar kayıt altına alındı.
- Yeni adapter production trafiği almadan önce geçmesi gereken billing, auth, usage, idempotency, streaming ve secret-scan kapıları yazıldı.
- `activeProviderAdapter` hâlâ `CloseRouterAdapter`; 9Router canlıya bağlanmadı.

### Kanıt

- `npm run lint` geçti.
- `npm test` geçti: 10 dosya, 57 test.
- `npm run build` geçti.
- Public bundle scan geçti: hit yok.
- `git diff --check` temiz.

### Sonuç

- Router POC yolu açık ama production ana omurgası değişmedi: müşteri, bakiye, ödeme, KDV, usage log ve admin kontrolü YapayZekaLab backendinde kalıyor.

## 2026-05-24 — Operasyon öncelikli VPS deploy hardening

### Yapılan

- `scripts/vps-deploy.sh` genişletildi:
  - `.env.production` varlık, `600` izin ve required key kontrolü eklendi.
  - Önceki git revision için `.deploy/rollback-last.sh` üretilir hale getirildi.
  - Production DB bağlantısı migration öncesi `SELECT 1` ile doğrulanır hale getirildi.
  - Migration öncesi `pg_dump` backup zorunlu kapıya alındı.
  - Public bundle secret/formül taraması deploy kapısına eklendi.
  - Restart sonrası ortak smoke scripti çalıştırılır hale getirildi.
- `scripts/vps-smoke.mjs` eklendi:
  - `/health` içinde `checks.db = "ok"` arar.
  - `/api/models` için 33 model kontrolü yapar.
  - `/v1/chat/completions` auth yokken `401` bekler.
  - bilinmeyen `/api/*` ve `/v1/*` için JSON `404` bekler.
  - canlı test API key yoksa `manual-live-required` yazar, sahte başarı üretmez.
- `scripts/scan-public-bundle.mjs` eklendi:
  - `dist/index.html` ve `dist/assets` içinde upstream secret, çarpan/formül/billing ratio ve eski fiyat izi arar.
- `deploy/vps/yapayzekalab.service` systemd hardening ile güncellendi.
- `deploy/vps/nginx-yapayzekalab.conf` security header'larıyla güncellendi.
- `scripts/vps-setup.sh` `pg_dump` için `postgresql-client` kurar hale getirildi.
- `docs/vps-deploy.md` rollback, backup, smoke ve env checklist kararlarıyla güncellendi.
- Bilinmeyen `/v1/*` route'ları auth middleware'e takılmadan JSON `404` dönecek şekilde route guard eklendi.

### Kanıt

- `bash -n scripts/vps-setup.sh scripts/vps-deploy.sh` geçti.
- `node --check scripts/vps-smoke.mjs` ve `node --check scripts/scan-public-bundle.mjs` geçti.
- `npm run lint` geçti.
- `npm test` geçti: 10 dosya, 57 test.
- `npm run build` geçti.
- `npm run scan:public` geçti: 3 dosya tarandı, hit yok.
- Local production smoke geçti:
  - `/health: ok db: ok`
  - `/api/models: 33`
  - `/v1/chat/completions unauth: 401`
  - `/api/__smoke_missing_route__: json_404`
  - `/v1/__smoke_missing_route__: json_404`
  - `SMOKE_API_KEY` ve `SMOKE_LOW_BALANCE_API_KEY` olmadığı için iki canlı API key testi `manual-live-required` olarak işaretlendi.
- `git diff --check` temiz.

### Sonuç

- VPS deploy hattı artık geri alınabilir, backup alan, env doğrulayan ve canlı smoke davranışını açıkça raporlayan bir kapıya sahip.
- Canlı API key gerektiren başarı/yetersiz bakiye smoke'ları için gerçek test key verilmeden tamamlandı denmeyecek.

## 2026-05-24 — Kalan fazlar: status, reconciliation, aktivasyon ve release kanıtı

### Agent/rol kaydı

- Product/Growth rolü: müşteri aktivasyon akışı, text-only beta konumlandırması ve güven yüzeyi önerileri.
- Backend/Ledger rolü: reconciliation, drift görünürlüğü ve idempotency kanıtı önerileri.
- Deploy/Ops rolü: release manifest, rollback, smoke ve ops status önerileri.
- Thread limiti nedeniyle kalan Security/Abuse, Frontend/Panel ve QA/Release rolleri koordinatör sentezi olarak yürütüldü; sahte agent onayı yazılmadı.

### Yapılan

- `GET /status` canlı operasyon görünürlüğü için secretsız API/DB/CloseRouter/model/deploy özeti döner hale geldi.
- Status servisi `.deploy/releases/*.json` manifestlerini ve `backup_file` alanını okuyacak şekilde güncellendi.
- `scripts/vps-smoke.mjs` artık `/status` için 200, `checks.db="ok"` ve `modelCount=33` kontrol ediyor.
- `scripts/vps-deploy.sh` deploy manifestini `.deploy/releases/<deploy_id>.json` olarak yazıyor; DB backup ve smoke sonucunu aynı kayda işliyor.
- `scripts/vps-ops-status.sh` eklendi; VPS üzerinde systemd, nginx, port, disk/memory ve log durumunu tek rapora topluyor.
- Admin reconciliation JSON ve CSV export endpointleri eklendi.
- API sekmesine müşteri aktivasyon akışı eklendi: giriş, bakiye, API key, ilk istek ve usage adımları.
- Public açılışta admin token yokken admin endpointlerine istek atılması engellendi; gereksiz 401 konsol gürültüsü kaldırıldı.
- README ve CLAUDE karar kayıtları güncellendi.

### Kanıt

- `git diff --check` temiz.
- `bash -n scripts/vps-setup.sh scripts/vps-deploy.sh scripts/vps-ops-status.sh` geçti.
- `node --check scripts/vps-smoke.mjs && node --check scripts/scan-public-bundle.mjs` geçti.
- Targeted tests geçti: `src/server/services/status-service.test.ts` + `src/server/services/reconciliation-service.test.ts` → 2 dosya, 4 test.
- `npm run lint` geçti.
- `npm test` geçti: 12 test dosyası, 61 test.
- `npm run build` geçti.
- `npm run scan:public` geçti: 3 dosya tarandı, hit yok.
- Local production smoke geçti:
  - `/health: ok db: ok`
  - `/status: ok models: 33`
  - `/api/models: 33`
  - `/v1/chat/completions unauth: 401`
  - `/api/__smoke_missing_route__: json_404`
  - `/v1/__smoke_missing_route__: json_404`
  - `SMOKE_API_KEY` ve `SMOKE_LOW_BALANCE_API_KEY` olmadığı için başarılı chat ve düşük bakiye smoke maddeleri `manual-live-required` kaldı.
- Browser kontrolünde API sekmesi açıldı; aktivasyon metinleri göründü; public body text içinde `çarpan|billing ratio|formül` izi yok.

### Sonuç

- Faz sırası korundu: VPS release/ops görünürlüğü ve müşteri aktivasyon yüzeyi güçlendirildi.
- Canlı deploy ve gerçek test API key gerektiren smoke maddeleri henüz tamam sayılmadı; VPS erişimi ve test key verilince bu kapılar ayrıca çalıştırılacak.

## 2026-05-24 — Release VPS Beta snapshot ve agent faz kontrolü

### Agent/rol kaydı

- Yeni native agent spawn denemesi thread limitine takıldı.
- Mevcut 6 agent id'si sorgulandı:
  - Product/Growth: OK; text-only beta, onboarding ve fiyat güveni önerileri verdi.
  - Backend/Ledger: OK; reconciliation, streaming outbox ve idempotency önerileri verdi.
  - Deploy/Ops: OK; VPS deploy, rollback, backup restore ve DNS/certbot önerileri verdi.
  - Security/Abuse: OK; rate limit, günlük TL limit ve audit/export sertleştirme sırası çıkarıldı.
  - Frontend/Panel: OK; dashboard, API key one-time reveal, usage table ve IBAN flow sırası çıkarıldı.
  - QA/Release: PARTIAL; agent beklemede kaldı, gate listesi koordinatör tarafından uygulandı.
- Ayrıntı: `agent-team/RELEASE_VPS_BETA_AGENT_TEAM_2026-05-24.md`

### Yapılan

- `phase/release-vps-beta` branch'i oluşturuldu.
- Kör `git add .` yapılmadan release snapshot commit gruplarına ayrıldı.
- Backend gateway core commitlendi: `a215d12 feat: add backend gateway core`.
- VPS deploy tooling commitlendi: `ea7dd1a chore: add VPS release tooling`.
- Customer activation/admin panel commitlendi: `57a85a3 feat: add customer activation panel`.
- Admin panelde Sistem & Audit içine `Mutabakat` sekmesi eklendi; CSV export butonu UI'dan erişilebilir hale geldi.
- Release checklist eklendi: `docs/release-vps-beta-checklist.md`.
- README, CLAUDE ve TEAM_STATUS kayıtları güncellendi.

### Kanıt

- `git diff --check` temiz.
- `npm run lint` geçti.
- `npm test` geçti: 12 test dosyası, 61 test.
- `npm run build` geçti.
- `npm run scan:public` geçti: 3 dosya tarandı, hit yok.
- Local production smoke geçti:
  - `/health: ok db: ok`
  - `/status: ok models: 33`
  - `/api/models: 33`
  - `/v1/chat/completions unauth: 401`
  - `/api/__smoke_missing_route__: json_404`
  - `/v1/__smoke_missing_route__: json_404`
  - `SMOKE_API_KEY` ve `SMOKE_LOW_BALANCE_API_KEY` olmadığı için başarılı chat ve düşük bakiye smoke maddeleri `manual-live-required` kaldı.
- Branch push edildi: `origin/phase/release-vps-beta`.
- GitHub PR linki: `https://github.com/chakallstr/yzapi/pull/new/phase/release-vps-beta`

### Sonuç

- Faz 1 release snapshot uygulandı ve commit grupları oluşturuldu.
- Faz 2 canlı VPS deploy için kalan blocker değişmedi: VPS erişimi, `.env.production`, DNS ve test API key gerekli.

## 2026-05-24 — Faz 2 canlı VPS preflight ve blocker kanıtı

### Agent/rol kaydı

- Yeni native agent spawn tekrar denendi; sonuç: `agent thread limit reached`.
- Ruflo `swarm_health` tekrar kontrol edildi; sonuç: `no_swarm`.
- Bu nedenle 6 rol için sahte agent onayı üretilmedi; Deploy/Ops ve QA/Release kontrolü koordinatör tarafından read-only komutlarla yürütüldü.

### Yapılan

- `scripts/vps-live-preflight.sh` eklendi.
- `npm run preflight:live` scripti eklendi.
- 503 runbook içine localden read-only canlı/VPS preflight komutu eklendi.
- Canlı domain ve hazır VPS alias'ı kontrol edildi; hiçbir secret değeri yazdırılmadı.

### Kanıt

- Branch: `phase/release-vps-beta`, rev: `77b1e95`.
- DNS: `yapayzekalab.org -> 77.92.151.228`.
- Canlı HTTP:
  - `/health = 503`
  - `/status = 503`
  - `/api/models = not-json`
- VPS read-only SSH:
  - host: `seslab`
  - `/opt/yapayzekalab` repo: missing
  - `.env.production`: missing
  - `yapayzekalab` service: inactive
  - Nginx config: ok

### Doğrulama

- `bash -n scripts/vps-live-preflight.sh` geçti.
- `npm run preflight:live` çalıştı ve doğru şekilde `preflight=BLOCKER failures=4` döndürdü.

### Sonuç

- Faz 2 canlı deploy tamam değildir.
- Gerçek canlı deploy için sıradaki zorunlu adımlar: domain DNS'in VPS'e alınması, `/opt/yapayzekalab` repo/env kurulumu, `.env.production` izninin `600` yapılması, `yapayzekalab` servisinin active hale getirilmesi ve gerçek `SMOKE_API_KEY` + `SMOKE_LOW_BALANCE_API_KEY` ile smoke kapısının geçirilmesi.

## 2026-05-24 — Sıradaki faz planı ve 6 rol kontrolü

### Agent/rol kaydı

- Ruflo mesh plan swarm kuruldu: `swarm-1779653015913-xntzke`.
- `swarm_health`: healthy, `agentCount: 0`.
- Ruflo worker spawn denemesi: `Hive-mind not initialized`.
- Native agent spawn denemesi: `agent thread limit reached`.
- Bu nedenle 6 rol gerçek çalışan agent çıktısı olarak değil, koordinatör tarafından kontrol edilen lane olarak kaydedildi.

### Yapılan

- Sıradaki faz planı yazıldı: `docs/superpowers/plans/2026-05-24-yapayzekalab-next-phases.md`.
- Canlı deploy öncesi yeni kritik bulgu plana işlendi: hedef `vps` CentOS Stream 8, mevcut setup akışı Ubuntu varsayımlı.
- Faz sırası netleşti:
  1. Phase 2A: CentOS uyumlu VPS setup gate.
  2. Phase 2B: `/opt/yapayzekalab` app bootstrap.
  3. Phase 2C: production env ve smoke key hazırlığı.
  4. Phase 2D: DNS öncesi localhost deploy smoke.
  5. Phase 2E: DNS, certbot, public smoke ve rollback drill.
  6. Phase 3+: customer panel, billing hardening, security, image/video, 9Router POC.

### Kanıt

- Branch: `phase/release-vps-beta`, rev: `d426bf9`.
- VPS OS: `CentOS Stream 8`.
- VPS portları: Nginx `80/443`, mevcut Node `127.0.0.1:3002`; app port `4567` henüz yok.
- Live preflight tekrar çalıştı ve `preflight=BLOCKER failures=4` döndürdü.

### Sonuç

- Sıradaki gerçek iş `scripts/vps-setup.sh` dosyasını CentOS/RHEL uyumlu hale getirmek.
- Canlı release hâlâ tamam değildir; DNS/env/service/smoke key kapısı geçmeden müşteri aktivasyonu production-ready sayılmayacak.

## 2026-05-24 — Faz 2A CentOS uyumlu VPS setup

### Yapılan

- `scripts/vps-setup.sh` dağıtım algılayacak hale getirildi.
- Debian/Ubuntu yolu mevcut `apt-get`, `ufw`, `sites-available/sites-enabled` davranışını koruyor.
- CentOS/RHEL yolu `dnf`, `/etc/nginx/conf.d/yapayzekalab.conf`, opsiyonel `firewalld` ve SELinux `httpd_can_network_connect` desteğiyle eklendi.
- Node.js 22 kontrolü platform bağımsız hale getirildi; Node 22 zaten varsa tekrar kurulum yapılmaz.
- `docs/vps-deploy.md` ve `docs/incident-503-runbook.md` CentOS/Nginx `conf.d` gerçeğiyle güncellendi.

### Neden

- Hedef `vps` sunucusu CentOS Stream 8 ve mevcut Nginx yapısı `/etc/nginx/conf.d/`.
- Eski setup scripti Ubuntu varsayımlıydı; canlı VPS'te `apt-get` veya `sites-enabled` kullanmaya çalışmak deploy öncesi riskti.
- Mevcut SesLab Nginx configleri canlı çalıştığı için CentOS yolunda bu dosyalara dokunulmaması gerekiyor.

### Kanıt

- Read-only VPS kontrolü:
  - OS: `CentOS Stream 8`
  - Nginx: config syntax ok
- Script arama kontrolü:
  - CentOS/RHEL path `dnf` ve `/etc/nginx/conf.d/yapayzekalab.conf` içeriyor.
  - Ubuntu path `apt-get` ve `sites-enabled` içinde kalıyor.
- Canlı preflight:
  - `/health=503`
  - `/status=503`
  - `/api/models=not-json`
  - `/opt/yapayzekalab` repo missing
  - `.env.production` missing
  - `yapayzekalab` service inactive
  - Sonuç: `preflight=BLOCKER failures=4`

### Doğrulama

- `bash -n scripts/vps-setup.sh scripts/vps-deploy.sh scripts/vps-ops-status.sh scripts/vps-live-preflight.sh` geçti.
- `git diff --check` temiz.
- `npm run lint` geçti.
- `npm test` geçti: 12 test dosyası, 61 test.
- `npm run build` geçti.
- `npm run scan:public` geçti: 3 dosya tarandı, hit yok.

### Sonuç

- Faz 2A, deploy scripti açısından CentOS blocker'ını çözer.
- Canlı deploy hâlâ tamam değildir; sıradaki faz `Faz 2B - VPS App Bootstrap`: `/opt/yapayzekalab` repo kurulumu, `.env.production`, servis start, DNS ve gerçek smoke key kapıları.

## 2026-05-24 — Faz 2B VPS app bootstrap

### Yapılan

- VPS ön kontrolü yapıldı: CentOS Stream 8, Node `v22.22.2`, npm `10.9.7`, Nginx syntax ok.
- VPS'e `git` kuruldu: `git version 2.43.0`.
- GitHub branch erişimi tokensız doğrulandı: `phase/release-vps-beta` -> `ec8eb2855db23f9327a6280ec5a324662f08ba3b`.
- `/opt/yapayzekalab` oluşturuldu ve `phase/release-vps-beta` branch'i klonlandı.
- VPS üzerinde `scripts/vps-setup.sh` çalıştırıldı; systemd servis ve Nginx config bootstrap edildi.
- Root read-only preflight için `/opt/yapayzekalab` Git safe.directory olarak kaydedildi.

### Neden

- Faz 2C/2D öncesinde app kodunun ve servis/Nginx configlerinin VPS üzerinde hazır olması gerekiyor.
- Bu faz production deploy değildir; `.env.production` oluşturulmadı, service active hale getirilmedi, DNS değiştirilmedi.

### Kanıt

- `/opt/yapayzekalab/.git`: present.
- VPS app branch: `phase/release-vps-beta`.
- VPS app rev: `ec8eb28`.
- Nginx config: `/etc/nginx/conf.d/yapayzekalab.conf` present.
- Nginx syntax: ok.
- systemd `yapayzekalab`: enabled, inactive.
- Mevcut SesLab service: active.
- `npm run preflight:live` artık `app_repo=present`, `app_branch=phase/release-vps-beta`, `app_rev=ec8eb28` döndürüyor.

### Doğrulama

- VPS read-only gate:
  - `git --version` -> `2.43.0`
  - `git -C /opt/yapayzekalab rev-parse --abbrev-ref HEAD` -> `phase/release-vps-beta`
  - `git -C /opt/yapayzekalab rev-parse --short HEAD` -> `ec8eb28`
  - `nginx -t` geçti
  - `systemctl is-enabled yapayzekalab` -> `enabled`
  - `systemctl is-active seslab-com` -> `active`
- `npm run preflight:live` beklenen şekilde BLOCKER kaldı:
  - canlı HTTP hâlâ 503/not-json
  - `.env.production` missing
  - `yapayzekalab` service inactive

### Sonuç

- Faz 2B app bootstrap tamamlandı.
- Sıradaki faz `Faz 2C - Production env ve smoke key hazırlığı`.
- Canlı deploy hâlâ tamam değildir; env, service start, DNS, certbot ve gerçek API key smoke kapıları sonraki fazlarda geçilecek.
