# YapayZekaLab — Deploy Sonrası Durum

## ⚠️ Production durumu
- **URL**: https://yapayzekalab.org
- **Son doğrulama (2026-05-24)**: https://yapayzekalab.org/ → 503
- **Health**: https://yapayzekalab.org/health → 503
- **Models**: https://yapayzekalab.org/api/models → 503
- **Frontend**: https://yapayzekalab.org/ → 503
- **Admin panel**: Admin tab'a girip "Giriş Yap"; parola sadece cPanel `.env` içindeki `ADMIN_PASSWORD` değerinden kontrol edilir.
- **DB**: Neon PostgreSQL (eu-central-1, free tier)
- **Node**: 22.22.2, cPanel Phusion Passenger

Local production build sağlıklı: `/health` 200, `db:"ok"`, `/api/models` 33 model. Canlı problem cPanel Passenger/deploy/env katmanında araştırılmalı.

## 🔑 Üretim parolaları

Üretim parolaları dokümana yazılmaz. `ADMIN_PASSWORD` sadece cPanel `.env` içinde tutulmalı; değişiklik gerekiyorsa yeni parola üret, `.env`'i güncelle ve app restart et.

## ⚠️ Yapman gereken 2 küçük iş

### 1. `.env` permissions 600 yap (güvenlik)
- cPanel File Manager > `/home/ufukince1/yapayzekalab/.env`
- Sağ tık → "Change Permissions"
- Numerik kutu: `600` → kaydet
- Şu an `0644`, dosya şifre içeriyor, sadece sen okuyabilmelisin

### 2. cPanel API Token oluştur (kolay deploy için)
Bir kez yapılır, sonra `npm run deploy` çalışır.

1. cPanel login → arama: **"Manage API Tokens"**
2. **Create** → Name: `yzapi_deploy` → (expiration yok ya da 1 yıl) → Create
3. Görünen token'ı kopyala (bir daha gösterilmez)
4. Lokal Mac'te:
   ```bash
   cd /Users/ufuk/yzapi
   cp .env.deploy.example .env.deploy
   # .env.deploy dosyasını aç, CPANEL_TOKEN= satırına token'ı yapıştır
   ```
5. Artık: `npm run deploy` ile her değişiklik tek komutla canlıya çıkar.

## 🚀 Sonraki Deploy

Kod değişiklik yaptığında:
```bash
npm run deploy           # build + upload + restart + health check
# veya
npm run deploy:fast      # build atla, mevcut dist/'i kullan
```

Script şunları yapar:
1. Local: `npm run build` (vite + esbuild)
2. `tsc --noEmit` check
3. ZIP: dist/ + package.json + package-lock.json
4. Upload zip → cPanel via Fileman API (token auth)
5. Extract zip server'da
6. Zip temizle
7. `tmp/restart.txt` touch (Passenger restart trigger)
8. `https://yapayzekalab.org/health` GET (5 retry)
9. `/api/models` count check (33 bekleniyor)

Build çıktısı şu dosyaları üretmelidir:

- `dist/server.js`
- `dist/server/db/migrate.js`
- `dist/server/db/seed.js`
- `dist/server/db/migrations/*.sql`
- `dist/.htaccess`

## 🧩 Eklenmesi gereken provider key'leri

Bunlar `.env`'de boş — eklediğinde ilgili özellik aktif olur:

| Env değişkeni | Aktif edeceği özellik | Nereden alınır |
|---|---|---|
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google ile kullanıcı login | console.cloud.google.com → OAuth 2.0 Client → Web app → Redirect URI: `https://yapayzekalab.org/api/auth/google/callback` |
| `CLOSEROUTER_API_KEY` | Gerçek model proxy çalışır | closerouter.dev panel |
| `SHOPIER_API_KEY` + `SHOPIER_API_SECRET` | Kart ödemesi (kullanıcı bakiye yükleyebilir) | shopier.com merchant |
| `CRYPTOMUS_MERCHANT_ID` + `CRYPTOMUS_API_KEY` | USDT/TRC20 ödemesi | cryptomus.com merchant |
| `IBAN_BANK_NAME` + `IBAN_NUMBER` + `IBAN_OWNER` | IBAN havale (manuel admin onaylı) | sen bilirsin |
| `RESEND_API_KEY` (+ `EMAIL_PROVIDER=resend`) | Welcome/bakiye/makbuz email | resend.com |

Eklemek için: `.env`'i düzenle (File Manager'da sağ tık → Edit), kaydet, Node.js App > Restart.

## 🔒 Güvenlik kontrolleri

- [ ] cPanel parolanı değiştir (eski parola düz metin geçti)
- [ ] cPanel'de 2FA aç (Security > Two-Factor Auth)
- [ ] `.env` permissions 600
- [ ] Neon DB'de connection string rotate (Neon dashboard → Settings → Reset password) — production ortamda yeni parola al
- [ ] cPanel API token oluştur + `.env.deploy`'a yaz (.gitignore'da)

## 🐛 Sorun çıkarsa

| Sorun | Çözüm |
|---|---|
| `/health` 502/503 | File Manager > `yapayzekalab/stderr.log` aç → son satırlara bak. Genelde `.env` eksik bir değişken |
| `/health` "It works!" | Placeholder server.js döndü, deploy başarısız. `dist/server.js` boyutunu kontrol et — 130KB+ olmalı |
| Admin login 401 | `.env`'deki ADMIN_PASSWORD tam parola olmalı, special char escape etme |
| `db:"fail"` | Neon DATABASE_URL yanlış veya Neon DB pause olmuş (free tier 5dk idle → suspend, ilk istek yeniden uyandırır, 2-3sn gecikme normal) |

## 📊 Domain ekosistemi

Aynı cPanel hesabında:
- `seslab.com.tr` (dokunulmadı, ayrı public_html/)
- `sesyap.com.tr` (dokunulmadı)
- `ufukince.com.tr` (ana domain)
- `yapayzekalab.org` ← biziz, /home/ufukince1/yapayzekalab/ Node app olarak çalışıyor
