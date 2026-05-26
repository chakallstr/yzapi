# YapayZekaLab QA Ajan Karar Defteri

Operasyon tarihi: 2026-05-26

## Oylama Kuralları

- Agent 1: QA Automation & End-User UAT Agent
- Agent 2: Backend, Database & Billing Agent
- Agent 3: Security, Abuse & Release Risk Agent
- Onay eşiği: en az 2/3.
- 0/3 ve 1/3 reddedilir.
- Bu dosyada kayıt yoksa karar onaylanmış sayılmaz.

---

Decision ID: DEC-ARCH-001
Decision title: Mimari harita QA çalışmasına başlamak için yeterli mi?
Area: Architecture Discovery
Options considered:
- A) Mimari harita yeterli, environment ve test fazına geç.
- B) Daha fazla kaynak dosya okunmadan ilerleme.
Evidence collected:
- `package.json` incelendi: Express + TypeScript backend, React + Vite frontend, Vitest testleri, PostgreSQL/Drizzle, Playwright dependency mevcut.
- `src/server/index.ts` incelendi: `/health`, `/status`, `/api/*`, `/api/payments/*`, `/v1/*`, JSON 404 ve SPA servis sırası görüldü.
- `src/server/db/schema.ts` incelendi: `system_config`, `users`, `api_keys`, `plans`, `model_overrides`, `announcements`, `provider_durumlari`, `transactions`, `usage_records`, `audit_logs`, `kur_history`, `sessions`, `payments`, `pending_iban_payments`.
- Route/service dosyaları tarandı: auth, user, admin, payments, proxy, models, settings, logs, jobs ve provider servisleri mevcut.
- README/CLAUDE notları incelendi: ürün modeli paket değil TL bakiye bazlıdır; video endpointleri production-ready değildir.
Agent 1 vote: APPROVE
Agent 1 reason: Frontend ve route yüzeyleri UAT/test tasarlamak için yeterince belirlendi; eksik kalan noktalar test sırasında kanıtlanabilir.
Agent 2 vote: APPROVE
Agent 2 reason: DB tabloları, ödeme akışları, billing servisleri ve `/v1` gateway akışı koddan izlenebilir durumda.
Agent 3 vote: APPROVE
Agent 3 reason: Auth, admin middleware, API key auth, webhook imza doğrulama ve JSON hata yüzeyleri güvenlik test kapsamına alınabilecek kadar haritalandı.
Approval count: 3/3
Final decision: APPROVED
Status: PASS
Follow-up action: Phase 2 environment/build/run doğrulamasına geç.

---

Decision ID: DEC-ENV-001
Decision title: Lokal environment QA için yeterli mi?
Area: Environment
Options considered:
- A) Lokal environment yeterli.
- B) Kısmen yeterli; eksikler raporlanarak test devam eder.
- C) Yetersiz; QA bloklanır.
Evidence collected:
- `npm run lint` PASS.
- `npm test` PASS: 14 test dosyası, 72 test.
- `npm run build` PASS.
- `npm run scan:public` PASS, hit yok.
- İlk DB migration denemesi PostgreSQL kapalı olduğu için `ECONNREFUSED` verdi; Docker açıldıktan sonra `npm run db:up`, `npm run db:migrate`, `npm run db:seed` PASS.
- Lokal `/health`, `/status`, `/api/models`, `/api/announcements/active`, unknown JSON 404 smoke PASS.
- Başarılı gerçek `/v1` ve low-balance smoke için `SMOKE_API_KEY` / `SMOKE_LOW_BALANCE_API_KEY` yok.
Agent 1 vote: APPROVE
Agent 1 reason: Local app ve browser smoke çalıştırılabilir; credential gerektiren akışlar açıkça ayrı blocker olarak etiketlendi.
Agent 2 vote: APPROVE
Agent 2 reason: DB migrate/seed ve temel backend smoke geçti; gerçek provider key gerektiren billing akışları hariç QA devam edebilir.
Agent 3 vote: APPROVE
Agent 3 reason: Public bundle secret scan geçti ve `.env` commit dışı; security testleri için environment yeterli.
Approval count: 3/3
Final decision: APPROVED
Status: PASS_WITH_MANUAL_BLOCKERS
Follow-up action: Credential gerektiren canlı API/OAuth/payment akışları manuel blocker olarak final raporda tutulacak.

