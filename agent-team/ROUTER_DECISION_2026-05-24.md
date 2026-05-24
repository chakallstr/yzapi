# Router Kararı — 2026-05-24

## Sonuç

MVP'de ana satış/bakiye katmanı YapayZekaLab backendidir. Upstream doğrudan CloseRouter'dır. 9Router ana satış katmanı değildir; ileride sadece `ProviderAdapter` arkasında POC/fallback olarak denenir.

## Tartışılan Akışlar

| Akış | Karar | Sebep |
|---|---|---|
| Müşteri → YapayZekaLab Backend → CloseRouter | MVP | En az hareketli parça; billing ve kanıt bizde |
| Müşteri → YapayZekaLab Backend → 9Router → Provider | Faz-2 POC | Fallback için faydalı olabilir; önce aynı billing testlerini geçmeli |
| Müşteri → 9Router → Provider | Red | TL bakiye, KDV, usage log, API key ve admin fiyat kontrolü zayıflar |

## 10 Agent Rolü

1. `yz-01-incident-lead` — koordinasyon
2. `yz-02-router-architect` — provider adapter/router kararı
3. `yz-03-billing-ledger` — TL bakiye/ledger/ödeme
4. `yz-04-api-proxy` — `/v1` proxy uyumluluğu
5. `yz-05-db-migrations` — DB/migration/deploy artifact
6. `yz-06-security-ops` — secret, rate limit, public sızıntı
7. `yz-07-frontend-panel` — müşteri/admin panel dili
8. `yz-08-deploy-live` — cPanel/VPS/live smoke
9. `yz-09-docs-github` — CLAUDE/README/WORKLOG/git
10. `yz-10-qa-gate` — lint/test/build/live gate

## QA Gate

- `/v1/chat/completions` bizim API key ile çalışmadan production-ready sayılmaz.
- Yetersiz bakiye provider'a gitmeden 402 dönmeli.
- Başarılı istek usage + transaction kaydı yazmalı.
- 9Router adapter ancak aynı testlerden geçerse canlıya alınabilir.
