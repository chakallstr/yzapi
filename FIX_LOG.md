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
- Retest: Targeted test PASS; lint/test/build PASS; live `/v1/models`, `/v1/providers`, `/v1/models/count` 200 JSON; unknown `/v1/*` JSON 404.
- Sonuç: FIXED LIVE.

## ADMIN-GOOGLE-001

- Problem: Canlı sitede Google admin hesabıyla giriş yapıldıktan sonra Admin sekmesi hâlâ ayrı `admin parola` ekranı gösteriyordu.
- Kök neden: Yerel kaynak kod ve backend tek Google admin modelindeydi; problem canlı hedefin eski/stale bundle servis etmesiydi. Gerçek canlı hedef `/opt/turkapiprojesi` ve servis `turkapiprojesi.service`; `/opt/yapayzekalab` yanlış/inactive hedefti.
- Karar: DEC-ADMIN-LIVE-STALE-001, 3/3 APPROVED.
- Yapılan değişiklik: Kod değişmedi. Güncel doğrulanmış `dist/` canlı `/opt/turkapiprojesi` hedefine yedekli olarak deploy edildi, `turkapiprojesi.service` restart edildi.
- Rollback: `/opt/turkapiprojesi/.deploy/rollback-manual-20260526T233319Z-8a8f1bc.sh`
- Test: `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, live health/auth smoke, live Chrome OAuth/Admin UAT.
- Retest: Admin Google OAuth PASS; Admin panel parola istemeden açıldı; live `qa:uat` 10/10 PASS.
- Sonuç: FIXED LIVE. Full release hâlâ funded billing/payment E2E kanıtına bağlı.

## LIVE-BILLING-001

- Problem: Launch için gerekli successful funded `yzk_live_*` text API billing kabulü kanıtlanamıyordu.
- Kök neden bulgusu: YapayZekaLab gateway öncesinde direct CloseRouter inference rotaları `502 upstream_connection_refused` veya `502 upstream_connect_timeout` veriyor. CloseRouter key/account/catalog/balance mevcut; sorun key yokluğu veya bakiye yokluğu değil.
- Karar: DEC-LIVE-BILLING-TEST-001, 3/3 APPROVED for isolated live test execution only.
- Yapılan değişiklik: Kod değişmedi. İzole canlı test kullanıcı/keyleri oluşturuldu, tiny text çağrıları denendi, raw keyler raporlanmadı, test keyleri revoke edildi.
- Test: Low-balance `402`, invalid key `401`, upstream failure zero-cost/no-decrement PASS. Direct `/credits` and `/models` PASS.
- Retest: Successful billing FAIL/BLOCKED because OpenAI/Anthropic/Deepseek/Google direct inference returned `502`.
- Sonuç: NOT FIXED. Provider/upstream inference düzelmeden launch billing acceptance verilemez.

## DESIGN-REGRESSION-001

- Problem: Reddedilen template görünümü ve kodu tekrar aktif kaynak içine girebildi; ayrıca untracked `src/yapayzekalab/` klasörü reddedilen template'in modüler kopyasını taşıyordu.
- Kök neden: Deploy/repair akışında doğru görsel kaynak doğrulanmadan frontend bundle değiştirildi; ayrıca template parmak izlerini engelleyen otomatik guard yoktu.
- Karar: DEC-FIX-DESIGN-RESTORE-001, 3/3 APPROVED.
- Yapılan değişiklik: Eski onaylı YapayZekaLab görsel shell'i `src/yapayzekalab/` altında aktif kaynak olarak restore edildi; `src/App.tsx` sadece route-to-tab wrapper oldu. Reddedilen bilimsel/dashboard/template fingerprintleri `src/rejected-template-guard.test.ts`, `vite.config.ts` ve `scripts/scan-public-bundle.mjs` ile engelleniyor. Ayrı admin şifresi geri getirilmedi; admin görünürlüğü allowlisted Google/user session mantığında kaldı.
- Test: `src/rejected-template-guard.test.ts`; `npm test`; `npm run lint`; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`; lokal `qa:uat`; Playwright browser smoke.
- Retest: 27 test file / 114 test PASS; lint PASS; build PASS; public bundle scan 0 hit; secret scan 0 hit; lokal UAT smoke 10/10 PASS. Live deploy sonrası smoke/UAT PASS; canlı browser smoke eski hero var, reddedilen template yok, anonim Admin görünmüyor.
- Sonuç: FIXED LIVE.

## UX-FAKE-LIVE-001

