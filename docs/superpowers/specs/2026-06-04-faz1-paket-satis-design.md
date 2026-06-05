# Faz 1 — Paket Satış Çekirdeği (Design Spec)

> Tarih: 2026-06-04 · Proje: CodeFast → yzapi tam klon, Faz 1 (bkz. `docs/research/codefast-clone-roadmap.md`)
> Referans: `docs/research/codefast-inventory.md`
> 🔒 **Release kuralı:** Bu iş kullanıcı açıkça demeden ASLA canlıya alınmaz / git'e push edilmez; deploy İKİ onay ister. Her şey lokalde. (memory: feedback_deploy_double_approval)
> ✅ **QA kapısı:** Canlıya çıkış 3-QA (≥2 PASS) ile (memory: feedback_qa_gate_deploy).

## 1. Amaç & Kapsam
yzapi'ye **request-limit tipi önceden ödemeli paket** satışı eklemek. Kullanıcı bakiyesiyle paket alır; paketin kapsadığı modellerde **günlük istek kotasından** düşer; kota biter veya model paket dışıysa mevcut **token-başına (PAYG) bakiye** akışına döner.

### Hedefler (Faz 1)
- `packages` + `user_package_entitlements` şeması (migration 0019).
- Admin "Paketler" CRUD + aç/kapat (feature toggle).
- Kullanıcı `tab-packages.jsx`: kategori filtreli vitrin, "Bakiye ile al", aktif paket + kalan günlük istek.
- Bakiye ile satın alma (atomik, idempotent — yeni money path).
- Enforcement: `request-guard`'da reserve ÖNCESİ kota dalı (Yaklaşım A) — **billing-service DOKUNULMAZ**.
- Günlük reset + expiry job.

### Kapsam DIŞI (sonraki fazlar)
- Token-bundle slider (Claude Max tarzı), studio-credit, hesap-teslim paketleri.
- Kart/Crypto ile **direkt** paket alımı (Faz 1: önce bakiye yükle → paket al).
- Hediye/geçiş kodu (Faz 2), DodoPayments (Faz 2).
- AI Chat / Studio / public Status / Destek / i18n / GitHub OAuth.

## 2. Mimari Karar — Yaklaşım A (para yoluna dokunmadan ayrı kota dalı)
Kota kontrolü, mevcut `reserveUsageBudget`/`settleReservedUsage` (DOKUNULMAZ) **yanına** eklenir, içine değil:
- İstek paket kapsamında + kota varsa → **atomik kota-rezerv**, bakiye reserve'i **atlanır**, upstream'e gider; başarıda `usage_records` `costTL=0, billed_via='package'`; hatada kota **release** (K1 deseninin kota ikizi: hata→tüketim yok).
- Kapsam dışı / kota bitti → mevcut PAYG reserve/settle **aynen** çalışır.
- Reddedilen alternatif (B): reserve'i "kaynak: bakiye|paket" diye genelleştirmek → DOKUNULMAZ'ı değiştirir.

## 3. Veri Modeli (migration `0019_packages.sql` + `schema.ts`)

### `packages`
| kolon | tip | not |
|------|-----|-----|
| id | text PK | slug, örn. `codex-500-gunluk` |
| ad | text | görünen ad |
| kategori | text | filtre sekmesi: GPT/Codex, Claude, Gemini, Grok, GLM, Önerilen … |
| aciklama | text | açıklama |
| tip | text | Faz 1 sabit `'request_limit'` (gelecek tipler için kolon) |
| gunluk_istek_limiti | integer | günlük istek kotası |
| sure_gun | integer | erişim süresi (gün) |
| allowed_models | jsonb | kapsanan model id'leri (`master-models` canonical) |
| fiyat_tl | numeric(14,4) | müşterinin ödediği sabit ₺ |
| fiyat_usd | numeric(14,4) null | sadece görsel referans (ops.) |
| enabled | boolean default true | **aç/kapat toggle** |
| display_order | integer default 0 | sıralama |
| created_at / updated_at | timestamptz | |

### `user_package_entitlements`
| kolon | tip | not |
|------|-----|-----|
| id | uuid PK | |
| user_id | uuid FK→users | cascade delete |
| package_id | text FK→packages | |
| daily_limit_snapshot | integer | satın almada `gunluk_istek_limiti` **snapshot**'ı (paket sonradan değişse aktif hak değişmez) |
| allowed_models_snapshot | jsonb | satın almada `allowed_models` snapshot'ı |
| activated_at | timestamptz | |
| expires_at | timestamptz | `activated_at + sure_gun` |
| status | text | `active` / `expired` / `revoked` |
| requests_today | integer default 0 | günlük sayaç |
| last_reset_date | date | lazy reset için |
| purchase_transaction_id | uuid FK→transactions null | satın-alma ledger satırı |
| created_at / updated_at | timestamptz | |

