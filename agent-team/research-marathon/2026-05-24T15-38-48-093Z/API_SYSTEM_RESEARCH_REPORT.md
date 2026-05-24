# YapayZekaLab API Sistemi 2 Saatlik Araştırma Raporu

- Durum: devam ediyor
- Run ID: `2026-05-24T15-38-48-093Z`
- Başlangıç: 2026-05-24T15:38:48.093Z
- Bitiş hedefi: 2026-05-24T17:38:48.093Z
- Kalan süre: 4076 sn
- Toplam benzersiz repo: 177
- Toplam code hit: 132
- Toplam bulgu: 168

## Agent Hatları

### Backend / Provider / Router

OpenAI-compatible proxy, provider adapter, streaming billing, catalog sync, fallback router, image/video task flow.

- Cycle: 134
- Son query: `x-request-id`
- Repo araması: 134
- Code araması: 67
- Repo: 90
- Code hit: 66
- Bulgu: 84
- Son olay: code search: x-request-id
### Billing / Security / Ops / Panel

TL prepaid wallet, append-only ledger, API key lifecycle, webhook idempotency, rate limit, audit, customer/admin panel, deploy/observability.

- Cycle: 136
- Son query: `idempotency_key`
- Repo araması: 136
- Code araması: 68
- Repo: 87
- Code hit: 66
- Bulgu: 84
- Son olay: code search: idempotency_key

## En Güçlü Repo Adayları

