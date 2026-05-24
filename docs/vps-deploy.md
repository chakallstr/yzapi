# YapayZekaLab VPS Deploy Runbook

## Hedef

Tek VPS üzerinde `yapayzekalab.org` panel ve API aynı Express app olarak çalışır. Nginx `127.0.0.1:4567` üstündeki Node servisine proxy yapar.

## Sunucu

- Ubuntu 24.04 LTS
- Node.js 22
- Nginx
- PostgreSQL client (`pg_dump` backup için)
- systemd service: `yapayzekalab`
- App path: `/opt/yapayzekalab`
- Env file: `/opt/yapayzekalab/.env.production`

## İlk Kurulum

```bash
sudo bash scripts/vps-setup.sh
```

Repo VPS'e klonlandıktan sonra:

```bash
sudo chown -R yapayzekalab:yapayzekalab /opt/yapayzekalab
sudo -u yapayzekalab cp .env.example /opt/yapayzekalab/.env.production
sudo chmod 600 /opt/yapayzekalab/.env.production
```

`.env.production` içine gerçek değerler girilir:

- `NODE_ENV=production`
- `PORT=4567`
- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `APP_BASE_URL=https://yapayzekalab.org`
- `FRONTEND_AUTH_RETURN=/`
- `CLOSEROUTER_API_KEY`
- ödeme ve email secretları

Deploy scripti required alanları boş bırakılmışsa durur. `.env.production` izni `600` olmalıdır.

## Deploy

```bash
APP_DIR=/opt/yapayzekalab bash scripts/vps-deploy.sh
```

Deploy scripti sırasıyla:

1. `.env.production` varlık, izin ve required key kontrolü yapar.
2. Önceki git revision için `.deploy/rollback-last.sh` rollback scripti üretir.
3. `npm ci` çalıştırır.
4. Production DB bağlantısını `SELECT 1` ile doğrular.
5. `npm run lint`, `npm test`, `npm run build` kapılarını çalıştırır.
6. `npm run scan:public` ile public bundle secret/formül taraması yapar.
7. `pg_dump` ile migration öncesi backup alır.
8. `NODE_ENV=production npm run db:migrate` çalıştırır.
9. `systemctl restart yapayzekalab` ile servisi yeniler.
10. `npm run smoke:vps` ile `/health`, `/status`, `/api/models`, auth `401`, JSON `404` ve opsiyonel canlı API key smoke kontrollerini çalıştırır.

Opsiyonel canlı smoke değişkenleri:

```bash
SMOKE_BASE_URL=http://127.0.0.1:4567
SMOKE_API_KEY=yzk_live_...
SMOKE_LOW_BALANCE_API_KEY=yzk_live_...
SMOKE_CHAT_MODEL=anthropic/claude-haiku-4.5
```

`SMOKE_API_KEY` veya `SMOKE_LOW_BALANCE_API_KEY` yoksa script sahte başarı yazmaz; çıktıya `manual-live-required` notu düşer.

## HTTPS

DNS VPS IP'sine döndükten sonra:

```bash
sudo certbot --nginx -d yapayzekalab.org -d www.yapayzekalab.org
```

## Smoke Test

```bash
curl -i https://yapayzekalab.org/health
curl -s https://yapayzekalab.org/api/models | jq length
curl -i https://yapayzekalab.org/v1/__smoke_missing_route__
```

Başarı kriteri:

- `/health` 200 ve `checks.db = "ok"`
- `/api/models` 33 model
- SPA ana sayfa 200
- bilinmeyen `/api/*` ve `/v1/*` route'ları HTML yerine JSON `404` döner
- `/v1/*` istekleri sadece `yzk_live_*` key ile çalışır
- `/status` canlı sistem durumunu secretsız şekilde döner

## Status ve Reconciliation

Public status:

```bash
curl -s https://yapayzekalab.org/status | jq
```

Admin reconciliation:

```bash
curl -H "Authorization: Bearer <admin_jwt>" \
  https://yapayzekalab.org/api/admin/reconciliation

curl -H "Authorization: Bearer <admin_jwt>" \
  https://yapayzekalab.org/api/admin/reconciliation/export
```

Reconciliation raporu kullanıcı bakiyesi ile ledger transaction toplamını karşılaştırır. `status="drift"` dönerse deploy tamam sayılamaz; fark rapora yazılır.

## Operasyon Status

VPS üzerinde:

```bash
APP_DIR=/opt/yapayzekalab SERVICE=yapayzekalab npm run ops:vps-status
```

Bu komut systemd, Nginx config, port, disk/RAM ve son logları read-only gösterir.

## Geri Alma

Önceki commit'e dön:

```bash
cd /opt/yapayzekalab
sudo -u yapayzekalab /opt/yapayzekalab/.deploy/rollback-last.sh
```

Migration sonrası geri alma gerekiyorsa DB backup dosyaları `.deploy/db-backups/` altındadır. Para/ledger tabloları için DB geri dönüşü manuel karar gerektirir; sadece kod rollback'i migration etkisini geri almaz.

## Release Manifest

Her deploy `.deploy/releases/<deploy_id>.json` üretir. Manifest içinde commit, branch, backup dosyası, rollback script yolu ve smoke çıktısı bulunur.
