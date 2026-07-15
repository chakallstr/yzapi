# CF Canlı-Eşitleyici (cf-mirror-sync) — Tasarım Spec'i
Tarih: 2026-06-23 | Proje: yzapi (yapayzekalab.org) | Tip: uygulama-içi feature (standalone /opt agent DEĞİL)

## 1. Problem
CF (CodeFast reseller) üniteyi **müşteri** bazında havuzlar (`cf_customer_id = userId`). yzapi `cf_remaining` aynasını CF'nin `x-codefast-remaining` header'ından **kopyalar; kendisi düşürmez**. Streaming (SSE) cevaplarda header **stream-açılışında** okunur (`closerouter-service.ts:652/832`) ve sık NULL → ayna **donar (over-report)** → panel "bakiyen var" der ama CF havuzu boşalmıştır → müşteri **403** yer (ör. yokumbennapacan: 939 headroom'da 12×403).

Ek olarak `topUpCfIfNeeded` tetiği `cf_remaining` **aynasına** bakar → over-report'ta **körleşir** → havuz boşken yeterli top-up yapmaz = aralıklı 403'ün asıl kök nedeni.

> NOT: CF tarafında NAKİT KAYBI YOK (19.063 paket isteği cost_tl=0; CF maliyeti istek-başı değil peşin ünitede; marj +). Bu spec **müşteri 403 mağduriyetini** ve **panel ↔ CF anlık tutarlılığını** çözer; para kaçağını değil.

## 2. Hedef
Paneldeki/aynadaki CF kalan sayısını CF gerçeğiyle **saniyeler içinde** tutmak (boştayken bile) VE havuz boşalmadan **403'ten önce** proaktif top-up tetiklemek.

## 3. Kapsam-dışı (YAGNI / güvenlik)
- Bakiye/transactions/grant/pause/entitlement-status YAZMAZ.
- Ham SQL YOK; yalnız mevcut audited fonksiyonlar.
- cf-brain ve klon-brain'e DOKUNULMAZ (izleyici/uyarıcı, insan-tetik kalır).
- Gate'in atomik UPDATE WHERE/SET'ine ve headroom valfine dokunulmaz.
- PAYG/reserve-settle para yoluna dokunulmaz.

## 4. Mimari — 3 parça

### Parça 1 — Stream-kapanış header yakalama (kök neden)
- Dosya: `src/server/services/closerouter-service.ts` (~652, ~832 streaming yolları).
- Şu an: `cfRemaining: cfRemainingHeader(upstream)` stream-AÇILIŞINDA okunuyor → sık NULL.
- Değişiklik: SSE bitince son chunk/trailer'dan `x-codefast-remaining` oku; varsa `usage.cfRemaining`'e koy. Mevcut settle yolu (`proxy.ts settleBilling` → `updateCfRemaining(userId, remaining, 'success')`) zaten kardeş-satır senkron + FLOOR yazıyor.
- **Flag:** `CF_STREAM_CLOSE_HEADER` (default false) → açılana kadar bugünkü stream-açılış davranışı korunur (deploy inert).
- Sonuç: **her istek** per-müşteri aynayı taze tutar; over-report kaynağında kapanır.
- Güvenlik: trailer da boşsa eski davranış (NULL → yazma yok); Parça 2 backstop'lar.

### Parça 2 — `cf-mirror-sync-job` (yeni in-app cron)
- Dosya: `src/server/jobs/cf-mirror-sync-job.ts`, `jobs/index.ts`'e node-cron ile kaydedilir (mevcut `cf-ledger-job`/`cf-reconcile-job` deseni).
- Periyot: `CF_MIRROR_SYNC_INTERVAL_SEC` (default 45).
- Her tick: aktif (`status='active'`, `cf_units_ordered>0`) CF müşterilerini DISTINCT `cf_customer_id`/userId çek → her biri için CF `/usage`'dan en güncel `remaining`'i al (mevcut `cf-ledger-service` CF client'ı yeniden kullanılır) → `updateCfRemaining(userId, remaining, 'success')`.
- never-throw: bir müşterinin probe'u patlasa diğerleri devam; job hatası serving'i etkilemez.

### Parça 3 — Proaktif top-up (top-up'ı kör-noktadan çıkar)
- Aynı job tick'inde, CF-gerçeği `remaining` çekildikten SONRA: `remaining < CF_PROACTIVE_TOPUP_THRESHOLD` ise (default: günlük yanış payına oranlı buffer, örn. 50) → `topUpCfIfNeeded`'ı **CF-gerçeğiyle** tetikle (aynaya değil).
- Mevcut `topUpCfIfNeeded` korumaları korunur: `daily_limit_snapshot` tavanı, idempotency `topup-<id>-b<ordered>`, CF idempotent, guarded `UPDATE WHERE cf_units_ordered=ordered`.
- Sonuç: havuz boşalmadan dolar → aralıklı 403 kaynağında biter.

## 5. Veri akışı
CF `/usage` (gerçek) → cf-mirror-sync-job → updateCfRemaining(userId, remaining, 'success') [audited, kardeş-satır senkron, FLOOR] → `cf_remaining` aynası → panel/gate.
Düşükse: CF-truth low → topUpCfIfNeeded(idempotent, daily_limit tavanı) → CF order → `cf_units_ordered`++.

## 6. Yapılandırma (env) — AS-BUILT (3-QA sonrası kesin isimler)
- `CF_MIRROR_SYNC_ENABLED` (default **false** → job hiç schedule olmaz = deploy sıfır-etki).
- `CF_MIRROR_SYNC_CRON` (default `*/30 * * * * *` = her 30sn; 6-alan cron). _(INTERVAL_SEC DEĞİL.)_
- `CF_MIRROR_SYNC_DRY_RUN` (default **true** = güvenli: ENABLED açılınca ilk tur log-only; gerçek yazma için ayrıca `=false`).
- `CF_PROACTIVE_TOPUP_ENABLED` (default **false**; proaktif top-up). _Ayrı eşik YOK_ — mevcut `CF_TOPUP_THRESHOLD_UNITS` (=75) `topUpCfIfNeeded` içinde yeniden kullanılır.
- Parça 1 (`CF_STREAM_CLOSE_HEADER`) **YOK** — spike'ta ertelendi (§11).
- `CF_MIRROR_SYNC_ENABLED=false` (default) → deploy davranışı bugünküyle birebir.

## 7. Değişmezler (invariants) / kabul kriterleri
- INV-1: sync-job yalnız `updateCfRemaining` + `topUpCfIfNeeded` çağırır; başka tabloya/kolona yazmaz.
- INV-2: `updateCfRemaining` çağrısı `source='success'` + CF'nin kendi `remaining`'i (asla yerel tahmin).
- INV-3: gate-headroom valfi (`cf_units_ordered < daily_limit_snapshot`) regresyon testiyle korunur.
- INV-4: her iki flag kapalıyken (default) davranış bugünküyle birebir (Parça 1 stream-açılış korunur, job no-op).
- AC-1: flag açıkken, boştaki bir aktif müşterinin aynası ≤ interval+1 tick içinde CF gerçeğine eşitlenir.
- AC-2: CF-truth eşik altına inince, sıradaki tick'te top-up tetiklenir (idempotent, tavan aşılmaz).
- AC-3: job içindeki herhangi bir hata yutulur (never-throw), serving etkilenmez.

## 8. Test
- Unit: sync-job pure parçaları (aktif-müşteri seçimi, threshold kararı, top-up tetik koşulu), dry-run yazma-yok.
- Regresyon: `entitlement-service.test.ts` kardeş-FLOOR + gate-headroom (mevcut testler korunur/genişletilir).
- never-throw testi (probe/updateCfRemaining throw → tick devam).
- Tam suite yeşil (mevcut ~965 + yeni). 3-QA ≥2 PASS (adversaryal).

## 9. Deploy & rollback
- İzole targeted rsync (manifest-aware: lokal main GERİDE + working tree kontamine → her hedef dosyanın CANLI kopyasını indir, diff'le, yalnız bu feature'ın hunk'larını uygula; `rsync -rlzn --checksum --itemize` ile yalnız-bu-dosyalar kanıtı).
- Hedef dosyalar: `closerouter-service.ts`, `jobs/cf-mirror-sync-job.ts` (yeni), `jobs/index.ts`, env örneği, testler. Migration YOK.
- Canlı yedek: `/opt/turkapiprojesi/.deploy/cf-mirror-sync-backup/`.
- Elle gate: lint → test → build → restart turkapiprojesi → health 200. (Job-source değişikliği build+restart sonrası etkili.)
- **Inert deploy** (flag default false) → çift-onay → kademeli aktivasyon: önce `DRY_RUN=true` (log doğrula) → sonra `ENABLED=true` interval geniş (örn 90s) → sonra 45s. Geri-al = flag false (anında).
- Targeted rsync MANIFEST'i güncellemez → gerçek canlı durumu memory notuna yaz.

## 10. Açık knob
- CF `/usage` kaynağı: doğrudan probe (default, ~14 müşteri × 45s = sorun değil; 250-event cap latest-remaining için yeterli) vs müşteri çok büyürse `cf-ledger-job` cadence'ini sıkıp ledger'dan oku. Default: doğrudan probe.

## 11. REVİZYON — canlı kod incelemesi sonrası (2026-06-23)
Canlı kaynak okundu; tasarımın çoğu ZATEN VAR:
- **Parça 2'nin çekirdeği MEVCUT:** `cf-ledger-service.ts:100 syncCfRemainingMirror(externalCustomerId, remaining)` CF gerçeğini müşterinin tüm aktif kardeş satırlarına yazar (header'dan bağımsız), `cf-ledger-job` (`*/3dk`) içinde `ingestCfUsageForCustomer` → `syncCfRemainingMirror` ile çağrılıyor. Yardımcılar mevcut: `listCfCustomerIds`, `cfUsage`, `mapCfEventsToLedgerRows`, `latestRemainingFromRows`. → Yeniden YAZILMAYACAK; YENİDEN KULLANILACAK.
- **Eksik = HIZ:** mirror sync 3dk'da bir; "anlık" için ~30-45s'lik AYRI hafif job (yalnız mirror, ledger upsert YOK).
- **`topUpCfIfNeeded` KÖR (doğrulandı, satır ~168):** `poolBuffer = MAX(cf_remaining)` aynaya bakar → over-report'ta sipariş etmez. Fix = opsiyonel `poolRemainingOverride` param (CF-gerçeğiyle çağır). `syncCfRemainingMirror` `remaining<=0`'da yazmadığı için (clobber-race koruması) tam-tükenmede ayna stale kalır → override ŞART.
- **Parça 1 (stream-close header) = SPIKE:** stream'de header `upstream.headers`'tan açılışta okunuyor, trailer okuma yok. CF'nin SSE gövdesi/trailer'da remaining verip vermediği BİLİNMİYOR → önce spike, sonra implementasyon/iptal. Fast-poll (yeni job) zaten asıl çözüm.
Plan: `docs/superpowers/plans/2026-06-23-cf-canli-esitleyici.md`.
