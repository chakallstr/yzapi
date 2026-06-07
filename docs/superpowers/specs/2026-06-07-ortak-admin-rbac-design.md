# Ortak (Partner) Admin Yetkilendirmesi — Tasarım

- **Tarih:** 2026-06-07
- **Proje:** yzapi (yapayzekalab.org)
- **Durum:** Onaylandı (tasarım) — uygulama planı bekliyor
- **Branch:** `fix/upstream-connect-retry` üzerinde çalışılacak (yeni alt-branch planda kararlaştırılır)
- **Hedef üye:** `aineuralvision@gmail.com` ("ortak" / co-admin)

> ⚠️ Bu CANLI ödeme sistemidir. Bu iş **billing/proxy/token mantığına dokunmaz**. Push/deploy YOK — her şey lokal, çift onay bekler. Migration **deploy-inert** (varsayılan değişiklik yapmaz).

---

## 1. Amaç

Sahibin (`cix.crazy666@gmail.com`) güvendiği bir iş ortağına, **aynı admin paneline** girip belirli sekmeleri kullanma yetkisi vermek. Ortak:

- Tüm kullanıcıları görebilmeli, **bakiye ekleyebilmeli**, Kullanıcılar sekmesindeki her işlemi yapabilmeli.
- Yalnız şu panelleri görebilmeli: **Dashboard, Trafik, Mali İzleme, Gözcü, Duyurular, Ödeme, Telegram, API Anahtarları, Loglar, Animasyon, Kullanıcılar**.
- Şu panellere **erişememeli**: API Yönetimi, Modeller (added-models + fiyat yazımı), Paketler, Kodlar, Teslimler, Sağlayıcı, Kur (yazım).

**Kapsam dışı:** çok-kiracılı "alt-kullanıcılı partner" modeli yok; bu bir **rol-tabanlı erişim (RBAC)** katmanıdır. Yeni iş ekranı yazılmaz — paneller zaten mevcut.

---

## 2. Roller

