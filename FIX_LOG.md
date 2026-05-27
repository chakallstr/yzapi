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

## PAYMENT-LIVE-001

- Problem: Canlı IBAN/payment init akışı, deploy edilmiş kodun beklediği USD quote kolonları (`amount_usd`, `payable_tl`, `credit_tl`, `kur_at_payment`, `rounding_tl`) production DB’de olmadığı için canlı E2E doğrulanamıyordu.
- Kök neden: `0005_payment_usd_quote_fields.sql` source/migration içinde vardı, fakat aktif VPS DB şemasına uygulanmamıştı.
- Karar: DEC-FIX-LIVE-PAYMENT-MIGRATION-001, 3/3 APPROVED.
- Yapılan değişiklik: Canlı PostgreSQL 14 yedeği alındı; `payments` ve `pending_iban_payments` tablolarına idempotent/additive USD quote kolonları eklendi.
- Rollback/backup: `/opt/turkapiprojesi/.deploy/db-backups/payment-quote-cols-20260527T070013Z.dump`.
- Retest: Canlı IBAN init `$10` için `payableTL=473`, `creditTL=472.7961`, `roundingTL=0.2039` döndürdü; admin approve tek transaction ile bakiye ekledi; duplicate approve `409`; reject without reason `400`; reject with reason `200`; normal user admin pending endpoint `403`; test kayıtları temizlendi.
- Sonuç: FIXED LIVE FOR IBAN. Shopier/Cryptomus sandbox E2E hâlâ provider env/test credential olmadığı için bloklu.

## PAYMENT-UI-001

- Problem: Hesap ekranı top-up kutusu backend’in USD→TL yukarı yuvarlama kuralı yerine ondalıklı yaklaşık TL ve frontend-only `%5 komisyon` gösteriyordu. Bu, kullanıcıya backend tahsilatından farklı tutar gösterebilirdi.
- Kök neden: Frontend hesaplama eski görsel shell içinde simülasyon mantığıyla kalmıştı; backend init endpointleri yalnız `amountUsd` alıp `Math.ceil(amountUsd * kur)` ile `payableTL` hesaplıyor.
- Karar: DEC-FIX-PAYMENT-UI-ROUNDING-001, 3/3 APPROVED.
- Yapılan değişiklik: `src/yapayzekalab/tab-account.jsx` içinde yalnız hesap/metin mapping’i değiştirildi. Shopier/IBAN ödeme ekranı tam TL `payableTL`, USD bakiye ve `roundingTL` gösteriyor; Cryptomus USD/USDT invoice 2 ondalığa yukarı yuvarlanıyor; ödeme geçmişi `Bakiye USD`, `Tahsilat TL`, `Yuvarlama` alanlarını gösteriyor. CSS, class, layout, renk, spacing, card/button/modal yapısı değiştirilmedi.
- Test: `src/api-docs-content.test.ts` payment contract testleri önce RED, sonra PASS.
- Retest: `npm test -- src/api-docs-content.test.ts` PASS 7/7; `npm run lint` PASS; `npm test` PASS 27 files / 116 tests; `npm run build` PASS; `npm run scan:public` PASS 0 hit; `node scripts/scan-secrets.mjs` PASS 0 hit; `npm run qa:uat` PASS 10/10.
- Live deploy: `manual-20260527T071659Z-ddee303` deployed to `/opt/turkapiprojesi`, service `turkapiprojesi.service`.
- Live retest: `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps` PASS; `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` PASS 10/10; live bundle contains `Bakiye USD`, `Tahsilat TL`, `Yuvarlama`, `yukarı tam liraya`; forbidden `%5 komisyon`, `Komisyon %`, rejected template/admin password/fake-live strings absent.
- Sonuç: FIXED LIVE.

## DEPLOY-TARGET-METADATA-001

