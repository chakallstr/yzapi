# Router POC Gate

## Karar

MVP production akışı:

```text
Müşteri -> YapayZekaLab API Backend -> upstream sağlayıcı
```

Alternatif router/gateway çözümleri ana satış katmanı değildir. Sadece `ProviderAdapter` arkasında POC/fallback olarak denenebilir.

## Production'a Alınma Şartı

Yeni bir provider adapter production trafiği almadan önce aynı kapılardan geçer:

- Geçerli müşteri API key'i ile başarılı istek.
- Geçersiz/revoked key için `401`.
- Kapalı model için `403`.
- Yetersiz bakiye için `402` ve upstream'e hiç istek gitmemesi.
- Başarılı kullanım sonrası usage record, ledger transaction ve kalan bakiye kanıtı.
- Aynı `request_id` ile çift charge olmaması.
- Provider hatasında cost `0` usage kaydı ve negatif bakiye olmaması.
- Streaming final usage yoksa `stream_missing_usage` kaydı.
- Public bundle içinde upstream secret veya fiyat formülü sızmaması.

## Test Komutu

```bash
npm run lint
npm test
npm run build
git diff --check
```

Bu kapılar geçmeden `activeProviderAdapter` mevcut upstream sağlayıcı dışına alınmaz.
