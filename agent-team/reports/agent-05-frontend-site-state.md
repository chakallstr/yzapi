# Agent 05 - Frontend / Site State

Kapsam: `/Users/ufuk/yzapi` frontend ve gorsel artefaktlar.

## Uygulanan yuzeyler

- SPA girisi: `index.html`, `src/main.tsx`, `src/App.tsx`
- Nav: Ana Sayfa, Modeller, SSS, API, Admin.
- Ana sayfa: hero, sistem durumu, API aktivitesi, ozellik kartlari, mini model katalogu, maliyet konsolu.
- Model sayfasi: metin/gorsel/video filtreleri, arama, detay paneli.
- SSS: bakiye modeli ve accordion.
- API sayfasi: routing agirliklari, fallback model, Node/Python/cURL ornekleri.
- Admin: dashboard, kur/carpan, modeller, kullanicilar, bakiye, duyurular, audit, gelir, API keys, planlar, bekleyen havaleler.
- Bakiye yukleme modal: Shopier, IBAN, crypto.

## Eksikler

- `src/pages/` yok.
- `src/components/` yok.
- Gercek URL bazli router yok.
- `/login`, `/register`, `/dashboard`, `/billing`, `/docs`, `/status`, `/terms`, `/privacy`, `/contact` ayrilmis sayfa olarak yok.
- User panel ayrismamis.

## Gorsel riskler

- Mobil nav `hidden md:flex`; mobilde ana gezinme kaybolabilir.
- Admin ekranlari tablo/sidebar yogun; mobil tasma riski var.
- `%100 cevrimici` sabit ifade gercek provider durumu olmadan yaniltici olabilir.
- Screenshot kaniti desktop agirlikli; mobil kanit yok.

## Dogrulama

- Agent `npm run lint -- --pretty false` gecirdi.
- Agent `git diff --check -- index.html src/App.tsx src/index.css src/main.tsx src/types.ts` gecirdi.

