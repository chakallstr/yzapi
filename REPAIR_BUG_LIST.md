# YapayZekaLab Repair Bug List

Bu liste önceki QA raporlarından deduplicate edilmiştir. Tasarım değişikliği gerektiren madde otomatik uygulanmayacaktır.

## R-BUG-001

Title: `/v1/models`, `/v1/providers`, `/v1/models/count` 404 dönüyor.
Source reports: `QA_FINAL_REPORT.md`, `API_TEST_REPORT.md`, `BACKEND_TEST_REPORT.md`, `FRONTEND_BACKEND_CONSISTENCY_REPORT.md`, `BUG_LIST.md`, `FIX_PLAN.md`, `LAUNCH_READINESS_REPORT.md`
Area: API catalog
Type: API, Backend, Frontend/backend consistency
Severity: High
User impact: Developer model katalogunu OpenAI/CloseRouter uyumlu şekilde çekemiyor.
Business impact: Entegrasyon başlangıcı ve docs güveni kırılıyor.
Security/payment risk: Düşük; public catalog olmalı, secret içermemeli.
Design/template risk: Yok.
Reproduction steps: `GET /v1/models`, `GET /v1/providers`, `GET /v1/models/count`.
Expected result: 200 JSON catalog/count/provider list.
Actual result: 404 JSON `Not found`.
Evidence: API/backend raporlarında endpointler 404.
Root cause hypothesis: `/v1` middleware yalnız proxy endpointlerini allowlist ediyor, public catalog route mount edilmemiş.
Files likely involved: `src/server/index.ts`, yeni veya mevcut `src/server/routes/*`, API contract tests.
Can be fixed without visual design change? YES
Recommended fix: Public `/v1` catalog route ekle; auth gerektiren `/v1/chat|responses|messages|images|videos` davranışını değiştirme.
Recommended phase: Phase 2B
Needs user approval? NO
Status: Planned

## R-BUG-002

Title: Runtime stabil değil; DB/Docker/listener kesintisi görüldü.
Source reports: `60_MINUTE_SITE_TEST_REPORT.md`, `SECURITY_RISK_REPORT.md`, `ENVIRONMENT_REPORT.md`, `BUG_LIST.md`, `LAUNCH_READINESS_REPORT.md`
Area: Runtime/environment
Type: Environment/build, Backend
Severity: Critical
User impact: Site aralıklı erişilemez veya degraded görünebilir.
Business impact: Launch güvenilirliği düşer.
Security/payment risk: Orta; yarım kalan ödeme/API akışlarında yanlış kullanıcı algısı oluşabilir.
Design/template risk: Yok.
Reproduction steps: 60 dk UAT sırasında local listener ve DB kapanma/kesinti.
Expected result: Production build/process manager ve DB health stabil çalışmalı.
Actual result: `ERR_CONNECTION_REFUSED`, DB bağlantı hatası, elle restart.
Evidence: Runtime/endurance raporları.
Root cause hypothesis: Local dev `tsx watch` ve Docker/Postgres bağımlılığı production süreçlerinden ayrılmamış veya test ortamı resetlenmiş.
Files likely involved: `package.json`, deploy/runbook scripts, environment docs; code değişimi root cause sonrası.
Can be fixed without visual design change? YES
Recommended fix: Önce process/env root-cause yaz; production `build + start/process manager` doğrula; kod değişimi kanıta bağlı.
Recommended phase: Phase 2A
Needs user approval? NO for docs/tests, YES for deploy/process changes
Status: Planned

## R-BUG-003

Title: Google OAuth local ortamda 503 dönüyor.
Source reports: `QA_FINAL_REPORT.md`, `SECURITY_REPORT.md`, `SECURITY_RISK_REPORT.md`, `ENVIRONMENT_REPORT.md`, `BUG_LIST.md`, `LAUNCH_READINESS_REPORT.md`
Area: Auth
Type: Auth, UX clarity, Environment/build
Severity: High
User impact: Yeni kullanıcı login akışı tamamlanamıyor.
Business impact: Kayıt/onboarding bloke olur.
Security/payment risk: Düşük/orta; güvenli 503 doğru ama launch için configured OAuth gerekir.
Design/template risk: Yok.
Reproduction steps: `GET /api/auth/google` local env ile.
Expected result: Env varsa 302/303 Google redirect ve ana domain callback; env yoksa net güvenli hata.
Actual result: 503 `google oauth not configured`.
Evidence: Auth/security/environment raporları.
Root cause hypothesis: Google OAuth env eksik veya callback base URL yapılandırılmamış.
Files likely involved: `src/server/routes/auth.ts`, `src/server/lib/env.ts`, `.env.example`, docs/runbook.
Can be fixed without visual design change? YES
Recommended fix: Secret yazmadan env placeholders/runbook doğrula; env varsa redirect URI ana domain callback testini ekle.
Recommended phase: Phase 2C
Needs user approval? NO for docs/env example placeholders; YES for real credential/deploy test
Status: Planned

