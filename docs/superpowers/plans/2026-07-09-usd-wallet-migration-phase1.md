# USD Cüzdan Göçü (Faz 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** yzapi müşteri cüzdanının otoriter para birimini TL'den USD'ye taşımak (`bakiye_usd` otoriter, `bakiye_tl` türetilmiş ayna), davranışı `USD_WALLET_ENABLED` flag'iyle kapılayarak, mevcut 448 bakiyeyi satış kuruyla (48.28) tek-sefer çevirerek.

**Architecture:** Yaklaşım A (yetki-devri). Uyuyan USD kolonları (canlıda VAR, 0 yazılı) aktive edilir. Her para-mutasyonu `bakiye_usd`'yi atomik günceller + `bakiye_tl` aynasını dual-write eder. `billing-service.computeCost` zaten `costUsd` üretir → flag ON'da USD düşer. Ledger USD-otoriter (`miktar_usd`+`kur_at_transaction`), açılış-snapshot satırlarıyla `SUM(bakiye_usd)==SUM(miktar_usd)` günden-1 tutar. Beyinler flag-öncesi USD-farkında yapılır. Flag OFF = byte-identik mevcut davranış (rollback = env-flip).

**Tech Stack:** Node v22 (VPS) / v25 (lokal), TypeScript, esbuild, Drizzle-benzeri raw SQL migration'lar, Postgres (self-host), Vitest, node-cron. Deploy = `scripts/sync-deploy.sh` sunucu-gate (lint/test/build/migrate/restart/smoke) VEYA targeted-rsync izolasyon.

**Spec:** `docs/superpowers/specs/2026-07-09-usd-wallet-migration-phase1-design.md`

---

## ⚠️ Execution ön-koşulları (HER görev bunlara uyar)

1. **Canlı-sadık replika ZORUNLU.** Kesin dosya:satır lokal-stale'den GÜVENİLMEZ. Task 0'da replika kurulur; tüm kod-değişiklikleri canlı-pull edilmiş dosyalara karşı yapılır. `LOCAL_SRC=~/yzapi` deploy YASAK.
2. **billing-service.ts DOKUNULMAZ-sınıfı** (yzapi CLAUDE.md) → 3-QA gate zorunlu (Task sonu).
3. **Para tablolarına ad-hoc UPDATE/INSERT auto-deny.** Backfill/açılış-snapshot = ayrı idempotent script (Task 3), app servisleri/endpoint üzerinden değilse Ufuk `!`-shell'iyle.
4. **Flag OFF deploy = byte-identik** — her görevde OFF-yolu davranış-değişmez testi.
5. **Test flake:** lokal (v25) `closerouter-service.test.ts` değişken kırmızı; deploy kararı **sunucu-gate (v22)** sonucuna göre (`project_yzapi_unit_suite_local_flake`).
6. **Cutover (Task 13) canlı-para = çift-onay + düşük-trafik + 3-QA PASS.**

---

## Dosya yapısı (değişecek/eklenecek)

**Yeni:**
- `migrations/00NN_usd_wallet_columns.sql` — eksik USD kolonları + limit ikizleri.
- `scripts/backfill-usd-wallet.ts` — bakiye_usd backfill + açılış-snapshot ledger (DRY_RUN destekli).
- `src/server/services/wallet-currency.ts` — TEK yer: flag-okuma + `debitWallet`/`creditWallet` USD/TL-ayna yardımcıları (DRY; tüm debit/credit siteleri bunu çağırır).
- Test dosyaları: `wallet-currency.test.ts`, `usd-wallet-migration.test.ts` (backfill), + mevcut billing/payment testlerine USD-flag varyantları.