---

Decision ID: DEC-STATIC-001
Decision title: Runtime UAT öncesi statik blocker var mı?
Area: Static Review
Options considered:
- A) Statik blocker yok.
- B) Statik risk var ama UAT devam edebilir.
- C) Statik blocker var; önce fix gerekir.
Evidence collected:
- BUG-ADMIN-001 bulundu: admin UI mutasyonlarında token göndermeyen raw fetch çağrıları vardı; DEC-FIX-001 ile düzeltildi.
- BUG-ROUTE-001 bulundu: `/admin` ve `/docs` doğru tabı açmıyordu; DEC-FIX-002 ile düzeltildi.
- Slack/Discord, sandbox special quota, monthly report ve API key edit endpointleri kodda görünmedi; launch kapsam riski olarak raporlandı.
- Video endpointleri 501; production-ready olarak pazarlanırsa risk.
- Secret/public bundle scan PASS.
Agent 1 vote: APPROVE
Agent 1 reason: Statik blockerlar düzeltildi; kalanlar test/launch kapsam riski olarak izlenebilir.
Agent 2 vote: APPROVE
Agent 2 reason: Backend sözleşmesiyle çelişen admin fetch ve route sorunları giderildi; DB/payment testleri devam edebilir.
Agent 3 vote: APPROVE
Agent 3 reason: Admin token eksikliği ve secret riski kontrol edildi; kalan güvenlik maddeleri final blocker olarak açık.
Approval count: 3/3
Final decision: APPROVED
Status: PASS_AFTER_FIXES
Follow-up action: Runtime/UAT ve kalıcı otomasyon testlerini sürdür.

---

Decision ID: DEC-TEST-SETUP-001
Decision title: Test stratejisi uygulamaya başlamak için yeterli mi?
Area: Test Strategy
Options considered:
- A) Test stratejisi yeterli.
- B) Eksikler var ama test yürütülebilir.
- C) Test stratejisi yetersiz.
Evidence collected:
- İlk TEST_PLAN oluşturuldu; Playwright senaryoları henüz eklenmedi/çalıştırılmadı.
Agent 1 vote: APPROVE
Agent 1 reason: UAT persona/journey matrisi yeterli başlangıç kapsamı veriyor.
Agent 2 vote: APPROVE
Agent 2 reason: API, DB, billing, payment ve idempotency kontrolleri plan kapsamına alındı.
Agent 3 vote: APPROVE
Agent 3 reason: Admin, auth, IDOR, webhook, secret ve abuse kontrolleri plan kapsamına alındı.
Approval count: 3/3
Final decision: APPROVED
Status: PASS
Follow-up action: Phase 2 ve Phase 3 kanıt toplama sonrası otomasyon/UAT yürüt.

---

