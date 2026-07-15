# Devreden (Rollover) CF Codex Paketi — Tasarım Spec'i (FİNAL)

- **Tarih:** 2026-06-24
- **Durum:** Tasarım + fiyat KİLİTLİ (3 workflow ile adversaryal doğrulandı, simülasyonla kanıtlandı) → implementasyon planı (writing-plans) sırada
- **Kapsam:** yzapi (yapayzekalab) — CF Codex/GPT üzerinde, günlük kotası ertesi günlere **devreden** (rollover) paketler: **Kendin Yap (builder)** + **sabit hazır paketler**, hepsinde **saatlik 150 istek hız freni**.
- **Kanıt:** `scratchpad/devreden-sim.mjs` + `devreden-sim-fixed.mjs` (devir formülü/gate doğrulaması) · `devreden-grid.mjs` (tutarlılık) · `devreden-B-final.mjs` + `B-fulldump.mjs` (final fiyat grid, satılan fiyatlarda 0 ihlal). Workflowlar: `wf_ec4ce68d` (red-team, 25 problem), `wf_bccfeb63` (tutarlılık), `wf_b2785893` (final lock).

> ⚠️ **DOKUNULMAZ:** billing reserve/settle/charge, `resolveBilledPromptTokens`/`normalizeProviderUsage`, provider-leak kontratları, MASTER_MODELS 42-kilit. Bu özellik para **yolunu** değiştirmez; paket-tüketim gate'ine devir + saatlik katmanı ve builder'a lookup-tablo fiyatlandırması ekler.

---

## 1. Ürün Yapısı & Kararlar (kilitli)

