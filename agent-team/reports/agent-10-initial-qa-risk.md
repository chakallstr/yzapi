# Agent 10 - Initial QA / Risk

Kapsam: ilk QA risk listesi.

## Kritik riskler

- `README.md` eski template: `README_TEMPLATE=YES`.
- Backend video route: `VIDEO_501=YES`.
- Dist bundle streaming riski: `STREAM_REQUIRE_DIST=YES`.
- Deploy migration JS yok: `DIST_MIGRATE=NO`.
- Deploy seed JS yok: `DIST_SEED=NO`.
- `.env` mevcut; secret rapora alinmadi: `ENV_EXISTS=YES`.
- Mobil nav gizli olabilir: `MOBILE_NAV_HIDDEN=YES`.

## Oncelik

1. Deploy bloklari: migration/seed ve startup path.
2. README ve canonical master doc.
3. Claude IDE endpoint uyumu.
4. Mobil nav ve route ayrimi.
5. Video endpoint stratejisi.

## Dogrulama komutlari

- `npm run lint`
- `npm test`
- `npm run build`
- `test -f dist/server/db/migrate.js`
- `test -f dist/server/db/seed.js`
- `rg '__require\\("stream"\\)' dist/server.js`
- `curl -I https://yapayzekalab.org/`

