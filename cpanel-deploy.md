# cPanel Deployment Guide — YapayZekaLab

## Overview

- **Server host:** jupiter.netlen.com.tr  
- **cPanel user:** ufukince1  
- **App directory:** /home/ufukince1/yapayzekalab  
- **Domain:** yapayzekalab.org  
- **Node version:** 20+ (required)

---

## 1. SSH Login

```bash
ssh ufukince1@jupiter.netlen.com.tr
```

Password: provided via secure channel (never store in plain text or version control).

---

## 2. Create PostgreSQL Database via cPanel UI

1. Log in to cPanel at `https://jupiter.netlen.com.tr:2083`
2. Scroll to the **Databases** section, click **PostgreSQL Databases**
3. Under **Create New Database**, enter a name e.g. `yapayzekalab_db`, click **Create Database**
4. Under **PostgreSQL Users**, enter a username e.g. `yzapi_user` and a strong password, click **Create User**
5. Under **Add User To Database**, select the user and database, click **Add**. Grant **ALL PRIVILEGES**
6. Note the full DB URL: `postgres://yzapi_user:<password>@localhost:5432/ufukince1_yapayzekalab_db`

---

## 3. Setup Node.js App in cPanel

1. In cPanel, find the **Software** section, click **Setup Node.js App**
2. Click **Create Application**
3. Set the following fields:
   - **Node.js version**: 20.x or higher
   - **Application mode**: Production
   - **Application root**: `yapayzekalab`  (relative to home, full path = `/home/ufukince1/yapayzekalab`)
   - **Application URL**: `yapayzekalab.org`
   - **Application startup file**: `dist/server.js`
4. Click **Create**. cPanel creates a virtual environment and sets up Passenger.

---

## 4. Upload Code to Server

### Option A — git clone (recommended if repo is on GitHub)

```bash
# SSH into the server first
cd /home/ufukince1
git clone https://github.com/YOUR_ORG/yapayzekalab.git yapayzekalab
cd yapayzekalab
```

### Option B — rsync from local dist/ (deploy pre-built artifacts)

```bash
# Run locally from project root after npm run build
rsync -avz --delete dist/ ufukince1@jupiter.netlen.com.tr:/home/ufukince1/yapayzekalab/dist/
rsync -avz package.json package-lock.json ufukince1@jupiter.netlen.com.tr:/home/ufukince1/yapayzekalab/
```

---

## 5. Install Production Dependencies

```bash
cd /home/ufukince1/yapayzekalab
# If using git clone (need to build):
npm ci
npm run build

# OR if rsync (only need runtime deps):
npm ci --omit=dev
```

---

## 6. Setup .env File

```bash
cd /home/ufukince1/yapayzekalab
cp dist/.env.example .env
nano .env   # or use vi
chmod 600 .env
```

Fill in all required values:

```env
# ── Core ──────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=4567
DATABASE_URL=postgres://yzapi_user:PASSWORD@localhost:5432/ufukince1_yapayzekalab_db
LOG_LEVEL=info

# ── Auth ──────────────────────────────────────────────────────────────────────
JWT_SECRET=CHANGE_THIS_TO_RANDOM_64_CHAR_STRING

# Admin ayrı şifre kullanmaz; yetkili Google hesabı:
# cix.crazy666@gmail.com

# ── App URL ───────────────────────────────────────────────────────────────────
APP_BASE_URL=https://yapayzekalab.org
FRONTEND_AUTH_RETURN=/

# ── Google OAuth (optional) ───────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yapayzekalab.org/api/auth/google/callback

# ── CloseRouter proxy ─────────────────────────────────────────────────────────
CLOSEROUTER_API_KEY=
CLOSEROUTER_BASE_URL=https://api.closerouter.dev/v1

# ── Shopier (optional) ────────────────────────────────────────────────────────
SHOPIER_API_KEY=
SHOPIER_API_SECRET=
SHOPIER_RETURN_URL=https://yapayzekalab.org/api/payments/shopier/callback

# ── Cryptomus (optional) ──────────────────────────────────────────────────────
CRYPTOMUS_MERCHANT_ID=
CRYPTOMUS_API_KEY=
CRYPTOMUS_RETURN_URL=https://yapayzekalab.org/api/payments/crypto/callback
CRYPTOMUS_WEBHOOK_URL=https://yapayzekalab.org/api/payments/crypto/webhook

# ── IBAN ──────────────────────────────────────────────────────────────────────
IBAN_BANK_NAME=Ziraat Bankasi
IBAN_NUMBER=TR00 0000 0000 0000 0000 0000 00
IBAN_OWNER=Ad Soyad

# ── KDV ───────────────────────────────────────────────────────────────────────
KDV_RATE=0.20

# ── Email (optional) ──────────────────────────────────────────────────────────
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.yapayzekalab.org
SMTP_PORT=587
SMTP_USER=noreply@yapayzekalab.org
SMTP_PASS=EMAIL_PASSWORD
SMTP_FROM=YapayZekaLab <noreply@yapayzekalab.org>
```

