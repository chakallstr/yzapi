# Release VPS Beta Checklist

## Hedef

`phase/release-vps-beta` branch'i, text-only Beta API için canlı VPS'e taşınabilir ilk release snapshot'ıdır.

## Commit Grupları

1. Backend core, DB, billing, proxy, tests.
2. Deploy/VPS scripts, Nginx/systemd templates, smoke/public scan.
3. Frontend activation, admin mutabakat görünümü, customer panel yüzeyi.
4. Docs, pricing snapshot, agent reports, WORKLOG/CLAUDE/README kayıtları.

## Local Gate

Her commit grubu öncesi veya final release öncesi:

```bash
git diff --check
npm run lint
npm test
npm run build
npm run scan:public
```

## Live Gate

VPS üzerinde:

```bash
APP_DIR=/opt/yapayzekalab bash scripts/vps-deploy.sh
```

Başarı kriterleri:

- `/health` 200 ve `checks.db="ok"`
- `/status` 200 ve `modelCount=33`
- `/api/models` 33 model
- `/v1/chat/completions` keysiz `401`
- bilinmeyen `/api/*` ve `/v1/*` JSON `404`
- `SMOKE_API_KEY` ile başarılı chat
- `SMOKE_LOW_BALANCE_API_KEY` ile `402`
- `.deploy/releases/*.json` içinde backup, smoke ve rollback yolu

## Rollback Gate

Canlı deploy sonrası düşük trafikte:

```bash
sudo -u yapayzekalab /opt/yapayzekalab/.deploy/rollback-last.sh
```

Rollback smoke geçmeden release güvenli sayılmaz.

## Public Güven

- Public bundle içinde `çarpan`, `billing ratio`, dahili formül ve upstream secret olmayacak.
- Image/video doğrulanmadan production-ready görünmeyecek.
- Text-only Beta API mesajı korunacak.
