# YZ API — USD Cüzdan Göçü (Faz 1) — Tasarım Spec

**Tarih:** 2026-07-09
**Durum:** Tasarım onaylandı (yaklaşım A + satış kuru), spec yazıldı — implementasyon planı beklemede.
**Sahibi:** Ufuk

---

## 0. Bu spec neyin parçası (büyük resim)

Ufuk "havuzlu satış sistemine geçiyoruz" dedi. Tüm iş **4 alt-sisteme** ayrıldı; her biri kendi spec→plan→3QA→çift-onay→deploy döngüsünden geçer:

| Faz | Ne | Bağımlılık |
|---|---|---|
| **1. USD cüzdan göçü** ← BU SPEC | bakiye/tx/kur/ingress TL→USD | temel |
| 2. Token havuzu motoru | requests_today → token drawdown (girdi+çıktı) + premium'da sonnet 0.83× ağırlık + gate | Faz 1'e bağlı |
| 3. Katalog + builder UI | hazır kartlar (Opus/Fable/Standart Havuz) + "Kendin Yap"; canlı fiyat | Faz 1+2'ye bağlı |
| 4. Eski paket emekliliği + no-fallback cutover | eski istek/CF paketleri satıştan kaldır, koltuk-only zorla | cutover |

**Gelecek fazlar için kilitli kararlar (bu spec'te uygulanmaz, referans):**
- Fiyat: standart $0.50/M, premium (opus/fable) $0.60/M. Yalnız Claude (GPT dahil değil).
- Paket = 1 premium model (opus VEYA fable) + sonnet; ya da standart paket (sonnet/haiku).
- Premium pakette sonnet **0.83× (50/60)** ağırlıkla düşer (havuz premium-token cinsinden).
- Fiyat = (token_M × tarife) + (gün − 1) × $0.50. **1. gün bedava**, min 10M, +5M artış, max 7 gün.
- Servis yalnız bizim koltuklardan, **fallback YOK**.

---

## 1. Hedef (Faz 1)

Müşteri cüzdanının **otoriter para birimini TL'den USD'ye** taşımak. Bugün cüzdan TL (`users.bakiye_tl`), üzerine USD "boyanmış" (müşteri yüzeyi zaten USD-öncelikli). Hedef: **USD gerçek para olsun, TL türetilmiş gösterim/ingress değeri olsun.**

**Neden kolay:** USD altyapısı canlıda zaten var ama **uykuda**:
- Kolonlar mevcut, hepsi boş/yazılmıyor: `users.bakiye_usd`, `transactions.miktar_usd` + `kur_at_transaction`, `usage_records.cost_usd`, `payments.amount_usd`/`kur_at_payment`.
- `billing-service.computeCost` her istekte **costUsd'yi zaten üretiyor** (yalnız TL'yi düşüyor).
- Müşteri yüzeyi zaten USD-birincil: `tab-account.jsx`, `/api/user/me.bakiyeUsd`, `MIN_TOPUP_USD=5`, Shopier quote `amountUsd`.
- Yükleme yolu zaten USD-farkında: müşteri $X seçer, `buildUsdTopupQuote(amountUsd,kur)` TL'ye çevirir.

Göç = **iç denominasyonu ters çevirmek** (saklanan ↔ türetilen), sıfırdan kurmak değil.

---

## 2. Kapsam

**DAHİL (Faz 1):**
- `bakiye_usd` otoriter cüzdan, `bakiye_tl` türetilmiş ayna.
- Tek-sefer backfill (mevcut 448 bakiye).
- Tahsilat (debit) yolu USD'ye.
- Yükleme (credit / Shopier + IBAN + crypto + Telegram) USD kredisi.
- Defter (`transactions`) USD-otoriter yazım + mutabakat invaryantı USD'ye.
- Limitler (min/max yükleme, günlük/aylık harcama, anomali eşiği) USD tabanına.
- Beyinler (kasa-brain/cf-brain/reconcile/Gözcü) USD-farkında (TL-ayna geçişte yaşatır).
- Flag-gating + backfill + doğrulama + rollback.

**HARİÇ (sonraki fazlar):** token-havuzu metering (Faz 2), pool katalog/builder (Faz 3), eski paket emekliliği (Faz 4). Bu spec paket/fiyat/model MANTIĞINI değiştirmez — yalnız cüzdan para birimini.

---

## 3. Mevcut durum (canlı doğrulama 2026-07-09)