- Problem: Repo deploy script/runbook eski hedefi (`/opt/yapayzekalab`, servis `yapayzekalab`, port `4567`) gösteriyordu; gerçek canlı hedef `/opt/turkapiprojesi`, servis `turkapiprojesi.service`, port `4568`. Ayrıca son payment UI deploy manifesti yazılmadığı için `/status.deploy.id` eski restored-theme deploy’unu gösteriyordu.
- Kök neden: Manuel deploy gerçek hedefe doğru yapılmıştı, fakat generic deploy tooling ve dokümantasyon eski placeholder hedefte kalmıştı; payment UI deploy’u release manifesti üretmedi.
- Karar: DEC-FIX-DEPLOY-TARGET-METADATA-001 ve DEC-FIX-LIVE-LEGACY-ADMINPASSWORD-ENV-001, 3/3 APPROVED.
- Yapılan değişiklik: `scripts/vps-deploy.sh` varsayılan canlı hedefe hizalandı; `docs/vps-deploy.md` ve `docs/release-vps-beta-checklist.md` gerçek servis/path/port ile güncellendi; `src/deploy-target-contract.test.ts` eklendi. Test setup ve aktif dokümanlardan legacy `ADMIN_PASSWORD` placeholder’ları kaldırıldı. Canlı `.deploy/releases/manual-20260527T071659Z-ddee303.json` manifesti yazıldı. Canlı eski env backup dosyası root-only secure alana taşındı; live `.env.production` içindeki kullanılmayan legacy `ADMIN_PASSWORD` satırı kaldırıldı.
- Test: `npm test -- src/deploy-target-contract.test.ts` önce RED 2/2 fail, sonra PASS 2/2; `npm test -- src/admin-single-owner-contract.test.ts` önce RED, sonra PASS; `bash -n scripts/vps-deploy.sh scripts/vps-live-preflight.sh scripts/vps-setup.sh` PASS; `npm run lint` PASS; `npm test` PASS 28 files / 118 tests; `npm run build` PASS; `npm run scan:public` PASS; `node scripts/scan-secrets.mjs` PASS.
- Live retest: `turkapiprojesi.service` active; `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps` PASS; `/status.deploy.id=manual-20260527T071659Z-ddee303`; legacy admin password line absent; env backup no longer in public deploy backup directory and secure copy is `600 root:root`.

## LIVE-OMNI-BILLING-001 — Temporary OmniRoute GPT billing verification

- Problem: CloseRouter inference remained `502`, so successful funded API billing could not be accepted.
- Kök neden: Upstream provider failure on CloseRouter path; temporary OmniRoute route was requested and configured separately.
- Yapılan değişiklik: Kod değişikliği bu adımda yapılmadı; canlı temporary OmniRoute route üzerinden bounded funded billing retest yapıldı.
- Test: Temporary funded `yzk_live_*` key with `/v1/chat/completions`, `model=openai/gpt-5.4-mini`, `max_tokens=4`.
- Sonuç: HTTP `200`; `X-YZ-Cost-TL=0.0329`, `X-YZ-Remaining-TL=49.97`, request id present; DB balance `49.9671`, spend `0.0329`, `usage_records.status=success`; cleanup leftovers `0`.
- Durum: API/Billing happy path temporary OmniRoute GPT için accepted; token usage monitoring required.

## LIVE-PAYMENT-PROVIDER-ENV-001 — Shopier/Cryptomus provider gate

- Problem: Shopier/Cryptomus E2E hâlâ launch gate.
- Kök neden: Live `.env.production` içinde `SHOPIER_API_KEY`, `SHOPIER_API_SECRET`, `CRYPTOMUS_API_KEY`, `CRYPTOMUS_MERCHANT_ID` unset.
- Yapılan değişiklik: Credential yazılmadı. Önceki sızmış değerler canlı env’e eklenmedi.
- Test: Temporary user/JWT ile `/api/payments/methods`, `/api/payments/shopier/init`, `/api/payments/crypto/init`, `/api/payments/iban/init`; ayrıca local payment contract tests ve secret scan.
- Sonuç: Shopier/Cryptomus methods disabled, init `503`, zero payment rows; IBAN init `200` and rounded quote correct; payment contract tests 32/32; secret scan 0 hits.
- Durum: Safe-disabled PASS; Shopier/Cryptomus provider E2E `BLOCKED_BY_MISSING_ROTATED_PROVIDER_ENV`.
- Sonuç: FIXED LIVE FOR DEPLOY OBSERVABILITY / RELEASE STILL BLOCKED BY PROVIDER BILLING AND SHOPIER-CRYPTOMUS E2E.