---

## 7. Run Database Migration

`npm run build` produces `dist/server/db/migrate.js` and copies SQL migrations into `dist/server/db/migrations/`.

```bash
cd /home/ufukince1/yapayzekalab
node -e "
import('./dist/server/db/migrate.js').then(() => { console.log('Migration done'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Or if using tsx:
```bash
npx tsx src/server/db/migrate.ts
```

---

## 8. Run Database Seed (first time only)

`npm run build` produces `dist/server/db/seed.js`.

```bash
node -e "
import('./dist/server/db/seed.js').then(() => { console.log('Seed done'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

---

## 9. Deploy .htaccess and Start the App

`npm run build` copies `.htaccess` into `dist/.htaccess`. If deploying manually, keep a copy in the app directory root too:

```bash
cp /home/ufukince1/yapayzekalab/.htaccess /home/ufukince1/yapayzekalab/dist/.htaccess
```

**Start via cPanel UI:**
1. Go back to **Setup Node.js App**
2. Click the **Run** button next to `yapayzekalab.org`

**Or restart via SSH:**
```bash
mkdir -p /home/ufukince1/yapayzekalab/tmp
touch /home/ufukince1/yapayzekalab/tmp/restart.txt
```

---

## 10. Enable AutoSSL / HTTPS

1. In cPanel, go to **Security** → **SSL/TLS Status**
2. Find `yapayzekalab.org` in the list
3. Click **Run AutoSSL**. Wait 1–2 minutes for Let's Encrypt to issue the certificate
4. Verify with: `curl -I https://yapayzekalab.org/health`

---

## 11. cPanel Cron Jobs (keep-alive + fallback)

In cPanel, go to **Advanced** → **Cron Jobs**. Add these 3 entries:

| Schedule | Command |
|----------|---------|
| `*/5 * * * *` | `curl -s https://yapayzekalab.org/health > /dev/null 2>&1` |

This keeps the Passenger app warm and alerts you if the health endpoint goes down.

The Node.js background jobs (kur-refresh, low-balance-scan, daily-report) run **inside** the app process — no separate cron lines needed for them.

---

## 12. Smoke Test

```bash
# Health check
curl -s https://yapayzekalab.org/health | python3 -m json.tool
# Expected: { "status": "ok", "checks": { "db": "ok", ... } }

# Frontend loads
curl -sI https://yapayzekalab.org/ | head -5
# Expected: HTTP/2 200

# API responds (403 = auth working correctly)
curl -s https://yapayzekalab.org/api/user/me | head -1
# Expected: { "error": "..." }
```

---

## 13. Rollback

If the new deployment breaks something:

```bash
# SSH into server
cd /home/ufukince1/yapayzekalab

# Method A: git rollback
git log --oneline -5          # find the previous working commit SHA
git checkout <previous-sha>   # or git reset --hard <sha>
npm ci --omit=dev
touch tmp/restart.txt

# Method B: restore from backup dist/ (if you kept one)
rm -rf dist_current
mv dist dist_current
mv dist_backup dist
touch tmp/restart.txt
```

After rollback, re-verify:
```bash
curl -s https://yapayzekalab.org/health
```

---

## Troubleshooting

- **App won't start**: Check `~/.passenger/logs/` or cPanel Error Logs under **Metrics → Errors**
- **DB connection failed**: Verify `DATABASE_URL` in `.env` and that the Postgres user has privileges
- **404 on /api routes**: Ensure the Node.js app is Running in Setup Node.js App, not stopped
- **HTTPS redirect loop**: In cPanel SSL → Force HTTPS, ensure only one redirect rule is active
- **Cron jobs not running**: Ensure cPanel Cron uses the full path to curl: `/usr/bin/curl`
