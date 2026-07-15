# Admin Kullanıcı Paket Yönetimi — Tasarım

**Tarih:** 2026-06-23
**Proje:** yzapi (yapayzekalab.org) — admin paneli
**Durum:** Onaylandı (brainstorming), implementasyon planı bekliyor

## Amaç

Admin panelinde bir kullanıcının detayına tıklandığında, o kullanıcının her paketi (entitlement) için
satır-içi yönetim aksiyonları olsun: **Değiştir, Duraklat/Devam, İptal (+iade), İade (tek başına),
Yenile, Sil**. Ayrıca panelin üstünde **"+ Paket Ekle"** — admin'in *istediği her paketi, istediği her
miktarda* (katalogdan veya tam-serbest özel) ekleyebileceği bir editör.

Hepsi **owner-only**, **atomik**, **idempotent**, **audit'li** uçlardan geçer. Canlı ödeme defterinde
**ham SQL `UPDATE`/`DELETE` YOK** — her şey app'in kendi servis fonksiyonlarından akar (auto-permission
sınıflandırıcısı ham mutasyonu zaten reddeder).

## Onaylanan Kararlar

| Konu | Karar |
|---|---|
| Paket ekleme ücretlendirme | **Admin her seferinde seçer**: `hediye` (bakiye sabit, ledger'a `admin_hediye` miktar 0) veya `bakiye` (bakiyeden tahsil + normal satın-alma transaction) |
| Editör gücü | **Tam serbest**: katalogdan paket VEYA özel (paket=şablon + günlük limit/süre/kota elle) |
| İade tutarı | **Admin seçer**: tam fiyat / kısmi (elle tutar) / iadesiz |
| Düzenlenebilir alanlar | Günlük limit · Kalan kota · Bitiş tarihi · Durum (aktif/duraklat) |
| CF "kalan kota" düzenleme | **KAPALI** (sadece non-CF). CF telafisi `Yenile/ekle` ile gerçek `topUpCfIfNeeded` üzerinden — ayna şişirme/over-serve riski yok |

## Mimari (Yaklaşım A — satır-içi aksiyonlar)

Kullanıcı-detay paneli (`tab-admin.jsx` `AdminUsers`, ~satır 665-699) "Paketler" bölümü genişletilir:
- Her entitlement satırına **aksiyon menüsü** (⋯) eklenir.
- "Paketler" başlığının yanına **"+ Paket Ekle"** butonu.
- Tüm aksiyonlar yeni `/api/admin/...` uçlarına `adminRequest()` ile gider; başarıda detay yeniden yüklenir.

### Backend uçları (yeni, owner-only)

| Aksiyon | Uç | Servis (yeni/var olan) |
|---|---|---|
| Paket ekle | `POST /api/admin/users/:id/entitlements` | `grantPackageEntitlement` (override alanlarıyla) + charge dalı |
| Değiştir | `PATCH /api/admin/entitlements/:entId` | **yeni** `adminUpdateEntitlement` |
| İptal (+iade) | `POST /api/admin/entitlements/:entId/cancel` | **yeni** `cancelEntitlementWithRefund` (delivery iade deseni) |
| İade (tek başına) | `POST /api/admin/entitlements/:entId/refund` | **yeni** `refundEntitlement` |
| Yenile | `POST /api/admin/entitlements/:entId/renew` | `renewEntitlement(forceNewRow)` + admin charge dalı |
| Sil | `DELETE /api/admin/entitlements/:entId` | **yeni** `deleteEntitlement` (hard delete) |

Yetki: hepsi `admin-permissions.ts`'te **owner-only** (partner kuralı eklenmez → fail-closed 403).

### Servis sözleşmeleri

- **`grantEntitlementAdmin({ userId, basePackageId, override:{ dailyLimit?, durationDays?, quantity?, allowedModels? }, charge:'gift'|'balance', adminId, note })`**
  - `charge='gift'`: bakiye sabit; `transactions` ledger'a `tip='admin_hediye'`, `miktarTL=0`, `aciklama=note`.
  - `charge='balance'`: `purchasePackageWithBalance` deseniyle bakiye düş + `tip='paket_satin_alma'`.
  - Override → `dailyLimitSnapshot` / `expiresAt` / `allowedModelsSnapshot` entitlement'a yazılır (şema değişikliği gerekmez).
  - CF paketleri: `cf_units_ordered=0` lazy başlar; gerçek üniteler `topUpCfIfNeeded` ile alınır (admin elle ayna yazmaz).
- **`adminUpdateEntitlement(entId, { dailyLimit?, remaining?, expiresAt?, paused?, status? }, adminId, note)`**
  - `remaining` (kalan kota): **non-CF only** → `requestsToday = max(0, dailyLimit - remaining)`. CF entitlement'ta `remaining` reddedilir (400).
  - Tek transaction içinde guarded UPDATE + audit kaydı.
- **`cancelEntitlementWithRefund(entId, { refund:'full'|'partial'|'none', amountTL? }, adminId, note)`**
  - `FOR UPDATE` lock → `status='cancelled'`, `expiresAt=now()` → iade seçiliyse atomik bakiye+`tip='iade'` transaction (idempotency `admin_cancel_<entId>`).
  - Tam fiyat = entitlement'ın `purchaseTransactionId` tutarı.
- **`refundEntitlement(entId, { refund, amountTL? }, adminId, note)`** — paket aktif kalır, sadece para iadesi (idempotency `admin_refund_<entId>_<gün>`).
- **`deleteEntitlement(entId, adminId)`** — satırı sil (audit'e `admin_delete` log). İptal'den farkı: geçmiş kalmaz; yanlış/test kaydı için.

### Ekleme editörü (frontend)

Modal/genişleyen form, iki mod:
1. **Katalogdan**: paket seç (admin paket listesinden) → opsiyonel günlük limit + süre override.
2. **Özel (tam serbest)**: bir paketi *şablon* seç (modeller/sağlayıcı/CF kablolaması ondan gelir) +
   günlük limit, süre (gün), kota adedini **elle yaz**.

Her iki modda: `charge: hediye/bakiye` seçimi + commit öncesi **önizleme** ("Bu işlem X₺ etkiler →
yeni bakiye Y"). Audit notu (serbest metin) **zorunlu**.

## İptal vs Sil vs İade

- **İptal**: satır `cancelled` olarak **kalır** (geçmiş + iade izlenir). İade alt-seçeneği içinde.
- **İade (tek başına)**: para iade edilir, paket **aktif kalır** (nadir senaryo için ayrı buton).
- **Sil**: satır tamamen **gider** (geçmiş kaybolur). Yanlış/test kaydı temizliği için.

## Audit & güvenlik

- Her money-aksiyonu: `adminId` + zorunlu serbest "neden" notu → ledger `aciklama` / audit log.
- Her money-aksiyonu **idempotent** (idempotency key).
- Onay diyalogları money etkisini açıkça gösterir.
- Owner-only; partner erişemez.

## Veri / şema

- **Migration muhtemelen YOK**: `user_package_entitlements.status` ve `transactions.tip` zaten `text`
  (`'cancelled'`, `'admin_hediye'` yeni değerler şema değişikliği istemez).
- Doğrulanacak: `status` için `'cancelled'`/`'paused'` değerlerinin gate sorgularıyla tutarlılığı
  (gate `status='active'` kontrol ediyor → `cancelled` otomatik kapanır, doğru).

## Test stratejisi

- Servis-seviyesi birim testleri: grant (gift/balance), update (non-CF remaining; CF remaining reddi),
  cancel (full/partial/none refund + idempotency tekrarı), refund, delete.
- Idempotency: aynı çağrı iki kez → tek ledger etkisi.
- `packages-noleak` kontrat testi kırılmamalı.
- Yetki: partner token → 403; owner → 200.

## Deploy / QA gerçeği (yzapi)

- Çok-dosya: `tab-admin.jsx`, `admin.ts`, `entitlement-service.ts`, `package-purchase-service.ts`,
  `admin-permissions.ts`. `npm run build` panel+server'ı birlikte derler → yeni hash'li bundle gönderilir.
- `tab-admin.jsx`/`admin.ts` başka undeployed feature'larla ortak → **kontaminasyon kontrolü** şart:
  canlı dosyayı indir, sadece kendi hunk'larını uygula, izole rsync (`--checksum --itemize-changes`)
  ile **yalnız kendi dosyalarının** listelendiğini kanıtla.
- Sunucu-side gate elle: `npm run lint && npm test && npm run build && db:migrate && restart && health`.
- 3-QA (≥2 PASS) + çift onay + deploy-guard kuralı.

## Kapsam dışı (YAGNI)

- Toplu (bulk) paket işlemleri.
- CF üniteyi elle ayna-yazma.
- Sıfırdan paketsiz (FK'sız) entitlement — özel mod hep bir şablon pakete bağlanır.

## Açık not

Bu doküman yzapi repo'sunda **untracked**. yzapi deploy'u kirli/untracked ağaçta abort eder; izole
worktree deploy'u etkilemez ama main checkout'tan deploy denenmeden önce commit'lenmeli veya kaldırılmalı.
