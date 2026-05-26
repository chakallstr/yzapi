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
- Retest: `/admin` Chrome smoke ile `Admin Girişi` göründü; `/docs` API tab içeriği göründü.
- Sonuç: FIXED LOCAL.

## BUG-QA-001

- Problem: Kullanıcı test listesinde yer alan `node scripts/scan-secrets.mjs` komutu repo içinde olmadığı için `MODULE_NOT_FOUND` ile kırılıyordu.
- Kök neden: Public bundle scan vardı, fakat Git kapsamlı kaynak secret scanner yoktu.
- Karar: DEC-FIX-004, 3/3 APPROVED.
- Yapılan değişiklik: `scripts/scan-secrets.mjs` eklendi; gerçek secret değerlerini basmadan Git kapsamındaki dosyaları tarıyor. `qa-artifacts/` `.gitignore` kapsamına alındı.
- Test: `src/secret-scan-script.test.ts`
- Retest: `node scripts/scan-secrets.mjs` PASS, 175 dosya tarandı, hit yok.
- Sonuç: FIXED.