Decision ID: DEC-FIX-001
Decision title: Admin panel mutasyon çağrıları admin JWT gönderecek şekilde düzeltilsin mi?
Area: Admin / Security / Frontend-Backend Contract
Options considered:
- A) Fix uygula: `src/App.tsx` içinde `/api/admin/*` mutasyon çağrıları `adminFetch` üzerinden gitsin.
- B) Fix uygulama; sadece raporla.
- C) Geniş refactor yap.
Evidence collected:
- `src/App.tsx` içinde admin login sonrası veri yükleme `adminFetch` kullanıyor.
- Aynı dosyada çok sayıda admin mutasyonu ham `fetch("/api/admin/...")` veya `fetch(\`/api/admin/...\`)` kullanıyor.
- Backend `adminAuth` middleware her protected admin endpointte `Authorization: Bearer <admin JWT>` bekliyor.
- Bu yüzden UI'da kur yenileme, config, model override, kullanıcı patch, bakiye düzenleme, duyuru, provider, admin API key ve plan işlemleri 401 riski taşıyor.
Agent 1 vote: APPROVE
Agent 1 reason: UAT açısından admin panelde butonlar görünse bile gerçek işlem yapılamaz; minimal fix testlenebilir.
Agent 2 vote: APPROVE
Agent 2 reason: Backend sözleşmesi değişmeden frontend header eksikliği gideriliyor; billing/admin verisine dokunmuyor.
Agent 3 vote: APPROVE
Agent 3 reason: Protected endpointlere token eklemek erişim kontrolünü bypass etmez, mevcut adminAuth kuralını doğru uygular.
Approval count: 3/3
Final decision: APPROVED
Status: PASS
Follow-up action: Önce failing static guard testi yaz, sonra `fetch` çağrılarını `adminFetch` ile değiştir, lint/test/build ile doğrula.

---

Decision ID: DEC-FIX-002
Decision title: SPA başlangıç tabı URL yoluna göre belirlensin mi?
Area: UAT / Frontend Routing / Admin Access
Options considered:
- A) `/admin`, `/api`, `/docs`, `/models`, `/sss` gibi yolları ilgili SPA tabına bağla.
- B) Admin tabı public nav'a ekle.
- C) Hiç fix yapma, yalnız raporla.
Evidence collected:
- Lokal ve canlı `/admin`, `/#admin`, `?tab=admin` 200 HTML döndürdü ama `Admin Girişi` içeriği görünmedi.
- `src/App.tsx` içinde admin panel render kodu var, fakat `activeTab` varsayılanı her zaman `homepage`.
- User/admin UAT testinde admin login ekranı erişilebilir olmalı; admin datası yine token olmadan görünmemeli.
- `/docs` route HTML döndürüyor ama ilk render homepage; doküman/API tabına otomatik geçmiyor.
Agent 1 vote: APPROVE
Agent 1 reason: UAT için doğrudan URL ile admin login ve docs/API ekranına erişim gerekir; public nav'a Admin eklemeden çözülebilir.
Agent 2 vote: APPROVE
Agent 2 reason: Backend sözleşmesi değişmiyor; yalnız frontend başlangıç tabı URL'den türetiliyor.
Agent 3 vote: APPROVE
Agent 3 reason: `/admin` sadece login ekranını gösterir, protected admin verisi yine admin JWT olmadan gelmez; güvenlik riski artmaz.
Approval count: 3/3
Final decision: APPROVED
Status: PASS
Follow-up action: Önce route helper testi yaz, sonra App başlangıç tabını helper ile bağla ve browser smoke ile doğrula.

---

Decision ID: DEC-FIX-003
Decision title: Browser UAT smoke kalıcı npm komutu olarak eklensin mi?
Area: Automated Tests / UAT Reproducibility
Options considered:
- A) `scripts/yapayzekalab-uat-smoke.mjs` ve `qa:uat` npm script’i ekle.
- B) Ad-hoc Playwright komutlarıyla devam et.
- C) Playwright browser install zorunlu kıl.
Evidence collected:
- Browser UAT ad-hoc Node/Playwright komutlarıyla yapıldı ve screenshots üretildi.
- Playwright paket olarak mevcut ama bundled Chromium kurulu değil; sistem Chrome kanalı çalışıyor.
- Tekrar edilebilir QA için komut, JSON/MD rapor ve screenshot çıktısı gerekir.
Agent 1 vote: APPROVE
Agent 1 reason: UAT sonuçlarının tekrarlanabilir olması için kalıcı browser smoke şart.
Agent 2 vote: APPROVE
Agent 2 reason: Backend değişikliği yapmaz; yalnız test otomasyonu ve endpoint UI smoke üretir.
Agent 3 vote: APPROVE
Agent 3 reason: Secret gerektirmez, gerçek para kullanmaz, release riskini düşürür.
Approval count: 3/3
Final decision: APPROVED
Status: PASS
Follow-up action: Önce script contract testi yaz, sonra minimal `qa:uat` scriptini ekle ve lokal/canlı çalıştır.

