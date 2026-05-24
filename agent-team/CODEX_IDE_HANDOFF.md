# Codex IDE Handoff - YapayZekaLab

Bu dosya yeni Codex IDE konusmasina verilecek tek prompt olarak hazirlandi.

## Prompt

YapayZekaLab / YZ API projesinde son 24 saatlik tum kararlar ve agent raporlari `/Users/ufuk/yzapi/agent-team` altinda toplandi.

Once su dosyalari oku:

1. `/Users/ufuk/yzapi/agent-team/TEAM_STATUS.md`
2. `/Users/ufuk/yzapi/agent-team/LAST24_MASTER_REPORT.md`
3. `/Users/ufuk/yzapi/agent-team/reports/agent-01-repo-timeline.md`
4. `/Users/ufuk/yzapi/agent-team/reports/agent-02-product-pricing.md`
5. `/Users/ufuk/yzapi/agent-team/reports/agent-03-codex-session-extractor.md`
6. `/Users/ufuk/yzapi/agent-team/reports/agent-04-claude-code-extractor.md`
7. `/Users/ufuk/yzapi/agent-team/reports/agent-05-frontend-site-state.md`
8. `/Users/ufuk/yzapi/agent-team/reports/agent-06-backend-api-auth-payments.md`
9. `/Users/ufuk/yzapi/agent-team/reports/agent-07-deploy-cpanel-hosting.md`
10. `/Users/ufuk/yzapi/agent-team/reports/agent-08-supplier-competitor.md`
11. `/Users/ufuk/yzapi/agent-team/reports/agent-09-brain-synthesizer.md`
12. `/Users/ufuk/yzapi/agent-team/reports/agent-10-initial-qa-risk.md`
13. `/Users/ufuk/yzapi/agent-team/qa/qa-agent-1-source-evidence.md`
14. `/Users/ufuk/yzapi/agent-team/qa/qa-agent-2-build-deploy-risk.md`

Aktif kararlar:

- Paket yok.
- Gunluk istek paketi yok.
- Bakiye/kredi bazli duz satis var.
- Routing: YapayZekaLab backendindeki `ProviderAdapter`; MVP upstream `CloseRouter`, `9Router` sadece Faz-2 POC/fallback adayi.
- Text: provider fiyat * 3.00.
- Billing token: `real_tokens / 0.90`.
- Text/image/video tek bakiye defterinden satilabilir.
- cPanel hedefi `yapayzekalab.org`.

Ilk is:

1. Router kararini koru: billing/auth/ledger YapayZekaLab backendinde kalir; 9Router musterinin dogrudan satis katmani olmaz.
2. cPanel startup path ve canli 503 blokajini dogrula.
3. Claude IDE hedefleniyorsa `/v1/messages` uyumlulugunu tasarla.
4. 9Router POC istenirse once `ProviderAdapter` arkasinda kapali feature flag ile uygula.
5. Degisiklikten sonra `npm run lint`, `npm test`, `npm run build` calistir.