| Repo | Skor | Star | Sinyal | Neden |
| --- | --- | --- | --- | --- |
| [BlockRunAI/ClawRouter](https://github.com/BlockRunAI/ClawRouter) | 195 | 6504 | provider-adapter, openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, observability, image-video | Ledger/payment idempotency tasarımına aday örnek. |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | 193 | 48094 | usage-metering, openai-compatible, provider-adapter, streaming, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [apache/apisix](https://github.com/apache/apisix) | 182 | 16632 | provider-adapter, streaming, wallet-ledger, api-key-security, rate-limit, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [maximhq/bifrost](https://github.com/maximhq/bifrost) | 177 | 5183 | wallet-ledger, openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, rate-limit, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [Kong/kong](https://github.com/Kong/kong) | 176 | 43435 | provider-adapter, streaming, rate-limit, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [tensorzero/tensorzero](https://github.com/tensorzero/tensorzero) | 169 | 11394 | observability, provider-adapter, streaming, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [icebear0828/codex-proxy](https://github.com/icebear0828/codex-proxy) | 169 | 1168 | openai-compatible, provider-adapter, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, image-video | Ledger/payment idempotency tasarımına aday örnek. |
| [langfuse/langfuse](https://github.com/langfuse/langfuse) | 163 | 27818 | observability, provider-adapter, streaming, usage-metering | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [katanemo/plano](https://github.com/katanemo/plano) | 163 | 6526 | observability, openai-compatible, provider-adapter, streaming, usage-metering, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [bentoml/OpenLLM](https://github.com/bentoml/OpenLLM) | 162 | 12331 | openai-compatible, streaming, usage-metering, api-key-security, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [Mirrowel/LLM-API-Key-Proxy](https://github.com/Mirrowel/LLM-API-Key-Proxy) | 159 | 497 | provider-adapter, openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [higress-group/higress](https://github.com/higress-group/higress) | 158 | 8466 | provider-adapter, streaming, usage-metering, rate-limit, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [ulab-uiuc/LLMRouter](https://github.com/ulab-uiuc/LLMRouter) | 158 | 1851 | provider-adapter, openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [Helicone/ai-gateway](https://github.com/Helicone/ai-gateway) | 153 | 591 | provider-adapter, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | 149 | 1713 | provider-adapter, streaming, usage-metering, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [dwgx/WindsurfAPI](https://github.com/dwgx/WindsurfAPI) | 145 | 2594 | openai-compatible, streaming, usage-metering, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [lm-sys/RouteLLM](https://github.com/lm-sys/RouteLLM) | 144 | 4934 | provider-adapter, usage-metering, streaming, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [AmazingAng/auth2api](https://github.com/AmazingAng/auth2api) | 143 | 465 | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [voidmind-io/voidllm](https://github.com/voidmind-io/voidllm) | 142 | 100 | provider-adapter, usage-metering, api-key-security, rate-limit, openai-compatible, streaming, wallet-ledger, admin-panel, observability | Ledger/payment idempotency tasarımına aday örnek. |
| [Azure-Samples/AI-Gateway](https://github.com/Azure-Samples/AI-Gateway) | 142 | 931 | provider-adapter, streaming, usage-metering, rate-limit, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [modelscope/FunASR](https://github.com/modelscope/FunASR) | 141 | 16240 | streaming, usage-metering | Streaming metering ve kullanım kaydı testlerine aday örnek. |
| [dulaiduwang003/comfyui-openrouter-ai](https://github.com/dulaiduwang003/comfyui-openrouter-ai) | 140 | 762 | provider-adapter, admin-panel, streaming, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [CommonstackAI/UncommonRoute](https://github.com/CommonstackAI/UncommonRoute) | 139 | 666 | provider-adapter, usage-metering, streaming, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [stulzq/azure-openai-proxy](https://github.com/stulzq/azure-openai-proxy) | 138 | 1348 | openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security | Ledger/payment idempotency tasarımına aday örnek. |
| [numman-ali/cc-mirror](https://github.com/numman-ali/cc-mirror) | 136 | 2221 | provider-adapter, streaming, usage-metering, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [open-webui/pipelines](https://github.com/open-webui/pipelines) | 136 | 2388 | provider-adapter, api-key-security, rate-limit, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [mylxsw/llm-gateway](https://github.com/mylxsw/llm-gateway) | 135 | 53 | provider-adapter, admin-panel, openai-compatible, streaming, usage-metering, api-key-security, rate-limit, observability, image-video | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [aws-samples/bedrock-access-gateway](https://github.com/aws-samples/bedrock-access-gateway) | 135 | 982 | openai-compatible, streaming, usage-metering, api-key-security, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [gety-ai/apple-on-device-openai](https://github.com/gety-ai/apple-on-device-openai) | 133 | 863 | openai-compatible, streaming, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| [flowapi-net/flow-llm-router](https://github.com/flowapi-net/flow-llm-router) | 131 | 153 | provider-adapter, openai-compatible, streaming, usage-metering, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |

## İşimize Yarayan Kalıplar

| Kalıp | Adet | Bizdeki karşılığı |
| --- | --- | --- |
| usage-metering | 115 | Token, saniye, görsel birimi ve kalan bakiye kanıtı için gerekli. |
| streaming | 90 | Stream cevabında usage ve hata durumlarını doğru kapatmak için kritik. |
| api-key-security | 83 | Müşteri key güvenliği, revoke, prefix lookup ve sızıntı azaltma için gerekli. |
| provider-adapter | 76 | CloseRouter/9Router/başka provider geçişini billing katmanından ayırır. |
| admin-panel | 60 | Model aç/kapat, fiyat override ve kullanıcı itiraz kanıtı için gerekli. |
| wallet-ledger | 53 | Bakiye negatif olmadan para hareketlerini açıklanabilir yapar. |
| rate-limit | 47 | Kötüye kullanım ve maliyet patlamasını sınırlar. |
| openai-compatible | 47 | API yüzeyini OpenAI uyumlu tutmak için örnek contract ve SDK davranışı sağlar. |
| observability | 33 | Production hatalarını request_id ile izlenebilir yapar. |
| webhook-idempotency | 21 | Ödeme tekrarlarında çift bakiye yüklemeyi engeller. |
| image-video | 5 | Text dışı modalitelerde usage/billing varsayım risklerini azaltır. |

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
| agent-backend-provider | [CommonstackAI/UncommonRoute](https://github.com/CommonstackAI/UncommonRoute) | provider-adapter, usage-metering, streaming, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [flowapi-net/flow-llm-router](https://github.com/flowapi-net/flow-llm-router) | provider-adapter, openai-compatible, streaming, usage-metering, api-key-security, admin-panel, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [withmartian/routerbench](https://github.com/withmartian/routerbench) | provider-adapter, streaming, usage-metering | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [katanemo/plano](https://github.com/katanemo/plano) | observability, openai-compatible, provider-adapter, streaming, usage-metering, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [kcolemangt/llm-router](https://github.com/kcolemangt/llm-router) | provider-adapter, openai-compatible, streaming, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [NVIDIA-AI-Blueprints/llm-router](https://github.com/NVIDIA-AI-Blueprints/llm-router) | provider-adapter, openai-compatible, streaming, usage-metering, api-key-security, observability | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [anyscale/llm-router](https://github.com/anyscale/llm-router) | provider-adapter, streaming, usage-metering, wallet-ledger, observability | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [BlockRunAI/ClawRouter](https://github.com/BlockRunAI/ClawRouter) | provider-adapter, openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security, rate-limit, admin-panel, observability, image-video | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [lm-sys/RouteLLM](https://github.com/lm-sys/RouteLLM) | provider-adapter, usage-metering, streaming, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [tommy-swe/National-Electricity-Services-Website-UI-vibe-coding-](https://github.com/tommy-swe/National-Electricity-Services-Website-UI-vibe-coding-) | provider-adapter, usage-metering, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [ulab-uiuc/LLMRouter](https://github.com/ulab-uiuc/LLMRouter) | provider-adapter, openai-compatible, streaming, usage-metering, wallet-ledger, api-key-security, observability | Ledger/payment idempotency tasarımına aday örnek. |
| agent-billing-security | [rajmart/amul_calc](https://github.com/rajmart/amul_calc) | usage-metering, wallet-ledger, streaming, admin-panel | Ledger/payment idempotency tasarımına aday örnek. |
| agent-billing-security | [SachinKatkar22/-Ekta-Agri-Split-Pro](https://github.com/SachinKatkar22/-Ekta-Agri-Split-Pro) | usage-metering, wallet-ledger | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [noemiparrot1-wq/gemini-openai-proxy](https://github.com/noemiparrot1-wq/gemini-openai-proxy) | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-backend-provider | [liangjaden/gemini-openai-proxy](https://github.com/liangjaden/gemini-openai-proxy) | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [Siddarthapogula/Khataa](https://github.com/Siddarthapogula/Khataa) | usage-metering, wallet-ledger | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [Junhyeok9904/gemini-openai-proxy](https://github.com/Junhyeok9904/gemini-openai-proxy) | openai-compatible, streaming, usage-metering | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [iamx-ariful-islam/OfficeMG](https://github.com/iamx-ariful-islam/OfficeMG) | usage-metering, wallet-ledger, admin-panel | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [andrew-healey/gemini-openai-proxy](https://github.com/andrew-healey/gemini-openai-proxy) | openai-compatible, streaming, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [yuvanchanthar/bsm-business-management](https://github.com/yuvanchanthar/bsm-business-management) | usage-metering, wallet-ledger, rate-limit | Ledger/payment idempotency tasarımına aday örnek. |
| agent-billing-security | [ShubhamBhatia-dev/account-book](https://github.com/ShubhamBhatia-dev/account-book) | wallet-ledger | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [MagicGoddess/gemini-openai-proxy](https://github.com/MagicGoddess/gemini-openai-proxy) | openai-compatible, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [dieki-n/bill-ledger](https://github.com/dieki-n/bill-ledger) | wallet-ledger | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [Roland4396/gemini-openai-proxy](https://github.com/Roland4396/gemini-openai-proxy) | openai-compatible, provider-adapter, streaming, usage-metering, api-key-security, rate-limit | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [SkyTechSolutions-DotCom/SmartKeeper-Pro](https://github.com/SkyTechSolutions-DotCom/SmartKeeper-Pro) | usage-metering, wallet-ledger | Ledger/payment idempotency tasarımına aday örnek. |
| agent-billing-security | [shariful27/ISP-Billing-Ledger](https://github.com/shariful27/ISP-Billing-Ledger) | usage-metering, wallet-ledger, streaming, api-key-security | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [Brioch/gemini-openai-proxy](https://github.com/Brioch/gemini-openai-proxy) | openai-compatible, streaming, api-key-security | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |
| agent-billing-security | [SiddeshUB/Accounting_Billing](https://github.com/SiddeshUB/Accounting_Billing) | usage-metering, wallet-ledger | Ledger/payment idempotency tasarımına aday örnek. |
| agent-billing-security | [guardaco/guarda-chrome-extension](https://github.com/guardaco/guarda-chrome-extension) | provider-adapter, streaming, wallet-ledger | Ledger/payment idempotency tasarımına aday örnek. |
| agent-backend-provider | [Lifailon/openrouter-bot](https://github.com/Lifailon/openrouter-bot) | provider-adapter, api-key-security, admin-panel | ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek. |

## Ham Veri

- Events: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-38-48-093Z/events.jsonl`
- Repos: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-38-48-093Z/repos.jsonl`
- Code hits: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-38-48-093Z/code-hits.jsonl`
- Findings: `/Users/ufuk/yzapi/agent-team/research-marathon/2026-05-24T15-38-48-093Z/findings.jsonl`
