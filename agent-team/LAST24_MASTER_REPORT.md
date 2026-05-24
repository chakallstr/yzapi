# YapayZekaLab Son 24 Saat Master Rapor

Tarih: 2026-05-24
Ana proje: `/Users/ufuk/yzapi`
Plan/karar arsivi: `/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api`

## Kisa sonuc

Son 24 saatte YapayZekaLab / YZ API projesi ciddi bicimde sekillenmis. Ana karar net: paket veya gunluk istek satilmayacak; kullanici TL/USD bakiye yukleyecek, model bazli gercek kullanim kadar bakiyeden dusecek. Repo tarafinda frontend, backend, fiyat motoru, payment dokumani, proxy/auth dokumani ve cPanel deploy artefaktlari olusmus.

## Urun kararlari

- Paket, preset, gunluk istek paketi yok.
- Bakiye/kredi bazli duz satis var.
- Kullanici bakiye yukler, API key alir, kullandikca bakiyesi duser.
- Text/image/video ticari olarak tek bakiye defterinden satilabilir.
- MVP ve site dili text API oncelikli olabilir, ama plan full catalog.
- Slogan yonu: "Kota yok, gizli limit yok. Bakiye yukle, kullandigin kadar ode."

## Fiyat kararlari

- Guncel router karari: YapayZekaLab backend `ProviderAdapter` ana katman; MVP upstream CloseRouter, 9Router sadece Faz-2 POC/fallback adayi.
- Text fiyatlama: provider fiyat * 3.00.
- Text faturalama: `billable_tokens = real_tokens / 0.90`.
- 900,000 gercek token = 1,000,000 faturalama tokeni.
- Efektif text carpani yaklasik 3.3333x.
- Kur: canli USD/TRY + %3 buffer.
- Minimum yukleme: 250 TL.
- KDV dahil fiyatlama.
- Prompt/cevap saklama hedefi: 30 gun.
- 128K input limiti varsayilan; ustu admin onayli.

## Teknik durum

- Frontend tek SPA: `src/App.tsx`.
- UI yuzeyleri: ana sayfa, modeller, SSS, API, admin, bakiye modal.
- Backend Express/TypeScript: `src/server/index.ts`.
- API mountlari: `/health`, `/api/admin`, `/api/auth`, `/api/user`, `/api/payments`, `/v1`.
- Proxy: `/v1/chat/completions`, image generation/edit.
- Video route su an 501.
- Auth: Google OAuth ve API key.
- Payment: Shopier, IBAN, Cryptomus.
- DB: Drizzle/Postgres.

## Deploy durumu

- Hedef domain: `yapayzekalab.org`.
- Host: `jupiter.netlen.com.tr`.
- cPanel user: `ufukince1`.
- App dizini: `/home/ufukince1/yapayzekalab`.
- Build ciktilari `dist/` altinda mevcut.
- cPanel/SSH ekran kanitlari ve RVF kayitlari mevcut.

## Kritik bloklar

1. Deploy migration/seed mismatch:
   - Build `dist/server.js` ve SQL migrations kopyaliyor.
   - Dokuman `dist/server/db/migrate.js` ve `seed.js` bekliyor.
   - Bu dosyalar yok.

2. Startup path tutarsizligi:
   - cPanel dokumani startup `dist/server.js`.
   - `.htaccess` yorumu `server.js` diyor.

3. Streaming runtime riski:
   - `dist/server.js` icinde `__require("stream")` var.

4. Claude IDE uyumu:
   - Mevcut kod OpenAI-compatible chat proxy.
   - Native Claude/Anthropic panel icin `/v1/messages` uyumu kesin degil.

5. Frontend route/mobil:
   - `src/pages` ve `src/components` yok.
   - Mobil nav riskli.

6. README:
   - Eski AI Studio/Gemini template gorunuyor.

## Dogrulanmis

- Agent 05: `npm run lint -- --pretty false` gecti.
- Agent 05: frontend diff-check gecti.
- Agent 06: `npm run lint` gecti.
- Agent 06: `npm test` gecti, 6 test dosyasi / 41 test.
- Context taramasi: deploy risk checks net.

## Sonraki teknik sira

1. Canonical README ve master handoff dokumanini repo kokune bagla.
2. Build/deploy scriptini migration/seed JS cikacak sekilde duzelt veya deploy dokumanini TS kaynaklarla calisacak sekilde degistir.
3. cPanel startup dosyasi kararini tek hale getir.
4. Streaming bundle riskini test et ve gerekirse stream importunu ESM uyumlu hale getir.
5. Video endpointleri UI'da gizle veya backend implement et.
6. Mobil nav ve URL route ayrimini yap.
7. Claude IDE hedefleniyorsa Anthropic Messages API compatible route ekle/dogrula.
