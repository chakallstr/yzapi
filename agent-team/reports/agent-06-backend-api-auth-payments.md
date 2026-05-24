# Agent 06 - Backend / API / Auth / Payments

Kapsam: `/Users/ufuk/yzapi` backend.

## Endpointler

- `GET /health`
- `/api/admin`
- `/api/auth`
- `/api/user`
- `/api/payments`
- `/v1` proxy
- Auth: Google OAuth, refresh, logout.
- Admin auth: login/logout/me.
- User/API key: me, api key create/list/revoke.
- Proxy: chat completions, image generation/edit.
- Video submit/poll: simdilik `501`.
- Payments: methods, Shopier, IBAN approve/reject, Cryptomus webhook/callback, history/admin all.

## Kararlar

- Admin auth: `ADMIN_PASSWORD` + JWT.
- User auth: Google OAuth.
- API key format: `yzk_live_*`, bcrypt hash, Bearer header.
- Proxy billing: CloseRouter response sonrasi usage record + atomik bakiye dusumu.
- Odeme tutari KDV dahil gross kabul ediliyor.
- IBAN her zaman acik; Shopier/Cryptomus env yoksa 503.

## Kritik deploy bloklari

- Build script `dist/server.js` ve migration SQL kopyaliyor.
- `cpanel-deploy.md` ise `dist/server/db/migrate.js` ve `seed.js` import etmeyi soyluyor.
- Bu JS dosyalari build sonucunda yok.
- ESM bundle icinde `__require("stream")` var; streaming runtime riski.
- `.htaccess` yorumu startup `server.js`, cPanel dokumani `dist/server.js` diyor.

## Dogrulama

- Agent `npm run lint` gecirdi.
- Agent `npm test` gecirdi: 6 test dosyasi, 41 test.
- Build calistirilmadi; read-only audit kapsami.