**Değişecek (canlı-pull'a karşı, blast-radius spec §6):**
- `services/billing-service.ts` (reserve/settle/charge), `payment-common.ts` (creditUserBalance), `image-billing-service.ts`, `web-search-billing-service.ts`, `package-purchase-service.ts`, `redeem-code-service.ts`, `signup-bonus-service.ts`, `account-delivery-service.ts`, `jobs/orphan-reservation-reaper-job.ts`, `routes/admin.ts` (bakiye), `routes/user.ts` (/me), `proxy.ts` (headers + balance snapshot), `rate-limit-service.ts` (limitler), `email-service.ts`, `lib/env.ts` (flag), `db/schema.ts`.
- Frontend `.jsx` admin gösterim (Task 9, düşük risk).
- Beyinler (Task 10, ayrı deploy): kasa-brain/cf-brain/Gözcü.

**Prensip:** debit/credit MANTIĞI tek `wallet-currency.ts`'te toplanır; 10+ çağıran site yalnız `debitWallet(tx, userId, {usd, tl})` / `creditWallet(...)` çağırır → DRY, tek-yerden-test, flag tek yerde.

---

## Task 0: Canlı-sadık replika + flag iskeleti

**Files:**
- Create: `~/yzapi-usd-migration/` (replika, git)

- [ ] **Step 1: Replika kur** — `project_yzapi_live_faithful_replica` reçetesi: `rsync -az --exclude .deploy --exclude node_modules --exclude .git --exclude '.env*' --exclude dist yzapi-vps:/opt/turkapiprojesi/ ~/yzapi-usd-migration/`; node_modules md5-eşleşirse symlink; `.env.example` scp geri. `git init` + baseline commit.
- [ ] **Step 2: Doğrula** — `cd ~/yzapi-usd-migration && npm ci >/dev/null 2>&1; npx tsc --noEmit` temiz (canlı koda karşı). Baseline test: `npm test 2>&1 | tail -5` (flake toleransı: closerouter SSE hariç yeşil).
- [ ] **Step 3: Commit** — `git add -A && git commit -m "chore: usd-migration replica baseline @ live"`

**Verification:** replika `tsc --noEmit` temiz + baseline suite (flake hariç) yeşil = canlı koda sadık zemin.

---

## Task 1: Şema — USD kolonlarını aktive et (migration)

**Files:**
- Create: `migrations/00NN_usd_wallet_columns.sql` (NN = canlı max+1, `ls migrations/ | tail` ile bul)
- Modify: `db/schema.ts` (kolon tipleri; canlı-pull)
- Test: `test/usd-wallet-schema.test.ts`

- [ ] **Step 1: Failing test** — migration sonrası kolonların varlığı + tip:
```ts
// test/usd-wallet-schema.test.ts
import { describe, it, expect } from "vitest";
import { db } from "../src/server/db/client";
describe("usd wallet schema", () => {
  it("users has bakiye_usd + toplam_harcama_usd numeric", async () => {
    const r = await db.execute(`SELECT column_name FROM information_schema.columns
      WHERE table_name='users' AND column_name IN ('bakiye_usd','toplam_harcama_usd')`);
    expect(r.rows.map((x:any)=>x.column_name).sort()).toEqual(["bakiye_usd","toplam_harcama_usd"]);
  });
  it("transactions has onceki_bakiye_usd + sonraki_bakiye_usd", async () => {
    const r = await db.execute(`SELECT column_name FROM information_schema.columns
      WHERE table_name='transactions' AND column_name IN ('onceki_bakiye_usd','sonraki_bakiye_usd')`);
    expect(r.rows.length).toBe(2);
  });
});
```
- [ ] **Step 2: Run → FAIL** — `npx vitest run test/usd-wallet-schema.test.ts` → kolonlar yok (onceki/sonraki_usd + toplam_harcama_usd henüz eklenmedi; bakiye_usd/miktar_usd zaten var).
- [ ] **Step 3: Migration yaz** (yalnız EKSİK olanlar; bakiye_usd/miktar_usd/kur_at_transaction canlıda VAR → `IF NOT EXISTS`):
```sql
-- migrations/00NN_usd_wallet_columns.sql
ALTER TABLE users            ADD COLUMN IF NOT EXISTS bakiye_usd numeric(14,6) DEFAULT 0;
ALTER TABLE users            ADD COLUMN IF NOT EXISTS toplam_harcama_usd numeric(14,6) DEFAULT 0;
ALTER TABLE transactions     ADD COLUMN IF NOT EXISTS miktar_usd numeric(14,6);
ALTER TABLE transactions     ADD COLUMN IF NOT EXISTS kur_at_transaction numeric(12,6);
ALTER TABLE transactions     ADD COLUMN IF NOT EXISTS onceki_bakiye_usd numeric(14,6);
ALTER TABLE transactions     ADD COLUMN IF NOT EXISTS sonraki_bakiye_usd numeric(14,6);
ALTER TABLE system_config    ADD COLUMN IF NOT EXISTS min_topup_usd numeric(10,2) DEFAULT 5;
ALTER TABLE system_config    ADD COLUMN IF NOT EXISTS gunluk_spend_limit_usd numeric(12,4);
ALTER TABLE system_config    ADD COLUMN IF NOT EXISTS aylik_spend_limit_usd numeric(12,4);
ALTER TABLE system_config    ADD COLUMN IF NOT EXISTS anomali_esik_usd numeric(12,4);
-- _journal.json'a idx/when ekle (drizzle deseni; canlı journal'ı canlı-pull et)
```
- [ ] **Step 4: schema.ts güncelle** — canlı-pull edilmiş schema.ts'e yeni kolonları ekle (mevcut `bakiye_usd`/`miktar_usd` zaten tanımlıysa yalnız eksikleri; drift'e dikkat).
- [ ] **Step 5: Migrate + Run → PASS** — replika DB'de `npm run db:migrate` (veya sunucu-gate) → `npx vitest run test/usd-wallet-schema.test.ts` PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(usd): add dormant USD wallet columns migration"`