- Problem: Eski temadaki playground ve onboarding akışı örnek simülasyonu `canlı test`, `sağlayıcı çağrılıyor` ve random görünümlü `yzk_live_a8f3…` değerleriyle gerçek doğrulanmış API/billing çağrısı gibi gösterebiliyordu.
- Kök neden: Restore edilen görsel shell içinde demo/mock metinler gerçek provider/billing kanıtından ayrılmamıştı.
- Karar: DEC-FIX-UX-FAKE-LIVE-001, 3/3 APPROVED.
- Yapılan değişiklik: Yalnızca metin/veri değişti; playground `örnek akış`, fake key `yzk_live_YOUR_KEY`, onboarding çağrısı `örnek yanıt` olarak netleştirildi. CSS, layout, class, renk, kart/modal/button stili değişmedi.
- Test: `npm test -- src/api-docs-content.test.ts`; `npm run lint`; `npm test`; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`; `npm run qa:uat`; Playwright browser smoke.
- Retest: Targeted docs/content test PASS 5/5; full regression PASS; live bundle fingerprint scan 0 hit; canlı browser smoke fake-live claim yok.
- Sonuç: FIXED LIVE.

## DESIGN-CSS-001

- Problem: Eski tema restore edilmesine rağmen `src/main.tsx` hâlâ önceki template'e ait `src/index.css` dosyasını yüklüyordu. Bu dosyada Tailwind, Inter, Space Grotesk, JetBrains Mono ve skeleton shimmer global template stilleri vardı.
- Kök neden: Entry point temizlenmeden eski tema `tokens.css` yanında önceki template global CSS’i de bundle’a giriyordu.
- Karar: DEC-FIX-DESIGN-CSS-001, 3/3 APPROVED.
- Yapılan değişiklik: Guard testine leftover template CSS fingerprintleri eklendi; `src/main.tsx` içindeki `./index.css` import’u kaldırıldı; `src/index.css` silindi; `@tailwindcss/vite` ve `tailwindcss` dependency/config wiring kaldırıldı. Eski tema `src/yapayzekalab/tokens.css` ile çalışmaya devam ediyor.
- Test: `npm test -- src/rejected-template-guard.test.ts`; `npm run lint`; `npm test`; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`; `npm run qa:uat`; Playwright browser CSS smoke.
- Retest: Guard PASS 7/7; full regression PASS 27 files / 114 tests; build CSS 6.42 kB; public/secret scan 0 hit; local/live UAT 10/10; live bundle/template scan hit yok; browser CSS smoke Tailwind/Inter template CSS yok.
- Sonuç: FIXED LIVE.

## SECURITY-DEPS-001

- Problem: `npm audit` 1 high ve 5 moderate vulnerability raporladı. High bulgu `drizzle-orm <0.45.2` SQL injection advisory idi.
- Kök neden: Eski `drizzle-orm`, `uuid` ve `drizzle-kit` sürümleri lock dosyasında kalmıştı.
- Karar: DEC-FIX-SEC-DEPS-001, 3/3 APPROVED.
- Yapılan değişiklik: `drizzle-orm` `0.45.2`, `uuid` `14.0.0`, `drizzle-kit` `0.31.10` seviyesine güncellendi; obsolete `@types/uuid` kaldırıldı. `npm audit fix --force` kullanılmadı.
- Test: `npm audit --omit=dev --json`; `npm run lint`; `npm test`; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`; `npm run qa:uat`.
- Retest: Production audit 0 vulnerability; full regression PASS 27 files / 114 tests; build/scans/UAT PASS. Genel `npm audit` hâlâ dev-only `drizzle-kit` zincirinde 4 moderate raporluyor; production runtime audit temiz.
- Sonuç: FIXED FOR PRODUCTION RUNTIME / DEV-ONLY MODERATE FOLLOW-UP.

## LIVE-DEPLOY-RESTORED-THEME-001

- Problem: Restore edilmiş eski tema ve template guard düzeltmeleri canlıya alınmadan kullanıcı tarafında reddedilen template riski devam ediyordu.
- Kök neden: Gerçek canlı hedef `/opt/turkapiprojesi` git checkout değil; generic `scripts/vps-deploy.sh` `/opt/yapayzekalab` varsayılanıyla bu canlı servis için yanlış hedefe bakıyor. Önceki manuel rollback scriptinde backup değişkeni kullanılmadığı için `/dist` gibi hatalı path vardı.
- Karar: DEC-LIVE-DEPLOY-RESTORED-THEME-001, 3/3 APPROVED.
- Yapılan değişiklik: Kod değişmedi; taze doğrulanmış `dist/`, `package.json`, `package-lock.json` canlı `/opt/turkapiprojesi` hedefine yedekli olarak yüklendi. Doğru PostgreSQL 14 `pg_dump` ile DB backup alındı, yeni düzgün rollback scripti üretildi, `turkapiprojesi.service` restart edildi.
- Deploy ID: `manual-20260527T064341Z-6021b8e`.
- Rollback: `/opt/turkapiprojesi/.deploy/rollback-manual-20260527T064341Z-6021b8e.sh`.
- Test: `npm run lint`; `npm test`; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`; `npm audit --omit=dev --json`; `npm run qa:uat`; live `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`; live `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`; live bundle fingerprint scan; browser visual/admin anonymous smoke.
- Retest: Local verification PASS; production audit 0; live smoke PASS; live UAT 10/10 PASS; live `/v1` catalog PASS; live rejected-template bundle hits `[]`; browser: eski tema görünüyor, anonim Admin gizli, admin parola/rejected template/fake live claim yok.
- Sonuç: FIXED LIVE. Full release hâlâ successful funded billing ve payment provider E2E kanıtına bağlı.
