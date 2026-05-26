# TEST RUN LIVE LOG

## T+00 - 2026-05-26 20:00:38 +03

- QA Supervisor testi başlattı.
- Repo: `/Users/ufuk/yzapi`
- Branch: `phase/release-vps-beta`
- Site URL: `http://127.0.0.1:4567`
- DB: Docker Compose PostgreSQL çalışıyor.
- Migration: `npm run db:migrate` başarılı.
- App: `npm run dev` ile port `4567` üzerinde çalışıyor.
- Sağlayıcı anahtarı: kullanıcı tarafından verildi, rapora/loglara yazılmadı.
- Güvenlik kısıtı: gerçek ödeme yapılmayacak, paid image/video testleri yapılmayacak.
- Not: Repo test başlangıcında önceki ödeme/USD değişiklikleri nedeniyle kirliydi; bu değişiklikler geri alınmayacak.


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


# 60 Dakika Site Testi Yeniden Koşu

- Başlangıç: 26.05.2026 21:00:09
- Site URL: http://127.0.0.1:4567
- Önceki koşu disk doluluğu nedeniyle kesildi; bu koşu sıfırdan başlatıldı.
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

# BG 60 Dakika Site Testi

- Başlangıç: 26.05.2026 21:41:06
- Site URL: http://127.0.0.1:4567
- Evidence dir: /Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z

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