## R-BUG-004

Title: Docs/API örnekleri CloseRouter uyumlu YapayZekaLab sözleşmesini göstermiyor.
Source reports: `QA_FINAL_REPORT.md`, `FRONTEND_BACKEND_CONSISTENCY_REPORT.md`, `UAT_END_USER_REPORT.md`, `BUG_LIST.md`, `FIX_PLAN.md`
Area: Docs/API tab
Type: Frontend functional, UX clarity
Severity: Medium
User impact: Developer ilk entegrasyon adımlarını güvenle takip edemiyor.
Business impact: Aktivasyon ve ilk API request dönüşümü düşer.
Security/payment risk: Düşük; örnekler API key'i frontend'e koymama uyarısı içermeli.
Design/template risk: Orta; sadece mevcut text/code content değişebilir, layout/class değişemez.
Reproduction steps: `/docs` veya API tabı aç; entegrasyon örneklerini ve base URL'leri kontrol et.
Expected result: YapayZekaLab base URL ve endpoints net, OpenAI-compatible örnekler gerçek endpointlerle uyumlu.
Actual result: Raporlar görünür/doğrulanır değil diyor; frontend kaynakta eski `api.yapayzekalab.com` URL örnekleri var.
Evidence: Docs/API raporları ve `src/App.tsx` static examples.
Root cause hypothesis: UI content önceki domain/placeholder ile kaldı.
Files likely involved: `src/App.tsx`, docs content tests.
Can be fixed without visual design change? YES, text-only/content-only
Recommended fix: Mevcut API tab code strings/base URL'leri `https://yapayzekalab.org/v1` ve `yzk_live_*` sözleşmesine hizala.
Recommended phase: Phase 2D/2F
Needs user approval? NO if no layout/style/class change
Status: Planned

## R-BUG-005

Title: Video endpoint durumu UI/docs içinde net sınırlı/beta olarak belirtilmiyor.
Source reports: `FRONTEND_BACKEND_CONSISTENCY_REPORT.md`, `BUG_LIST.md`, `API_GATEWAY_REPORT.md`
Area: Models/video
Type: Frontend/backend consistency, UX clarity
Severity: Medium
User impact: Kullanıcı video özelliğini production-ready sanabilir.
Business impact: Yanlış beklenti ve destek yükü oluşur.
Security/payment risk: Düşük; yanlış ücret beklentisi doğabilir.
Design/template risk: Orta; sadece mevcut text/status data değişebilir, tasarım değişemez.
Reproduction steps: Models video filtreleri ve API docs/video endpoint metnini kontrol et.
Expected result: Video API beta/sınırlı veya 501 olarak net açıklanır.
Actual result: Backend expected 501 iken UI durumu yeterince net değil.
Evidence: API_GATEWAY ve consistency raporları.
Root cause hypothesis: Model metadata/API text video endpoint availability ile hizalı değil.
Files likely involved: `src/App.tsx`, maybe `src/master-models.ts` if metadata needed.
Can be fixed without visual design change? YES, text/data-only
Recommended fix: Mevcut copy/metadata içinde video durumunu `beta/sınırlı` olarak netleştir; endpoint auth/501 davranışını değiştirme.
Recommended phase: Phase 2D/2F
Needs user approval? NO if text/data-only
Status: Planned

## R-BUG-006

Title: Successful `/v1` billing, balance decrement ve usage_records gerçek akışta doğrulanmadı.
Source reports: `QA_FINAL_REPORT.md`, `API_TEST_REPORT.md`, `API_GATEWAY_REPORT.md`, `QA_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
Area: API billing
Type: API, Billing, Database, Test gap
Severity: High
User impact: İlk başarılı API request ve maliyet güveni kanıtlanmadı.
Business impact: Launch için ana gelir akışı doğrulanmamış kalır.
Security/payment risk: Yüksek; yanlış ücretlendirme veya eksik ledger riski kanıtlanmadan kapanmaz.
Design/template risk: Yok.
Reproduction steps: Valid funded key ile küçük text call, headers, DB balance/usage kontrolü.
Expected result: 200 response, cost headers, balance decrement, usage_records.
Actual result: Test blocked; key/upstream env yok.
Evidence: API reports.
Root cause hypothesis: Test credential/upstream env eksik; kod bug kanıtlanmadı.
Files likely involved: Test scripts, env/runbook; code only if retest fails.
Can be fixed without visual design change? YES/UNKNOWN
Recommended fix: Safe seeded test user/key/upstream env ile retest; bug çıkarsa ayrı DEC-FIX.
Recommended phase: Phase 2B/2G
Needs user approval? YES for real secret/provider spend
Status: Blocked

## R-BUG-007

Title: Shopier/Cryptomus E2E webhook/payment doğrulanmadı.
Source reports: `PAYMENT_BILLING_REPORT.md`, `SECURITY_REPORT.md`, `QA_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
Area: Payment
Type: Payment, Billing, Security, Test gap
Severity: High
User impact: Bakiye yükleme güveni kanıtlanmadı.
Business impact: Para alma ve otomatik bakiye credit launch blocker.
Security/payment risk: Yüksek; invalid/duplicate webhook double-credit riski gerçek provider ile kapanmadı.
Design/template risk: Yok.
Reproduction steps: Sandbox Shopier/Cryptomus valid/invalid/duplicate callback/webhook.
Expected result: Sadece valid verified callback/webhook tek kez credit eder.
Actual result: Env yok; provider E2E blocked/partial unit coverage.
Evidence: Payment/security reports.
Root cause hypothesis: Rotated sandbox credentials ve no-real-money test ortamı eksik.
Files likely involved: Env/runbook/tests; code only if retest fails.
Can be fixed without visual design change? YES/UNKNOWN
Recommended fix: Provider secrets rotate edilip sandbox E2E yapılmalı; gerçek secret dosyaya yazılmamalı.
Recommended phase: Phase 2C/2G
Needs user approval? YES for real provider credentials
Status: Blocked

