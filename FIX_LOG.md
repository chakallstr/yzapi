# Fix Log

Operasyon tarihi: 2026-05-26

## BUG-ADMIN-001

- Problem: Admin panelde protected `/api/admin/*` mutasyonları token göndermeyen raw `fetch` kullanıyordu.
- Kök neden: `adminFetch` helper sadece veri yükleme çağrılarında kullanılmış, buton/inline mutasyon çağrılarına uygulanmamış.
- Karar: DEC-FIX-001, 3/3 APPROVED.
- Yapılan değişiklik: `src/App.tsx` içindeki protected admin çağrıları `adminFetch` ile değiştirildi.
- Test: `src/admin-fetch-guard.test.ts`
- Retest: `npm test`, `npm run lint`, `npm run build`, `npm run scan:public` PASS.
- Sonuç: FIXED.

## BUG-ROUTE-001

- Problem: `/admin`, `/docs`, `/models`, `/sss` doğrudan açıldığında SPA ilgili tabı seçmiyordu.
- Kök neden: `activeTab` her zaman `"homepage"` ile başlıyordu.
- Karar: DEC-FIX-002, 3/3 APPROVED.
- Yapılan değişiklik: `src/navigation.ts` helper eklendi; `src/App.tsx` başlangıç tabını URL pathname/query/hash üzerinden belirliyor.
- Test: `src/navigation.test.ts`
- Retest: `/admin` Chrome smoke artık ayrı admin şifresi ekranı beklemiyor; admin paneli sadece allowlisted user oturumuyla açılacak şekilde güncellendi.
- Sonuç: FIXED LOCAL.

## BUG-QA-001

- Problem: Kullanıcı test listesinde yer alan `node scripts/scan-secrets.mjs` komutu repo içinde olmadığı için `MODULE_NOT_FOUND` ile kırılıyordu.
- Kök neden: Public bundle scan vardı, fakat Git kapsamlı kaynak secret scanner yoktu.
- Karar: DEC-FIX-004, 3/3 APPROVED.
- Yapılan değişiklik: `scripts/scan-secrets.mjs` eklendi; gerçek secret değerlerini basmadan Git kapsamındaki dosyaları tarıyor. `qa-artifacts/` `.gitignore` kapsamına alındı.
- Test: `src/secret-scan-script.test.ts`
- Retest: `node scripts/scan-secrets.mjs` PASS, 179 dosya tarandı, hit yok.
- Sonuç: FIXED.

## BUG-QA-002

- Problem: Kullanıcının canlı smoke listesinde yer alan `scripts/turkapi-smoke.mjs` yoktu.
- Kök neden: Repo içinde aynı kontrolü yapan `scripts/vps-smoke.mjs` vardı, fakat beklenen komut adı yoktu.
- Karar: DEC-FIX-005, 3/3 APPROVED.
- Yapılan değişiklik: `scripts/turkapi-smoke.mjs` mevcut `vps-smoke` scriptini çağıran ince wrapper olarak eklendi.
- Retest: `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs` PASS; funded/low-balance key testleri credential olmadığı için manuel gereksinim.
- Sonuç: FIXED.

## BUG-ADMIN-002

- Problem: Admin panelinden oluşturulan API key `keyHash: null` ile kaydedildiği için `/v1` auth tarafından kullanılamıyordu.
- Kök neden: Admin route gerçek `generateApiKey()` / `hashApiKey()` servisini kullanmıyordu.
- Karar: DEC-FIX-006, 3/3 APPROVED.
- Yapılan değişiklik: Admin create endpoint hash’li key üretir; full key sadece create response içinde döner. Admin UI full key’i tek seferlik uyarı kutusunda gösterir.
- Test: `src/admin-billing-guard.test.ts`; local admin API smoke.
- Retest: Admin key create 201, full key varlığı doğrulandı, revoke 200.
- Sonuç: FIXED LOCAL.

## BUG-ADMIN-003

- Problem: `PATCH /api/admin/users/:id` body içindeki `bakiyeTL` alanı transaction ledger yazmadan kullanıcı bakiyesi değiştirebiliyordu.
- Kök neden: Generic user update route’u finansal alanı da kabul ediyordu.
- Karar: DEC-FIX-006, 3/3 APPROVED.
- Yapılan değişiklik: `bakiyeTL` generic patch içinde 400 ile reddedildi; ledger yazan `/api/admin/users/:id/bakiye` endpointi zorunlu bırakıldı.
- Test: `src/admin-billing-guard.test.ts`; local admin API smoke.
- Retest: Direct balance patch 400.
- Sonuç: FIXED LOCAL.

## BUG-PAY-001

- Problem: Payment init endpointleri sistem min/max bakiye limitlerini uygulamıyordu; IBAN env boşken yöntem aktif görünebiliyordu.
- Kök neden: `system_config.minBakiyeTL/maxBakiyeTL` payment init içinde kullanılmıyordu ve IBAN enabled sabitti.
- Karar: DEC-FIX-006, 3/3 APPROVED.
- Yapılan değişiklik: `payment-guards` helperları eklendi; Shopier/IBAN/Cryptomus init miktarı min/max ile doğrulanıyor, IBAN env eksikse disabled/503 dönüyor.
- Test: `src/server/services/payment-guards.test.ts`; local payment methods smoke.
- Retest: Payment methods 200, current env IBAN disabled, scanner/lint/test/build PASS.
- Sonuç: FIXED LOCAL.

## R-BUG-001

- Problem: `/v1/models`, `/v1/providers`, `/v1/models/count` public katalog endpointleri 404 dönüyordu.
- Kök neden: `/v1` route chain sadece authenticated proxy endpointlerini allowlist ediyor, public catalog router mount edilmiyordu.
- Karar: DEC-FIX-001 ve DEC-FIX-001A, 3/3 APPROVED.
- Yapılan değişiklik: Public read-only `/v1` catalog router eklendi; payload müşteri-facing computed fiyat/availability üzerinden üretilecek şekilde düzeltildi. Authenticated `/v1` proxy, billing, images/videos ve unknown JSON 404 davranışı değiştirilmedi.
- Test: `src/server/routes/v1-catalog.test.ts`
- Retest: Targeted test PASS; lint/test/build PASS; public scan pending.
- Sonuç: FIXED LOCAL / FULL LIVE ROUTE SMOKE PENDING.

## ADMIN-GOOGLE-001

- Problem: Canlı sitede Google admin hesabıyla giriş yapıldıktan sonra Admin sekmesi hâlâ ayrı `admin parola` ekranı gösteriyordu.
- Kök neden: Yerel kaynak kod ve backend tek Google admin modelindeydi; problem canlı hedefin eski/stale bundle servis etmesiydi. Gerçek canlı hedef `/opt/turkapiprojesi` ve servis `turkapiprojesi.service`; `/opt/yapayzekalab` yanlış/inactive hedefti.
- Karar: DEC-ADMIN-LIVE-STALE-001, 3/3 APPROVED.
- Yapılan değişiklik: Kod değişmedi. Güncel doğrulanmış `dist/` canlı `/opt/turkapiprojesi` hedefine yedekli olarak deploy edildi, `turkapiprojesi.service` restart edildi.
- Rollback: `/opt/turkapiprojesi/.deploy/rollback-manual-20260526T233319Z-8a8f1bc.sh`
- Test: `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, live health/auth smoke, live Chrome OAuth/Admin UAT.
- Retest: Admin Google OAuth PASS; Admin panel parola istemeden açıldı; live `qa:uat` 10/10 PASS.
- Sonuç: FIXED LIVE. Full release hâlâ funded billing/payment E2E kanıtına bağlı.
