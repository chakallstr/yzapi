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