## R-BUG-008

Title: Admin full browser click-through ve audit kapsamı partial.
Source reports: `ADMIN_REPORT.md`, `QA_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
Area: Admin
Type: Admin, Security, Test gap
Severity: Medium
User impact: Admin panelde tüm kritik tabların gerçek kullanım güveni eksik.
Business impact: Operasyonel yönetim ve destek riski.
Security/payment risk: Orta; admin mutation/audit coverage tam kanıtlanmadı.
Design/template risk: Yok.
Reproduction steps: Admin user session ile tüm admin tab/actions browser click-through ve audit check.
Expected result: Her tab çalışır, sensitive action auditlenir.
Actual result: Static/API partial pass, full browser UAT eksik.
Evidence: Admin report.
Root cause hypothesis: Credential/test data eksik; bazı audit kapsamları doğrulanmadı.
Files likely involved: Admin tests/scripts; code only if retest fails.
Can be fixed without visual design change? YES/UNKNOWN
Recommended fix: Admin UAT script/manuel checklist ile retest; eksik audit varsa ayrı fix.
Recommended phase: Phase 2E/2G
Needs user approval? YES for live admin session
Status: Planned/Blocked for live credential

## R-BUG-009

Title: Canlı deploy lokal fixlerden geride.
Source reports: `QA_REPORT.md`, `UAT_END_USER_REPORT.md`, `AUTOMATED_TESTS_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
Area: Deployment
Type: Environment/build, Frontend functional
Severity: Medium
User impact: Canlı kullanıcı lokal düzeltilmiş `/sss` ve `/admin` route davranışını görmüyor.
Business impact: Launch smoke canlıda geçmiyor.
Security/payment risk: Düşük/orta; admin login exposure doğru doğrulanamıyor.
Design/template risk: Deploy farkı dışında yok.
Reproduction steps: `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`.
Expected result: 10/10 PASS.
Actual result: 6/10 FAIL, `/sss` ve `/admin` içerik hatası.
Evidence: UAT/automation/readiness reports.
Root cause hypothesis: Local commit deploy edilmemiş veya canlı bundle eski.
Files likely involved: Deploy scripts/VPS; no code until current fixes validated.
Can be fixed without visual design change? YES
Recommended fix: GitHub backup + QA gate sonrası deploy; canlı smoke tekrar.
Recommended phase: Phase 2G
Needs user approval? YES for deploy
Status: Deferred

## R-BUG-010

Title: Favicon/static 404 ve visual baseline eksik.
Source reports: `UAT_END_USER_REPORT.md`, `LAUNCH_READINESS_REPORT.md`, `SECURITY_REPORT.md`
Area: Static/visual verification
Type: Low priority UX, Test gap
Severity: Low
User impact: Minor console noise.
Business impact: Düşük.
Security/payment risk: Düşük.
Design/template risk: Orta if asset/style touched.
Reproduction steps: Chrome smoke console/network.
Expected result: No unexplained static 404; baseline screenshots captured before frontend edits.
Actual result: One local console 404 likely favicon/static; no baseline.
Evidence: UAT/readiness/security reports.
Root cause hypothesis: Missing static asset or browser default favicon request.
Files likely involved: Public/static assets, visual reports; no style changes.
Can be fixed without visual design change? UNKNOWN
Recommended fix: Capture visual baseline before frontend edits; static 404 cleanup only if asset path confirmed and no template change.
Recommended phase: Phase 2G
Needs user approval? NO for report; YES if visual asset/template change needed
Status: Planned