| Rol | Kimlik kaynağı | Erişim |
|-----|----------------|--------|
| `owner` | Kod-sabiti e-posta (`ADMIN_EMAIL`) | Her şey, her zaman (DB'ye bağlı değil → kendini kilitleme riski yok) |
| `partner` | DB `users.role = 'partner'` | Sabit, kodda tanımlı panel/uç seti |
| `user` | varsayılan | Admin erişimi yok |

**Karar:** Rol **JWT'ye gömülmez**, her istekte DB'den okunur → ortağı geri aldığın an etki eder (eski token açığı yok).

---

## 3. Mevcut mimari (keşif bulguları — kanıt)

- **Tek auth chokepoint:** `adminAuth` (`src/server/middleware/admin-auth.ts`). JWT `role==='user'` + `durum==='aktif'` + `email===ADMIN_EMAIL`. **3 ayrı router'ın hepsi** bunu kullanıyor:
  - `/api/admin/*` → mount'ta (`app.ts:141`)
  - `/api/payments/admin/*` → **per-route** `adminAuth` (`payments.ts:1051,1071,1137,1177,1190,1216,1295`)
  - `/api/telegram/admin/*` → **per-route** `adminAuth` (`telegram.ts:703,729,738,746,754`)
  - ⇒ Yetki kontrolünü **`adminAuth` içine** koymak 3 mount noktasını birden kapsar; hiçbir admin route'u atlayamaz.
- **3 sabit-email yeri:** `middleware/admin-auth.ts:8` (gerçek kapı), `routes/admin.ts:60` `SINGLE_ADMIN_EMAIL` (admin askıya-alma koruması, `:660`), `tab-admin.jsx:10` `LAUNCH_ADMIN_EMAIL` (gösterim).
- **`/api/admin/me`** (`routes/admin-auth.ts:19`) → panel bunu çağırıp admin görünümünü açar; bugün `{role:'admin', sub, email}` döner. **Genişletilecek.**
- **Panel ilk yükleme TUZAĞI** (`tab-admin.jsx:2608 loadAdminData`): **tek `Promise.all` ile 11 uç** aktif sekme fark etmeksizin çekiliyor. Biri 403 dönerse `Promise.all` reddeder → **tüm panel ölür**. 11 uç:
  `me, dashboard, users, announcements, provider-durumu(GET), kur-history(GET), reconciliation, audit-logs, config(GET), model-overrides(GET), api-keys`.
  Bunlardan **4'ü** (provider-durumu, kur-history, config, model-overrides) "owner-ağırlıklı" gruplardan → partner için **GET serbest** olmalı yoksa panel açılmaz. Ayrıca **Dashboard** render'ı provider-durumu + config **okumasına** bağlı.
  ⇒ İzin modeli **method-duyarlı** olmalı: partner bu uçları **okuyabilir (GET)**, ama owner-only kaynaklara **yazamaz (POST/PATCH/DELETE)**.
- **Animasyon sekmesi** tamamen **client-side** (`tweaks/setTweak`, slider/toggle — `tab-admin.jsx:~2600`); backend ucu YOK. Partner için sadece sekmeyi göstermek yeterli.

---

## 4. Veri modeli — migration `0026_user_role.sql`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
-- değerler: 'user' | 'partner'  (owner e-posta ile tanınır, bu kolona yazılmaz)
```

- `schema.ts` `users` tablosuna `role: text("role").notNull().default("user")`.
- `meta/_journal.json` sıralı güncellenir.
- ⚠️ **Deploy-time numara doğrulaması:** lokal en yüksek migration `0025_models_maintenance_notice` (henüz canlıda değil). Canlı sequence'e göre numara **deploy anında** yeniden doğrulanır (CLAUDE.md deploy-isolation tuzağı). Tasarım numarası: `0026`.
- **Inert:** kolon varsayılanı `'user'` → deploy davranışı değiştirmez; ortak ayrı adımda aktive edilir.

---

## 5. İzin haritası (kaynak: `src/server/middleware/admin-permissions.ts` — YENİ)

**Anlam:** `requiredRoleFor(method, fullPath)` → `'owner' | 'partner' | null`. `null` = eşlenmemiş = **fail-closed (owner-only)**. Owner her zaman geçer; partner yalnız sonuç `'partner'` ise geçer. `fullPath = req.baseUrl + req.path` (3 mount noktasını da kapsasın diye tam yol).

### 5.1 Partner — tam CRUD (grup → uçlar)

| Grup | Method + Yol |
|------|--------------|
| dashboard | `GET /api/admin/dashboard` |
| traffic | `GET /api/admin/traffic`, `/traffic/overview`, `/timeseries`, `/models`, `/providers`, `/users`, `/api-keys`, `/errors` |
| mali-izleme | `GET /api/admin/mali-izleme/{son,canli-akis,gecmis}`, `POST /api/admin/mali-izleme/tara`, `GET /api/admin/reconciliation`, `GET /api/admin/reconciliation/export` |
| gozcu | `GET /api/admin/gozcu/{son,findings,gecmis}`, `POST /api/admin/gozcu/tara`, `POST /api/admin/gozcu/findings/:id/{ack,snooze,heal}` |
| announce | `GET/POST /api/admin/announcements`, `PATCH/DELETE /api/admin/announcements/:id` |
| payments | `GET /api/payments/admin/{pending-iban,all,osb-dead-letters}`, `POST /api/payments/admin/pending-iban/:id/{approve,reject}`, `POST /api/payments/admin/osb-dead-letters/:id/{resolve,ignore}` |
| telegram | `GET /api/telegram/admin/{accounts,deliveries,conflicts}`, `POST /api/telegram/admin/{reconcile,relink}` |
| apikeys | `GET /api/admin/api-keys`, `POST /api/admin/api-keys/revoke/:id`, `POST /api/admin/api-keys/:userId/create` |
| logs | `GET /api/admin/audit-logs`, `GET /api/admin/bakiye-hareketleri` |
| users | `GET /api/admin/users`, `GET /api/admin/users/:id/detail`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/bakiye` |

### 5.2 Partner — yalnız OKUMA (GET partner, yazım owner-only) — panel/dashboard için zorunlu

| Yol | GET | Yazım |
|-----|-----|-------|
| `/api/admin/provider-durumu` | partner ✓ | `PATCH /:provider` → **owner** |
| `/api/admin/config` | partner ✓ | `POST` → **owner** |
| `/api/admin/kur-history` | partner ✓ | (yazım yok; `refresh-kur` owner) |
| `/api/admin/model-overrides` | partner ✓ | `POST`, `DELETE /:modelId` → **owner** |

> ⚠️ Uygulama notu: `GET /config` ve `GET /dashboard` serileştiricilerinin **upstream sır (apiKeyCipher/base_url) içermediği doğrulanır**. Partner güvenilen co-admin ama yine de minimum maruziyet.

### 5.3 Owner-only (partner erişimi YOK — panel-load'da değiller, yalnız owner sekmeleri)

| Grup | Uçlar |
|------|-------|
| api | `POST /api/admin/config` (GET shared-read; bkz §5.2), `GET/POST /api/admin/api-settings`, `/api-settings/providers`, `/api-settings/models`(GET), `/api-settings/models/:id`(POST), `/api-settings/api-keys/:id/policy`(GET/POST), `POST /api/admin/provider/test-connection` |
| providers | `GET/POST /api/admin/provider-profiles`, `POST /api/admin/provider-profiles/activate`, `PATCH /api/admin/provider-durumu/:provider` |
| overrides | `GET/POST /api/admin/added-models`, `DELETE /api/admin/added-models/:modelId`, `POST/DELETE /api/admin/model-overrides*` (yazım) |
| kur | `POST /api/admin/refresh-kur` |
| packages | `GET/POST /api/admin/packages`, `PATCH /api/admin/packages/:id`, `POST /api/admin/packages/:id/toggle`, `DELETE /api/admin/packages/:id`, `GET /api/admin/plans`, `PATCH /api/admin/plans/:id` |
| codes | `GET/POST /api/admin/redeem-codes`, `POST /api/admin/redeem-codes/:id/toggle` |
| teslimler | `GET /api/admin/delivery-orders`, `POST /api/admin/delivery-orders/:id/{deliver,cancel}` |

### 5.4 Owner-only YENİ uç (privilege-escalation kapısı)

- `POST /api/admin/users/:id/role` — gövde `{ role: 'partner' | 'user' }`. **Yalnız owner.** Audit-loglu. Partner çağırırsa 403.

---

## 6. Backend değişiklikleri

1. **`middleware/admin-permissions.ts` (YENİ):** `AdminRole` tipi, `PARTNER_TABS` listesi, `requiredRoleFor(method, fullPath)` (fail-closed) ve `allowedTabsForRole(role)`.
2. **`middleware/admin-auth.ts`:** select'e `role` ekle. Kimlik sonrası:
   - `email === ADMIN_EMAIL` → `req.adminRole='owner'`
   - değilse `user.role === 'partner'` → `req.adminRole='partner'`
   - değilse 403.
   - Sonra **authz:** `requiredRoleFor(req.method, req.baseUrl + req.path)` → partner için izin yoksa **403** (`recordAuthFailure` ile Gözcü'ye sinyal). Owner bypass.
   - `req.admin` payload'ına rol taşınır (audit/attribution için).
3. **`routes/admin-auth.ts` `/me`:** `{ role: req.adminRole, sub, email, allowedTabs: allowedTabsForRole(req.adminRole) }` döndür.
4. **`routes/admin.ts`:**
   - YENİ `POST /users/:id/role` (owner-only — `requiredRoleFor` map'inde owner; ayrıca handler içinde `req.adminRole==='owner'` ikinci kontrol = defense-in-depth). Audit: `writeAudit('user_role_change', id, ...)`.
   - `PATCH /users/:id` ve `/bakiye`: **owner hesabını koru** — partner, owner'ın `durum`/`role`'ünü değiştiremez (mevcut `SINGLE_ADMIN_EMAIL` guard'ını genişlet). Bakiye eklemeye owner-hedefli izin verilir (zararsız + audit'li) ama owner status/role partner tarafından dokunulamaz.
   - **Audit attribution:** `writeAudit` çağrılarının acting admin'i (owner mu partner mı, e-posta) kaydettiğini doğrula; partner mutasyonları ortağın e-postasıyla görünmeli.

---

## 7. Frontend değişiklikleri (`tab-admin.jsx` — yalnız UX; güvenlik backend'de)

- `loadAdminData`'daki 11 uç partner için de okunabilir (5.2 sayesinde) → **`Promise.all` aynen kalır**, panel açılır. *(Opsiyonel sağlamlaştırma: ileride bir shared-read owner-only yapılırsa kırılmasın diye `Promise.allSettled` + graceful-degrade — planda değerlendirilir.)*
- `me.allowedTabs` ile sekme filtresi: `visibleSections = ADMIN_SECTIONS.filter(s => me.allowedTabs.includes(s.id))`. `SubNav`'a bunu geçir.
- `section` state owner-only bir id ise ilk izinli sekmeye sıfırla (render guard); ortak devtools'tan zorlasa bile içerik owner-only uca 403 alır (backend zaten engeller).
- Üst şeritteki "ADMIN" rozeti partner için "ORTAK" gösterebilir (kozmetik).
- `tab-admin.jsx:10` `LAUNCH_ADMIN_EMAIL` gösterim metni partner'ı da kapsayacak şekilde güncellenir (AdminAccessNotice metni).

### 7.1 Kullanıcılar sekmesi — "Ortak yap / Geri al" (yalnız owner görür)
- Owner ise kullanıcı satırında/detayında bir buton: `POST /api/admin/users/:id/role` `{role:'partner'|'user'}`.
- Partner bu kontrolü görmez (me.role !== 'owner').

---

## 8. Aktivasyon (deploy-inert)

1. Migration kolonu ekler (varsayılan `'user'` → davranış değişmez).
2. `aineuralvision@gmail.com` **önce sisteme kaydolmuş** olmalı (Google/GitHub OAuth). Hesabı yoksa kayıt şart.
3. Promosyon: `scripts/set-partner-role.ts <email> [--revoke]` (geri-alınabilir) **veya** owner UI butonu. Script `ENV_FILE_PATH=.env.production npx tsx` deseniyle.

---

## 9. Test planı (3-QA gate'i için kanıt)

- **Mevcut contract testleri:** "tek-admin allowlist"i kilitleyen testleri bul (`rg -l "ADMIN_EMAIL|single.admin|SINGLE_ADMIN" src/**/__tests__ src/**/*contract*`) ve güncelle: owner e-postası **değişmedi** + partner owner-only uçlara erişemez invariant'ı.
- **Unit (`admin-permissions.test.ts`):** temsili yollar için `requiredRoleFor` doğru rol döndürür; eşlenmemiş yol → owner (fail-closed); shared-read GET vs yazım ayrımı.
- **Itest (gerçek Postgres, `*.itest.ts`):**
  - partner → partner uçlarında 200; owner-only uçlarda 403 (config POST, provider-profiles, packages, redeem-codes, delivery-orders, model-overrides POST, refresh-kur, provider-durumu PATCH, **users/:id/role**).
  - partner → shared-read GET'lerde 200 (config, provider-durumu, kur-history, model-overrides).
  - owner → her şeyde 200.
  - partner owner'ı askıya **alamaz** / owner role **değiştiremez**.
  - DB'de `role='user'`'a çekilince partner **anında** 403 (token yenilemeden).
  - `/me` rol başına doğru `allowedTabs` döndürür.
- **scan:public / noleak:** değişmez (admin yüzeyi public değil) ama build sonrası yine koşulur.

---

## 10. Güvenlik / red-team

- **Privilege escalation:** rol değişimi owner-only + handler'da ikinci kontrol + fail-closed map. Partner kendini/başkasını terfi edemez.
- **Doğrudan API çağrısı:** UI'da sekme gizlemek güvenlik değil; gerçek kapı `adminAuth` içindeki authz (3 mount'u kapsar).
- **Owner koruması:** partner owner'ın status/role'ünü değiştiremez.
- **Anında iptal:** rol DB'den her istek okunur.
- **Audit:** her partner mutasyonu ortağın e-postasıyla `audit_logs`'a.
- **Açık karar noktaları (owner onayı):**
  1. **Gözcü `heal`** uçları para-bitişik düzeltmeler çalıştırır (`refund_orphan_reservations`, `expire_stale_pending_iban`, `failover_provider`). Varsayılan: partner'a **açık** (bakiye yetkisiyle tutarlı). İstenirse owner-only yapılır.
  2. **IBAN onayı** gerçek bakiye yükler → partner'a açık (Ödeme paneli isteği). Onaylandı.
  3. Partner model fiyatlarını + provider durumunu **görür** (panel zorunluluğu + güvenilen co-admin), **değiştiremez**.

---

## 11. DOKUNULMAZ

- `billing-service.ts` reserve/settle/charge, `resolveBilledPromptTokens`, `normalizeProviderUsage` — dokunulmaz.
- `ADMIN_EMAIL` (owner) **değişmez**.
- Provider sır non-leak: `provider-profiles`/`api-settings` owner-only kalır; shared-read serileştiriciler sır-içermez doğrulanır.
- `MASTER_MODELS` 42-kilit, `reject-template-guard` — dokunulmaz.

---

## 12. Değişen/eklenen dosyalar (özet)

| Dosya | Değişiklik |
|-------|-----------|
| `src/server/middleware/admin-permissions.ts` | **YENİ** — rol tipi, izin haritası, fail-closed `requiredRoleFor`, `allowedTabsForRole` |
| `src/server/middleware/admin-auth.ts` | `role` select + owner/partner ayrımı + authz çağrısı + `req.adminRole` |
| `src/server/routes/admin-auth.ts` | `/me` → role + allowedTabs |
| `src/server/routes/admin.ts` | YENİ `POST /users/:id/role` (owner-only) + owner-koruma genişletmesi |
| `src/server/db/schema.ts` | `users.role` |
| `src/server/db/migrations/0026_user_role.sql` + `meta/_journal.json` | **YENİ** migration |
| `src/yapayzekalab/tab-admin.jsx` | sekme filtresi (allowedTabs) + "Ortak yap" butonu + rozet/metin |
| `scripts/set-partner-role.ts` | **YENİ** — aktivasyon (geri-alınabilir) |
| `src/server/**/__tests__/*` | contract güncelleme + yeni unit + itest |
