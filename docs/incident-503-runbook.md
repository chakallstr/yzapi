# 503 Incident Runbook

Canlı `503` durumunda sırayla kontrol et:

1. DNS: domain VPS IP'sine gidiyor mu?
2. HTTPS: sertifika geçerli mi?
3. Nginx: `sudo nginx -t` başarılı mı?
4. App port: `4567` dinliyor mu?
5. systemd: `sudo systemctl status yapayzekalab` active/running mi?
6. Env: `/opt/yapayzekalab/.env.production` var mı, izni `600` mü?
7. DB: deploy scriptindeki `SELECT 1` DB check geçiyor mu?
8. App log: `journalctl -u yapayzekalab -n 100 --no-pager`
9. Public smoke: `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`
10. Gerekirse rollback: `/opt/yapayzekalab/.deploy/rollback-last.sh`

Tek komut özet:

```bash
APP_DIR=/opt/yapayzekalab SERVICE=yapayzekalab npm run ops:vps-status
```

Localden read-only canlı kapı kontrolü:

```bash
VPS_ALIAS=vps DOMAIN=yapayzekalab.org npm run preflight:live
```

Bu komut domain HTTP durumunu, `/api/models` sayısını, SSH ile VPS'teki app dizini/env/service/Nginx varlığını kontrol eder; secret değerlerini yazdırmaz.

Incident kapanmadan önce `agent-team/WORKLOG.md` içine kök neden, işlem ve son smoke sonucu yazılır.
