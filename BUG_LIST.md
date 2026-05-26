# BUG LIST

## BUG-001 - `/v1/models`, `/v1/models/count`, `/v1/providers` 404 dönüyor

- Area: API / frontend-backend consistency
- Severity: High
- Agent found: QA Supervisor + Backend/Billing
- Reproduction:
  - `GET http://127.0.0.1:4567/v1/models`
  - `GET http://127.0.0.1:4567/v1/models/count`
  - `GET http://127.0.0.1:4567/v1/providers`
- Expected:
  - `/v1/models`: OpenAI-compatible JSON model listesi
  - `/v1/models/count`: model sayısı
  - `/v1/providers`: sağlayıcı listesi
- Actual:
  - Üçü de JSON `404 Not found` döndü.
- Evidence:
  - 2026-05-26 20:03 +03 curl kontrolü.
- Root cause hypothesis:
  - `src/server/index.ts` içinde `/v1` known route allowlist sadece proxy endpointlerini içeriyor; model/provider public router `/v1` altına mount edilmemiş veya allowlist eksik.
- Recommended fix:
  - `/v1` allowlist içine `/models`, `/models/count`, `/models/{provider}/{model}/endpoints`, `/providers` eklenmeli ve public models router `/v1` altına proxy auth öncesi mount edilmeli.
- Apply now:
  - Hayır. 60 dakikalık test tamamlanmadan kod yazılmayacak; fix için 2/3 ajan kararı gerekecek.
# Bug List — QA 2026-05-26

## BUG-001 — `/v1/models`, `/v1/providers`, `/v1/models/count` 404
- Alan: API / Frontend-backend sözleşmesi
- Severity: High
- Repro: `GET /v1/models`, `GET /v1/providers`, `GET /v1/models/count`
- Expected: JSON model/provider katalog endpointleri.
- Actual: JSON `404 Not found`.
- Kanıt: 60 dakika koşusunda her biri 83 kez 404; post-check tekrar 404.
- Öneri: `/v1` public katalog route'larını ekle ve allowlist/proxy sırasını düzelt.

## BUG-002 — Runtime listener/DB stabilitesi
- Alan: Runtime / DevOps
- Severity: Critical
- Repro: 60 dakika koşusu sırasında port `4567` aralıklı `ERR_CONNECTION_REFUSED`; Docker/Postgres kapalıyken DB endpointleri 500.
- Expected: Test boyunca server reachable kalmalı veya kontrollü degraded response dönmeli.
- Actual: Elle Docker ve dev server restart gerekti.
- Kanıt: final network error 3218; final HTTP 4xx/5xx gözlem 3814.
- Öneri: process manager, health supervisor, DB startup dependency, dev/prod service config kontrolü.

## BUG-003 — Google OAuth 503
- Alan: Auth
- Severity: High
- Repro: UI/API login akışında `/api/auth/google`
- Expected: 302/303 Google redirect veya yapılandırılmış güvenli hata.
- Actual: `503`, `google oauth not configured`.
- Öneri: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URI ve app base URL kontrolü.

## BUG-004 — Docs/API entegrasyon örnekleri görünür doğrulanmadı
- Alan: Docs / UAT
- Severity: Medium/High
- Expected: cURL/Node/Python, Authorization, base URL ve model örnekleri açık görünmeli.
- Actual: Test bug kaydı `Docs/API entegrasyon örneği görünmüyor`.
- Öneri: CloseRouter dokümanının YapayZekaLab uyarlaması `/docs` ve API tab içinde görünür olmalı.

## BUG-005 — Video desteği net sınırlı gösterilmiyor
- Alan: UI / Ürün doğruluğu
- Severity: Medium
- Expected: Video endpointleri hazır değilse “beta/sınırlı/yakında/501” gibi net durum.
- Actual: Video ifadesi var, sınırlı destek metni yok.
- Öneri: Model kartlarında endpoint availability ve video durum etiketi göster.
