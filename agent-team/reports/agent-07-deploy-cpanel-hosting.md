# Agent 07 - Deploy / cPanel / Hosting

Kapsam: deploy dokumani, cPanel/SSH artefaktlari, build ciktilari.

## Deploy hedefi

- Host: `jupiter.netlen.com.tr`
- cPanel user: `ufukince1`
- Domain: `yapayzekalab.org`
- App dizini: `/home/ufukince1/yapayzekalab`
- cPanel app root: `yapayzekalab`
- Startup file dokuman karari: `dist/server.js`

## Artefaktlar

- `cpanel-deploy.md`
- `.htaccess`
- `dist/index.html`
- `dist/server.js`
- `dist/server.js.map`
- `dist/.env.example`
- `20260524-121849-cpanel-ssh-investigate.rvf`
- `20260524-123217-cpanel-deploy-yzapi.rvf`
- `20260524-130235-cpanel-deploy.rvf`
- `20260524-131025-cpanel-chmod-env.rvf`
- `cpanel_login.png`
- `filemanager_yapayzekalab.png`
- `nodejs.png`
- `ssh_real.png`
- `terminal.png`

## Bloklar

- `package.json` build: `vite build` + esbuild `src/server/index.ts` -> `dist/server.js`.
- `postbuild` sadece migrations ve `.env.example` kopyaliyor.
- `dist/server/db/migrate.js` yok.
- `dist/server/db/seed.js` yok.
- `cpanel-deploy.md` migration/seed calistirma adimi bu dosyalari bekliyor.
- `.htaccess` yorumu Passenger startup `server.js` diyor; dokuman startup `dist/server.js` diyor.

## Sonuc

Deploy artefaktlari hazir gorunuyor ama migration/seed ve startup talimati duzeltilmeden production deploy guvenli degil.

