# AGENT CHAT LOG

## T+00 - 2026-05-26 20:00:38 +03

- QA Supervisor: 60 dakikalık wall-clock site testi başlatıldı.
- Agent 1 / Frontend: ana sayfa, modeller, API/SSS, mobil görünüm ve console/network hataları için görevlendirildi.
- Agent 2 / Chaos UI: hızlı tıklama, geri/ileri, reload, viewport değişimleri ve modal/filtre kombinasyonları QA Supervisor tarafından yürütülecek.
- Agent 3 / API: geçerli `yzk_live_` anahtarı yoksa no-auth/invalid-auth/malformed testlerle sınırlı kalacak.
- Agent 4 / Backend/Billing/DB: health/status/model/payment/api-key/usage/billing etkileri için görevlendirildi.
- Agent 5 / Security/Risk: admin exposure, secret leakage, unknown route JSON, webhook/payment riskleri için görevlendirildi.
- Agent 6 / Reporting: rapor dosyaları bu çalışma boyunca güncellenecek.
- Blokaj: test kullanıcısı/admin credential yok; gerçek Google OAuth tamamlanırsa manuel/cookie gerektirebilir.
- Sonraki 10 dakika odağı: anonim ziyaretçi, homepage, navigation, console/network, temel API route davranışı.


## T+00 - 26.05.2026 20:02:31

- Odak: Başlangıç ve preflight
- Elapsed seconds: 1
- Pages/routes tested: 0
- Buttons/click attempts accepted: 0
- Forms tested: 0
- API/route checks: 0
- Console errors: 0
- Network errors: 0
- Bugs observed so far: 0
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-2026-05-26T17-02-30-270Z

- Agent 1: kullanıcı akışları ve viewport kontrolleri sürüyor.
- Agent 2: hızlı tıklama/reload/back-forward kombinasyonları sürüyor.
- Agent 3: paid image/video olmadan negatif API kontrolleri sürüyor.
- Agent 4: health/status/API route sonuçları toplanıyor.
- Agent 5: admin exposure ve JSON 404 kontrolleri sürüyor.
- Sonraki odak: bir sonraki 10 dakikalık faz.

## T+10 - 26.05.2026 20:12:34

- Odak: Anonim ziyaretçi + homepage
- Elapsed seconds: 604
- Pages/routes tested: 1
- Buttons/click attempts accepted: 735
- Forms tested: 4
- API/route checks: 0
- Console errors: 311
- Network errors: 752
- Bugs observed so far: 0
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-2026-05-26T17-02-30-270Z

- Agent 1: kullanıcı akışları ve viewport kontrolleri sürüyor.
- Agent 2: hızlı tıklama/reload/back-forward kombinasyonları sürüyor.
- Agent 3: paid image/video olmadan negatif API kontrolleri sürüyor.
- Agent 4: health/status/API route sonuçları toplanıyor.
- Agent 5: admin exposure ve JSON 404 kontrolleri sürüyor.
- Sonraki odak: bir sonraki 10 dakikalık faz.

## T+20 - 26.05.2026 20:22:34

- Odak: Modeller tab derin test
- Elapsed seconds: 1204
- Pages/routes tested: 2
- Buttons/click attempts accepted: 1304
- Forms tested: 456
- API/route checks: 0
- Console errors: 311
- Network errors: 752
- Bugs observed so far: 3
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-2026-05-26T17-02-30-270Z

- Agent 1: kullanıcı akışları ve viewport kontrolleri sürüyor.
- Agent 2: hızlı tıklama/reload/back-forward kombinasyonları sürüyor.
- Agent 3: paid image/video olmadan negatif API kontrolleri sürüyor.
- Agent 4: health/status/API route sonuçları toplanıyor.
- Agent 5: admin exposure ve JSON 404 kontrolleri sürüyor.
- Sonraki odak: bir sonraki 10 dakikalık faz.

## T+30 - 26.05.2026 20:32:33

- Odak: SSS/API/docs yeni kullanıcı
- Elapsed seconds: 1803
- Pages/routes tested: 2
- Buttons/click attempts accepted: 1868
- Forms tested: 456
- API/route checks: 0
- Console errors: 311
- Network errors: 752
- Bugs observed so far: 426
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-2026-05-26T17-02-30-270Z

- Agent 1: kullanıcı akışları ve viewport kontrolleri sürüyor.
- Agent 2: hızlı tıklama/reload/back-forward kombinasyonları sürüyor.
- Agent 3: paid image/video olmadan negatif API kontrolleri sürüyor.
- Agent 4: health/status/API route sonuçları toplanıyor.
- Agent 5: admin exposure ve JSON 404 kontrolleri sürüyor.
- Sonraki odak: bir sonraki 10 dakikalık faz.


