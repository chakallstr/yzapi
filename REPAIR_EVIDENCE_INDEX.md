# YapayZekaLab Repair Evidence Index

Bu indeks yalnızca mevcut QA raporlarında kanıtlanmış veya açıkça bloklu olarak işaretlenmiş bulguları içerir.

## R-BUG-001 — `/v1` Public Catalog Endpointleri Yok

- Source report file: `QA_FINAL_REPORT.md`, `API_TEST_REPORT.md`, `BACKEND_TEST_REPORT.md`, `FRONTEND_BACKEND_CONSISTENCY_REPORT.md`, `BUG_LIST.md`, `FIX_PLAN.md`, `LAUNCH_READINESS_REPORT.md`
- Section/title: API/backend/frontend-backend consistency
- Exact failure summary: `GET /v1/models`, `GET /v1/providers`, `GET /v1/models/count` JSON `404 Not found` dönüyor.
- Related endpoint/page/component: `/v1/models`, `/v1/providers`, `/v1/models/count`
- Reproduction evidence: 60 dakika koşusunda ve post-checklerde endpointler 404; `API_TEST_REPORT.md` her üç endpointi 404 olarak listeliyor.
- Affected area: API, frontend/backend consistency, developer docs
- Severity suggested by original report: High
- Status: Confirmed

## R-BUG-002 — Runtime Stabilite Sorunu

- Source report file: `60_MINUTE_SITE_TEST_REPORT.md`, `SECURITY_RISK_REPORT.md`, `ENVIRONMENT_REPORT.md`, `BUG_LIST.md`, `LAUNCH_READINESS_REPORT.md`
- Section/title: Runtime/endurance
- Exact failure summary: 60 dakikalık testte port/listener `ERR_CONNECTION_REFUSED`, Docker/Postgres kapalıyken DB bağımlı endpointlerde 500/503 ve elle restart ihtiyacı görüldü.
- Related endpoint/page/component: Local dev runtime, DB-backed endpoints, `/health`
- Reproduction evidence: `BUG_LIST.md` runtime port refusal ve Docker/Postgres kesintisini listeliyor; `ENVIRONMENT_REPORT.md` Docker daemon kapalıyken migration `ECONNREFUSED` notu içeriyor.
- Affected area: Environment/build/runtime
- Severity suggested by original report: Critical
- Status: Confirmed operational blocker

## R-BUG-003 — Google OAuth 503

- Source report file: `QA_FINAL_REPORT.md`, `SECURITY_REPORT.md`, `SECURITY_RISK_REPORT.md`, `ENVIRONMENT_REPORT.md`, `BUG_LIST.md`, `LAUNCH_READINESS_REPORT.md`
- Section/title: Auth/OAuth
- Exact failure summary: Lokal `/api/auth/google` `503 google oauth not configured` döndü.
- Related endpoint/page/component: `/api/auth/google`, Google login button
- Reproduction evidence: Raporlarda OAuth env yokluğu ve 503 açıkça kayıtlı.
- Affected area: Auth, onboarding
- Severity suggested by original report: High
- Status: Confirmed in local env; production env/callback verification blocked

## R-BUG-004 — Docs/API Örnekleri Görünür veya Doğrulanır Değil

- Source report file: `QA_FINAL_REPORT.md`, `FRONTEND_BACKEND_CONSISTENCY_REPORT.md`, `UAT_END_USER_REPORT.md`, `BUG_LIST.md`, `FIX_PLAN.md`
- Section/title: Docs/API tab
- Exact failure summary: `/docs` veya API alanında beklenen CloseRouter/OpenAI uyumlu YapayZekaLab entegrasyon örnekleri görünür/doğrulanır durumda değil; mevcut örneklerin backend sözleşmesiyle uyumu kanıtlanmadı.
- Related endpoint/page/component: `/docs`, API tab, code examples
- Reproduction evidence: UAT raporları docs/API görünürlük ve doğrulama eksikliğini işaretliyor; frontend kaynakta örnekler eski `https://api.yapayzekalab.com/v1/chat/completions` URL'sini içeriyor.
- Affected area: Frontend functional, docs, UX clarity
- Severity suggested by original report: Medium/High
- Status: Confirmed mismatch

## R-BUG-005 — Video Desteği Durumu Net Değil