**Verification:** `information_schema` 4 yeni kolon (users 2 + transactions 2 + system_config 4) + mevcut bakiye_usd/miktar_usd korunur; tip numeric.

---

## Task 2: Flag plumbing (`USD_WALLET_ENABLED`)

**Files:**
- Modify: `lib/env.ts` (zod bool, default false)
- Test: `test/env-usd-flag.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { env } from "../src/server/lib/env";
describe("USD_WALLET_ENABLED flag", () => {
  it("defaults false (byte-identik davranış)", () => {
    expect(typeof env.USD_WALLET_ENABLED).toBe("boolean");
    expect(env.USD_WALLET_ENABLED).toBe(false);
  });
});
```
- [ ] **Step 2: Run → FAIL** — flag tanımsız.
- [ ] **Step 3: env.ts'e ekle** — `CODEX_SEAT_ONLY` deseninin birebir aynısı: `USD_WALLET_ENABLED: z.string().optional().transform(v => v === "true").default("false")` (canlı env.ts'teki mevcut bool desenini takip et).
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(usd): add USD_WALLET_ENABLED env flag (default false)"`

**Verification:** flag var, default false → OFF = mevcut davranış.

---

## Task 3: Cüzdan-para yardımcısı (`wallet-currency.ts`) — DRY çekirdek

**Files:**
- Create: `src/server/services/wallet-currency.ts`
- Test: `test/wallet-currency.test.ts`

- [ ] **Step 1: Failing test** (flag ON/OFF davranışı + ayna + ledger alanları):
```ts
import { describe, it, expect } from "vitest";
import { buildWalletMutation } from "../src/server/services/wallet-currency";
// buildWalletMutation: saf fonksiyon → SQL-yerine değer üretir (debit/credit sonrası kolonlar).
describe("wallet-currency", () => {
  const kur = 48.28;
  it("OFF: TL otoriter (mevcut davranış, USD dokunmaz)", () => {
    const m = buildWalletMutation({ enabled:false, dir:"debit", usd:0.5, tl:24.14, kur, before:{tl:100, usd:2} });
    expect(m.newTL).toBeCloseTo(75.86, 2);
    expect(m.newUSD).toBe(2); // OFF'ta USD değişmez
    expect(m.ledger.miktar_tl).toBeCloseTo(24.14,2);
  });
  it("ON: USD otoriter + TL ayna = usd*kur + ledger usd-otoriter", () => {
    const m = buildWalletMutation({ enabled:true, dir:"debit", usd:0.5, tl:24.14, kur, before:{tl:100, usd:2} });
    expect(m.newUSD).toBeCloseTo(1.5, 6);
    expect(m.newTL).toBeCloseTo(1.5*kur, 2); // ayna
    expect(m.ledger.miktar_usd).toBeCloseTo(0.5,6);
    expect(m.ledger.kur_at_transaction).toBe(kur);
    expect(m.ledger.onceki_bakiye_usd).toBe(2);
    expect(m.ledger.sonraki_bakiye_usd).toBeCloseTo(1.5,6);
  });
  it("ON credit: usd artar, ayna güncel", () => {
    const m = buildWalletMutation({ enabled:true, dir:"credit", usd:10, tl:483, kur, before:{tl:0, usd:0} });
    expect(m.newUSD).toBe(10);
    expect(m.newTL).toBeCloseTo(10*kur,2);
  });
});
```
- [ ] **Step 2: Run → FAIL** — modül yok.
- [ ] **Step 3: Implement** — saf fonksiyon; flag ON → USD otoriter (`newUSD = before.usd ± usd`), `newTL = round(newUSD*kur,4)` ayna, ledger `miktar_usd/kur_at_transaction/onceki_usd/sonraki_usd` dolu, `miktar_tl = round(usd*kur,4)` türev; flag OFF → mevcut TL yolu (`newTL = before.tl ± tl`, USD dokunulmaz, ledger TL-only eski davranış). Saf/izole (DB yok) → kolay test.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(usd): wallet-currency DRY helper (flag-gated debit/credit math)"`