## PAYMENT-PROVIDER-AMOUNT-GUARD-001

- Problem: Shopier/Cryptomus provider callback/webhook safety reports required explicit amount/currency mismatch protection before crediting balance.
- Kök neden: Signature/idempotency contracts existed, but route-level signed amount/currency matching needed stronger source/test evidence.
- Karar: DEC-FIX-PAYMENT-PROVIDER-AMOUNT-001, 3/3 APPROVED.
- Yapılan değişiklik: Shopier callback verification now exposes signed paid TL and currency; payment route rejects mismatch before credit. Cryptomus webhook route now requires signed amount/currency/to_currency to match the stored USD/USDT invoice expectation before credit.
- Test: `npm run lint`; `npm test`; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`.
- Retest: Full regression PASS 28 files / 126 tests; public scan 0 hit; secret scan 227 scanned / 0 hit.
- Sonuç: FIXED LOCALLY. Shopier/Cryptomus live/sandbox provider E2E remains blocked until rotated env is installed.

## OAUTH-RETURN-001

- Problem: Standard Chrome live Google OAuth returned to `/dashboard?at=...&rt=...`, but frontend stayed anonymous and owner Admin did not appear.
- Kök neden: Restored frontend did not consume `at`/`rt` query tokens from the backend callback, and `/dashboard` was not mapped to the authenticated account area.
- Karar: DEC-FIX-OAUTH-RETURN-001, 3/3 APPROVED.
- Yapılan değişiklik: `src/yapayzekalab/App.jsx` now stores OAuth return tokens with the existing token aliases and immediately removes them from the URL; `src/App.tsx` maps `/dashboard` to the existing account tab. No visual styling changed.
- Test: `npm test -- src/admin-single-owner-contract.test.ts`; `npm run lint`; `npm test`; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`.
- Retest: Targeted contract PASS 3/3; full regression PASS 28 files / 126 tests; build/scans PASS; live safe smoke/UAT still PASS.
- Sonuç: FIXED LOCALLY / LIVE DEPLOY AND CHROME OWNER RETEST REQUIRED.

## OAUTH-STATE-RESTART-001

- Problem: Giriş akışı deploy/restart sırasında bozulabiliyor. Google OAuth `state` değeri process içi `Map` içinde tutulduğu için, kullanıcı Google ekranındayken servis restart olursa callback `Invalid or expired state` döner.
- Kök neden: OAuth state memory-only idi; production deploy/restart bu state'i sıfırlıyordu.
- Yapılan değişiklik: OAuth state restart-safe imzalı ve süreli hale getirildi. Backend artık `JWT_SECRET` ile HMAC imzalı state üretip doğruluyor; process içi state Map kaldırıldı.
- Güvenlik etkisi: State hâlâ imzalı ve 5 dakika TTL ile korunuyor; token veya secret loglanmadı.
- Test: `src/server/services/google-oauth-service.test.ts` önce RED (`createOAuthState is not a function`), sonra PASS.
- Retest: `npm test -- src/admin-single-owner-contract.test.ts src/server/services/google-oauth-service.test.ts` PASS 5/5; `npm run lint` PASS; `npm test` PASS 29 files / 128 tests; `npm run build` PASS; `npm run scan:public` PASS; `node scripts/scan-secrets.mjs` PASS; live safe smoke PASS.
- Sonuç: FIXED LOCALLY / LIVE DEPLOY BLOCKED BY 4-AGENT CAPACITY GATE.
