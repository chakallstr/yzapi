Decision ID: DEC-AUDIT-001
Decision title: 95K context limiti ve request öncesi rezervasyon zorunlu mu?
Decision type: Critical financial safety fix
Related bug IDs: BIL-CRIT-001, BIL-CRIT-002, BIL-HIGH-001
Evidence from reports:
- `src/server/routes/proxy.ts` içinde `enforceRequestGuards` yalnız `bakiye > 0` kontrolü yapıyor.
- Stream akışında upstream çağrı başlıyor, billing stream sonrasında arka planda yapılıyor.
- `stream_missing_usage` yolu `cost=0` ile çıkabiliyor.
- Kod tabanında 95K backend hard limit bulunmadı.
Files likely affected:
- `src/server/routes/proxy.ts`
- `src/server/services/billing-service.ts`
- `src/server/services/closerouter-service.ts`
- yeni/ilgili test dosyaları
Risk level: Critical
Design/template impact: None
Security impact: Positive
Backend/API/billing impact: High; upstream öncesi stop-condition ve stream muhasebesi güvenli hale gelecek
Proposed action:
- Backend tarafında 95K hard context guard ekle.
- Request öncesi tahmini maliyet rezervasyonu ekle.
- Stream sonunda provider usage yoksa güvenli local estimate ile finalize et.
- Rezervasyon/finalize akışını testlerle doğrula.
Agent 1 vote: APPROVE
Agent 1 reason: Billing reviewer bulgusu request öncesi rezervasyon eksikliğinin doğrudan para kaybı riski yarattığını doğruladı.
Agent 2 vote: APPROVE
Agent 2 reason: Security reviewer 95K limitin hiç olmadığını ve az pozitif bakiye ile pahalı stream çağrılarının geçebildiğini doğruladı.
Agent 3 vote: APPROVE
Agent 3 reason: QA reviewer route-level test boşluğu ve `stream_missing_usage` ücretsiz kullanım yolunu CRITICAL olarak doğruladı.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Test-first backend guard ve reservation düzeltmesi uygulanabilir.
Status: Active

Decision ID: DEC-AUDIT-002
Decision title: API key listeleme ve durum kontrolü sertleştirilsin mi?
Decision type: Security and abuse safety fix
Related bug IDs: SEC-MED-001, SEC-HIGH-002
Evidence from reports:
- `/api/user/api-keys` mevcut aktif key'leri `fullKey` olarak geri döndürüyor.
- `/api/admin/api-keys` mevcut key'leri decrypt edip listeliyor.
- `validateApiKey` aktif olmayan kullanıcı durumunu (`askida`, `engelli`) kontrol etmiyor.
Files likely affected:
- `src/server/routes/user.ts`
- `src/server/routes/admin.ts`
- `src/server/services/api-key-service.ts`
- ilgili test dosyaları
Risk level: High
Design/template impact: None
Security impact: Positive
Backend/API/billing impact: Low
Proposed action:
- Liste endpointlerinden geçmiş raw key dönüşünü kaldır.
- Sadece yeni oluşturma anında raw key göster.
- API key doğrulamada kullanıcı durumunu backend tarafında zorunlu kıl.
Agent 1 vote: APPROVE
Agent 1 reason: Kullanıcı ve admin listelerinde sürekli raw key görünmesi regresyon değil, güvenlik açığıdır.
Agent 2 vote: APPROVE
Agent 2 reason: DB + app secret ele geçirilirse mevcut tasarım key kurtarmaya izin veriyor; en azından tekrar dağıtımı kapatmak gerekli.
Agent 3 vote: APPROVE
Agent 3 reason: Askıda/engelli kullanıcıların key ile devam etmesi iş kuralına aykırı; backend check eklenmeli.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Dar backend güvenlik düzeltmeleri uygulanabilir.
Status: Active

Decision ID: DEC-CMD-001
Decision title: Kritik billing ve auth testlerini çalıştır
Decision type: Verification command
Related bug IDs: BIL-CRIT-001, BIL-CRIT-002, SEC-HIGH-002
Evidence from reports:
- 95K limit ve reservation için yeni test dosyaları eklendi.
- Stream ve bakiye stop-condition düzeltmeleri derleme/test ile doğrulanmalı.
Files likely affected:
- `src/server/services/request-guard-service.test.ts`
- `src/server/services/billing-service.test.ts`
- `src/server/middleware/user-auth.test.ts`
- `src/server/middleware/admin-auth.test.ts`
- `src/server/services/api-key-service.test.ts`
Risk level: Low
Design/template impact: None
Security impact: Positive
Backend/API/billing impact: Verification only
Proposed action:
- Hedefli Vitest komutunu çalıştır.
- Başarılıysa ardından tam test paketine geç.
Agent 1 vote: APPROVE
Agent 1 reason: Hedefli test, bug fix doğrulaması için yeterli ve dar kapsamlı.
Agent 2 vote: APPROVE
Agent 2 reason: Finansal fixin kanıtı komut çıktısı olmadan kabul edilemez.
Agent 3 vote: APPROVE
Agent 3 reason: Görsel etkisi yok; sadece backend doğrulama.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Hedefli test komutu çalıştırılabilir.
Status: Active

Decision ID: DEC-CMD-002
Decision title: Tam test ve derleme doğrulaması çalıştır
Decision type: Verification command
Related bug IDs: BIL-CRIT-001, BIL-CRIT-002, SEC-HIGH-002
Evidence from reports:
- Hedefli kritik testler geçti.
- Regresyon riski nedeniyle tam test ve derleme kanıtı gerekiyor.
Files likely affected:
- backend billing/auth/proxy dosyaları
- yeni test dosyaları
Risk level: Medium
Design/template impact: None
Security impact: Positive
Backend/API/billing impact: Verification only
Proposed action:
- `npm test`
- `npm run lint`
- `npm run build`
Agent 1 vote: APPROVE
Agent 1 reason: Tam regresyon kanıtı olmadan fix tamam sayılmamalı.
Agent 2 vote: APPROVE
Agent 2 reason: Type/lint/build kırıkları üretime sızmamalı.
Agent 3 vote: APPROVE
Agent 3 reason: Görsel değişiklik yok; teknik doğrulama gerekli.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Tam test, lint ve build komutları çalıştırılabilir.
Status: Active

Decision ID: DEC-CMD-003
Decision title: Public bundle ve secret sızıntı taraması çalıştır
Decision type: Verification command
Related bug IDs: SEC-HIGH-002
Evidence from reports:
- API key listeleme ve auth katmanı değişti.
- Secret ve raw key sızıntısı oluşmadığını kanıtlamak gerekiyor.
Files likely affected:
- `dist/**`
- backend route/service dosyaları
Risk level: Low
Design/template impact: None
Security impact: Positive
Backend/API/billing impact: Verification only
Proposed action:
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
Agent 1 vote: APPROVE
Agent 1 reason: Kullanıcıya açık bundle taraması release öncesi zorunlu.
Agent 2 vote: APPROVE
Agent 2 reason: Raw key/secret sızıntısı için kanıt lazım.
Agent 3 vote: APPROVE
Agent 3 reason: Görsel etkisiz, güvenlik kanıtı üretir.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Public scan ve secret scan komutları çalıştırılabilir.
Status: Active
