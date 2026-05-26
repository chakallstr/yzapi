# SECURITY RISK REPORT

Durum: 60 dakikalık site testi sonrası doldurulacak.
# Security Risk Report — 2026-05-26

## Geçen Güvenlik Kontrolleri
- Admin protected endpointleri authsuz `401`.
- Payment protected endpointleri authsuz `401`.
- `/v1/*` inference endpointleri authsuz `401`.
- Unknown `/api/*` ve `/v1/*` JSON hata döndü; HTML stack trace görülmedi.
- Public bundle scan ve secret scan temiz: hit yok.

## Riskler
- Kullanıcının paylaştığı upstream anahtar sızmış kabul edilmeli; rotate edilmeli. Bu anahtar dosyaya/loglara yazılmadı.
- Runtime restart/DB kesintisi sırasında 500 ve connection refused üretildi; operasyonel dayanıklılık yetersiz.
- Google OAuth local ortamda `503 google oauth not configured`; login hazır değil.
- Valid kullanıcı/API key olmadığı için API key plaintext, full key once-only, revoke sonrası bloklama, IDOR ve usage/balance etkileri gerçek akışla doğrulanamadı.

---

# Live Security/Risk Update — 2026-05-27

## Düzelen / Kabul Edilen

- Google OAuth live standard Chrome ile tamamlandı.
- Admin button anonymous durumda görünmedi.
- Admin dashboard only allowlisted Google user `cix.crazy666@gmail.com` oturumundan açıldı.
- Ayrı admin password formu canlı bundle'dan kalktı; stale `admin parola` / `adminToken` metinleri canlı frontend asset içinde bulunmadı.
- Live invalid/no-auth API checks JSON `401` davranışını korudu.
- Secret scan after report update: 214 files scanned, hits `[]`.

## Devam Eden Güvenlik/Release Riskleri

- Provider panel/API keys daha önce kullanıcı tarafından chat içinde paylaşıldığı için rotate edilmeli; raporlara gerçek secret yazılmadı.
- Shopier/Cryptomus sandbox valid/invalid/duplicate webhook E2E tamamlanmadı; payment security launch gate kapalı.
- Shopier standard Chrome panel access reached real production order data; destructive payment/order tests were intentionally not executed there.
- CloseRouter inference direct `502` verdiği için success billing ve cost headers kanıtlanamadı; failure path safe olsa da launch onayı için yeterli değil.
- Admin destructive actions/audit kapsamı hâlâ sınırlı tutuldu; gerçek müşteri verisi mutasyonu yapılmadı.
