# YapayZekaLab QA / UAT / Güvenlik Test Planı

Operasyon tarihi: 2026-05-26

## Amaç

Normal bir müşterinin siteyi açıp ürünü anlayabilmesi, giriş yapabilmesi, bakiye yükleyebilmesi, API key oluşturabilmesi, ilk API çağrısını yapabilmesi, maliyeti/bakiyeyi görebilmesi ve ödeme/admin/güvenlik risklerine karşı korunması test edilecek.

## Kapsam

- Public landing, Modeller, SSS, API tabı.
- Google login ve user token akışı.
- Kullanıcı bakiye, API key, kullanım kayıtları.
- `/v1` OpenAI-compatible gateway.
- Shopier, IBAN, Cryptomus ödeme akışları.
- Admin login, config, kullanıcı, bakiye, duyuru, provider, audit, reconciliation, plans ve API key yönetimi.
- Secret sızıntısı, admin bypass, IDOR, webhook imza, ödeme idempotency, JSON hata formatı.
- Mobil görünüm ve gerçek tarayıcı UAT.

## Test Verisi Stratejisi

- Normal kullanıcı: seed veya test DB kullanıcısı.
- Funded kullanıcı: bakiyesi pozitif kullanıcı.
- Low/zero balance kullanıcı: bakiyesi 0 veya düşük kullanıcı.
- Admin kullanıcı: `cix.crazy666@gmail.com` ile normal Google/user JWT; ayrı admin şifresi yok.
- Revoked API key: test içinde oluşturulup revoke edilecek.
- Invalid API key: sahte `yzk_live_invalid`.
- Pending IBAN: `/api/payments/iban/init` ile oluşturulacak.
- Payment webhook: gerçek para kullanılmadan imzalı/sahte payload testleri.

## Test Matrisi