İndeksler: `(user_id, status)`, `(status, expires_at)`. **Tekrar-alım:** aktif aynı paket varsa → `expires_at` uzatılır (yeni satır değil) — Faz 1 kararı.

> Not: mevcut kullanılmayan `plans` tablosu Faz 1'de kullanılmaz (karışmamak için yeni `packages`); ileride birleştirme değerlendirilir.

## 4. Servisler

### `entitlement-service.ts` (yeni)
- `checkEntitlementCoverage(userId, modelId): {covered:boolean, entitlementId?}` — salt-okunur: aktif, süresi geçmemiş, modeli `allowed_models_snapshot` içinde içeren ve bugün kotası dolmamış hak var mı? (Birden çoksa en erken `expires_at`.)
- `reserveEntitlementSlot(entitlementId): boolean` — **atomik**:
  ```sql
  UPDATE user_package_entitlements
     SET requests_today = CASE WHEN last_reset_date < CURRENT_DATE THEN 1 ELSE requests_today + 1 END,
         last_reset_date = CURRENT_DATE, updated_at = now()
   WHERE id = $1 AND status='active' AND expires_at > now()
     AND (last_reset_date < CURRENT_DATE OR requests_today < daily_limit_snapshot)
   RETURNING id;
  ```
  satır döndüyse slot alındı; yoksa kota bitti → fallback.
- `releaseEntitlementSlot(entitlementId)` — hata durumunda: `requests_today = GREATEST(requests_today-1,0)` (bounded; gün dönümü kenar durumu kabul edilebilir, reserve/settle toleransının ikizi).
- `listUserEntitlements(userId)` — aktif haklar + kalan günlük (`daily_limit_snapshot - requests_today`, lazy reset uygulanmış).

### Satın alma — `package-purchase-service.ts` (yeni, money path)
`purchasePackageWithBalance(userId, packageId)`:
- Paket `enabled` + `tip='request_limit'` doğrula.
- **Atomik tek transaction** (mevcut `creditUserBalance` deseninin debit ikizi):
  1. `UPDATE users SET bakiye_tl = bakiye_tl - fiyat_tl WHERE id=userId AND bakiye_tl >= fiyat_tl` → satır yoksa `InsufficientBalanceError` (402).
  2. `transactions` satırı: `tip='paket_satin_alma'`, `miktarTL = -fiyat_tl`, idempotencyKey `pkg_purchase_<uuid>`.
  3. entitlement oluştur/uzat (snapshot'larla).
- İdempotent + atomik. **DOKUNULMAZ-bitişik** → mevcut ledger desenine bire bir uy.

## 5. Enforcement entegrasyonu (`proxy.ts` + `request-guard-service.ts`)
Akış (text uçları):
1. `coverage = checkEntitlementCoverage(userId, modelId)` (salt-okunur).
2. `enforceRequestGuards(..., { skipBalanceGuard: coverage.covered })` — **tek değişiklik:** bakiye>0 ön-guard'ı, kapsam varsa atlanır. (request-guard guard'dır; billing math değil.)
3. Forward'dan hemen önce: `coverage.covered` ise `reserved = reserveEntitlementSlot(entitlementId)`.
   - `reserved` → **paket modu**: `reserveUsageBudget` ÇAĞRILMAZ. Upstream forward. Başarı → `usage_records` (`costTL=0, costUsd=0, billed_via='package', entitlement_id`). Hata → `releaseEntitlementSlot` + `usage_records` (status='error', costTL=0). Bakiyeye DOKUNULMAZ.
   - `!reserved` (yarış: kota az önce bitti) → **bakiye modu**'na düş.
4. Paket modu değilse → mevcut **PAYG**: `reserveUsageBudget → forward → settleReservedUsage` (DEĞİŞMEZ).

`usage_records`'a yeni kolon: `billed_via text default 'balance'` + `entitlement_id uuid null` (migration 0019'a dahil). Billing header'lara `X-YZ-Billed-Via: package|balance` eklenebilir (ops.).

