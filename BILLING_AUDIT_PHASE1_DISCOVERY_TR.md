# YapayZekaLab Billing Audit — Phase 1 Discovery

## Kapsam

- Backend stack, auth, API key, bakiye ledger, usage kayıtları, ödeme callback yüzeyi ve admin config akışı incelendi.
- Kritik muhasebe akışları: `users`, `transactions`, `usage_records`, `payments`, `pending_iban_payments`, `api_keys`, `system_config`.

## Keşif özeti

- Sistem ana muhasebe birimi olarak TL bakiye kullanır.
- Text model satış fiyatları doğrudan model katalog verisinden üretilir.
- Public yüzeyde yalnız satış fiyatı görünmelidir.
- Admin config, payment ve usage akışları iç fiyat üretim detayını dışa açmamalıdır.

## Sonraki faz notu

- Eski iç fiyat izleri current tree, testler ve build artefact’larından temizlenmelidir.
- Dağıtım paketi yalnız çalışma için gerekli minimum dosyaları taşımalıdır.
