# API TEST REPORT

Durum: 60 dakikalık site testi sonrası doldurulacak.
# API Test Report — 2026-05-26

## Sonuç
- Genel API sonucu: `PARTIAL / BLOCKED`
- Authsuz ve invalid-auth güvenlik kontrolleri çalıştı.
- Valid `yzk_live_*` anahtar olmadığı için başarılı text inference, billing header, balance düşümü ve usage_records doğrulaması bloklu.
- Paid image/video testi yapılmadı.

## Endpoint Sonuçları
- `GET /v1/__qa_missing_route__`: `404`, JSON.
- `POST /v1/chat/completions`: `401`, JSON.
- `POST /v1/responses`: `401`, JSON.
- `POST /v1/messages`: `401`, JSON.
- `POST /v1/images/generations`: `401`, JSON.
- `POST /v1/images/edits`: `401`, JSON.
- `POST /v1/videos/submit`: `401`, JSON.
- `GET /v1/videos/tasks/qa-test-task`: `401`, JSON.

## Blokajlar
- `GET /v1/models`: `404`.
- `GET /v1/providers`: `404`.
- `GET /v1/models/count`: `404`.
- Valid kullanıcı API anahtarı yok.
- Upstream CloseRouter health local ortamda `unknown`.

---

# Live API/Billing Retest Update — 2026-05-27 02:50 TRT

## Sonuç

- Genel API sonucu: `PARTIAL / BLOCKED_BY_UPSTREAM_INFERENCE`.
- Canlı public katalog deploy sonrası düzeldi: `/v1/models`, `/v1/providers`, `/v1/models/count` artık live smoke kapsamından geçti.
- Canlı auth/security negatif yollar çalıştı: authsuz `/v1/chat/completions` JSON `401` döndü.
- İzole canlı test kullanıcıları ve test API keyleri oluşturuldu, raw key değerleri rapora/loga yazılmadı, test sonrası salt-okuma DB kontrolünde `qa-live-billing-*` test satırı kalmadı.
- Zero-balance test key ile küçük text çağrısı `402` döndü; provider harcaması yapılmadı.
- Invalid key testi `401` döndü.
- Funded key ile başarılı ücretli text inference hâlâ doğrulanamadı; gateway çağrıları ve doğrudan CloseRouter inference çağrıları `502 upstream_error` verdi.

## Direct CloseRouter Provider Evidence

Masrafsız/güvenli kontroller:

- `GET /credits`: `200`, `total_credits ~= 1.99998845`, `total_usage ~= 0.00001155`.
- `GET /models/count`: `200`, `count = 34`.
- `GET /models?output_modalities=text`: `200`, `18` text model döndü.
- Model endpoint metadata: `anthropic/claude-haiku-4.5`, `deepseek/deepseek-v4-pro`, `openai/gpt-5.4-mini`, `moonshotai/kimi-k2.5` için `200`.

Inference kontrolleri:

- Direct `POST /chat/completions` `openai/gpt-5.4-mini`: `502`, `upstream_connection_refused`.
- Direct `POST /chat/completions` `anthropic/claude-haiku-4.5`: `502`, `upstream_connection_refused`.
- Direct `POST /chat/completions` `deepseek/deepseek-v4-pro`: `502`, `upstream_connection_refused`.
- Direct `POST /chat/completions` `google/gemini-3.1-flash-lite-preview`: `502`, `upstream_connection_refused`.
- Direct `POST /responses` `openai/gpt-5.4-mini`: `502`, `upstream_connect_timeout`.
- `qwen/qwen3-235b` and `z-ai/glm-4.32b` direct calls returned `400 model unavailable`; these were not valid success candidates.

## Billing Acceptance Status

- PASS: API key auth rejection for invalid/no-auth.
- PASS: Low-balance rejection path returns safe `402`.
- PASS: Upstream failure path records zero-cost error usage and does not decrement test balance.
- PASS: Direct provider diagnostics show account/key/catalog/balance are present.
- BLOCKED: Successful text response, `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`, `X-YZ-Request-Id`, positive cost deduction, `transactions`, and success `usage_records` cannot be accepted until CloseRouter inference returns a successful response.

Final API verdict remains: `NOT READY — API/BILLING/BALANCE BLOCKERS`.

---

# Live API/Billing Recheck — 2026-05-27 10:20 TRT

## Direct Provider Status

- `/credits`: `200`, `total_credits=1.99998845`, `total_usage=0.00001155`.
- `/models/count`: `200`, `count=34`.
- Tiny `/chat/completions` calls with `max_tokens <= 4` timed out for:
  - `anthropic/claude-haiku-4.5`
  - `openai/gpt-5.4-mini`
  - `deepseek/deepseek-v4-pro`
  - `google/gemini-3.5-flash`
  - `moonshotai/kimi-k2.5`
  - `qwen/qwen3.6-plus`

