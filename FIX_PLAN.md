# FIX PLAN

Durum: test bulguları ve 2/3 agent onayı sonrası doldurulacak.
# Fix Plan — QA Sonrası

## Öncelik 1
- `BUG-002`: Runtime stabilitesi. Docker/service/process manager ayarı netleşmeden launch yok.
- `BUG-001`: `/v1/models`, `/v1/providers`, `/v1/models/count` route'ları eklenecek.
- `BUG-003`: Google OAuth 503 giderilecek veya UI hazır değil durumuna alınacak.

## Öncelik 2
- Docs/API örnekleri CloseRouter uyarlamasıyla görünür hale getirilecek.
- Video desteği sınırlı durum etiketiyle netleştirilecek.
- Test user + funded balance + `yzk_live_*` anahtar ile gerçek billing doğrulaması yapılacak.

## 3 Ajan Onayı
- Agent 1 / Frontend: APPROVE — UAT blockerlar kullanıcı akışını bozuyor.
- Agent 4 / Backend/Billing: APPROVE — `/v1` katalog ve valid billing doğrulaması eksik.
- Agent 5 / Security: APPROVE — OAuth/API key/billing gerçek akışları doğrulanmadan launch riskli.
- Approval count: 3/3.