| Karar | Değer |
|---|---|
| Hedef model | CF **Codex/GPT** (mevcut cf-codex upstream) |
| Ürün 1 | **Kendin Yap (builder):** müşteri istek (**100 → 10.000**, 50'şer) + süre (**2–30 gün**) seçer |
| Ürün 2 | **Sabit hazır paketler:** **500 / 1000 / 2000** istek/gün × **1 / 7 / 14 / 30 gün** (12 kart) |
| Saatlik fren | **150 istek/saat** — grant DEĞİL, sadece maks. hız (DB-backed). Her istek hem saatlik frenden hem günlük+devir kotadan düşer |
| Devir | **Sınırsız** birikim (paket bitene kadar), yalnız **50'nin katı**, küsürat yanar; **negatif devir yok** (GREATEST(0)) |
| Pause | Duraklatılan günler devre **girmez** (resume'da accrual tabanı sıfırlanır) |
| Tüketim sırası | Aynı kullanıcıda devreden + normal CF → **devreden önce** (`COALESCE(daily_quota, daily_limit_snapshot)` ASC) |
| Çoklu alım | Her alım/yenileme **AYRI SATIR** (EXTEND yasak) |
| Tedarik | CF havuzu, lazy **50'şer** top-up (mevcut, değişmez) |
| Builder min süre | **2 gün** (devir anlamlı olsun); 1 günlük yalnız sabit paketlerde |

---

## 2. Fiyatlandırma (FİNAL — kilitli, kanıtlı)

### Model (Opsiyon B)
- **Günlük (1-gün) hacim eğrisi (affine):** `gunlukFiyat(n) = 7,75 + 0,3225 × n` → 100=40, 500=169, 1000=330,25, 10000=3232,75. Birim 0,40 → 0,323 ₺/istek (hacim indirimi monoton).
- **Süre faktörü:** `durationFactorB(d) = 1 − 0,11683 × (d−1)/29` → 1g=1,0 · 2g=0,996 · 7g=0,976 · 14g=0,948 · **30g=0,883** (= **%11,6 aylık indirim**).
- **Ham fiyat:** `raw(n,d) = gunlukFiyat(n) × d × durationFactorB(d)`.
- **Satılan fiyat:** **order-preserving yuvarlama** — `raw`'ı ₺1'e floor + iki-eksenli fixpoint aşağı-clamp (artan n'de ₺/istek azalan, artan d'de ₺/istek-gün azalan), çapalar sabit. ⚠️ `roundClean` (5/10/25/50) KULLANILMAZ — monotonluğu kırar (kanıt: önceki workflow 12+ ihlal).

### Kilitli çapalar (satılan fiyatta TAM)
- 100 istek / 1 gün = **40 TL** · 500 istek / 1 gün = **169 TL** · **1000 istek / 30 gün = 8.750 TL** (kullanıcı kararı) · türeyen giriş 100/30g = **1.059 TL**.

### Doğrulama (satılan/sold fiyat üzerinde — RAW değil)
- Hacim monoton ✓ · Süre monoton ✓ · Hiçbiri maliyet-altı değil ✓ · Çapalar tam ✓ · **Min marj 4,14×** (@ 10.000/30g). CF maliyeti = **0,069 TL/istek**.

### Sabit paketler (hazır kartlar)
| İstek/gün | 1 gün | 7 gün | 14 gün | 30 gün |
|---|---|---|---|---|
| 500 | 169 | 1.154 | 2.242 | 4.477 |
| 1000 | 330 | 2.255 | 4.381 | **8.750** |
| 2000 | 652 | 4.458 | 8.659 | 17.294 |

### Builder tam grid (100–10.000 × 2–30 gün; 1 gün yok)
| İstek/gün | 2 gün | 7 gün | 14 gün | 30 gün |
|---|---|---|---|---|
| 100 | 79 | 273 | 530 | 1.059 |
| 150 | 111 | 383 | 744 | 1.487 |
| 200 | 143 | 493 | 958 | 1.914 |
| 250 | 176 | 603 | 1.172 | 2.341 |
| 300 | 208 | 713 | 1.386 | 2.768 |
| 350 | 240 | 823 | 1.600 | 3.195 |
| 400 | 272 | 934 | 1.814 | 3.623 |
| 450 | 304 | 1.044 | 2.028 | 4.050 |
| 500 | 336 | 1.154 | 2.242 | 4.477 |
| 600 | 400 | 1.374 | 2.669 | 5.332 |
| 700 | 465 | 1.594 | 3.097 | 6.186 |
| 800 | 529 | 1.815 | 3.525 | 7.041 |
| 900 | 593 | 2.035 | 3.953 | 7.895 |
| 1000 | 657 | 2.255 | 4.381 | **8.750** |
| 1500 | 979 | 3.357 | 6.520 | 13.022 |
| 2000 | 1.300 | 4.458 | 8.659 | 17.294 |
| 3000 | 1.942 | 6.661 | 12.938 | 25.839 |
| 5000 | 3.227 | 11.067 | 21.495 | 42.928 |
| 10000 | 6.439 | 22.082 | 42.888 | 85.652 |

> Ara değerler (örn. 175 istek / 5 gün) **bilinear interpolasyon**la bu grid'den hesaplanır (her iki eksen affine → interpolasyon monotonluğu + çapaları + maliyet-altı korur, test edildi 0 ihlal).

### Builder fiyat uygulaması (custom-package-pricing.ts — YAPISAL rewrite)
1. **LOOKUP TABLOSU** ship et (düz çarpan formülü çapaları üretemez). 95-hücrelik (19 istek × 5 gün) önceden hesaplanmış **satılan** fiyatlar `BUILDER_PRICE_TABLE` sabiti olarak gömülür. Grid yukarıda.
2. Ara değerler **bilinear interpolasyon**.
3. `roundClean` **bypass** (runtime'da çağrılmaz).
4. `cf_unit_cost_tl` (0,069) **yalnız maliyet-altı guard** (fiyat türetimine girmez); `BUILDER_MARKUP` çarpanı fiyat yolundan kaldırılır.
5. `limitStepError` min **600 → 100** (çağrı-bazlı; mevcut 599→null/600-altlimit testleri yeniden yazılacak).
6. Builder min süre 2 gün; sabit paketler 1 gün dahil aynı lookup tablosunu paylaşır (gün-domeni farkı).

---

## 3. Veri Modeli

### `packages` (+2 kolon)
| Kolon | Tip | Default | Anlam |
|---|---|---|---|
| `devreden` | boolean NOT NULL | `false` | Devreden mi? **false → mevcut davranış (inert)** |
| `saatlik_limit` | integer NULL | `NULL` | Saatlik maks. istek hızı (=150); NULL → fren yok |

`gunluk_istek_limiti` devredende GÜNLÜK taban (100–10.000), `sure_gun` 1–30, `is_configurable=true` builder şablonu için.

### `user_package_entitlements` (+5 kolon)
| Kolon | Tip | Default | Anlam |
|---|---|---|---|
| `daily_quota` | integer NULL | `NULL` | Günlük taban (snapshot). NULL → devreden değil → yeni clause'lar no-op |
| `rollover_balance` | integer NOT NULL | `0` | Birikmiş devir (HEP ≥0 ve 50'nin katı) |
| `saatlik_limit` | integer NULL | `NULL` | Saatlik fren (snapshot, =150) |
| `hour_window_start` | timestamptz NULL | `NULL` | İçinde bulunulan saat penceresi başı |
| `requests_this_hour` | integer NOT NULL | `0` | Bu saatteki istek sayısı |

`daily_limit_snapshot` devredende = `daily_quota × sure_gun` (CF ömürlük havuz tavanı / top-up cap). CHECK: `rollover_balance ≥ 0` ve `% 50 = 0`. Mevcut paketler `devreden=false`/`daily_quota=NULL` → **sıfır regresyon**.

---

## 4. Gate Mantığı (`entitlement-service.ts`)
Devreden için bir istek **3 koşulu birden** sağlar; yeni clause'lar HEM `checkPackageCoverage` HEM `tryReservePackageSlot`'a **birebir (lockstep)** eklenir.

1. **CF tedariki (mevcut, DOKUNULMAZ).**
2. **Günlük tavan (YENİ, ayrı AND clause — CF-muafiyet OR'una KONMAZ):**
   `AND (e.daily_quota IS NULL OR e.last_reset_date < CURRENT_DATE OR e.requests_today < e.daily_quota + e.rollover_balance)`
3. **Saatlik fren (YENİ, ayrı AND clause):**
   `AND (e.saatlik_limit IS NULL OR e.hour_window_start IS NULL OR e.hour_window_start < date_trunc('hour', now()) OR e.requests_this_hour < e.saatlik_limit)`

**Seçim sırası:** `ORDER BY COALESCE(e.daily_quota, e.daily_limit_snapshot) ASC, e.expires_at ASC` (devreden donmaz). `FOR UPDATE OF e SKIP LOCKED` korunur.

---

## 5. Devir Birikim Formülü (DÜZELTİLMİŞ — kanıtlı)
```
kullanılmayan = max(0, daily_quota − requests_today)          // YALNIZ o günün tabanı
rollover_balance += GREATEST(0, floor(kullanılmayan/50)*50)    // 50-floor, negatif clamp
+ tam boş günler: (gap−1) × daily_quota                        // gap = CURRENT_DATE − last_reset_date
```
- Bölüm-1'deki ilk kural (`(daily_quota+rollover_balance) − requests_today`) **bileşik patlama** yapıyordu (kanıt: gün6 12.900 vs 2.500; 30g 4,3×10¹¹). Düzeltilmiş kural lineer/sınırsız birikim verir (25 gün idle → 12.500). ✅
- **Atomik:** accrual + günlük reset + saatlik reset, `tryReservePackageSlot`'un **tek atomik UPDATE'inin** SET CASE'ine gömülür (ayrı sorgu yok → çift-birikim/TOCTOU race kapanır). PostgreSQL RHS'leri eski satır değerleriyle değerlendirir.

---

## 6. Saatlik Throttle (DB-backed)
Saatlik 150 = maks. hız (grant değil). `hour_window_start` + `requests_this_hour`, §5 atomik UPDATE'te sıfırlanır/artar; gate §4-koşul-3 ile kontrol. Aşımda `RateLimitError(429, Retry-After=saat sonu)`. `releasePackageSlot` başarısız istekte `requests_this_hour`'u da iade eder (simetri). In-memory reddedildi (restart 150+150, çoklu-process N×150, iade asimetrisi — kanıtlı).

## 7. Pause
Paused entitlement gate'te seçilmez. **Resume'da accrual tabanı sıfırlanır** (`last_reset_date=CURRENT_DATE`, `requests_today=0`, `hour_window_start=now()`, `requests_this_hour=0`) → duraklatılan günler birikmez.

## 8. Panel / Frontend
- `listUserPackagesForPanel` devreden-farkında: `gunlukTaban=daily_quota`, `devirBakiyesi=rollover_balance`, `bugunKullanilabilir=daily_quota+rollover_balance`, `bugunKullanilan=requests_today`, `saatlikLimit`/`saatlikKullanilan`. `computeDisplayConsumed` devreden dalı (günlük semantik, lifetime DEĞİL). Panel sayısı gate ile aynı kaynaktan → "402-with-units"/şişik gösterim yok.
- `tab-mypackages.jsx`: ana çubuk `bugün: {requests_today}/{daily_quota+rollover_balance}` + "🔄 Devreden hak: {rollover_balance}" + "⏱ Saatlik: {requests_this_hour}/{saatlik_limit}".
- `tab-packages.jsx`: builder kartı (istek+süre seçici, anlık fiyat) + sabit kartlar; "🔄 Devreden" + "⏱ Saatlik 150" rozetleri. i18n TR/EN.

## 9. Seed
`scripts/seed-devreden-codex.ts` (sunucuda `NODE_ENV=production npx tsx`, idempotent ON CONFLICT). 12 sabit paket (500/1000/2000 × 1/7/14/30, fiyatlar §2'den) + 1 builder şablonu (`is_configurable`, 100–10.000, 2–30 gün, `BUILDER_PRICE_TABLE`). cf_catalog_id/cf_api_slug = mevcut cf-codex. `devreden=true`, `saatlik_limit=150`. `satista=false` kurulur → doğrulama sonra `satista=true`.

## 10. Deploy & Risk
- ⚠️ **Gate dosyaları canlı-lokal AYRIŞIK** (canlıda R-3 over-serve cap + shared-pool FLOOR mirror VAR, lokal `main`'de YOK). `entitlement-service.ts`/`proxy.ts`/`codefast-provisioning-service.ts`/`custom-package-pricing.ts`/`package-purchase-service.ts` için **canlı dosyayı indir + hunk uygula + izole targeted rsync** (`--checksum` izolasyon kanıtı). **`LOCAL_SRC=~/yzapi` deploy YASAK.**
- **Migration `0044_package_rollover`:** numara CANLI sıraya göre (canlı max ≥0043). `meta/_journal.json` `when` = **canlı max + 1** (`Date.now()`'a GÜVENME — drizzle sessiz-atlama). Kolonlar nullable/default → **INERT**. **Deploy sonrası `information_schema.columns` ile 7 kolon + CHECK doğrula.**
- **Aktivasyon ayrı/geri-alınabilir:** seed `satista=false` → doğrulama → `satista=true` (DB UPDATE).
- **Para yolu DOKUNULMAZ.** Mevcut CF paketi smoke 200 = regresyon yok. **3-QA + çift onay** (money-adjacent).

## 11. Test Planı (itest)
1. Birikim lineer (30g×73 → 12.000; tavan ≤ gün_no×daily_quota). 2. İdle 25g → 12.500. 3. Negatif clamp (requests_today>quota → bump 0). 4. Çift-birikim race (5 paralel → tek accrual). 5. Günlük tavan AND clause (tavanda 402; CF ünite olsa bile). 6. Saatlik DB-backed (151. istek 429; restart korur; başarısız istek iade). 7. Seçim sırası (devreden önce). 8. Grant (daily_limit_snapshot=quota×gün, ayrı satır). 9. Pause/resume (paused gün birikmez). 10. Panel (bugunKullanilabilir=quota+rollover, gate ile aynı). 11. **Builder fiyat:** lookup tablosu çapaları/grid'i verir; bilinear interp monoton + maliyet-altı yok; satılan fiyat = §2 tablo. 12. Regresyon: non-devreden no-op, tam suite yeşil.

## 12. Residual / Açık Maddeler (bloklamaz — implementasyonda kapanır)
- **`cf_unit_cost=0,069` anlamı bir kez doğrula:** per-istek-TL (repo kanıtı öyle) mi, per-CF-ünite mi? Per-ünite çıkarsa gerçek maliyet 0,1035/istek → worst-case (komisyon+FX+iade %10) 10000/30g marjı ~2,48× → o zaman `raw ≥ 3×` guard ekle. Nominal 0,069'da guard gereksiz (tüm hücre >4,1×).
- 30g yüksek-hacim köşesi en ince tampon (4,14× → komisyon/FX/iade ile ~3,72×) — izlemeye al.
- `limitStepError` min 100 → mevcut testler (599→null, 600 alt-limit) yeniden yazılacak.
- Bilinear interpolasyon production-test (adım 50 × gün 2–30 taraması, runtime'da 0 ihlal).
- 450/1g hücresi monotonluk için 153 (builder'da 1g yok → moot; sabit pakette 450 yok → moot).
- `seed-custom-builder-fields.ts` ON CONFLICT `cf_unit_cost_tl`'yi ezer → guard değerini senkron tut (revert tuzağı).

## 13. Kanıt
3 workflow: red-team (142 agent, 25 doğrulanmış problem → düzeltildi) · tutarlılık · final-lock. Final B grid bağımsız verifier ile **satılan fiyatlarda 0 ihlal**, çapalar tam, min marj 4,14×. Devir formülü/gate/hourly düzeltmeleri yeniden-simülasyonla ispatlandı (44/44 assertion PASS).