**Verification:** 3 test yeşil; OFF-yolu USD'ye dokunmaz (byte-identik garanti); ON-yolu USD-otoriter + ayna + ledger USD alanları.

---

## Task 4: Çekirdek DEBIT — billing-service USD (flag-gated)

**Files:**
- Modify: `services/billing-service.ts` (reserve/settle/charge — canlı-pull)
- Test: `test/billing-usd.test.ts`

- [ ] **Step 1: Failing test** — reserve+settle round-trip flag ON: bakiye_usd düşer, ayna güncel, usage_records cost_usd yazılı, K1 (hata→0+iade) USD. (DB-entegre veya mock; canlı computeCost zaten costUsd üretir.)
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — reserve/settle/charge'daki `UPDATE users SET bakiye_tl = bakiye_tl - X RETURNING` çağrılarını `wallet-currency.buildWalletMutation` + tek `UPDATE users SET bakiye_usd=:newUSD, bakiye_tl=:newTL, toplam_harcama_usd=... RETURNING` ile değiştir (flag ile dallanır). Ledger insert `miktar_usd/kur_at_transaction/onceki_usd/sonraki_usd` dolu. `costUsd` = mevcut `computeCost(...,"usd")` çıktısı. K1 iade yolu USD.
- [ ] **Step 4: Run → PASS** + `npx vitest run test/billing-usd.test.ts test/billing-service.test.ts` (mevcut billing testleri OFF'ta hâlâ yeşil = byte-identik).
- [ ] **Step 5: Commit** — `git commit -am "feat(usd): billing-service USD debit flag-gated"`

**Verification:** ON'da reserve/settle bakiye_usd düşürür + ayna + ledger USD; OFF'ta mevcut billing testleri değişmeden geçer; K1 upstream-hata → 0 charge + tam USD iade.

---

## Task 5: Çekirdek CREDIT — creditUserBalance USD (flag-gated)

**Files:**
- Modify: `services/payment-common.ts` (creditUserBalance — canlı-pull)
- Test: `test/credit-usd.test.ts`

- [ ] **Step 1: Failing test** — flag ON: `creditUserBalance(userId, {amountUsd:10, kur})` → bakiye_usd += 10, ayna = 10*kur, ledger miktar_usd=10, idempotent (aynı key iki kez = tek kredi).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — `creditUserBalance` imzasına `amountUsd` (ingress zaten taşıyor); flag ON → `buildWalletMutation(credit)`; OFF → mevcut TL kredisi. Idempotency (`pay_<key>`) korunur.
- [ ] **Step 4: Run → PASS** (+ mevcut payment testleri OFF yeşil)
- [ ] **Step 5: Commit** — `git commit -am "feat(usd): creditUserBalance USD flag-gated"`

**Verification:** ON'da yükleme bakiye_usd'yi artırır + ayna + ledger; idempotent; OFF byte-identik.

---

## Task 6: İkincil debit/credit siteleri (aynı yardımcıya bağla)

**Files (her biri canlı-pull, hepsi `wallet-currency`'ye bağlanır):**
- `services/image-billing-service.ts`, `services/web-search-billing-service.ts` (debit)
- `services/package-purchase-service.ts` (purchase debit + refund — ⚠️ paket MANTIĞI değişmez, yalnız para birimi; `fiyat_usd` otoriter okunur, yoksa `fiyat_tl/kur`)
- `services/redeem-code-service.ts`, `services/signup-bonus-service.ts`, `services/account-delivery-service.ts` (credit)
- `jobs/orphan-reservation-reaper-job.ts` (refund)
- `routes/admin.ts` POST `/users/:id/bakiye` (admin USD delta)
- Test: her site için ON/OFF varyant (`test/secondary-usd.test.ts`)

- [ ] **Step 1: Failing tests** — her site flag ON'da USD-yolu, OFF'ta mevcut TL-yolu (byte-identik).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — her sitedeki inline `bakiye_tl ±` UPDATE'i `buildWalletMutation` + tek UPDATE ile değiştir (Task 4 deseni birebir). admin: miktar USD delta.
- [ ] **Step 4: Run → PASS** (+ ilgili mevcut testler OFF yeşil)
- [ ] **Step 5: Commit** — site-başı veya toplu: `git commit -am "feat(usd): secondary debit/credit sites USD flag-gated"`

**Verification:** her para-yolu ON'da USD/ayna/ledger; OFF davranış-değişmez; paket alım/iade tutarları USD tabanında doğru.

---

## Task 7: Ledger USD invaryantı + açılış-snapshot uyumu

**Files:**
- Modify: (Task 4-6'da ledger insert'leri zaten USD alanları yazıyor) — burada invaryant testi + reconciliation
- Test: `test/ledger-usd-invariant.test.ts`

- [ ] **Step 1: Failing test** — bir kullanıcı için açılış-snapshot + N debit/credit sonrası `SUM(miktar_usd) == bakiye_usd` ve `ABS(miktar_usd-(sonraki_usd-onceki_usd))<1e-6` (drift yok).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — insert'lerde onceki/sonraki_usd tutarlılığı garanti (Task 4-6 üretti); gerekiyorsa reconciliation yardımcı SELECT'i (Gözcü/kasa okuması için). Kod değişimi minimal, çoğu test-doğrulama.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** — `git commit -am "test(usd): ledger USD invariant + snapshot consistency"`

**Verification:** invaryant testi yeşil; `SUM(bakiye_usd)==SUM(miktar_usd)` (açılış-snapshot dahil) tutar → kasa/Gözcü yanlış-alarm önlenir.

---

## Task 8: Limitler USD tabanına (flag-gated)

**Files:**
- Modify: `services/rate-limit-service.ts` (günlük/aylık spend + anomali), min/max topup
- Test: `test/limits-usd.test.ts`

- [ ] **Step 1: Failing test** — flag ON: harcama limitleri USD kolonlarından okunur; OFF: TL.
- [ ] **Step 2: FAIL → Step 3: Implement** (flag dallanır; `MIN_TOPUP_USD` zaten var) → **Step 4: PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(usd): spend/anomaly limits USD flag-gated"`

**Verification:** ON'da limitler USD; OFF TL; müşteri yanlış-blok/serbest yok.

---

## Task 9: Gösterim — /me, headers, email, admin (USD)

**Files:**
- Modify: `routes/user.ts` /me (bakiyeUsd birincil), `proxy.ts` (`X-YZ-Cost-USD`/`X-YZ-Remaining-USD` ekle, TL türev), `email-service.ts` (₺→$ + ≈₺), admin JSX (`tab-admin/activity/packages/models` — TL-birincil→USD; düşük risk, müşteri-kritik değil)
- Test: `test/display-usd.test.ts` + kontrat testleri

- [ ] **Step 1: Failing test** — /me `bakiyeUsd` birincil + `bakiyeTL` türev; headers USD var.
- [ ] **Step 2: FAIL → Step 3: Implement** → **Step 4: PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat(usd): display surfaces USD-primary (me/headers/email/admin)"`

**Verification:** /me + headers + email + admin USD gösterir; `scan:public` no-leak temiz.

---

## Task 10: Beyinler USD-farkında (SHADOW, AYRI deploy, flag-öncesi)

**Files (VPS SHADOW watchdog'lar — kendi deploy reçetesi, yzapi app değil):**
- kasa-brain (TL P&L → USD), cf-brain / Gözcü `ledger_drift` (miktar_usd okur), reconcile

- [ ] **Step 1** — her beyni canlı-pull, `bakiye_usd`/`miktar_usd` okuyacak şekilde güncelle (TL-ayna geçişte yaşatır ama otoriter USD).
- [ ] **Step 2** — kendi test suite (varsa) + `node --check`.
- [ ] **Step 3** — 3-agent QA (SHADOW watchdog QA reçetesi).
- [ ] **Step 4** — scp deploy + bir gerçek tick doğrula.

**Verification:** beyinler USD-otoriter okur, drift=0; **flag açılmadan ÖNCE canlı** (yoksa cutover'da yanlış-alarm).

**⚠️ Not:** Bu görev app-deploy'dan AYRI ve flag-cutover'dan ÖNCE bitmeli.

---

## Task 11: Kontrat testleri + tam suite

**Files:**
- Modify: `account-balance-contract.test.ts`, `admin-billing-guard.test.ts`, `payment-safety-contract.test.ts`, `packages-route-coverage.test.ts`

- [ ] **Step 1** — kontratlara USD-flag varyantları (OFF = mevcut kilit, ON = USD).
- [ ] **Step 2** — replika tam suite: `npm test` (flake toleransı closerouter SSE).
- [ ] **Step 3: Commit** — `git commit -am "test(usd): contract tests USD variants + full suite green"`

**Verification:** tam suite yeşil (flake hariç); OFF kontratları değişmemiş.

---

## Task 12: INERT deploy (flag OFF, sunucu-gate)

- [ ] **Step 1** — targeted-rsync izolasyon (`--checksum --itemize` kanıtı, yalnız değişen dosyalar) VEYA sunucu-gate `sync-deploy.sh`. **Flag OFF** → byte-identik davranış.
- [ ] **Step 2** — sunucu-gate: lint + tam test (v22, 187+) + build + migrate (Task 1) + restart + health 200.
- [ ] **Step 3** — canlı doğrula: yeni kolonlar `information_schema`'da; davranış değişmemiş (bir gerçek istek TL-debit hâlâ, flag OFF).
- [ ] **Step 4: Commit** — deploy manifest/notu.

**Verification:** flag OFF canlıda, migration uygulandı, mevcut para davranışı DEĞİŞMEDİ (kanıt: bir gerçek işlem TL). Rollback gerekmez (inert).

---

## Task 13: CUTOVER — backfill + flag flip + doğrula (ÇİFT-ONAY + DÜŞÜK-TRAFİK)

**Files:**
- `scripts/backfill-usd-wallet.ts`

- [ ] **Step 1: Backfill DRY_RUN** — `NODE_ENV=production DRY_RUN=1 npx tsx scripts/backfill-usd-wallet.ts` → 448 satır önizleme (`bakiye_usd = bakiye_tl/48.28`), toplam kontrol `SUM(usd)*48.28 ≈ SUM(tl)`.
- [ ] **Step 2: Backfill gerçek** — DRY_RUN=0 (flag hâlâ OFF). + açılış-snapshot ledger satırları (`tip='acilis_usd', miktar_usd=bakiye_usd, kur_at_transaction=48.28`).
- [ ] **Step 3: Doğrula (flag OFF, backfill sonrası)** — `SUM(bakiye_usd)*48.28 ≈ SUM(bakiye_tl)` (±kuruş); açılış-snapshot ile `SUM(bakiye_usd)==SUM(miktar_usd)`; beyinler (Task 10) drift=0.
- [ ] **Step 4: FLAG FLIP** — düşük-trafikte `USD_WALLET_ENABLED=true` + restart. **ÇİFT-ONAY + 3-QA PASS şart.**
- [ ] **Step 5: Canlı doğrula** — bir gerçek yükleme (USD kredisi) + bir gerçek istek (USD debit) + `/me` USD + admin USD + `X-YZ-*-USD` header + kasa/Gözcü drift=0 + hata yok (~10dk izle).
- [ ] **Step 6: Rollback hazır** — sorun → `USD_WALLET_ENABLED=false` + restart (ayna dolu, TL davranışına anında döner).

**Verification:** canlı gerçek yükleme+istek USD-otoriter işler; toplam eşitlik korunur; beyinler temiz; /me+admin+header USD; rollback tek env-flip.

---

## Self-Review (spec kapsamı)

- Spec §5.1 otoriter/ayna → Task 3-6. §5.2 backfill → Task 13. §5.3 debit → Task 4. §5.4 credit → Task 5. §5.5 admin → Task 6. §5.6 ledger/invaryant → Task 7,13. §5.7 kur → değişmez (dokunulmadı, doğru). §5.8 limitler → Task 8. §5.9 beyinler → Task 10. §5.10 flag/cutover → Task 2,12,13. §6 blast-radius → Task 4-9. §7 test → her task + Task 11. §8 rollback → Task 13/6. **Boşluk yok.**
- Placeholder: kod-adımları gerçek kod/SQL içerir; kesin satır-hunk'lar canlı-pull'a bağlı (bilinçli, stale-lokal gerçeği — ön-koşul §1'de deklare).
- Tip tutarlılığı: `buildWalletMutation` imzası Task 3'te sabit, Task 4-8 aynısını çağırır.

---

## Execution Handoff

Faz 1, canlı-para. Öneri: **subagent-driven-development** (her task taze subagent + iki-aşamalı review), Task 0→13 sırayla; Task 12-13 (deploy/cutover) Ufuk çift-onayı + 3-QA olmadan çalıştırılmaz.
