# YapayZekaLab API Sistemi 2 Saatlik Araştırma Raporu

- Durum: devam ediyor
- Run ID: `2026-05-24T15-26-10-100Z`
- Başlangıç: 2026-05-24T15:26:10.100Z
- Bitiş hedefi: 2026-05-24T17:26:10.100Z
- Kalan süre: 7030 sn
- Toplam benzersiz repo: 115
- Toplam code hit: 0
- Toplam bulgu: 107

## Agent Hatları

### Backend / Provider / Router

OpenAI-compatible proxy, provider adapter, streaming billing, catalog sync, fallback router, image/video task flow.

- Cycle: 8
- Son query: `"videos/tasks" "polling"`
- Repo araması: 8
- Code araması: 4
- Repo: 59
- Code hit: 0
- Bulgu: 54
- Son olay: code search: "videos/tasks" "polling"
### Billing / Security / Ops / Panel

TL prepaid wallet, append-only ledger, API key lifecycle, webhook idempotency, rate limit, audit, customer/admin panel, deploy/observability.

- Cycle: 8
- Son query: `"rate limit" "api key" "redis"`
- Repo araması: 8
- Code araması: 4
- Repo: 56
- Code hit: 0
- Bulgu: 53
- Son olay: code search: "rate limit" "api key" "redis"

## En Güçlü Repo Adayları