## 6. API uçları
- `GET /api/packages` (auth) → enabled paketler (gizli alan yok: provider/base_url/maliyet sızmaz).
- `GET /api/packages/:id` → detay.
- `GET /api/user/entitlements` → aktif haklar + kalan günlük + expiry.
- `POST /api/user/packages/:id/purchase` → bakiye ile al.
- Admin: `GET/POST/PATCH/DELETE /api/admin/packages`, `GET /api/admin/entitlements`.

## 7. Frontend
### Admin — `tab-admin.jsx` `ADMIN_SECTIONS`'a `{id:'packages', label:'Paketler'}` + `AdminPackagesSection`
CRUD: ad, kategori, açıklama, günlük istek limiti, süre(gün), allowed_models (katalogdan çoklu seçim), fiyat ₺, **enabled toggle**, display_order. Liste + aç/kapat.

### Kullanıcı — `tab-packages.jsx` (yeni), `App.jsx` tab'larına `packages` eklenir
- `GET /api/packages` → kategori filtre sekmeleri (distinct kategori + sayım), paket kartları (ad, kategori, günlük limit, süre, ₺, kapsanan modeller), **"Bakiye ile al"**.
- Yetersiz bakiye → "Bakiye Yükle"ye yönlendir.
- Aktif paketler + bugün kalan istek + expiry (dashboard/account'ta da özet).

## 8. Feature flag / toggle
- `systemConfig.packages_enabled` (boolean) → tüm özelliği aç/kapat (kapalıysa tab + uçlar gizli/410).
- Paket-başı `enabled` → vitrinde görünürlük + satın alınabilirlik.

## 9. Job'lar (`jobs/index.ts`)
- `package-maintenance-job` (örn. `5 0 * * *`): `status='active' AND expires_at<now()` → `status='expired'`. (Günlük reset lazy yapılıyor; istenirse burada da toplu reset.)

## 10. Test stratejisi
- **Unit:** entitlement reserve/commit/release (atomiklik, gün dönümü), resolve önceliği, purchase idempotency + atomiklik, yetersiz bakiye 402.
- **Contract:** `/api/packages` shape + **no-leak** (provider/base_url/maliyet yok); 42-lock'a dokunmaz.
- **Integration (gerçek PG):** satın alma bakiyeyi atomik düşer + ledger; paket modu bakiyeye dokunmaz; kota bitince fallback; gün dönümü reset; expiry; eşzamanlı istekte kota aşılmaz (atomik UPDATE).
- **DOKUNULMAZ regresyon:** `billing-service` reserve/settle/pricing testleri yeşil kalır; K1 (hata→0 tahsil) korunur.

## 11. DOKUNULMAZ / dikkat
- `billing-service.ts` reserve/settle/charge + `pricing-service` **değişmez**; paket dalı ayrı.
- Satın-alma debit yeni money path → atomik + idempotent + ledger satırı (mevcut desen).
- Her istekte (paket dahil) `usage_records` yazılır (paket → costTL=0).
- Provider codename/base_url/maliyet **sızmaz** (scan:public + no-leak contract'ları).
- `request-guard` değişikliği yalnız "bakiye ön-guard'ını kapsam varsa atla" — minimal.

## 12. Kabul kriterleri
1. Admin paket oluşturup aç/kapatabilir; kapalı paket vitrinde yok.
2. Kullanıcı yeterli bakiyeyle paket alır; bakiye atomik düşer, ledger'da `paket_satin_alma` satırı; entitlement aktif.
3. Kapsanan modele istek → günlük kotadan düşer, **bakiye değişmez**, `usage_records billed_via='package'`.
4. Günlük kota bitince → otomatik **bakiyeden** devam (yeterliyse); değilse 402.
5. Model paket dışıysa → bakiyeden (PAYG) gider.
6. Süresi dolan entitlement enforce edilmez; job `expired` işaretler.
7. Eşzamanlı isteklerde günlük limit aşılmaz.
8. `billing-service`/pricing testleri ve no-leak contract'ları yeşil.
9. `packages_enabled=false` iken tüm özellik gizli.

## 13. Migration & rollout
- `0019_packages.sql` (`packages`, `user_package_entitlements`, `usage_records.billed_via`+`entitlement_id`) + `schema.ts` Drizzle + `meta/_journal.json`.
- Deploy `db:migrate` çalıştırır — ama **release kullanıcı çift onayıyla** (bu spec hiçbir şeyi otomatik deploy etmez).
- Geri alma: yeni tablolar/kolonlar additive; feature flag kapalı başlatılabilir.
