# YapayZekaLab VPS Deploy Runbook

## Hedef

Tek VPS üzerinde `yapayzekalab.org` panel ve API aynı Express app olarak çalışır. Mevcut canlı hedefte Nginx `127.0.0.1:4568` üstündeki Node servisine proxy yapar.

## Sunucu

- Ubuntu 24.04 LTS veya mevcut `vps` hedefindeki CentOS Stream 8
- Node.js 22
- Nginx
- PostgreSQL client (`pg_dump` backup için)
- systemd service: `turkapiprojesi`
- App path: `/opt/turkapiprojesi`
- Env file: `/opt/turkapiprojesi/.env.production`

## İlk Kurulum

```bash
sudo bash scripts/vps-setup.sh
```

Setup scripti dağıtımı otomatik algılar:

- Debian/Ubuntu: `apt-get`, `ufw`, `/etc/nginx/sites-available` + `/etc/nginx/sites-enabled`
- CentOS/RHEL: `dnf`, mevcutsa `firewalld`, `/etc/nginx/conf.d/yapayzekalab.conf`

CentOS/RHEL yolunda mevcut `/etc/nginx/conf.d/seslab.com.tr.conf` gibi canlı config dosyaları silinmez veya devre dışı bırakılmaz.

Repo VPS'e klonlandıktan sonra:

```bash
sudo chown -R turkapi:turkapi /opt/turkapiprojesi
sudo -u turkapi cp .env.example /opt/turkapiprojesi/.env.production
sudo chmod 600 /opt/turkapiprojesi/.env.production
```

`.env.production` içine gerçek değerler girilir:

- `NODE_ENV=production`
- `PORT=4568`
- `DATABASE_URL`
- `JWT_SECRET`
- `API_KEY_ENCRYPTION_SECRET` (zorunlu; `JWT_SECRET`'tan **farklı**, en az 32 karakter — saklı API anahtarlarını şifreler)
- `APP_BASE_URL=https://yapayzekalab.org`
- `FRONTEND_AUTH_RETURN=/`
- `CLOSEROUTER_API_KEY`
- ödeme ve email secretları
- `TELEGRAM_BOT_TOKEN` kullanılıyorsa `TELEGRAM_WEBHOOK_SECRET` (zorunlu — aşağıdaki Telegram Webhook bölümüne bakın)
- WhatsApp OTP açıksa (`WHATSAPP_OTP_ENABLED=true`) `WHATSAPP_OTP_HASH_SECRET` (zorunlu; `JWT_SECRET`'tan farklı)

Admin ayrı şifre kullanmaz; admin yetkisi `cix.crazy666@gmail.com` Google/user oturumuyla verilir.

Deploy scripti required alanları boş bırakılmışsa durur. `.env.production` izni `600` olmalıdır. Ayrıca `API_KEY_ENCRYPTION_SECRET == JWT_SECRET` ise ve `TELEGRAM_BOT_TOKEN` set olup `TELEGRAM_WEBHOOK_SECRET` boşsa deploy başlamadan durur (fail-fast).

## Telegram Webhook Secret (K4)

`TELEGRAM_BOT_TOKEN` set ise, production'da `TELEGRAM_WEBHOOK_SECRET` **zorunludur**; aksi halde webhook gelen tüm update'leri reddeder ve bot durur. `.env.production` içindeki değer ile Telegram `setWebhook` `secret_token` **birebir aynı** olmalıdır:

```bash
# .env.production içinde set:  TELEGRAM_WEBHOOK_SECRET=<32+ char rastgele>
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://yapayzekalab.org/api/payments/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET ile AYNI>"
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo" | jq
```

## API Key Şifreleme Secret Rotasyonu (Y4)

`API_KEY_ENCRYPTION_SECRET` değiştirilirse mevcut saklı API anahtarı şifreleri çözülemez hale gelir. Güvenli rotasyon:

```bash
# 1. Yeni secret'ı API_KEY_ENCRYPTION_SECRET'a koy
# 2. Önceki değeri API_KEY_ENCRYPTION_SECRET_OLD'a koy
# 3. Dry-run:
npm run db:rotate-cipher
# 4. Onayla (kalıcı yeniden şifreleme):
npm run db:rotate-cipher -- --confirm
# 5. Tüm satırlar rotate olunca API_KEY_ENCRYPTION_SECRET_OLD'u kaldır
```

## Deploy

```bash
APP_DIR=/opt/turkapiprojesi SERVICE=turkapiprojesi SMOKE_BASE_URL=http://127.0.0.1:4568 bash scripts/vps-deploy.sh
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
9. `systemctl restart turkapiprojesi` ile servisi yeniler.
10. `npm run smoke:vps` ile `/health`, `/status`, `/api/models`, auth `401`, JSON `404` ve opsiyonel canlı API key smoke kontrollerini çalıştırır.

Opsiyonel canlı smoke değişkenleri:

```bash
SMOKE_BASE_URL=http://127.0.0.1:4568
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
APP_DIR=/opt/turkapiprojesi SERVICE=turkapiprojesi npm run ops:vps-status
```

Bu komut systemd, Nginx config, port, disk/RAM ve son logları read-only gösterir.

## Geri Alma

Önceki commit'e dön:

```bash
cd /opt/turkapiprojesi
sudo -u turkapi /opt/turkapiprojesi/.deploy/rollback-last.sh
```

Migration sonrası geri alma gerekiyorsa DB backup dosyaları `.deploy/db-backups/` altındadır. Para/ledger tabloları için DB geri dönüşü manuel karar gerektirir; sadece kod rollback'i migration etkisini geri almaz.

## Release Manifest

Her deploy `.deploy/releases/<deploy_id>.json` üretir. Manifest içinde commit, branch, backup dosyası, rollback script yolu ve smoke çıktısı bulunur.