---

Decision ID: DEC-FIX-004
Decision title: Eksik secret scan aracı ve QA artifact ignore kuralı eklensin mi?
Area: Security / Release Hygiene / Automated Tests
Options considered:
- A) `scripts/scan-secrets.mjs` ekle, gerçek değerleri raporlamadan Git kapsamındaki dosyaları tara ve `qa-artifacts/` klasörünü ignore et.
- B) Eksik komutu yalnız raporla, otomasyon ekleme.
- C) Tüm çalışma dizinini `.env` dahil tara.
Evidence collected:
- Kullanıcı test listesinde `node scripts/scan-secrets.mjs` var.
- Repo içinde `scripts/scan-secrets.mjs` yok; komut `MODULE_NOT_FOUND` ile FAIL verdi.
- `.env*`, `dist`, `node_modules`, `.pgdata` zaten ignore; yeni UAT smoke çıktıları `qa-artifacts/` altında üretiliyor ve GitHub'a binary/log artifact olarak alınmamalı.
Agent 1 vote: APPROVE
Agent 1 reason: Tek komut QA çıktısının tekrar edilebilir olması için eksik kalite aracı tamamlanmalı.
Agent 2 vote: APPROVE
Agent 2 reason: Ürün kodu veya DB davranışı değişmez; yalnız güvenli tarama ve artifact hijyeni eklenir.
Agent 3 vote: APPROVE
Agent 3 reason: Secret scanner gerçek değerleri basmadan çalışmalı ve ignored `.env` dosyalarını commit kapsamı dışı tutmalıdır.
Approval count: 3/3
Final decision: APPROVED
Status: PASS
Follow-up action: Önce scanner contract testi yaz, sonra script ve `.gitignore` kuralını ekle; `node scripts/scan-secrets.mjs` ile doğrula.

---

Decision ID: DEC-RETEST-001
Decision title: Admin JWT fix kabul edilsin mi?
Area: Retest / Admin Security
Options considered:
- A) Fix kabul edilsin.
- B) Ek düzeltme gerekir.
Evidence collected:
- `src/admin-fetch-guard.test.ts` PASS.
- `npm test` PASS.
- `npm run lint` PASS.
- `npm run build` PASS.
- Protected admin API authsuz 401 dönüyor; admin login sonrası local API seviyesi çalıştı.
Agent 1 vote: APPROVE
Agent 1 reason: UI regression guard ham admin fetch çağrılarını yakalıyor.
Agent 2 vote: APPROVE
Agent 2 reason: Backend sözleşmesi değişmeden frontend token header eksikliği giderildi.
Agent 3 vote: APPROVE
Agent 3 reason: Erişim kontrolü bypass edilmedi, mevcut adminAuth kuralı uygulanıyor.
Approval count: 3/3
Final decision: APPROVED
Status: ACCEPTED
Follow-up action: Canlı deploy sonrası admin browser click-through tekrar çalıştır.

---