| Test ID | Başlık | Alan | Persona | Ön koşul | Adımlar | Beklenen | Durum | Kanıt | Şiddet |
|---|---|---|---|---|---|---|---|---|---|
| SMK-001 | Health endpoint | Backend | Sistem | App çalışıyor | `GET /health` | 200 ve `checks.db=ok` | PASS | ENVIRONMENT_REPORT | P0 |
| SMK-002 | Status endpoint | Backend | Sistem | App çalışıyor | `GET /status` | Secretsız JSON | PASS | ENVIRONMENT_REPORT | P1 |
| SMK-003 | Unknown API JSON 404 | Backend/Security | Malicious | App çalışıyor | `GET /api/__missing__` | JSON 404, HTML yok | PASS | API_GATEWAY_REPORT | P1 |
| SMK-004 | Unknown v1 JSON 404 | Backend/Security | Malicious | App çalışıyor | `GET /v1/__missing__` | JSON 404, HTML yok | PASS | API_GATEWAY_REPORT | P1 |
| UAT-001 | İlk ziyaret ürün anlaşılabilirliği | UX | Anonymous Visitor | Browser | Homepage açılır | 30 sn içinde bakiye bazlı model anlaşılır | PASS | UAT_END_USER_REPORT | P1 |
| UAT-002 | Model keşfi | UX/API | Developer | Browser | Modeller tab, filtre, arama | Fiyat/status net; video 501 yanıltmaz | PASS LOCAL / PASS LIVE ROUTE | UAT_END_USER_REPORT | P1 |
| UAT-003 | SSS bakiye modeli | UX | Anonymous Visitor | Browser | SSS okunur | Paket/quota karışıklığı yok | PASS LOCAL / FAIL LIVE | UAT_END_USER_REPORT | P2 |
| UAT-004 | Google login | Auth | New Developer | OAuth env | Google login tıklanır | 302/redirect veya eksik env açık hata | PARTIAL | UAT_END_USER_REPORT | P0 |
| UAT-005 | API key güvenli oluşturma | User/API | Developer | User JWT | create/list/refresh/revoke | Tam key sadece ilk response, DB hash | PASS LOCAL | API_GATEWAY_REPORT | P0 |
| UAT-006 | İlk API çağrısı | Gateway/Billing | Developer | Funded user + key + upstream | cURL örneğiyle chat | Response, billing headers, bakiye düşümü | BLOCKED_MANUAL_SECRET | API_GATEWAY_REPORT | P0 |
| UAT-007 | Bakiye yükleme | Payment | Balance Buyer | User JWT | Shopier/IBAN/crypto init | Gerçek para yok; pending ve imza güvenli | PARTIAL | PAYMENT_BILLING_REPORT | P0 |
| UAT-008 | Düşük bakiye | Billing | Low-Balance User | Zero balance | `/v1` çağrısı | 402/net hata, provider çağrısı yok | BLOCKED_MANUAL_SECRET | API_GATEWAY_REPORT | P0 |
| UAT-009 | Usage/cost güveni | Billing | Returning API User | Çağrı yapılmış | UI ve DB usage karşılaştırılır | Header, DB, UI tutarlı | BLOCKED_MANUAL_SECRET | PAYMENT_BILLING_REPORT | P1 |
| UAT-010 | Mobil kullanılabilirlik | Mobile | Mobile User | Browser | 390x844, tablet, desktop | Core flow kırılmaz | PARTIAL | UAT_END_USER_REPORT | P1 |
| UAT-011 | Hata toparlama | UX/API | Confused User | App çalışıyor | invalid auth/key/body/model/payment | Stack trace/secrets yok; net yönlendirme | PARTIAL PASS | SECURITY_REPORT | P1 |
| UAT-012 | Admin görünürlüğü | Admin/Security | Malicious | Browser/API | anon/user admin UI/API dener | Veri/mutasyon engellenir | PASS LOCAL / FAIL LIVE ROUTE | ADMIN_REPORT | P0 |
| API-001 | `/v1/chat/completions` auth matrix | Gateway | Developer/Malicious | App çalışıyor | no auth/invalid/revoked/valid/low balance | Beklenen 401/402/200/headers | PARTIAL PASS | API_GATEWAY_REPORT | P0 |
| API-002 | `/v1/responses` auth matrix | Gateway | Developer | App çalışıyor | aynı matris | Beklenen sonuçlar | PARTIAL | API_GATEWAY_REPORT | P0 |
| API-003 | `/v1/messages` auth matrix | Gateway | Developer | App çalışıyor | aynı matris | Beklenen sonuçlar | PARTIAL | API_GATEWAY_REPORT | P0 |
| API-004 | Görsel endpoints | Gateway/Billing | Developer | Funded user | generations/edits | billing header ve usage | PARTIAL | API_GATEWAY_REPORT | P1 |
| API-005 | Video endpoints | Gateway | Developer | App çalışıyor | submit/task | 501 açık ve yanıltıcı pazarlama yok | EXPECTED 501 | API_GATEWAY_REPORT | P2 |
| PAY-001 | Payment methods | Payment | Buyer | User JWT | `GET /api/payments/methods` | Enabled flags doğru | PASS LOCAL | PAYMENT_BILLING_REPORT | P1 |
| PAY-002 | Shopier init/callback | Payment | Buyer | Shopier env/mock | init + valid/invalid callback | Geçersiz imza credit vermez | BLOCKED_ENV / UNIT PARTIAL | PAYMENT_BILLING_REPORT | P0 |
| PAY-003 | Cryptomus init/webhook | Payment | Buyer | Cryptomus env/mock | init + valid/invalid webhook | Sadece paid/paid_over credit | BLOCKED_ENV / UNIT PARTIAL | PAYMENT_BILLING_REPORT | P0 |
| PAY-004 | IBAN approve/reject | Payment/Admin | Admin | Pending IBAN | approve/reject | Tek credit, duplicate engel | PASS PRE-GUARD / BLOCKED_ENV CURRENT | PAYMENT_BILLING_REPORT | P0 |
| ADM-001 | Admin auth | Admin/Security | Admin/Malicious | Admin env | login/me/logout/non-admin | sadece admin erişir | PASS LOCAL | ADMIN_REPORT | P0 |
| ADM-002 | Admin CRUD matrix | Admin | Admin | Admin JWT | config/users/balance/announcements/plans/api keys | mutasyonlar auditlenir | PARTIAL PASS | ADMIN_REPORT | P1 |
| SEC-001 | Secret scan | Security | Malicious | Repo/build | `.env` hariç public tarama | Secret yok | PASS | SECURITY_REPORT | P0 |
| SEC-002 | IDOR ve auth bypass | Security | Malicious | 2 kullanıcı | başka user verisi/key/payment denenir | erişim yok | PARTIAL | SECURITY_REPORT | P0 |
| SEC-003 | Webhook/payment bypass | Security | Malicious | App çalışıyor | callback/webhook manipülasyonu | balance fake credit yok | PARTIAL | SECURITY_REPORT | P0 |
| MOB-001 | Mobil nav/modal/copy | Mobile | Mobile User | Browser | homepage/API/balance/modal/copy | kullanılabilir | PARTIAL | UAT_END_USER_REPORT | P1 |

## Çalıştırılacak Komutlar

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
- `npm run qa:uat`
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`
- `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs`
- `npm run db:up`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run dev`
- `SMOKE_BASE_URL=http://127.0.0.1:4567 npm run smoke:vps`

## Rapor Dosyaları

- `QA_REPORT.md`
- `UAT_END_USER_REPORT.md`
- `ARCHITECTURE_MAP.md`
- `ENVIRONMENT_REPORT.md`
- `STATIC_REVIEW_REPORT.md`
- `API_GATEWAY_REPORT.md`
- `PAYMENT_BILLING_REPORT.md`
- `ADMIN_REPORT.md`
- `SECURITY_REPORT.md`
- `AUTOMATED_TESTS_REPORT.md`
- `FIX_LOG.md`
- `LAUNCH_READINESS_REPORT.md`

## Sınırlar

- Gerçek para kullanılmayacak.
- Gerçek secret değerleri rapora yazılmayacak.
- Google OAuth otomatik tamamlanamazsa mocked/manual olarak etiketlenecek.
- Upstream API key yoksa başarılı `/v1` gerçek provider testi `BLOCKED_MANUAL_SECRET` sayılacak.
- Mock test gerçek production doğrulaması olarak işaretlenmeyecek.