- **486 kullanıcı, 448 bakiyeli, toplam 19,191.58 TL** (~$400), max 1208.62 TL (~$25), ort bakiyeli 42.84 TL (~$0.89). Küçük veri → backfill saniyeler.
- `bakiye_usd`: **486/486 boş** (uykuda). `transactions.miktar_usd`/`kur_at_transaction`: son 7g 30.675 tx'in **0'ında** yazılı (uykuda). Yarım göç YOK.
- **kur canlıda:** `kur=48.277748` (satış), `live_kur=46.871600` (ham), `kur_buffer=0.03`, `kur_source=manual`, `auto_kur_refresh=t`.
  - ⚠️ Hafıza notu "Yahoo+%10 kıskaç" ve yerel repo `open.er-api.com`+%3 — **ikisi de canlıyla uyuşmuyor**; canlı `kur_source=manual`. Implementasyonda canlı `kur-service.ts` re-doğrulanmalı.
- Müşteri yüzeyi zaten USD-birincil (yukarı bkz).

⚠️ **Lokal repo canlının GERİSİNDE** (targeted-rsync deploy'ları commit'lenmez). Aşağıdaki dosya:satır referansları lokal `~/yzapi`'den; implementasyonda **canlıdan indir + hunk** (LOCAL_SRC=~/yzapi deploy YASAK — bkz `project_yzapi_deploy_isolation_trap`).

---

## 4. Kararlar (kilitli)

1. **Yaklaşım A** — yetki-devri + TL-ayna, flag-gated. (B sert-kesme ve C paralel-cüzdan reddedildi.)
2. **Dönüşüm kuru = satış kuru (48.28)** — `bakiye_usd = bakiye_tl / 48.28`. Müşteri yüklerken bu kurdan ödedi → geri çevirimde de aynısı = muhasebe-tutarlı. (Ham kur ve lehe-yuvarlama reddedildi.)
3. `bakiye_tl` **silinmez**; `bakiye_usd × satış_kur` türetilmiş ayna olarak dual-write ile yaşar (TL-okuyanlar kırılmasın).
4. Flag: `USD_WALLET_ENABLED` (env, `CF_UNIFIED_COUNTER_ENABLED` deseni: uykuda deploy → backfill → flag aç → doğrula → rollback env-flip).

---

## 5. Tasarım