Decision ID: DEC-RETEST-002
Decision title: SPA deep-link route fix kabul edilsin mi?
Area: Retest / UAT Routing
Options considered:
- A) Fix kabul edilsin.
- B) Ek düzeltme gerekir.
Evidence collected:
- `src/navigation.test.ts` PASS.
- Lokal `npm run qa:uat` PASS 10/10.
- Canlı `qa:uat` FAIL 6/10; canlı sürüm local fixleri içermiyor.
Agent 1 vote: APPROVE
Agent 1 reason: Lokal Chrome smoke `/admin`, `/docs`, `/models`, `/sss` route içeriklerini doğruladı.
Agent 2 vote: APPROVE
Agent 2 reason: Backend veya veri modeli değişmeden SPA başlangıç durumu düzeltildi.
Agent 3 vote: APPROVE
Agent 3 reason: `/admin` sadece login ekranını açıyor; admin datası anonim kullanıcıya açılmıyor.
Approval count: 3/3
Final decision: APPROVED
Status: ACCEPTED_LOCAL
Follow-up action: Canlı deploy sonrası `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` 10/10 olmalı.

---

Decision ID: DEC-RETEST-003
Decision title: `qa:uat` browser smoke otomasyonu kabul edilsin mi?
Area: Retest / Automated UAT
Options considered:
- A) Kabul edilsin.
- B) Playwright test suite’e çevrilmeden kabul edilmesin.
Evidence collected:
- `src/uat-smoke-script.test.ts` PASS.
- `npm run qa:uat` lokal 10/10 PASS.
- Canlı run 6/10 FAIL üreterek gerçek deploy farkını yakaladı.
Agent 1 vote: APPROVE
Agent 1 reason: Chrome ile desktop/mobile route smoke’u tekrarlanabilir hale geldi ve canlı farkı yakaladı.
Agent 2 vote: APPROVE
Agent 2 reason: Backend değişikliği yok; release öncesi UI/API route smoke kanıtı üretiyor.
Agent 3 vote: APPROVE
Agent 3 reason: Secret/parola gerektirmiyor ve gerçek para kullanmıyor.
Approval count: 3/3
Final decision: APPROVED
Status: ACCEPTED
Follow-up action: CI/preflight zincirine bağlanması önerilir.

---

Decision ID: DEC-RETEST-004
Decision title: Secret scanner fix kabul edilsin mi?
Area: Retest / Security Hygiene
Options considered:
- A) Kabul edilsin.
- B) Daha agresif scanner gereksin.
Evidence collected:
- İlk scanner run fazla false-positive verdi; kural daraltıldı.
- `src/secret-scan-script.test.ts` PASS.
- `node scripts/scan-secrets.mjs` PASS, 175 dosya tarandı, hit yok.
- `qa-artifacts/` `.gitignore` içine alındı.
Agent 1 vote: APPROVE
Agent 1 reason: Kullanıcı test listesindeki eksik komut artık tekrarlanabilir şekilde çalışıyor.
Agent 2 vote: APPROVE
Agent 2 reason: Ürün davranışı değişmedi; yalnız QA/güvenlik hijyeni tamamlandı.
Agent 3 vote: APPROVE
Agent 3 reason: Scanner gerçek değer basmıyor ve Git ignore kapsamına saygı duyuyor.
Approval count: 3/3
Final decision: APPROVED
Status: ACCEPTED
Follow-up action: GitHub yedekleme öncesi scanner sonucu rapora işlendi.

---

Decision ID: DEC-AUTOMATION-001
Decision title: Kritik ürün akışları için otomasyon yeterli mi?
Area: Automated Tests
Options considered:
- A) Launch için yeterli.
- B) Kısmen yeterli; release öncesi ek E2E gerekir.
- C) Yetersiz.
Evidence collected:
- `npm test`: 16 dosya / 75 test PASS.
- `npm run qa:uat`: lokal 10/10 PASS.
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: canlı 6/10 FAIL.
- Gerçek Google callback, funded `/v1` billing headers, low-balance, Shopier/Cryptomus E2E otomasyonu yok.
Agent 1 vote: NEEDS_MORE_EVIDENCE
Agent 1 reason: Public smoke var, fakat login sonrası müşteri journey otomasyonu eksik.
Agent 2 vote: NEEDS_MORE_EVIDENCE
Agent 2 reason: Billing/payment/provider başarılı akışları gerçek key/env olmadan otomatik doğrulanmadı.
Agent 3 vote: NEEDS_MORE_EVIDENCE
Agent 3 reason: Payment webhook ve admin allowlist riskleri launch otomasyonuyla kapatılmadı.
Approval count: 0/3
Final decision: REJECTED_FOR_LAUNCH
Status: PARTIAL_PASS_FOR_REGRESSION
Follow-up action: Seeded test user, funded key, low-balance key ve provider sandbox credentiallarıyla E2E suite eklenmeli.