- Source report file: `FRONTEND_BACKEND_CONSISTENCY_REPORT.md`, `BUG_LIST.md`, `API_GATEWAY_REPORT.md`
- Section/title: Models/video capability
- Exact failure summary: UI video modelleri gösteriyor, fakat backend video endpointleri production-ready değil ve 501/beta/sınırlı durum net anlatılmıyor.
- Related endpoint/page/component: Models tab video cards, FAQ/API docs, `/v1/videos/submit`, `/v1/videos/tasks/:taskId`
- Reproduction evidence: `API_GATEWAY_REPORT.md` video endpointleri expected 501 olarak işaretli; consistency raporu UI'ın bu durumu net göstermediğini söylüyor.
- Affected area: Frontend/backend consistency, UX clarity
- Severity suggested by original report: Medium
- Status: Confirmed clarity issue

## R-BUG-006 — Successful Billing Flow Doğrulanmadı

- Source report file: `QA_FINAL_REPORT.md`, `API_TEST_REPORT.md`, `API_GATEWAY_REPORT.md`, `QA_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
- Section/title: API billing/balance
- Exact failure summary: Valid funded `yzk_live_*` key olmadığı için successful text inference, `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`, `X-YZ-Request-Id`, balance decrement ve `usage_records` gerçek akışta doğrulanmadı.
- Related endpoint/page/component: `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, usage records
- Reproduction evidence: API raporları valid-key testlerini blocked olarak işaretliyor.
- Affected area: API, billing, database, launch readiness
- Severity suggested by original report: High test blocker
- Status: Blocked by missing safe funded key/upstream env

## R-BUG-007 — Payment Provider E2E Doğrulanmadı

- Source report file: `PAYMENT_BILLING_REPORT.md`, `SECURITY_REPORT.md`, `QA_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
- Section/title: Payment/billing
- Exact failure summary: Shopier/Cryptomus init/callback/webhook gerçek veya sandbox uçtan uca doğrulanmadı; provider env yok.
- Related endpoint/page/component: `/api/payments/shopier/*`, `/api/payments/crypto/*`, payment modal/admin payments
- Reproduction evidence: Payment report provider env blocked ve only partial signature coverage olarak işaretliyor.
- Affected area: Payment, billing, security
- Severity suggested by original report: High test blocker
- Status: Blocked by missing rotated sandbox credentials

## R-BUG-008 — Admin Full Browser Click-Through Partial

- Source report file: `ADMIN_REPORT.md`, `QA_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
- Section/title: Admin
- Exact failure summary: Admin auth/guardlar lokal API/statik olarak geçti, fakat tüm admin tabların gerçek browser click-through ve audit kapsamı tamamlanmadı.
- Related endpoint/page/component: Admin panel, admin API endpoints, audit logs
- Reproduction evidence: `ADMIN_REPORT.md` full browser click-through ve audit partial olarak işaretliyor.
- Affected area: Admin, security, release readiness
- Severity suggested by original report: Medium
- Status: Partial/blocker for final launch confidence

## R-BUG-009 — Live Deploy Farkı

- Source report file: `QA_REPORT.md`, `UAT_END_USER_REPORT.md`, `AUTOMATED_TESTS_REPORT.md`, `LAUNCH_READINESS_REPORT.md`
- Section/title: Live UAT
- Exact failure summary: Lokal `qa:uat` 10/10 PASS iken canlı `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` 6/10 FAIL; `/sss` ve `/admin` doğru içerik göstermiyor.
- Related endpoint/page/component: Live SPA routes `/sss`, `/admin`, deploy pipeline
- Reproduction evidence: Live UAT report 6/10 FAIL olarak kayıtlı.
- Affected area: Deployment, frontend route behavior
- Severity suggested by original report: Medium
- Status: Confirmed live/local drift

## R-BUG-010 — Static/Favicon 404 ve Görsel Baseline Eksik

- Source report file: `UAT_END_USER_REPORT.md`, `LAUNCH_READINESS_REPORT.md`, `SECURITY_REPORT.md`
- Section/title: Visual/static polish
- Exact failure summary: Lokal admin route smoke sırasında tek console 404 var; favicon/static kaynak olabilir. Görsel regresyon baseline yok.
- Related endpoint/page/component: Static assets, visual lock evidence
- Reproduction evidence: UAT raporu tek console 404 notu; readiness report favicon/static cleanup önerisi.
- Affected area: Low-priority UX/visual verification
- Severity suggested by original report: Low/Medium
- Status: Confirmed minor/open