No image/video calls were made. No provider key was printed.

## Updated API Verdict

The account/catalog/balance side of CloseRouter is reachable, but inference remains unavailable from the live VPS. Do not run larger token tests or claim successful YapayZekaLab billing until at least one tiny direct provider call succeeds, then a funded `yzk_live_*` gateway call proves cost headers, transaction, usage record and balance decrement.

---

# Live API/Billing Diagnostic — 2026-05-27 10:31 TRT

## Current Catalog and Endpoint Evidence

- Base URL from live VPS env: `https://api.closerouter.dev/v1`.
- Live provider key exists and has the expected `closerouter_` prefix; the key value was not printed.
- `/credits`: `200`, `total_credits=1.99998845`, `total_usage=0.00001155`.
- `/models?output_modalities=text`: `200`, `18` text models, `18` chat-capable models.
- Current low-cost chat candidates from live catalog:
  - `deepseek/deepseek-v4-pro`
  - `google/gemini-3.1-flash-lite-preview`
  - `mimo/mimo-v2-pro`
  - `minimax/minimax-m2.7`
  - `openai/gpt-5.4-mini`
  - `qwen/qwen3.6-plus`

## Bounded Inference Evidence

- `POST /chat/completions` `deepseek/deepseek-v4-pro`: `502`, `upstream_connection_refused`, request id `c2c53a5e-1cd3-474d-8136-17da70c0d922`.
- `POST /chat/completions` low-cost current catalog candidates above: all returned `502 upstream_error` after roughly 21 seconds.
- `POST /messages` `anthropic/claude-haiku-4.5`: `502`, `upstream_connect_timeout`, request id `98a159de-f6df-4a97-a7e6-78516f90bf65`.
- No image/video calls were made. No secret values were printed.

## Updated Root Cause Assessment

The failure is not caused by YapayZekaLab using stale model IDs. Live catalog and credits are reachable, but CloseRouter's inference route returns provider-level `502` for both OpenAI-style chat and Anthropic-style messages. Successful funded YapayZekaLab billing remains blocked until CloseRouter inference returns at least one successful text response.

---

# Heartbeat Live API/Billing Recheck — 2026-05-27 11:01 TRT

## Safe Live Smoke

- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`: PASS for `/health`, `/status`, `/api/models`, authless `/v1/chat/completions` `401`, unknown `/api/*` JSON `404`, and unknown `/v1/*` JSON `404`.
- Successful gateway chat and low-balance gateway smoke were skipped because no safe `SMOKE_API_KEY` / `SMOKE_LOW_BALANCE_API_KEY` was present in the local env.

## Direct CloseRouter VPS Evidence

- Source: live VPS app environment under `/opt/turkapiprojesi`; provider key presence/prefix checked without printing the key.
- `/credits`: `200`, `total_credits=1.99998845`, `total_usage=0.00001155`.
- `/models/count`: `200`, `count=34`.
- `/models?output_modalities=text`: `200`, `18` text models; chat-capable candidates included `anthropic/claude-haiku-4.5`, `anthropic/claude-opus-4.6`, `anthropic/claude-opus-4.7`, `anthropic/claude-sonnet-4.6`, `deepseek/deepseek-v4-pro`, `google/gemini-2.5-pro`, `google/gemini-3.1-flash-lite-preview`, `google/gemini-3.1-pro-preview`.
- Exactly one tiny text inference was attempted: `POST /chat/completions` with `model=deepseek/deepseek-v4-pro`, `max_tokens=4`.
- Result: `502`, `upstream_error`, request id `b00967ca-09ae-4ffa-8a64-7d78f14d9cb5`, elapsed about `21.6s`, no usage returned.
- No image/video generation was run. No payment flow was touched. No secret values were printed.

## Updated API Verdict

Direct provider inference is still not resolved. Because the direct tiny inference failed, the funded YapayZekaLab gateway billing verification was not run. Successful API billing remains blocked until a direct text inference succeeds, then a safe funded `yzk_live_*` gateway key can prove billing headers, balance decrement, transaction ledger and success `usage_records`.

---

# Temporary OmniRoute Provider Check — 2026-05-27 18:28 TRT

## Reason

CloseRouter direct inference remains unreliable (`502 upstream_error`). User requested temporary OmniRoute usage.

## Safe Evidence

- Live YapayZekaLab smoke stayed PASS: `/health`, `/status`, `/api/models`, authless `/v1/chat/completions` `401`, unknown `/api/*` and `/v1/*` JSON `404`.
- Public OmniRoute endpoint `https://api.seslab.tr/v1/models` returns `401 AUTH_002` without a valid OmniRoute key, as expected.
- Live VPS has an `omniroute` container bound to `127.0.0.1:20128`.
- Existing YapayZekaLab live env only has `CLOSEROUTER_API_KEY` / `CLOSEROUTER_BASE_URL`; no dedicated OmniRoute env was present.
- The current CloseRouter key does not authenticate against OmniRoute; both `Authorization` and `x-api-key` returned `401 AUTH_002`.
- OmniRoute DB contains one active API key; the raw key was not printed.
- Authenticated direct OmniRoute `/v1/models` returned `200`, `70` models.
- One direct tiny OmniRoute text request returned `200` with `model=kr/claude-haiku-4.5`, request id `chatcmpl-1779896002128`, and usage `total_tokens=6125`, `prompt_tokens=6124`, `completion_tokens=1`.

## Billing Risk

OmniRoute inference works, but its tiny call reported a large prompt token count. Because YapayZekaLab bills from provider-reported usage, switching live traffic to OmniRoute without a funded gateway billing test could overcharge or distort customer usage. Live env was not switched in this heartbeat.

## Updated API Verdict

OmniRoute is a viable temporary upstream candidate, but production gateway billing remains blocked until a rollbackable env switch is made with a safe funded `yzk_live_*` test key and the billing headers, balance decrement, transaction ledger and `usage_records` are verified against OmniRoute usage.

---

# Live OmniRoute Gateway Billing Retest — 2026-05-27 19:28 TRT

## Reason

CloseRouter inference remained unavailable. The live YapayZekaLab service was already switched to the temporary OmniRoute upstream with a rollback path. This retest verifies the real customer gateway path, not just direct provider access.

## Safe Evidence

- Temporary live test user marker: `qa-omni-recheck-1779899269150`.
- Temporary funded `yzk_live_*` key was created only in the live DB for this test; raw key was not printed.
- Request: live service-local `/v1/chat/completions`, client model `openai/gpt-5.4-mini`, `max_tokens=4`.
- Result: `200`, response contained choices.
- Billing headers present:
  - `X-YZ-Cost-TL`: `0.0329`
  - `X-YZ-Remaining-TL`: `49.97`
  - `X-YZ-Request-Id`: present
- DB after call:
  - user balance: `49.9671`
  - total spend: `0.0329`
  - total requests: `1`
  - `usage_records.status`: `success`
  - `usage_records.model_id`: `openai/gpt-5.4-mini`
  - input usage: `2022`
  - output usage: `66`
  - usage cost TL: `0.0329`
  - usage remaining TL: `49.9671`
  - error code: `null`
- Cleanup: temporary test user leftovers `0`.

## Updated API Verdict

API text billing through the temporary OmniRoute GPT path is now accepted for the bounded funded-key happy path. CloseRouter itself is still unhealthy, so the launch dependency is now provider-routing/operations rather than YapayZekaLab gateway billing code. Continue monitoring OmniRoute usage because earlier direct OmniRoute tests showed unexpectedly large reported token counts on one Claude route; the live GPT route billed a small amount but still used estimated/provider usage fallback.

---

# Safe API Smoke Recheck — 2026-05-27 20:52 TRT

## Commands

- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`
- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`

## Result

- Live UAT smoke: PASS 10/10, report `qa-artifacts/uat-smoke-2026-05-27T17-51-32-980Z/uat-smoke-report.md`.
- Live backend smoke: PASS for `/health`, `/status`, `/api/models`, authless `/v1/chat/completions` `401`, unknown `/api/*` JSON `404`, and unknown `/v1/*` JSON `404`.
- Funded and low-balance gateway smoke were skipped because no safe `SMOKE_API_KEY` / `SMOKE_LOW_BALANCE_API_KEY` was present in the local env for this run.
- No image/video generation was run.
- No real payment flow was touched.
- No secret values were printed.

## Current API Verdict

Temporary OmniRoute happy-path text billing remains previously accepted from the live funded-key retest. This recheck did not rerun funded billing because safe key env was absent; it only confirms public/system/authless API smoke remains healthy while local OAuth/payment guard fixes await deploy.

---

# Local Claude Popusk Migration API Contract Retest — 2026-05-28 14:34 TRT

## Scope

- Local code migration only; no live deploy, no real payment, no image/video generation.
- Main provider base abstraction now supports `AI_PROVIDER_BASE_URL` with Claude Popusk as default and legacy env fallback.
- Active public model catalog is text-only and canonical.

## Evidence

- Targeted API/catalog/pricing/docs regression PASS: 8 files / 48 tests.
- Full local regression PASS: 31 files / 141 tests.
- `npm run lint` PASS.
- `npm run build` PASS after updating the old-theme URL guard.
- `npm run scan:public` PASS, 0 hits.
- `node scripts/scan-secrets.mjs` PASS, 0 hits.

---

# Remaining Safe API/UAT Tests With Provider Payment E2E Excluded — 2026-05-28 15:01 TRT

## Scope

- User removed Shopier/Cryptomus provider E2E from required scope.
- No real payment.
- No image/video generation.
- No paid provider inference.
- No customer-data mutation.

## Results

- Local regression PASS: 31 files / 143 tests.
- Lint PASS.
- Build PASS.
- Public bundle scan PASS: 0 hits.
- Secret scan PASS: 235 scanned / 0 hits.
- Live smoke PASS:
  - `/health` ok, DB ok.
  - `/status` ok.
  - `/api/models` reachable.
  - Authless `/v1/chat/completions` returns 401.
  - Unknown `/api/*` and `/v1/*` return JSON 404.
- Live UAT smoke PASS: 10/10, report `qa-artifacts/uat-smoke-2026-05-28T12-00-34-459Z/uat-smoke-report.md`.

## Remaining API Gaps

- Live smoke skipped successful funded chat because `SMOKE_API_KEY` was absent.
- Live smoke skipped low-balance check because `SMOKE_LOW_BALANCE_API_KEY` was absent.
- Live `/api/models` still reports 33 models; local Claude Popusk catalog has 42. The latest local catalog/pricing work is not deployed yet.

---

# Full E2E API Retest — 2026-05-28 15:12 TRT

## Local Production API

- Local DB started with Docker Postgres.
- Migrations and seed completed.
- Local production server started on `127.0.0.1:4567`.
- Smoke PASS with expected 42 models.
- Local UAT PASS 10/10.

## API Negative/Balance Safety

Temporary local API key rows were created and deleted.

- No auth chat: 401 JSON.
- Invalid key chat: 401 JSON.
- Revoked key chat: 401 JSON.
- Low balance chat: 402 JSON.
- Unknown model: 404 JSON.
- Malformed JSON: found 500, fixed, then PASS 400 JSON.
- No auth messages: 401 JSON.
- No auth image generation: 401 JSON.

## Successful Funded Billing

Not completed.

Reason: no safe provider/live `SMOKE_API_KEY` is present in env, and no provider key is stored in the local env. This test still requires a safe funded test key and a configured provider env after deploy.

## API Status

- Local contracts cover `/v1/models`, `/v1/models/count`, `/v1/providers`, model canonicalization, no-auth gateway separation, text pricing and safe-disabled media endpoints.
- Live funded Claude Popusk inference/billing was not run in this change.
- Launch API verdict remains blocked until a live rollbackable deploy plus safe funded `yzk_live_*` billing retest verifies headers, balance decrement and `usage_records` on the selected upstream.

---

# Direct Claude Popusk Key Probe — 2026-05-28 14:40 TRT

## Scope

- User-provided provider key tested directly against `https://api.claude-popusk.shop/v1`.
- Key was not printed, committed, or copied into reports.
- No image/video generation and no payment actions.

## Result

- `GET /models`: PASS, `200`, `42` models.
- `POST /chat/completions`: PASS, model `gpt-5.4-mini`, `200`, answer `ok`, usage `9` total tokens.
- `POST /messages`: PASS, model `claude-haiku-4-5-20251001`, `200`, answer `ok`, usage `11` input / `1` output token.
- `POST /responses`: FAIL/UNSUPPORTED, `404 not_found`.
- Direct provider `/models/count`, `/providers`, `/credits`: unsupported on this provider path (`404`). YapayZekaLab local gateway still owns public `/v1/models/count` and `/v1/providers`.

## Code Adjustment From Probe

- Removed active `responses` support from model catalog endpoint metadata.
- Public copy now says `/v1/responses` can return JSON error/no charge when this provider path does not support it.

## Regression

- Targeted tests PASS: 5 files / 26 tests.
- Full tests PASS: 31 files / 141 tests.
- `npm run lint` PASS.
- `npm run build` PASS.
- `npm run scan:public` PASS, 0 hits.
- `node scripts/scan-secrets.mjs` PASS, 0 hits.

---

# Claude Popusk Public Pricing and Ordering Retest — 2026-05-28 14:53 TRT

## Scope

- Local catalog/UI data ordering only.
- No provider call, no real payment, no image/video generation.
- Public price table added at `CLAUDE_POPUSK_PRICE_TABLE.md`.

## Result

- Basic text tier: `$0.62/M`.
- Standard GPT/o-series tier: `$1.00/M`.
- Premium Claude Opus 4.7 / GPT 5.5 tier: `$1.20/M`.
- Backend `MASTER_MODELS` and frontend model display order are aligned by explicit contract test.
- Model list order is cheapest-first, with older/cheaper families before newer/premium entries.

## Regression

- RED order test first failed against the previous premium-first catalog.
- Targeted tests PASS: 2 files / 10 tests.
- Full tests PASS: 31 files / 143 tests.
- `npm run lint` PASS.
- `npm run build` PASS.
- `npm run scan:public` PASS, 0 hits.
- `node scripts/scan-secrets.mjs` PASS, 0 hits.
