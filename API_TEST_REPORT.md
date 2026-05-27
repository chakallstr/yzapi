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