---

Decision ID: DEC-FINAL-RELEASE-001
Decision title: YapayZekaLab gerçek kullanıcılar için hazır mı?
Area: Release Readiness
Options considered:
- READY FOR PRODUCTION
- READY AFTER MINOR FIXES
- NOT READY — MAJOR UX/FLOW ISSUES
- NOT READY — PAYMENT/BILLING/AUTH BLOCKERS
- NOT READY — SECURITY BLOCKERS
- NOT READY — BUILD/ENVIRONMENT BLOCKERS
Evidence collected:
- Local kalite kapısı PASS: lint, 16/75 tests, build, public scan, source secret scan.
- Local `qa:uat` PASS 10/10.
- Live `qa:uat` FAIL 6/10; `/sss` ve `/admin` canlıda doğru içerik göstermiyor.
- Real Google callback, live funded `/v1`, billing headers, low-balance, Shopier/Cryptomus E2E doğrulanmadı.
Agent 1 vote: REJECT
Agent 1 reason: Canlı route smoke geçmiyor ve login sonrası gerçek müşteri journey tamamlanmadı.
Agent 2 vote: REJECT
Agent 2 reason: Başarılı canlı API usage, billing headers, balance deduction ve payment provider E2E eksik.
Agent 3 vote: REJECT
Agent 3 reason: Payment webhook/provider ve admin allowlist riskleri launch öncesi açık.
Approval count: 0/3
Final decision: NOT READY — PAYMENT/BILLING/AUTH BLOCKERS
Status: REJECTED_FOR_PRODUCTION
Follow-up action: GitHub checkpoint sonrası canlı deploy/test credential hazırlığı ve full live UAT yapılmalı.

---

Decision ID: DEC-FIX-005
Decision title: `scripts/turkapi-smoke.mjs` komut alias'ı eklensin mi?
Area: Automated Tests / Live Smoke Compatibility
Options considered:
- A) `scripts/turkapi-smoke.mjs` dosyasını mevcut `scripts/vps-smoke.mjs` komutunu çağıran ince wrapper olarak ekle.
- B) Kullanıcıdan komutu `npm run smoke:vps` olarak değiştirmesini iste.
- C) Ayrı ve kopya smoke script'i yaz.
Evidence collected:
- Kullanıcının zorunlu test listesinde `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs` var.
- Komut `MODULE_NOT_FOUND` ile FAIL verdi.
- Repo içinde aynı sözleşmeyi yürüten `scripts/vps-smoke.mjs` mevcut ve daha önce lokal/canlı public smoke kontrollerinde çalıştı.
Agent 1 vote: APPROVE
Agent 1 reason: Kullanıcının istediği tekil test komutu tekrarlanabilir olmalı; wrapper UAT kapsamını bozmaz.
Agent 2 vote: APPROVE
Agent 2 reason: Backend veya billing davranışını değiştirmez; mevcut smoke sözleşmesini farklı dosya adıyla çalıştırır.
Agent 3 vote: APPROVE
Agent 3 reason: Secret gerektirmez, değer basmaz ve kopya test mantığı yerine mevcut güvenli script'i kullanır.
Approval count: 3/3
Final decision: APPROVED
Status: PASS
Follow-up action: Wrapper dosyasını ekle, syntax check ve canlı smoke komutuyla doğrula.
