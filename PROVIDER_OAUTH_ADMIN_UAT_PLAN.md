# YapayZekaLab Provider, OAuth ve Admin UAT Planı

Tarih: 2026-05-26

> Bu plan Chrome üzerinden gerçek oturumlarla kalan launch blocker testlerini tamamlamak içindir. Şifre, 2FA, kart bilgisi, API secret veya provider token dosyaya yazılmayacak ve loglanmayacak.

## 1. Sorun Tanımı

Koç / Orchestrator: "Yerel kod ve otomasyon tarafında bazı düzeltmeler geçti, ama launch için ödeme, OAuth, admin ve gerçek billing kanıtı hâlâ eksik."

Ajan 1 — QA/UAT: "Kullanıcı gözüyle Google login, bakiye yükleme modalı, ödeme geçmişi, admin görünürlüğü ve admin tab click-through gerçek Chrome oturumunda doğrulanmalı."

Ajan 2 — Backend/API/Billing: "Her UI adımı DB/API kanıtıyla eşleşmeli: `payments`, `pending_iban_payments`, `transactions`, `usage_records`, kullanıcı bakiyesi ve billing headers."

Ajan 3 — Security/Visual/Release: "Sağlayıcı secretları rotate edilmeli, Chrome'da kullanıcı manuel giriş yapmalı, gerçek para harcanmamalı, tasarım değişmemeli, deploy backup olmadan yapılmamalı."

## 2. Neden Önceden Tamamlanamadı?

- Shopier/Cryptomus dashboard login ve 2FA kullanıcıya bağlı; otomasyon parola/2FA okuyamaz veya saklayamaz.
- Paylaşılan provider/router keyleri sızmış kabul edildi; güvenli test için rotate edilmiş yeni secret gerekir.
- Google OAuth callback testi gerçek Google hesabı ve canlı redirect ile tamamlanmalı; local env eksikken sadece 503 doğrulanabilir.
- Funded/low-balance `yzk_live_*` test key olmadan billing headers, balance decrement ve `usage_records` PASS sayılamaz.
- Gerçek ödeme yapılmayacak; Shopier/Cryptomus sadece sandbox/test, provider dashboard test aracı veya çok küçük manuel test onayıyla yürütülür.

## 3. Varsayımlar ve Güvenlik Kuralları

- Chrome kullanılır; kullanıcı giriş/2FA gereken yerde manuel işlem yapar.
- Codex hiçbir şifreyi, OTP'yi, kart bilgisini veya secret değerini okumaz, dosyaya yazmaz, rapora basmaz.
- Shopier/Cryptomus credentialları dashboarddan rotate edilir; yeni değerler sadece VPS/server env içine girilir.
- Browser callback tek başına bakiye artırma PASS sebebi değildir; sadece doğrulanmış server callback/webhook sonrası kredi PASS sayılır.
- Admin sadece `cix.crazy666@gmail.com` Google session ile görünür olmalıdır.
- Mevcut tema, layout, renk, spacing, class, CSS ve component görünümü değişmeyecek.

## 4. Chrome Çalışma Düzeni

1. Chrome açık sekmeler kontrol edilir.
2. Gerekirse kullanıcı mevcut Chrome profilinde şu oturumları açar:
   - `https://yapayzekalab.org`
   - Shopier merchant panel
   - Cryptomus merchant panel
   - Google hesabı: `cix.crazy666@gmail.com`
3. Codex sadece sayfa gezintisi, buton tıklama, ekran görüntüsü, network/console gözlemi ve görünür durum kaydı yapar.
4. Credential ekranında kontrol kullanıcıya bırakılır; otomasyon bu alanları okumaz.
5. Her kritik akış sonunda backend/API/DB kanıtı ayrı toplanır.

## 5. Ajan Görev Dağılımı

### Ajan 1 — QA/UAT

- Chrome ile müşteri gibi ilerler.
- Login, bakiye modalı, ödeme yöntemi seçimi, ödeme geçmişi, admin görünürlüğü, mobil/desktop temel akışlarını doğrular.
- Ekran görüntüsü ve console/network hatası kaydı toplar.

### Ajan 2 — Backend/API/Billing

- Her ödeme/API/admin aksiyonundan sonra backend durumunu doğrular.
- Beklenen tablolar: `users`, `payments`, `pending_iban_payments`, `transactions`, `usage_records`, `audit_logs`, `api_keys`.
- Billing headers ve bakiye düşümünü API yanıtıyla karşılaştırır.

### Ajan 3 — Security/Visual/Release

- Admin yetki ayrımı, normal user/anonymous erişim reddi, payment bypass, invalid/duplicate webhook ve secret leak risklerini kontrol eder.
- Görsel kilidi korur; source style/class/layout değişikliği önerilirse bloke eder.
- Deploy gate: GitHub backup + rollback plan + live smoke olmadan production ready onayı vermez.

