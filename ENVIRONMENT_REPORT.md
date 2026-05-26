# Environment Report

Operasyon tarihi: 2026-05-26

## Özet

Lokal geliştirme ortamı Docker açıldıktan sonra QA için çalışır hale geldi. İlk durumda Docker daemon ve PostgreSQL kapalıydı; bu yüzden migration `ECONNREFUSED` verdi. Docker açıldı, Postgres compose servisi kaldırıldı, migration ve seed başarıyla uygulandı.

## Komut Sonuçları

| Komut | Amaç | Sonuç | Not |
|---|---|---|---|
| `npm run lint` | TypeScript kontrolü | PASS | `tsc --noEmit` exit 0 |
| `npm test` | Unit/service regression | PASS | Son durumda 18 test dosyası, 80 test geçti |
| `npm run build` | Production frontend/backend build | PASS | Vite/esbuild geçti; sadece 500 KB chunk uyarısı var |
| `npm run scan:public` | Public bundle secret taraması | PASS | 3 dosya tarandı, hit yok |
| `node scripts/scan-secrets.mjs` | Kaynak secret taraması | PASS | 179 Git kapsamlı dosya tarandı, hit yok |
| `npm run qa:uat` | Lokal Chrome UAT smoke | PASS | 10/10, rapor `qa-artifacts/uat-smoke-2026-05-26T14-05-53-517Z/uat-smoke-report.md` |
| `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` | Canlı Chrome UAT smoke | FAIL | 6/10, `/sss` ve `/admin` içerik hatası |
| `docker compose ps` | DB altyapı kontrolü | FAIL -> FIXED | Docker daemon kapalıydı, Docker.app açıldı |
| `npm run db:migrate` | DB migration | FAIL -> PASS | İlk deneme `ECONNREFUSED`; Postgres açılınca geçti |
| `npm run db:seed` | Test seed data | PASS | system_config, plans, users, provider, announcements, api_keys, transactions seed |
| `SMOKE_BASE_URL=http://127.0.0.1:4567 npm run smoke:vps` | Lokal smoke | PARTIAL PASS | Public checks geçti; `SMOKE_API_KEY` yok diye başarılı chat/low-balance atlandı |
| `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps` | Canlı smoke | PARTIAL PASS | Public checks geçti; `SMOKE_API_KEY` yok diye başarılı chat/low-balance atlandı |
| `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs` | Canlı smoke alias | PARTIAL PASS | Public checks geçti; başarılı chat/low-balance için key yok |

## Lokal Smoke Kanıtı

- `/health`: 200, `checks.db=ok`
- `/status`: 200, `modelCount=33`, `db=ok`, `closerouter=unknown`
- `/api/models`: 200, 33 model
- `/api/announcements/active`: 200
- `/api/__missing__`: JSON 404
- `/v1/__missing__`: JSON 404
- `/v1/chat/completions` authsuz: 401
- `/api/auth/google`: lokal env eksik olduğu için 503

## Canlı Smoke Kanıtı

- `https://yapayzekalab.org/health`: 200, `db=ok`, `closerouter=ok`
- `https://yapayzekalab.org/status`: 200, `modelCount=33`
- `https://yapayzekalab.org/api/models`: 200
- `https://yapayzekalab.org/api/announcements/active`: 200
- Bilinmeyen `/api/*` ve `/v1/*`: JSON 404
- Authsuz `/v1/chat/completions`: 401
- `/api/auth/google`: 302, redirect URI `https://yapayzekalab.org/api/auth/google/callback`
- `/docs` ve `/user-dashboard`: 200 SPA HTML

## Eksik / Manual Gerekenler

- Lokal Google OAuth env yok; otomatik gerçek Google login test edilemedi.
- Lokal `CLOSEROUTER_API_KEY` yok; başarılı gerçek `/v1` provider çağrısı test edilemedi.
- `SMOKE_API_KEY` ve `SMOKE_LOW_BALANCE_API_KEY` yok; başarılı API çağrısı ve low-balance smoke atlandı.
- Shopier ve Cryptomus env lokal yok; gerçek provider init yalnız disabled/503 veya local code seviyesinde test edilebilir.
- Canlı login sonrası user/payment/admin UAT için credential verilmedi.

## Sonuç

PARTIAL PASS. Lokal ve canlı public/runtime smoke sağlıklı; gerçek auth/payment/API kullanım akışları credential ve test API key olmadan production-ready onayı alamaz.
