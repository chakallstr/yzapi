# Admin Report

Operasyon tarihi: 2026-05-26

## Test Edilenler

| Alan | Sonuç | Not |
|---|---|---|
| Admin auth modeli | FIXED LOCAL | Ayrı admin şifresi kaldırıldı; sadece `cix.crazy666@gmail.com` user JWT admin kabul edilir |
| Admin API anon erişim | PASS | `/api/admin/dashboard` authsuz 401 |
| Admin UI route | FIXED | Admin sekmesi sadece allowlisted kullanıcı giriş yapmışsa görünür |
| Admin data load | PASS STATIC/API | `adminFetch` kullanıyor |
| Admin mutasyonları | FIXED | Protected `/api/admin/*` raw fetch çağrıları `adminFetch` oldu |
| Admin API key create | FIXED LOCAL | Admin-created key artık hash’li, full key sadece create response/UI uyarısında görünüyor |
| Direct user balance patch | FIXED LOCAL | Generic user PATCH `bakiyeTL` alanını 400 ile reddediyor; ledger endpoint zorunlu |
| Kur/config/model/user/balance/announcement/provider/plans/API key UI calls | PASS STATIC | Token guard testi eklendi |
| IBAN pending approve | PASS LOCAL | Allowlisted user JWT ile approve/reject güvenliği test edildi |
| Audit | PARTIAL | Audit write kodu var; her admin mutasyonunun audit kapsamı tek tek doğrulanmadı |

## Bulunan ve Düzeltilen Hata

- `BUG-ADMIN-001`: Admin panel mutasyonları token göndermiyordu.
- Fix: `src/App.tsx` içinde protected admin endpointler `adminFetch` ile çağrılıyor.
- Test: `src/admin-fetch-guard.test.ts`
- Retest: `npm test`, `npm run lint`, `npm run build`, `npm run scan:public` geçti.
- `BUG-ADMIN-002`: Admin-created API key `keyHash: null` ile oluşuyordu ve kullanılamazdı.
- Fix: Admin create endpoint `generateApiKey()` + `hashApiKey(fullKey)` kullanıyor; full key yalnız create response içinde dönüyor.
- Test: `src/admin-billing-guard.test.ts`, local admin API smoke.
- `BUG-ADMIN-003`: Generic user patch route’u `bakiyeTL` alanını transaction ledger yazmadan değiştirebiliyordu.
- Fix: Bu alan 400 ile reddedildi; `/api/admin/users/:id/bakiye` ledger yazan endpoint olarak bırakıldı.
- Test: `src/admin-billing-guard.test.ts`, local admin API smoke.

## Açık Riskler

- Admin email bazlı kısıt yok; sistem parola/JWT role bazlı.
- CSRF/session modeli localStorage token kullandığı için klasik cookie CSRF yok, fakat XSS olursa token riski var.
- Admin panel uçtan uca tüm butonlar browser ile tek tek tıklanmadı; API/static kontrat doğrulandı.

## Sonuç

PARTIAL PASS. Kritik token gönderme hatası düzeltildi; tam admin UAT için canlı admin credential ve browser üzerinden tüm tabların tek tek denenmesi gerekiyor.

---

# Live Admin Update — 2026-05-27

## Canlı Browser UAT

| Alan | Sonuç | Not |
|---|---|---|
| Anonymous admin visibility | PASS LIVE | Standart Chrome'da anonymous durumda Admin düğmesi görünmedi |
| Google OAuth admin login | PASS LIVE | `cix.crazy666@gmail.com` hesabı ile callback tamamlandı |
| Separate admin password removal | PASS LIVE | Admin click sonrası parola formu değil `YZ Admin` dashboard açıldı |
| Live stale bundle check | PASS LIVE | Eski `admin parola`, `Admin paneline gir`, `ADMİN GİRİŞİ`, `adminToken` metinleri canlı asset içinde bulunmadı |
| Full destructive admin actions | NOT RUN | Gerçek müşteri verisi mutasyonu yapılmadı |
| Audit coverage | PARTIAL | OAuth audit entry göründü; tüm mutasyonlar tek tek canlıda denenmedi |

## Güncel Sonuç

Admin password/user complaint fixed live. Admin launch acceptance is improved, but full admin mutation/audit UAT remains partial by design because destructive actions on real customer data were not executed.