### 5.1 Otoriter cüzdan & TL-ayna
- **`users.bakiye_usd` = tek gerçek bakiye.** Tüm debit/credit önce buna atomik `UPDATE ... RETURNING`.
- **`users.bakiye_tl` = türetilmiş ayna** = `bakiye_usd × satış_kur`. Her cüzdan mutasyonunda **aynı transaction içinde** güncellenir (dual-write). Kur değişince ayna anlık dalgalanmaz (yalnız bir sonraki mutasyonda/refresh'te tazelenir) — küçük drift kabul; TL-ayna yalnız gösterim/legacy-okuyucu içindir, para değil.
- `toplam_harcama_tl` ikizi `toplam_harcama_usd` (yeni kolon) — lifetime spend USD-otoriter.

### 5.2 Backfill (tek-sefer, flag-öncesi)
```
UPDATE users SET bakiye_usd = ROUND(bakiye_tl / :satis_kur, 6)
WHERE bakiye_usd IS NULL OR bakiye_usd = 0;   -- :satis_kur = system_config.kur (48.28)
```
- 448 satır. İdempotent (yalnız boş USD). Backfill sonrası doğrulama: `SUM(bakiye_usd) × satis_kur ≈ SUM(bakiye_tl)` (±yuvarlama).
- `toplam_harcama_usd` de backfill (`/ satis_kur`).
- **Ayrı script** (`scripts/backfill-usd-wallet.ts`, DRY_RUN=1 önce), sunucuda; app'e OTORİTER yükten önce (flag kapalıyken) koşulur.

### 5.3 Tahsilat yolu (debit) — flag-gated
`billing-service.ts` (reserve/settle/charge) `costUsd`'yi zaten hesaplıyor.
- Flag AÇIK: `bakiye_usd -= costUsd` (atomik `RETURNING`), `bakiye_tl` ayna güncelle. Ledger satırı: `miktar_usd`(otoriter) + `kur_at_transaction`(o anki satış kur) + `miktar_tl`(=miktar_usd × kur, türev/tarihsel).
- Flag KAPALI: bugünkü davranış (byte-identik), TL-debit.
- Aynı desen: `image-billing-service.ts`, `web-search-billing-service.ts`.
- **K1 invaryantı korunur:** upstream hata → 0 tahsil + tam iade (USD tarafında).
- Yanıt başlıkları: `X-YZ-Cost-USD`/`X-YZ-Remaining-USD` eklenir; `X-YZ-*-TL` geriye-uyum için türev kalır.

### 5.4 Yükleme yolu (credit) — flag-gated
Tüm ingress'ler zaten `amountUsd` taşıyor (`buildUsdTopupQuote`).
- Flag AÇIK: `bakiye_usd += amountUsd`; `payableTL = ceil(amountUsd × satış_kur)` müşteriden Shopier/IBAN'la TL olarak tahsil (kapı TL kalır); `payments.amount_usd/payable_tl/kur_at_payment` zaten yazılıyor. Ledger `miktar_usd=amountUsd`.
- Shopier/IBAN/crypto/Telegram/redeem/signup-bonus/admin-grant/account-delivery hepsi `creditUserBalance` (payment-common.ts) üzerinden → **tek yerden** USD'ye çevrilir.
- OSB fixed-link (`/shopier/osb-notify`) — sabit ürün haritası `creditUSD` cinsine taşınır (bugün priceTL/creditTL; ⚠️ canlı 07-05 OSB-USD path'i re-doğrula).

### 5.5 Admin & manuel
- `POST /users/:id/bakiye` — miktar artık **USD delta** (UI USD gösteriyor). TL-delta legacy girişi için opsiyonel `× kur` çeviri, ama otoriter = USD.
- Admin liste/detay `bakiyeUsd` birincil (bazı yerler zaten), TL ikincil-türev.

### 5.6 Defter & mutabakat invaryantı
- Gidecek: her `transactions` insert `miktar_usd`+`kur_at_transaction` yazar; `onceki_bakiye`/`sonraki_bakiye` **USD** cinsine (yeni `onceki_bakiye_usd`/`sonraki_bakiye_usd` kolonları VEYA mevcutları USD'ye taşı — implementasyonda karar, tercih: yeni `_usd` kolonları, TL'leri tarihsel bırak).
- **Mutabakat invaryantı TL'den USD'ye:** Gözcü/kasa-brain `ledger_drift` taraması `ABS(miktar_usd − (sonraki_usd − onceki_usd)) > 1e-6`. `SUM(bakiye_usd) == SUM(miktar_usd)` (tarihsel TL invaryantı dondurulur; USD invaryantı flag-açılış anından ileriye).
- ⚠️ Backfill anı: bakiye_usd tek-sefer set edilir ama ona karşılık gelen bir `miktar_usd` ledger satırı YOK → USD invaryantı **açılış-snapshot'tan** başlar (opening-balance satırı: her user için `tip='acilis_usd', miktar_usd=bakiye_usd` INSERT et ki `SUM(bakiye_usd)==SUM(miktar_usd)` günden-1 tutsun). Bu, kasa/Gözcü drift-alarmını yanlış-tetiklemekten korur.

### 5.7 kur'un rolü (daralır)
- Cüzdan **saf USD**. kur yalnız: (a) TL-ingress (Shopier/IBAN müşteriden TL çeker → `ceil(usd×kur)`), (b) TL-gösterim (ayna, `/me.bakiyeTL`), (c) backfill tek-sefer.
- `pricing.ts toTL` + `kur-service.ts` DEĞİŞMEZ (pricing zaten USD-native); yalnız cüzdan tarafı kur'a bağımlılıktan kurtulur.

### 5.8 Limitler (USD tabanına)
- `MIN_TOPUP_USD=5` zaten USD.
- `system_config.min/max_bakiye_tl`, `anomali_esik_tl`, `gunluk/aylik_spend_limit_tl` → USD ikizleri (`_usd`) + `rate-limit-service.ts` USD-okur. Flag-gated (kapalıyken TL).

### 5.9 Beyinler (SHADOW watchdog'lar)
- **kasa-brain** (TL P&L), **cf-brain**, **reconcile**, **Gözcü ledger_drift** hepsi TL varsayar. Geçişte **TL-ayna onları yaşatır** (bakiye_tl hâlâ dolu). Ama düzgün iş: USD-otoriter okuma.
- Faz 1 alt-görevi: kasa-brain/cf-brain/Gözcü'yü `bakiye_usd`/`miktar_usd` okuyacak şekilde güncelle (SHADOW, salt-okuma, kendi deploy reçetesi). **Sıra:** cüzdan flag'i açılmadan ÖNCE beyinler USD-farkında olmalı (yoksa ledger_drift/Identity alarmları yanlış-patlar). → Bu, Faz 1'in **son** alt-adımı, flag-açılıştan önce.

### 5.10 Flag-gating & cutover sırası
1. Uykuda deploy (flag OFF, byte-identik davranış; yeni kolonlar+kod).
2. Beyinleri USD-farkında yap (SHADOW, ayrı deploy).
3. `scripts/backfill-usd-wallet.ts` DRY_RUN → gerçek (flag OFF iken).
4. Açılış-snapshot ledger satırları (`acilis_usd`).
5. Düşük-trafikte `USD_WALLET_ENABLED=true` + restart.
6. Doğrula: bir gerçek yükleme + bir gerçek istek USD-debit; `SUM(bakiye_usd)==SUM(miktar_usd)`; `/me` + admin USD; kasa/Gözcü drift=0.
7. Rollback: `USD_WALLET_ENABLED=false` + restart (bakiye_tl ayna hâlâ dolu, TL davranışına anında döner).

---

## 6. Blast-radius (dosya:satır — lokal repo, canlıda re-doğrula)

**KRİTİK (atomik para yazımı, flag-gated + 3-QA):**
1. `services/billing-service.ts` — reserve `:164-200`, settle `:249-328`, charge `:446-485` → USD-debit + ayna + ledger USD.
2. `services/payment-common.ts creditUserBalance` `:70-106` → USD-credit (tek yer).
3. `services/package-purchase-service.ts` `:200-221,343-357` → paket alım/iade USD (⚠️ Faz 2/3 paket mantığı ayrı; Faz 1 yalnız para birimi).
4. `services/image-billing-service.ts` `:90-112`, `services/web-search-billing-service.ts` `:124-140`.
5. `services/payment-pricing.ts buildUsdTopupQuote` `:30-41` → credit=amountUsd (near-identity).
6. `routes/admin.ts POST /users/:id/bakiye` `:903-916` → USD delta.
7. `redeem-code-service.ts:60-72`, `signup-bonus-service.ts:136-158`, `account-delivery-service.ts:86`, `jobs/orphan-reservation-reaper-job.ts:59-73`.

**ŞEMA/VERİ (migration + backfill):**
8. `schema.ts` — `users.bakiye_usd`/`toplam_harcama_usd` aktive; `transactions` `_usd`/`onceki_usd`/`sonraki_usd`; `system_config` `_usd` limit ikizleri. Migration + backfill script.

**INGRESS (zaten USD-farkında — çoğu gösterim flip):**
9. `routes/payments.ts` (Shopier init/callback/OSB `:462-601,687-780`, IBAN, crypto), `routes/telegram.ts:198-222`.

**GÖSTERİM/limit (düşük risk):**
10. `routes/user.ts /me` `:221-223`, `getUserBalanceSnapshot`, `X-YZ-*` başlıklar, `email-service.ts:191-238` (₺→$), `rate-limit-service.ts:98-127` limitler.
11. Frontend `.jsx`: `tab-account.jsx` zaten USD-birincil; `tab-admin/activity/packages/models` TL-birincil → USD'ye (Faz 1 gösterim kuyruğu; müşteri-kritik değil, admin).

**Kontrat testleri (kilit güncelle):** `account-balance-contract`, `admin-billing-guard`, `payment-safety-contract` (MIN_USD), `packages-route-coverage` (fiyat_usd).

---

## 7. Test
- **Unit:** her debit/credit yolu flag ON/OFF (byte-identik OFF); backfill idempotent + dönüşüm doğruluğu; K1 (hata→0+iade) USD; ledger USD invaryantı; opening-snapshot toplam eşitliği.
- **Contract:** `/me`, admin, headers USD alanları; MIN_TOPUP_USD; no-leak (TL-ayna gösterimde kalır ama otoriter USD).
- **Integration (mümkünse):** tek test-müşteri, flag ON, gerçek yükleme + istek + iade round-trip; `SUM(bakiye_usd)==SUM(miktar_usd)`.
- **Sunucu-gate:** lint + tam suite + build + migrate + restart + health 200 (yzapi standart).

## 8. Rollback
- `USD_WALLET_ENABLED=false` + restart → TL davranışı (ayna dolu). Migration geri-alınmaz (yeni kolonlar zararsız kalır). Backfill idempotent.
- ⚠️ Flag ON iken oluşan yeni yüklemeler bakiye_usd-otoriter; rollback sonrası TL-ayna okunur (kur ile türev) — kısa drift kabul; kalıcı rollback istenmiyorsa flag ON hedef.

## 9. Açık işler / Faz 2-4 köprüsü
- Faz 1 bitince **Faz 2 (token havuzu)**: bu spec cüzdanı USD yaptı; Faz 2 kotayı istek→token yapar. Fiyatlama (Faz 3) USD cüzdana yaslanır.
- kasa-brain/cf-brain USD portu Faz-1 son adımı (flag-öncesi).
- Frontend admin TL→USD gösterim kuyruğu Faz-1 sonrası kozmetik.

---

## 10. İlgili notlar
`project_yzapi_shopier_osb_usd_live`, `project_yzapi_realtime_kur_source`, `project_yzapi_ledger_drift_990_admin_deduct`, `project_yzapi_unified_cf_counter` (flag-gated deploy deseni), `project_kasa_brain`, `project_yzapi_deploy_isolation_trap`, `feedback_qa_gate_deploy`, `feedback_deploy_double_approval`.