# Yeniden Koşu Agent Başlangıcı

- QA Supervisor: disk temizliği sonrası 60 dakikalık tam koşu yeniden başlatıldı.
- Site URL: http://127.0.0.1:4567
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-rerun-2026-05-26T18-00-09-461Z

## T+0 - 26.05.2026 21:00:10

- Odak: Başlangıç ve preflight
- Elapsed seconds: 1
- Pages/routes tested: 0
- Buttons/click attempts accepted: 0
- Forms tested: 0
- API/route checks: 0
- Console errors: 0
- Network errors: 0
- HTTP 4xx/5xx gözlem: 0
- Tekil bug gözlemi: 0
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-rerun-2026-05-26T18-00-09-461Z

- Agent 1: UI/UX, mobil ve kullanıcı akışlarını sürdürüyor.
- Agent 2: hızlı tıklama, reload, back/forward ve form kombinasyonlarını sürdürüyor.
- Agent 3: paid image/video olmadan negatif API kontrollerini sürdürüyor.
- Agent 4: endpoint ve backend sözleşmesini doğruluyor.
- Agent 5: admin exposure, JSON hata formatı ve secret sızıntısını izliyor.
- Sonraki odak: planlanan bir sonraki 10 dakikalık faz.

## T+10 - 26.05.2026 21:10:17

- Odak: Modeller tab derin test
- Elapsed seconds: 608
- Pages/routes tested: 2
- Buttons/click attempts accepted: 357
- Forms tested: 0
- API/route checks: 0
- Console errors: 1
- Network errors: 0
- HTTP 4xx/5xx gözlem: 0
- Tekil bug gözlemi: 1
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-rerun-2026-05-26T18-00-09-461Z

- Agent 1: UI/UX, mobil ve kullanıcı akışlarını sürdürüyor.
- Agent 2: hızlı tıklama, reload, back/forward ve form kombinasyonlarını sürdürüyor.
- Agent 3: paid image/video olmadan negatif API kontrollerini sürdürüyor.
- Agent 4: endpoint ve backend sözleşmesini doğruluyor.
- Agent 5: admin exposure, JSON hata formatı ve secret sızıntısını izliyor.
- Sonraki odak: planlanan bir sonraki 10 dakikalık faz.

## BG T+0 - 26.05.2026 21:41:06

- Odak: Başlangıç
- Elapsed seconds: 1
- Pages/routes tested: 0
- Buttons: 0
- Forms: 0
- API checks: 0
- Console errors: 0
- Network errors: 0
- HTTP 4xx/5xx: 0
- Tekil bug: 0
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z

## BG T+10 - 26.05.2026 21:51:06

- Odak: Modeller
- Elapsed seconds: 601
- Pages/routes tested: 0
- Buttons: 0
- Forms: 0
- API checks: 0
- Console errors: 0
- Network errors: 1333
- HTTP 4xx/5xx: 0
- Tekil bug: 0
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z

## BG T+20 - 26.05.2026 22:01:12

- Odak: SSS/API/docs
- Elapsed seconds: 1207
- Pages/routes tested: 4
- Buttons: 328
- Forms: 0
- API checks: 0
- Console errors: 22
- Network errors: 1481
- HTTP 4xx/5xx: 20
- Tekil bug: 2
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z

## BG T+30 - 26.05.2026 22:11:08

- Odak: Dashboard/payment authsuz
- Elapsed seconds: 1802
- Pages/routes tested: 4
- Buttons: 475
- Forms: 0
- API checks: 7
- Console errors: 167
- Network errors: 1481
- HTTP 4xx/5xx: 168
- Tekil bug: 2
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z

## BG T+40 - 26.05.2026 22:21:06

- Odak: Mobil chaos
- Elapsed seconds: 2401
- Pages/routes tested: 4
- Buttons: 639
- Forms: 0
- API checks: 581
- Console errors: 168
- Network errors: 2475
- HTTP 4xx/5xx: 414
- Tekil bug: 2
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z

## BG T+50 - 26.05.2026 22:31:08

- Odak: Admin/security/error
- Elapsed seconds: 3002
- Pages/routes tested: 10
- Buttons: 831
- Forms: 41
- API checks: 589
- Console errors: 168
- Network errors: 3218
- HTTP 4xx/5xx: 422
- Tekil bug: 2
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z

## BG T+60 - 26.05.2026 22:41:06

- Odak: Final
- Elapsed seconds: 3601
- Pages/routes tested: 10
- Buttons: 831
- Forms: 41
- API checks: 3981
- Console errors: 168
- Network errors: 3218
- HTTP 4xx/5xx: 3814
- Tekil bug: 2
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z