| Repo | Skor | Star | Sinyal | Neden |
| --- | --- | --- | --- | --- |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | 193 | 48094 | usage-metering, openai-compatible, provider-adapter, streaming, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [apache/apisix](https://github.com/apache/apisix) | 182 | 16632 | provider-adapter, streaming, wallet-ledger, api-key-security, rate-limit, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [maximhq/bifrost](https://github.com/maximhq/bifrost) | 177 | 5183 | wallet-ledger, openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, rate-limit, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [Kong/kong](https://github.com/Kong/kong) | 176 | 43435 | provider-adapter, streaming, rate-limit, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [tensorzero/tensorzero](https://github.com/tensorzero/tensorzero) | 169 | 11394 | observability, provider-adapter, streaming, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [icebear0828/codex-proxy](https://github.com/icebear0828/codex-proxy) | 169 | 1168 | openai-compatible, provider-adapter, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, image-video | Ledger/payment idempotency tasarımına aday örnek. |
| [langfuse/langfuse](https://github.com/langfuse/langfuse) | 163 | 27818 | observability, provider-adapter, streaming, usage-metering | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [bentoml/OpenLLM](https://github.com/bentoml/OpenLLM) | 162 | 12331 | openai-compatible, streaming, usage-metering, api-key-security, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [Mirrowel/LLM-API-Key-Proxy](https://github.com/Mirrowel/LLM-API-Key-Proxy) | 159 | 497 | provider-adapter, openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [higress-group/higress](https://github.com/higress-group/higress) | 158 | 8466 | provider-adapter, streaming, usage-metering, rate-limit, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [Helicone/ai-gateway](https://github.com/Helicone/ai-gateway) | 153 | 591 | provider-adapter, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | 149 | 1713 | provider-adapter, streaming, usage-metering, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [dwgx/WindsurfAPI](https://github.com/dwgx/WindsurfAPI) | 145 | 2593 | openai-compatible, streaming, usage-metering, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [AmazingAng/auth2api](https://github.com/AmazingAng/auth2api) | 143 | 465 | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [voidmind-io/voidllm](https://github.com/voidmind-io/voidllm) | 142 | 100 | provider-adapter, usage-metering, api-key-security, rate-limit, openai-compatible, streaming, wallet-ledger, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [Azure-Samples/AI-Gateway](https://github.com/Azure-Samples/AI-Gateway) | 142 | 931 | provider-adapter, streaming, usage-metering, rate-limit, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [modelscope/FunASR](https://github.com/modelscope/FunASR) | 141 | 16239 | streaming, usage-metering | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| [stulzq/azure-openai-proxy](https://github.com/stulzq/azure-openai-proxy) | 138 | 1348 | openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security | Ledger/payment idempotency tasarımına aday örnek. |
| [numman-ali/cc-mirror](https://github.com/numman-ali/cc-mirror) | 136 | 2221 | provider-adapter, streaming, usage-metering, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [open-webui/pipelines](https://github.com/open-webui/pipelines) | 136 | 2388 | provider-adapter, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [mylxsw/llm-gateway](https://github.com/mylxsw/llm-gateway) | 135 | 53 | provider-adapter, admin-panel, openai-compatible, streaming, usage-metering, api-key-security, rate-limit, observability, image-video | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [aws-samples/bedrock-access-gateway](https://github.com/aws-samples/bedrock-access-gateway) | 135 | 982 | openai-compatible, streaming, usage-metering, api-key-security, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [gety-ai/apple-on-device-openai](https://github.com/gety-ai/apple-on-device-openai) | 133 | 863 | openai-compatible, streaming, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [diemus/azure-openai-proxy](https://github.com/diemus/azure-openai-proxy) | 130 | 634 | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [MrFadiAi/free-llm-gateway](https://github.com/MrFadiAi/free-llm-gateway) | 126 | 100 | provider-adapter, rate-limit, admin-panel, openai-compatible, streaming, usage-metering, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [UNICKCHENG/openai-proxy](https://github.com/UNICKCHENG/openai-proxy) | 125 | 413 | openai-compatible, streaming, usage-metering, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [envoyproxy/ai-gateway](https://github.com/envoyproxy/ai-gateway) | 125 | 1679 | provider-adapter, usage-metering, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [codeking-ai/cligate](https://github.com/codeking-ai/cligate) | 124 | 79 | api-key-security, admin-panel, openai-compatible, provider-adapter, streaming, usage-metering, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [kgateway-dev/kgateway](https://github.com/kgateway-dev/kgateway) | 122 | 5530 | rate-limit | Security/abuse guard tasarımına aday örnek. |
| [supercorp-ai/supergateway](https://github.com/supercorp-ai/supergateway) | 122 | 2643 | streaming, usage-metering | Streaming metering ve kullanım kaydı testlerine aday örnek. |

## İşimize Yarayan Kalıplar

| Kalıp | Adet | Bizdeki karşılığı |
| --- | --- | --- |
| usage-metering | 78 | Token, saniye, görsel birimi ve kalan bakiye kanıtı için gerekli. |
| streaming | 56 | Stream cevabında usage ve hata durumlarını doğru kapatmak için kritik. |
| api-key-security | 54 | Müşteri key güvenliği, revoke, prefix lookup ve sızıntı azaltma için gerekli. |
| provider-adapter | 42 | CloseRouter/9Router/başka provider geçişini billing katmanından ayırır. |
| admin-panel | 37 | Model aç/kapat, fiyat override ve kullanıcı itiraz kanıtı için gerekli. |
| rate-limit | 34 | Kötüye kullanım ve maliyet patlamasını sınırlar. |
| openai-compatible | 33 | API yüzeyini OpenAI uyumlu tutmak için örnek contract ve SDK davranışı sağlar. |
| wallet-ledger | 30 | Bakiye negatif olmadan para hareketlerini açıklanabilir yapar. |
| observability | 22 | Production hatalarını request_id ile izlenebilir yapar. |
| webhook-idempotency | 8 | Ödeme tekrarlarında çift bakiye yüklemeyi engeller. |
| image-video | 4 | Text dışı modalitelerde usage/billing varsayım risklerini azaltır. |

## Uygulama Fikirleri

- ProviderAdapter sınırını koru: CloseRouter direct MVP, 9Router/fallback sadece adapter arkasında POC.
- Streaming metering için final usage event yoksa pessimistic reserve + reconcile tasarımı ekle.
- Bakiye kaynağı append-only ledger olsun; cached balance sadece okunabilir hızlandırıcı olsun.
- API key sadece bir kez gösterilsin; DB’de hash + kısa prefix + revoked_at + last_used_at tutulmalı.
- Rate limit memory yerine Redis/Postgres tabanlı, user+key+route+model bazlı olmalı.
- Image/video usage birimleri canlı upstream response ile doğrulanmadan production billing açılmamalı.
- Her istek `X-YZ-Request-Id`, upstream request id, model snapshot id, pricing snapshot id ile izlenmeli.

## Son Bulgu Akışı

| Agent | Kaynak | Sinyal | Kullanım |
| --- | --- | --- | --- |
| agent-backend-provider | [gety-ai/apple-on-device-openai](https://github.com/gety-ai/apple-on-device-openai) | openai-compatible, streaming, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [Nativu5/Gemini-FastAPI](https://github.com/Nativu5/Gemini-FastAPI) | openai-compatible, streaming, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [AmazingAng/auth2api](https://github.com/AmazingAng/auth2api) | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [bentoml/OpenLLM](https://github.com/bentoml/OpenLLM) | openai-compatible, streaming, usage-metering, api-key-security, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [michelle-avery/openai-compatible-conversation](https://github.com/michelle-avery/openai-compatible-conversation) | openai-compatible, provider-adapter, streaming, usage-metering, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [uprootiny/gh-dashboard](https://github.com/uprootiny/gh-dashboard) | usage-metering, rate-limit, admin-panel, provider-adapter, streaming, api-key-security, image-video | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [modelscope/FunASR](https://github.com/modelscope/FunASR) | streaming, usage-metering | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-backend-provider | [icebear0828/codex-proxy](https://github.com/icebear0828/codex-proxy) | openai-compatible, provider-adapter, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, image-video | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [aws-samples/bedrock-access-gateway](https://github.com/aws-samples/bedrock-access-gateway) | openai-compatible, streaming, usage-metering, api-key-security, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [open-webui/pipelines](https://github.com/open-webui/pipelines) | provider-adapter, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [dwgx/WindsurfAPI](https://github.com/dwgx/WindsurfAPI) | openai-compatible, streaming, usage-metering, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [rails-engine/audit-log](https://github.com/rails-engine/audit-log) | usage-metering, admin-panel | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-billing-security | [DamienHarper/auditor](https://github.com/DamienHarper/auditor) | provider-adapter, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [threathunters-io/laurel](https://github.com/threathunters-io/laurel) | usage-metering | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-backend-provider | [zhouyaya100/zapi-go](https://github.com/zhouyaya100/zapi-go) | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [liggitt/audit2rbac](https://github.com/liggitt/audit2rbac) | admin-panel | Mimari fikir ve checklist için değerlendir. |
| agent-backend-provider | [X0Ken/openai-gateway](https://github.com/X0Ken/openai-gateway) | openai-compatible, provider-adapter, usage-metering, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [soynatan/django-easy-audit](https://github.com/soynatan/django-easy-audit) | streaming, usage-metering, admin-panel | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-billing-security | [vvangelovski/django-audit-log](https://github.com/vvangelovski/django-audit-log) | streaming | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-billing-security | [skoruba/AuditLogging](https://github.com/skoruba/AuditLogging) | streaming, usage-metering | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-backend-provider | [zhouyaya100/z-api](https://github.com/zhouyaya100/z-api) | openai-compatible, provider-adapter, usage-metering, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [DamienHarper/auditor-bundle](https://github.com/DamienHarper/auditor-bundle) | usage-metering, api-key-security | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-backend-provider | [PavelSozonov/openai-api-gateway](https://github.com/PavelSozonov/openai-api-gateway) | usage-metering, api-key-security, rate-limit | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-backend-provider | [eboltachev/OpenAI-API-Gateway](https://github.com/eboltachev/OpenAI-API-Gateway) | provider-adapter, streaming, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [abdelilah/aws-openai-api-gateway-proxy](https://github.com/abdelilah/aws-openai-api-gateway-proxy) | usage-metering, api-key-security | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-backend-provider | [naka1205/codex-api](https://github.com/naka1205/codex-api) | openai-compatible, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [akashrai3134/rate-limiter-redis-express](https://github.com/akashrai3134/rate-limiter-redis-express) | rate-limit | Security/abuse guard tasarımına aday örnek. |
| agent-backend-provider | [pokon548/ai-gateway-openai-wrapper](https://github.com/pokon548/ai-gateway-openai-wrapper) | openai-compatible, usage-metering, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [supercorp-ai/supergateway](https://github.com/supercorp-ai/supergateway) | streaming, usage-metering | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| agent-backend-provider | [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | provider-adapter, streaming, usage-metering, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |

## Ham Veri

- Events: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-26-10-100Z/events.jsonl`
- Repos: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-26-10-100Z/repos.jsonl`
- Code hits: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-26-10-100Z/code-hits.jsonl`
- Findings: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-26-10-100Z/findings.jsonl`