## 6. Faz 1 — Chrome ve Live Surface Hazırlığı

Adımlar:

1. Chrome bağlantısı denenir; çalışmazsa Chrome Extension durumu raporlanır.
2. `https://yapayzekalab.org` homepage, `/docs`, `/sss`, `/admin` açılır.
3. Canlı `/sss` drift'i tekrar doğrulanır.
4. Console/network hataları kaydedilir.
5. Admin butonu anonymous kullanıcıda görünmemeli; görünürse bug açılır.

Kabul:

- Chrome otomasyon kullanılabilir veya manuel fallback açıkça kayıtlı.
- Anonymous kullanıcı admin data göremez.
- `/sss` canlı drift PASS/FAIL net kaydedilir.

## 7. Faz 2 — Google OAuth ve Admin Oturumu

Adımlar:

1. Kullanıcı Chrome'da `cix.crazy666@gmail.com` Google hesabına manuel giriş yapar.
2. `https://yapayzekalab.org/api/auth/google` açılır.
3. Redirect URI kontrol edilir: `https://yapayzekalab.org/api/auth/google/callback`.
4. Callback sonrası siteye dönülür.
5. `/api/user/me` ile email doğrulanır.
6. Admin nav yalnız bu email ile görünür olmalı.
7. Normal/anonymous session ile `/api/admin/me`, `/api/admin/dashboard`, `/api/payments/admin/all` 401/403 dönmeli.

Kabul:

- Google OAuth callback gerçek Chrome oturumunda tamamlanır.
- Admin sadece `cix.crazy666@gmail.com` için görünür.
- Ayrı admin şifresi yok; `/api/admin/login` 410 kalır.

## 8. Faz 3 — Admin Full Browser UAT

Adımlar:

1. Admin dashboard açılır.
2. Sırayla tablar gezilir:
   - Dashboard
   - Kur/config
   - Model overrides
   - Users
   - Bakiye hareketleri
   - Duyurular
   - Provider status
   - Audit logs
   - Reconciliation/export
   - Gelir analytics
   - API keys
   - Planlar
   - Bekleyen havaleler
3. Mutasyonlar sadece test veriyle yapılır.
4. Bakiye düzeltme testinde küçük test kullanıcı kullanılır; ledger ve audit kaydı doğrulanır.
5. Admin-created API key testte raw key sadece ilk cevapta görünmeli, DB hash/masked mantığı korunmalı.

Kabul:

- Tüm admin tabları browserda açılır ve veri sızdırmadan çalışır.
- Mutasyonlar audit log üretir.
- Normal user admin endpointlerini kullanamaz.

## 9. Faz 4 — Funded ve Low-Balance API Billing Testi

Gerekli güvenli veri:

- `SMOKE_API_KEY`: küçük bakiyeli funded test key.
- `SMOKE_LOW_BALANCE_API_KEY`: sıfır/düşük bakiye test key.

Adımlar:

1. Funded key ile küçük `POST /v1/chat/completions` çağrısı yapılır.
2. Yanıt headerları kontrol edilir:
   - `X-YZ-Cost-TL`
   - `X-YZ-Remaining-TL`
   - `X-YZ-Request-Id`
3. Kullanıcı bakiyesi önce/sonra karşılaştırılır.
4. `usage_records` satırı ve request id izlenir.
5. Low-balance key ile aynı endpoint denenir.
6. Invalid/revoked key ile 401; malformed body ile 400 JSON doğrulanır.

Kabul:

- Başarılı text call 200 döner ve doğru charge edilir.
- Failed/malformed/invalid/revoked çağrılar yanlış ücretlendirilmez.
- Low-balance 402 veya açıkça dokümante edilmiş güvenli hata döner.

## 10. Faz 5 — Shopier Dashboard ve Callback Testi

Ön koşul:

- Shopier panelde yeni/rotate edilmiş test credential hazırlanır.
- `SHOPIER_API_KEY`, `SHOPIER_API_SECRET`, `SHOPIER_RETURN_URL` sadece server env içine girilir.
- Gerçek kart/para kullanılmaz; sandbox/test veya provider'ın güvenli test akışı kullanılır.

Adımlar:

1. Chrome'da Shopier panel açılır; entegrasyon ayarları ve callback URL doğrulanır.
2. Canlı/staging server env değerleri maskeli şekilde var/yok olarak kontrol edilir.
3. Kullanıcı olarak bakiye modalında `$10` gibi küçük test tutarı seçilir.
4. `POST /api/payments/shopier/init` ödeme kaydı ve imzalı form üretir.
5. Shopier test ödeme akışı tamamlanır veya provider test callback aracı kullanılır.
6. Valid callback sonrası tek kez bakiye kredi edilir.
7. Invalid signature callback bakiye artırmaz.
8. Fail/cancel callback bakiye artırmaz.
9. Duplicate valid callback ikinci kez kredi etmez.

