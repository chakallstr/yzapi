# CloseRouter Provider Incident Evidence

Date: 2026-05-27

## Summary

YapayZekaLab live VPS can reach CloseRouter account, balance and model catalog endpoints, but direct inference fails before YapayZekaLab can prove successful paid usage billing.

No API key, Authorization header, cookie, payment credential or raw env value is included in this report.

## Environment

- Caller: live VPS service environment under `/opt/turkapiprojesi`
- Base URL: `https://api.closerouter.dev/v1`
- Key prefix check: expected `closerouter_` prefix present
- Balance endpoint: reachable
- Model catalog endpoint: reachable

## Passing Checks

- `GET /credits`: `200`
- `total_credits`: `1.99998845`
- `total_usage`: `0.00001155`
- `GET /models?output_modalities=text`: `200`
- Text models returned: `18`
- Chat-capable models returned: `18`

## Failing Checks

### Chat Completions

Current low-cost chat-capable catalog candidates all returned `502 upstream_error` after roughly 21 seconds:

- `deepseek/deepseek-v4-pro`
- `google/gemini-3.1-flash-lite-preview`
- `mimo/mimo-v2-pro`
- `minimax/minimax-m2.7`
- `openai/gpt-5.4-mini`
- `qwen/qwen3.6-plus`

Detailed example:

- Endpoint: `POST /chat/completions`
- Model: `deepseek/deepseek-v4-pro`
- Status: `502`
- Error code: `upstream_error`
- Failure reason: `upstream_connection_refused`
- Provider name: `Deepseek`
- Request id: `c2c53a5e-1cd3-474d-8136-17da70c0d922`

### Anthropic Messages

- Endpoint: `POST /messages`
- Model: `anthropic/claude-haiku-4.5`
- Status: `502`
- Error code: `upstream_error`
- Failure reason: `upstream_connect_timeout`
- Provider name: `Anthropic`
- Request id: `98a159de-f6df-4a97-a7e6-78516f90bf65`

## Launch Impact

Successful YapayZekaLab API billing remains blocked because a successful upstream text response is required to prove:

- `X-YZ-Cost-TL`
- `X-YZ-Remaining-TL`
- `X-YZ-Request-Id`
- positive `transactions` ledger write
- success `usage_records`
- user balance decrement

## Recommended Provider Escalation

Ask CloseRouter support to investigate the two request ids above and confirm whether the account, routing profile, upstream provider routes or current provider availability are blocking inference.

After CloseRouter confirms the route is healthy, run one tiny direct inference first, then one funded YapayZekaLab gateway call. Do not run large token tests before that gate passes.
