# Payment / Billing Report

Operasyon tarihi: 2026-05-26

## Test Sonuçları

| Alan | Sonuç | Kanıt |
|---|---|---|
| Payment methods | PASS LOCAL | User JWT ile 200; current env’de IBAN/Shopier/Cryptomus eksikse disabled |
| Payment amount guard | PASS UNIT | `minBakiyeTL` / `maxBakiyeTL` altında/üstünde 400 helper doğrulandı |
| IBAN config guard | PASS LOCAL | IBAN env alanları eksikse methods `enabled:false`, init 503 |
| IBAN init | PASS PRE-GUARD / BLOCKED CURRENT ENV | 120 TL pending payment ve referans kod pre-guard doğrulandı; current env IBAN eksik olduğu için init kapalı |
| Admin pending IBAN list | PASS LOCAL | Oluşturulan pending kayıt listede bulundu |
| Admin IBAN approve | PASS LOCAL | Balance +120 TL, payment `basarili`, transaction oluştu |
| Duplicate IBAN approve | PASS LOCAL | 409; çift credit yok |
| Idempotency | PASS LOCAL | Aynı referans için transaction count 1 |
| Shopier init | BLOCKED/EXPECTED | Lokal env yok; gerçek para kullanılmadı |
| Shopier callback signature | PARTIAL | Unit test coverage mevcut; live/sandbox callback yapılmadı |
| Cryptomus init | BLOCKED/EXPECTED | Lokal env yok; gerçek provider kullanılmadı |
| Cryptomus webhook signature | PARTIAL | Unit test coverage mevcut; live/sandbox webhook yapılmadı |
| Usage deduction | BLOCKED | Başarılı gerçek `/v1` çağrısı için live funded key/upstream kanıtı yok |
| Admin direct balance patch | PASS LOCAL | Generic user patch route’u `bakiyeTL` için 400; ledger endpointi kullanılmalı |
| Reconciliation | PARTIAL | Endpoint var; admin credential ile temel API test edildi, tam finansal mutabakat raporu manuel incelenmedi |

## Kritik Güvenlik Kuralları

- Browser crypto callback yalnız redirect yapıyor; credit webhook ile olmalı.
- Invalid webhook/callback unit test kapsamı var.
- IBAN admin approve idempotent test edildi; ayrıca boş IBAN env artık kullanıcıya aktif yöntem gibi gösterilmiyor.
- Payment init miktar doğrulaması sistem `minBakiyeTL` / `maxBakiyeTL` limitleriyle korundu.
- Failed payment/duplicate provider callback canlı provider olmadan test edilmedi.

## Sonuç

PARTIAL PASS. Ledger dışı bakiye patch’i kapatıldı, ödeme miktar/IBAN guard eklendi. Shopier/Cryptomus gerçek/sandbox provider doğrulaması ve başarılı API usage deduction tamamlanmadan launch onayı verilmez.
