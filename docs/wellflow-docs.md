# Wellflow Documentation (yakalanmış arşiv)

> Kaynak: https://wellflow.dev/docs · Yakalama: 2026-05-31T11:39:57Z · 40 sayfa.
> Bu, aktif upstream sağlayıcı (wellflow) resmi dokümanının yerel kopyasıdır.
> FATURALAMA-KRİTİK alanlar için bkz. en altta "BILLING-KRİTİK ÖZET (agent notu)".

## Temel gerçekler

- **AI gateway**, tek endpoint, OpenAI + Anthropic formatı. Prepaid bakiye.
- Base URL: `https://apiawellflow.dev` (Anthropic/Claude Code `/v1` OLMADAN; OpenAI formatı `/v1` ile).
- Key formatı: `wf_` + 48 karakter.
- Router providerları: Wellflow Router (GPT/Claude/Llama/Gemini) + Anthropic (direct Claude).

## Endpoint'ler

- `POST /v1/chat/completions` (OpenAI) — usage: `prompt_tokens`, `completion_tokens`, `total_tokens`. max_tokens limiti dokümanda 2048 yazıyor.
- `POST /v1/messages` (Anthropic) — usage: `input_tokens`, `output_tokens`.
- `POST /v1/messages/count_tokens` — istek çalıştırmadan token sayar (sadece Anthropic).
- `GET /v1/models` — model listesi.
- `GET /v1/models/info` — **fiyat alanları dahil** (aşağıda kritik).
- `GET /v1/balance` — `balance_cents`, lifetime token sayaçları.
- `GET /v1/usage` — istek başı `cost_cents` (GERÇEK upstream maliyet, cursor pagination).
- `POST /v1/responses` — Claude Code/Codex/Agents SDK formatı. usage: input/output/total_tokens.
- `POST /v1/web-search`, `GET /health`.

## GET /v1/models/info — FİYAT ALANLARI (KRİTİK)

Örnek (Claude Sonnet 4):
```json
{
  "id": "claude-sonnet-4-20250514",
  "max_input_tokens": 200000,
  "max_output_tokens": 8192,
  "input_price_per_1m": 3.00,
  "output_price_per_1m": 15.00,
  "cache_write_price_per_1m": 3.00,
  "cache_read_price_per_1m": 3.00
}
```
Alanlar: `input_price_per_1m`, `output_price_per_1m`, `cache_write_price_per_1m`, `cache_read_price_per_1m` — USD/1M token.
Auth opsiyonel (key verilirse bireysel fiyat yansır).

> ⚠️ Örnekte `cache_read_price_per_1m (3.00) == input_price_per_1m (3.00)`. Yani wellflow
> cache-read'i bu örnekte TAM giriş fiyatından gösteriyor (Anthropic-native 0.1× İNDİRİMİ YOK).
> GERÇEK opus-4-7 / haiku-4-5 değerleri canlı endpoint'ten doğrulanmalı (örnek illüstratif olabilir).

## Pricing / Rezervasyon

- Maliyet formülü: `cost = (tokens / 1e6) × price_per_million × (1 + markup%)`. Input/output ayrı.
- Rezervasyon: `reserve = (max_tokens × $0.0006) + $0.10`. Min hold $0.10. max_tokens yoksa default 2048.
  Hold 5 dk sonra otomatik düşer (bizim orphan-reaper Y3 ile aynı mantık).
- Top-up min $1.00.

## Modeller / aliaslar (Cursor)

cursor47→claude-opus-4.7, cursor46→opus-4.6, cursor45→opus-4.5, cursor46s→sonnet-4.6,
cursor45s→sonnet-4.5, cursor45h→haiku-4.5, cursorgpt54→gpt-5.4, cursorgpt55→gpt-5.5,
cursorgemini→gemini-3.1-pro-preview. Model adı tire/nokta esnek.

## Hata kodları

400 model_required/unknown_model/bad_request/context_length_exceeded · 401 unauthorized ·
402 insufficient_quota/account_frozen · 429 rate_limited/queue_full/queue_timeout ·
500 server_error · 501 not_implemented. context_length_exceeded ekstra alanlar:
`context_limit`, `estimated_input_tokens`.

## IDE entegrasyonları

- Claude Code: `ANTHROPIC_BASE_URL=https://api.wellflow.dev` (/v1 YOK), responses API default.
- Codex: `base_url=https://api.wellflow.dev/v1`, `wire_api=responses`.
- Cline/Kilo: OpenAI Compatible `…/v1`. Roo Code: Anthropic `…` (/v1 yok).

## Reseller API (/reseller/v1) — KRİTİK (maliyet şeffaflığı)

- Auth: `Authorization: Bearer RESELLER_MASTER_KEY`.
- Header `X-Wellflow-Reseller: true` → SSE sonuna maliyet ekler:
  `data: {"usage": {...}, "cost_cents": 0.29}` (gerçek zamanlı maliyet).
- Header `X-WF-Hide: 1` → /v1/models/info fiyatları sıfırlar, branding gizler (white-label).
- `GET /reseller/v1/usage/events` → istek başı: `cost_cents`, **`cost_retail_cents`** (son-müşteri fiyatı),
  **`cost_your_cost_cents`** (SENİN upstream maliyetin), provider, model, input/output_tokens.
- `GET /reseller/v1/me` → master_wallet.balance_cents, limitler (rps/rpm/concurrency).
- Sub-org yönetimi, topup/withdraw, custom pricing (price_in/out_per_million_cents, >= base),
  webhooks (balance_low/depleted/topup, key.revoked).

---

# BILLING-KRİTİK ÖZET (agent notu — 2026-05-31)

1. **Cache fiyatı upstream'de görünür:** `/v1/models/info` her model için `cache_read_price_per_1m`
   ve `cache_write_price_per_1m` döndürür. Dokümandaki örnekte cache_read = input price (TAM fiyat,
   0.1× indirim YOK). → Bizim `normalizeProviderUsage`'da cache-read'i 1.0× faturalamamız, wellflow
   bize 1.0× kesiyorsa DOĞRUDUR; 0.1×'e indirmek BİZİ ZARARA sokar. KESİN karar için canlı
   `/v1/models/info` (opus-4-7, haiku-4-5) okunmalı.
2. **Gerçek maliyet kanıtı reseller endpoint'inde:** Eğer key reseller ise `GET /reseller/v1/usage/events`
   → `cost_your_cost_cents` bize ne kesildiğini token-token verir. Normal key ise `GET /v1/usage` →
   istek başı `cost_cents`.
3. **Rezervasyon modeli birebir bizimkine benziyor** (reserve+hold+5dk expiry) → kendi reserve/settle
   mantığımızla uyumlu.
