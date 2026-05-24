# Release VPS Beta Agent Team — 2026-05-24

## Durum

- Hedef branch: `phase/release-vps-beta`
- Native agent açma denemesi: thread limit nedeniyle yeni agent açılamadı.
- Mevcut 6 eski agent id'si sorgulandı; 5 agent anlamlı read-only çıktı döndürdü, 1 agent beklemede kaldı.
- Bu dosya sahte agent onayı değildir; alınan gerçek çıktıların release planına çevrilmiş özetidir.

## Agent Kararları

| Rol | Durum | Çıktı | Karar |
|---|---|---|---|
| Product/Growth | OK | Text-only Beta API, örnek maliyet, public fiyat güveni, ilk 5 dakika aktivasyon | VPS öncesi mesaj net, VPS sonrası onboarding |
| Backend/Ledger | OK | Reconciliation, streaming outbox, concurrency/idempotency, payment amount verification | Para ve usage kanıtı müşteri trafiğinden önce sertleşmeli |
| Deploy/Ops | OK | VPS deploy, rollback prova, DB backup restore, DNS/certbot, release manifest | İlk gerçek kapı canlı VPS deploy ve rollback kanıtı |
| Security/Abuse | OK | Kalıcı rate limit, günlük TL limit, max token/request, audit/export | İlk müşteri trafiği büyümeden uygulanmalı |
| Frontend/Panel | OK | Dashboard, API key one-time reveal, usage table, IBAN durumları, mobil route ayrımı | API sekmesi geçici; gerçek müşteri dashboard'u ayrılmalı |
| QA/Release | PARTIAL | Bekleyen agent çıktı vermedi; koordinatör gate listesi uygulandı | Her faz lint/test/build/scan/smoke ve WORKLOG kanıtı ister |

## Öncelik Sırası

1. Release snapshot ve commit grupları.
2. Canlı VPS deploy + gerçek test API key smoke.
3. Müşteri dashboard aktivasyonu.
4. Ledger/reconciliation/admin görünürlüğü.
5. Rate limit ve abuse hardening.
6. Image/video live usage kanıtı.
7. 9Router POC.

## Blocker

- Canlı VPS deploy için VPS erişimi, `.env.production`, DNS/domain kontrolü ve test API key gerekiyor.
- `SMOKE_API_KEY` ve `SMOKE_LOW_BALANCE_API_KEY` yoksa başarılı chat ve 402 smoke tamam sayılamaz.
