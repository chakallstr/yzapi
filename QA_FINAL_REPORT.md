# QA FINAL REPORT

Durum: tüm fazlar tamamlandıktan sonra doldurulacak.
# QA Final Report — 60 Dakika Koşu Sonucu

## Özet
- Repo: `/Users/ufuk/yzapi`
- Site URL: `http://127.0.0.1:4567`
- Geçerli 60 dakika koşusu: `2026-05-26 21:41:06 +03` - `2026-05-26 22:41:07 +03`
- Süre: `3601` saniye
- Son karar: `NOT READY — API/BILLING/BALANCE BLOCKERS`

## Kanıt ve Kapsam
- Evidence: `/Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z`
- Summary: `/Users/ufuk/yzapi/qa-artifacts/site-60min-bg-2026-05-26T18-41-06-099Z/summary.json`
- Kapsam: 10 route/page, 831 tıklama, 41 form denemesi, 3981 endpoint/API kontrolü, 6 screenshot.

## Geçen Alanlar
- `/health`, `/status`, `/api/models`, `/api/announcements/active` son durumda 200 verdi.
- Unknown `/api/*` ve `/v1/*` JSON 404 döndü.
- Admin ve payment protected endpointleri authsuz 401 döndü.
- `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, image/video endpointleri authsuz 401 döndü.
- `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs` geçti.

## Kalan Blokajlar
- Runtime stabilitesi zayıf: test sırasında site önce DB/Docker kesintisi, sonra listener/port erişilemezliği yaşadı; elle restart gerekti.
- `/v1/models`, `/v1/providers`, `/v1/models/count` 404 dönüyor.
- Google login `/api/auth/google` 503 verdi.
- `/docs` veya API alanında beklenen entegrasyon örnekleri görünür/doğrulanır durumda değil.
- Valid `yzk_live_*` kullanıcı anahtarı ve admin credential olmadığı için gerçek başarılı API billing, balance decrement, usage_records ve admin mutation testi yapılamadı.
- `closerouter` health `unknown`; verilen upstream anahtar dosyaya/loglara yazılmadı ve ücretli provider testi yapılmadı.