Kabul:

- `payments` kaydı `success/failed` durumuna doğru geçer.
- `transactions` sadece valid success için bir kez oluşur.
- Admin ödeme bildirimi/audit kanıtı vardır.
- Callback logları raw secret, token, cookie veya tam payload basmaz.

## 11. Faz 6 — Cryptomus Dashboard ve Webhook Testi

Ön koşul:

- Cryptomus panelde Merchant/API key rotate edilir.
- `CRYPTOMUS_MERCHANT_ID`, `CRYPTOMUS_API_KEY`, `CRYPTOMUS_WEBHOOK_URL`, `CRYPTOMUS_RETURN_URL` sadece server env içinde tutulur.

Referans:

- Resmi Cryptomus webhook dokümanı, invoice status değişince `url_callback` adresine POST gönderildiğini ve status alanının `paid`, `paid_over`, `wrong_amount`, `fail`, `cancel`, `system_fail` gibi değerler alabildiğini belirtir.

Adımlar:

1. Chrome'da Cryptomus panel açılır; merchant ve webhook/test araçları kontrol edilir.
2. Bakiye modalında crypto init çalıştırılır.
3. `POST /api/payments/crypto/init` ödeme kaydı ve invoice URL üretir.
4. Browser return/callback tek başına bakiye artırmamalı.
5. Valid `paid` veya `paid_over` webhook tek kez kredi etmeli.
6. Invalid signature bakiye artırmamalı.
7. `wrong_amount`, `fail`, `cancel`, `system_fail` bakiye artırmamalı.
8. Duplicate webhook ikinci kez kredi etmemeli.

Kabul:

- `payments`, `transactions`, kullanıcı bakiyesi ve admin payment list tutarlı.
- Webhook signature doğrulanmadan kredi yok.
- Status bazlı kredi kuralları doğru.

## 12. Faz 7 — IBAN Bildirim ve Admin Approve/Reject

Adımlar:

1. Kullanıcı olarak IBAN ödeme bildirimi oluşturulur.
2. Referans kodu ve yukarı yuvarlanmış TL tutarı UI'da görünür.
3. Admin bekleyen havaleler tabında kayıt görünür.
4. Approve ile tek kez bakiye eklenir.
5. Duplicate approve ikinci kez kredi etmez.
6. Reject için sebep zorunlu olmalı; reject sonrası bakiye artmamalı.

Kabul:

- `pending_iban_payments` durumları doğru.
- `payments` ve `transactions` tutarlı.
- Audit log oluşur.

## 13. Faz 8 — Raporlama, Visual Lock ve Deploy Gate

Adımlar:

1. Chrome screenshotları alınır:
   - Homepage
   - API tab
   - Bakiye modalı
   - Admin dashboard
   - Pending IBAN
   - Payment history
2. Source style/class/layout diff kontrol edilir.
3. `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs` çalıştırılır.
4. GitHub backup alınır.
5. Deploy sadece 3/3 veya en az 2/3 ajan onayıyla yapılır.
6. Deploy sonrası live smoke:
   - `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`
   - `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs`
   - OAuth/admin/payment smoke tekrarları.

Kabul:

- Visual lock PASS.
- Secret scan PASS.
- Live `/sss`, OAuth, admin, payment, billing PASS olmadan production ready yok.

## 14. Çıktı Dosyaları

Test sonunda şu dosyalar güncellenecek:

- `PROVIDER_OAUTH_ADMIN_UAT_REPORT.md`
- `PAYMENT_PROVIDER_E2E_REPORT.md`
- `GOOGLE_OAUTH_UAT_REPORT.md`
- `ADMIN_FULL_BROWSER_UAT_REPORT.md`
- `BILLING_LIVE_EVIDENCE_REPORT.md`
- `LAUNCH_READINESS_AFTER_PROVIDER_UAT.md`
- `AGENT_REPAIR_DECISIONS.md`
- `FIX_LOG.md`

## 15. Final Karar Kuralı

READY FOR PRODUCTION ancak şu kanıtlar tamamlanırsa verilir:

- Google OAuth gerçek callback PASS.
- Admin sadece `cix.crazy666@gmail.com` ile PASS.
- Funded API billing headers + balance decrement + usage_records PASS.
- Low-balance safe error PASS.
- Shopier valid/invalid/duplicate PASS.
- Cryptomus valid/invalid/duplicate/status PASS.
- IBAN approve/reject idempotency PASS.
- Live `qa:uat` PASS.
- Visual lock ve secret scan PASS.

Mevcut varsayılan karar: `NOT READY — API/BILLING/BALANCE BLOCKERS`.
