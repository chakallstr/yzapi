# Devreden CF Codex Paketi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CF Codex/GPT üzerinde, kullanılmayan günlük kotası ertesi günlere devreden (rollover) paketler ekle — Kendin Yap builder (100–10.000 istek × 2–30 gün, lookup-tablo fiyat) + sabit paketler (500/1000/2000 × 1/7/14/30) + saatlik 150 istek hız freni.

**Architecture:** Mevcut paket-entitlement gate'ine 3 yeni katman: (a) günlük tavan + sınırsız devir birikimi (atomik UPDATE'e gömülü), (b) DB-backed saatlik hız freni, (c) lookup-tablo + bilinear interpolasyon builder fiyatı. Tüm yeni kolonlar nullable/default → mevcut paketler için inert. Para yolu (reserve/settle) dokunulmaz.

**Tech Stack:** Express + TypeScript, PostgreSQL (Drizzle ORM + raw `dbSql`), Vitest (unit + itest), React/JSX (Vite), node-postgres.

⚠️ **Spec:** `docs/superpowers/specs/2026-06-24-devreden-codex-paketi-design.md` — fiyat tablosu, model ve tüm kararlar orada kilitli.

⚠️ **DEPLOY GERÇEĞİ (kritik):** Canlı `entitlement-service.ts` / `proxy.ts` / `codefast-provisioning-service.ts` lokal `main`'in ÖNÜNDE (R-3 over-serve cap + shared-pool FLOOR mirror canlıda var, lokalde yok). Bu dosyalara TDD ve deploy **canlı-faithful replika** üzerinden yapılır (Faz 0). `LOCAL_SRC=~/yzapi` deploy YASAK.

---

## Faz 0 — Canlı-faithful replika + worktree (TDD tabanı)

### Task 0.1: Canlı replika kur

**Files:**
- Create: `~/yzapi-devreden/` (replika, git-init'li)

- [ ] **Step 1: Replikayı canlıdan çek**

```bash
rsync -az --exclude node_modules --exclude .git --exclude '.env*' yzapi-vps:/opt/turkapiprojesi/ ~/yzapi-devreden/
```

- [ ] **Step 2: node_modules + .env.example**

```bash
# package-lock eşleşiyorsa local node_modules'ü symlink'le, yoksa npm ci
if [ "$(md5 -q ~/yzapi/package-lock.json)" = "$(md5 -q ~/yzapi-devreden/package-lock.json)" ]; then
  ln -s ~/yzapi/node_modules ~/yzapi-devreden/node_modules
else
  (cd ~/yzapi-devreden && npm ci)
fi
scp yzapi-vps:/opt/turkapiprojesi/.env.example ~/yzapi-devreden/.env.example   # contract test okur
```

- [ ] **Step 3: Baseline commit (diff'lerin temiz çıkması için)**

```bash
cd ~/yzapi-devreden && git init -q && git add -A && git commit -q -m "baseline: live replica"
```

- [ ] **Step 4: Mevcut canlı migration sıra numarasını öğren (0044 için)**

Run: `ls ~/yzapi-devreden/src/server/db/migrations/ | grep -E '^00' | sort | tail -3`
Expected: en yüksek `NNNN_*.sql` (canlıda ≥ `0043_*`). Yeni migration = `(max+1)`. `meta/_journal.json` en yüksek `when`'i not al (yeni `when = max + 1`).

- [ ] **Step 5: DB ayağa kaldır + mevcut migration'ları uygula**

```bash
cd ~/yzapi-devreden && docker rm -f yzapi-postgres-1 2>/dev/null; rm -rf .pgdata; npm run db:up
docker exec yzapi-postgres-1 pg_isready -U yzapi -d yzapi   # ready bekle
npm run db:migrate
```

> Bundan sonraki TÜM görevler `~/yzapi-devreden/` içinde yapılır. Faz 7'de yalnız değişen dosyalar canlıya izole rsync edilir.

---

## Faz 1 — Migration 0044 (7 yeni kolon)

### Task 1.1: Migration dosyası + schema.ts + journal

**Files:**
- Create: `src/server/db/migrations/0044_package_rollover.sql` (numara Faz 0.4'teki canlı max+1; bu plan 0044 varsayar — gerçek numarayı oraya göre ayarla)
- Modify: `src/server/db/migrations/meta/_journal.json` (yeni girdi, `when` = mevcut max + 1)
- Modify: `src/server/db/schema.ts` (packages + userPackageEntitlements tabloları)
- Test: `src/server/__tests__/migration-rollover-columns.itest.ts`

- [ ] **Step 1: Failing itest yaz (kolonlar var mı)**

```ts
// src/server/__tests__/migration-rollover-columns.itest.ts
import { describe, it, expect } from "vitest";
import { dbSql } from "../db/client";

describe("0044 rollover columns", () => {
  it("packages has devreden + saatlik_limit", async () => {
    const rows = await dbSql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'packages' AND column_name IN ('devreden','saatlik_limit')`;
    expect(rows.map(r => r.column_name).sort()).toEqual(["devreden", "saatlik_limit"]);
  });
  it("user_package_entitlements has 5 rollover columns", async () => {
    const rows = await dbSql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_package_entitlements'
        AND column_name IN ('daily_quota','rollover_balance','saatlik_limit','hour_window_start','requests_this_hour')`;
    expect(rows.length).toBe(5);
  });
  it("rollover_balance has non-negative + multiple-of-50 check", async () => {
    const rows = await dbSql`SELECT conname FROM pg_constraint WHERE conname = 'upe_rollover_balance_chk'`;
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd ~/yzapi-devreden && npm run itest -- migration-rollover-columns`
Expected: FAIL (kolonlar yok)

- [ ] **Step 3: Migration SQL yaz**

```sql
-- src/server/db/migrations/0044_package_rollover.sql
ALTER TABLE packages ADD COLUMN IF NOT EXISTS devreden boolean NOT NULL DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS saatlik_limit integer;

ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS daily_quota integer;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS rollover_balance integer NOT NULL DEFAULT 0;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS saatlik_limit integer;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS hour_window_start timestamptz;
ALTER TABLE user_package_entitlements ADD COLUMN IF NOT EXISTS requests_this_hour integer NOT NULL DEFAULT 0;

DO $mig$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'upe_rollover_balance_chk') THEN
    ALTER TABLE user_package_entitlements
      ADD CONSTRAINT upe_rollover_balance_chk CHECK (rollover_balance >= 0 AND rollover_balance % 50 = 0);
  END IF;
END $mig$;
```

> ⚠️ SSH/psql'de `$mig$` dollar-quoting yerel migrator için sorun değil (dosyadan okunur), ama elle `psql -c` ile çalıştırırsan `$$` shell-PID tuzağına dikkat.

- [ ] **Step 4: schema.ts'e kolonları ekle (Drizzle tek-kaynak)**

`packages` tablosuna:
```ts
devreden: boolean("devreden").notNull().default(false),
saatlikLimit: integer("saatlik_limit"),
```
`userPackageEntitlements` tablosuna:
```ts
dailyQuota: integer("daily_quota"),
rolloverBalance: integer("rollover_balance").notNull().default(0),
saatlikLimit: integer("saatlik_limit"),
hourWindowStart: timestamp("hour_window_start", { withTimezone: true }),
requestsThisHour: integer("requests_this_hour").notNull().default(0),
```

- [ ] **Step 5: _journal.json'a girdi ekle**

`meta/_journal.json` `entries` dizisine yeni obje: `{ idx: <mevcut max idx+1>, version: "...", when: <mevcut max when + 1>, tag: "0044_package_rollover", breakpoints: true }`. ⚠️ `when` mevcut max'tan BÜYÜK olmalı.

- [ ] **Step 6: Migrate + test geçsin**

Run: `cd ~/yzapi-devreden && npm run db:migrate && npm run itest -- migration-rollover-columns`
Expected: PASS (3 test)

- [ ] **Step 7: Commit**

```bash
git add src/server/db/migrations/0044_package_rollover.sql src/server/db/migrations/meta/_journal.json src/server/db/schema.ts src/server/__tests__/migration-rollover-columns.itest.ts
git commit -m "feat(devreden): migration 0044 rollover + hourly + daily_quota columns"
```

---

## Faz 2 — Builder fiyat: lookup tablosu + bilinear interpolasyon

### Task 2.1: BUILDER_PRICE_TABLE + interpolasyon (saf, testli)

**Files:**
- Create: `src/server/services/devreden-pricing.ts`
- Test: `src/server/services/devreden-pricing.test.ts`

- [ ] **Step 1: Failing unit test yaz (çapalar + interpolasyon + monotonluk)**

```ts
// src/server/services/devreden-pricing.test.ts
import { describe, it, expect } from "vitest";
import { devredenPrice, BUILDER_ISTEK, BUILDER_GUN } from "./devreden-pricing";

describe("devreden builder pricing", () => {
  it("çapaları tam verir", () => {
    expect(devredenPrice(100, 1)).toBe(40);
    expect(devredenPrice(500, 1)).toBe(169);
    expect(devredenPrice(1000, 30)).toBe(8750);
    expect(devredenPrice(100, 30)).toBe(1059);
  });
  it("grid noktalarını tam verir", () => {
    expect(devredenPrice(2000, 30)).toBe(17294);
    expect(devredenPrice(10000, 30)).toBe(85652);
    expect(devredenPrice(500, 30)).toBe(4477);
  });
  it("ara istek değerini interpoler (175/30g, 150=1487 ile 200=1914 arası)", () => {
    const p = devredenPrice(175, 30);
    expect(p).toBeGreaterThan(1487);
    expect(p).toBeLessThan(1914);
  });
  it("ara gün değerini interpoler (500 istek/5 gün, 2g=336 ile 7g=1154 arası)", () => {
    const p = devredenPrice(500, 5);
    expect(p).toBeGreaterThan(336);
    expect(p).toBeLessThan(1154);
  });
  it("hacim monoton: aynı günde istek artınca ₺/istek azalır", () => {
    for (const d of BUILDER_GUN) {
      let prevPer = Infinity;
      for (const n of BUILDER_ISTEK) {
        const per = devredenPrice(n, d) / n;
        expect(per).toBeLessThanOrEqual(prevPer + 1e-9);
        prevPer = per;
      }
    }
  });
  it("süre monoton: aynı istekte gün artınca ₺/(istek*gün) azalır", () => {
    for (const n of BUILDER_ISTEK) {
      let prevPer = Infinity;
      for (const d of BUILDER_GUN) {
        const per = devredenPrice(n, d) / (n * d);
        expect(per).toBeLessThanOrEqual(prevPer + 1e-9);
        prevPer = per;
      }
    }
  });
  it("hiçbiri CF maliyetinin (0.069/istek) altında değil", () => {
    for (const n of BUILDER_ISTEK) for (const d of BUILDER_GUN) {
      expect(devredenPrice(n, d)).toBeGreaterThan(0.069 * n * d);
    }
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd ~/yzapi-devreden && npx vitest run src/server/services/devreden-pricing.test.ts`
Expected: FAIL (module yok)

- [ ] **Step 3: devreden-pricing.ts yaz (kilitli grid + bilinear interp)**

```ts
// src/server/services/devreden-pricing.ts
// Spec §2 — FİNAL kilitli satılan fiyat grid'i (order-preserving yuvarlanmış).
// 450/1g monotonluk için 153 (raw 152.88; builder'da 1g yok ama bütünlük için).
export const BUILDER_ISTEK = [100,150,200,250,300,350,400,450,500,600,700,800,900,1000,1500,2000,3000,5000,10000];
export const BUILDER_GUN = [1,2,7,14,30];
// satır = istek, sütun sırası = [1,2,7,14,30]
const TABLE: Record<number, number[]> = {
  100:[40,79,273,530,1059], 150:[56,111,383,744,1487], 200:[72,143,493,958,1914],
  250:[88,176,603,1172,2341], 300:[104,208,713,1386,2768], 350:[120,240,823,1600,3195],
  400:[136,272,934,1814,3623], 450:[153,304,1044,2028,4050], 500:[169,336,1154,2242,4477],
  600:[201,400,1374,2669,5332], 700:[233,465,1594,3097,6186], 800:[265,529,1815,3525,7041],
  900:[298,593,2035,3953,7895], 1000:[330,657,2255,4381,8750], 1500:[491,979,3357,6520,13022],
  2000:[652,1300,4458,8659,17294], 3000:[975,1942,6661,12938,25839], 5000:[1620,3227,11067,21495,42928],
  10000:[3232,6439,22082,42888,85652],
};

function lower<T extends number>(arr: T[], v: number): number {
  let i = 0; while (i < arr.length - 1 && arr[i + 1] <= v) i++; return i;
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Kilitli grid + bilinear interpolasyon. n∈[100,10000], d∈[1,30]. Tam TL döner. */
export function devredenPrice(n: number, d: number): number {
  n = Math.max(100, Math.min(10000, n));
  d = Math.max(1, Math.min(30, d));
  const gi = lower(BUILDER_GUN, d);
  const d0 = BUILDER_GUN[gi], d1 = BUILDER_GUN[Math.min(gi + 1, BUILDER_GUN.length - 1)];
  const td = d1 === d0 ? 0 : (d - d0) / (d1 - d0);
  const ni = lower(BUILDER_ISTEK, n);
  const n0 = BUILDER_ISTEK[ni], n1 = BUILDER_ISTEK[Math.min(ni + 1, BUILDER_ISTEK.length - 1)];
  const tn = n1 === n0 ? 0 : (n - n0) / (n1 - n0);
  const at = (istek: number, di: number) => TABLE[istek][di];
  const p00 = at(n0, gi), p01 = at(n0, Math.min(gi + 1, BUILDER_GUN.length - 1));
  const p10 = at(n1, gi), p11 = at(n1, Math.min(gi + 1, BUILDER_GUN.length - 1));
  const pn0 = lerp(p00, p10, tn), pn1 = lerp(p01, p11, tn);
  return Math.round(lerp(pn0, pn1, td));
}

/** Maliyet-altı guard (Spec §12 residual): cf_unit_cost=0.069 TL/istek per-istek-TL kabul edilir. */
export const CF_UNIT_COST_TL = 0.069;
export function isAboveCost(price: number, n: number, d: number): boolean {
  return price > CF_UNIT_COST_TL * n * d;
}
```

- [ ] **Step 4: Run → pass**

Run: `cd ~/yzapi-devreden && npx vitest run src/server/services/devreden-pricing.test.ts`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git add src/server/services/devreden-pricing.ts src/server/services/devreden-pricing.test.ts
git commit -m "feat(devreden): builder lookup-table pricing + bilinear interpolation"
```

### Task 2.2: previewConfigurablePrice'ı devreden builder'a bağla + limitStepError min 100

**Files:**
- Modify: `src/server/services/custom-package-pricing.ts` (limitStepError'a opsiyonel `min` param)
- Modify: `src/server/services/package-purchase-service.ts` (previewConfigurablePrice devreden dalı)
- Modify: `src/server/services/custom-package-pricing.test.ts` (599→null / 600 testleri güncelle)
- Test: `src/server/services/package-purchase-service.test.ts` (yeni devreden preview testi)

- [ ] **Step 1: Failing test — devreden paket için preview devredenPrice kullanır + limitStepError(n, 100)**

```ts
// custom-package-pricing.test.ts — mevcut limitStepError testlerini güncelle
import { limitStepError } from "./custom-package-pricing";
it("limitStepError varsayılan min 600", () => {
  expect(limitStepError(599)).not.toBeNull();
  expect(limitStepError(600)).toBeNull();
});
it("limitStepError çağrı-bazlı min 100 (devreden builder)", () => {
  expect(limitStepError(100, 100)).toBeNull();
  expect(limitStepError(99, 100)).not.toBeNull();
  expect(limitStepError(150, 100)).toBeNull();
  expect(limitStepError(175, 100)).not.toBeNull(); // 50'nin katı değil
});
```

- [ ] **Step 2: Run → fail**

Run: `cd ~/yzapi-devreden && npx vitest run src/server/services/custom-package-pricing.test.ts`
Expected: FAIL (limitStepError 2. param almıyor)

- [ ] **Step 3: limitStepError'a opsiyonel min ekle**

`custom-package-pricing.ts`:
```ts
export function limitStepError(limit: number, min = 600): string | null {
  if (!Number.isInteger(limit) || limit < min) return `Limit en az ${min} olmalı`;
  if (limit % 50 !== 0) return "Limit 50'nin katı olmalı";
  return null;
}
```

- [ ] **Step 4: previewConfigurablePrice'a devreden dalı**

`package-purchase-service.ts` `previewConfigurablePrice` içinde, paketi yükledikten sonra:
```ts
import { devredenPrice } from "./devreden-pricing";
// ... pkg yüklendikten sonra:
if (pkg.devreden) {
  const err = limitStepError(customLimit, 100);
  if (err) throw new AppError(err, 400, "limit_step");
  const fiyatTL = devredenPrice(customLimit, customDays);
  const sellKur = liveKur * (1 + kurBuffer);
  return { fiyatTL, fiyatUsd: Number((fiyatTL / sellKur).toFixed(4)), birimFiyatUsd: 0 };
}
// ... mevcut (non-devreden) yol değişmeden devam
```

- [ ] **Step 5: Devreden preview testi**

```ts
// package-purchase-service.test.ts
it("devreden paket preview devredenPrice'tan gelir (500 istek/30g = 4477)", async () => {
  // mock: pkg.devreden=true, cf_unit_cost yok; sistem config kur mock'lu
  const res = await previewConfigurablePrice("cf-codex-devreden-builder", 500, 30);
  expect(res.fiyatTL).toBe(4477);
});
```

- [ ] **Step 6: Run → pass (+ mevcut suite yeşil)**

Run: `cd ~/yzapi-devreden && npx vitest run src/server/services/custom-package-pricing.test.ts src/server/services/package-purchase-service.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/services/custom-package-pricing.ts src/server/services/package-purchase-service.ts src/server/services/custom-package-pricing.test.ts src/server/services/package-purchase-service.test.ts
git commit -m "feat(devreden): builder preview via lookup table + call-based limitStepError min"
```

---

## Faz 3 — Gate + Devir + Saatlik (entitlement-service.ts) — CANLI dosyaya hunk

> ⚠️ Bu görevler **canlı `entitlement-service.ts`** üzerine uygulanır (replikadaki dosya = canlı). Mevcut R-3/shared-pool clause'larına DOKUNMA; yeni clause'ları AND olarak EKLE.

### Task 3.1: Günlük tavan + saatlik clause'ları (lockstep) + ORDER BY

**Files:**
- Modify: `src/server/services/entitlement-service.ts` (`checkPackageCoverage` + `tryReservePackageSlot` WHERE + ORDER BY)
- Test: `src/server/services/entitlement-rollover.itest.ts`

- [ ] **Step 1: Failing itest — günlük tavan + seçim sırası**

```ts
// entitlement-rollover.itest.ts
import { describe, it, expect, beforeEach } from "vitest";
import { dbSql } from "../db/client";
import { tryReservePackageSlot } from "./entitlement-service";
// helper: createDevredenEntitlement(userId, {dailyQuota, rollover, saatlik, days}) → id
// (test-setup'ta seed helper yaz)

describe("devreden gate", () => {
  it("günlük tavan dolunca slot vermez (requests_today >= daily_quota+rollover)", async () => {
    const { userId, model } = await seedDevreden({ dailyQuota: 100, rollover: 0, requestsToday: 100 });
    const slot = await tryReservePackageSlot(userId, model);
    expect(slot).toBeNull();
  });
  it("günlük tavan altında slot verir + requests_today++", async () => {
    const { userId, model, entId } = await seedDevreden({ dailyQuota: 100, rollover: 50, requestsToday: 100 });
    const slot = await tryReservePackageSlot(userId, model);
    expect(slot).not.toBeNull(); // 100 < 100+50
  });
  it("devreden(500) normal-CF(1000) varken ÖNCE seçilir", async () => {
    const { userId, model, devredenId } = await seedDevredenPlusNormalCf({ devredenQuota: 500, normalLimit: 1000 });
    const slot = await tryReservePackageSlot(userId, model);
    expect(slot?.entitlementId).toBe(devredenId);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
Expected: FAIL

- [ ] **Step 3: checkPackageCoverage + tryReservePackageSlot WHERE'ine YENİ AND clause'ları (lockstep, ikisine de aynı)**

Her iki sorgunun WHERE'ine (CF clause'larından SONRA, ayrı AND):
```sql
AND (e.daily_quota IS NULL
     OR e.last_reset_date < CURRENT_DATE
     OR e.requests_today < e.daily_quota + e.rollover_balance)
AND (e.saatlik_limit IS NULL
     OR e.hour_window_start IS NULL
     OR e.hour_window_start < date_trunc('hour', now())
     OR e.requests_this_hour < e.saatlik_limit)
```
`tryReservePackageSlot` ORDER BY:
```sql
ORDER BY COALESCE(e.daily_quota, e.daily_limit_snapshot) ASC, e.expires_at ASC
```
RETURNING'e ekle: `upe.daily_quota, upe.rollover_balance, upe.saatlik_limit, upe.requests_this_hour`. `PackageCoverage` arayüzüne bu alanları ekle.

- [ ] **Step 4: Run → pass**

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add src/server/services/entitlement-service.ts src/server/__tests__/itest-setup.ts src/server/services/entitlement-rollover.itest.ts
git commit -m "feat(devreden): daily ceiling + hourly gate clauses (lockstep) + selection order"
```

### Task 3.2: Devir birikim + saatlik sayaç (atomik UPDATE SET CASE)

**Files:**
- Modify: `src/server/services/entitlement-service.ts` (`tryReservePackageSlot` UPDATE SET)
- Test: `src/server/services/entitlement-rollover.itest.ts` (devir senaryoları)

- [ ] **Step 1: Failing itest — lineer birikim + 50-floor + gap + negatif clamp + atomik**

```ts
it("yeni günde devir lineer birikir (quota 500, dün 100 kullanıldı → +400)", async () => {
  const { userId, model, entId } = await seedDevreden({ dailyQuota: 500, rollover: 0, requestsToday: 100, lastResetDays: 1 });
  await tryReservePackageSlot(userId, model);
  const [r] = await dbSql`SELECT rollover_balance, requests_today FROM user_package_entitlements WHERE id=${entId}`;
  expect(r.rollover_balance).toBe(400); // floor(500-100/50)*50, REPLACE-bug yok
  expect(r.requests_today).toBe(1);
});
it("50-floor: dün 73 kullanılınca +400 değil floor((500-73)/50)*50=400... küsürat yanar", async () => {
  const { userId, model, entId } = await seedDevreden({ dailyQuota: 500, rollover: 0, requestsToday: 73, lastResetDays: 1 });
  await tryReservePackageSlot(userId, model);
  const [r] = await dbSql`SELECT rollover_balance FROM user_package_entitlements WHERE id=${entId}`;
  expect(r.rollover_balance).toBe(400); // floor(427/50)*50
});
it("çok günlük gap: 3 gün idle → +3*quota", async () => {
  const { userId, model, entId } = await seedDevreden({ dailyQuota: 500, rollover: 0, requestsToday: 0, lastResetDays: 3 });
  await tryReservePackageSlot(userId, model);
  const [r] = await dbSql`SELECT rollover_balance FROM user_package_entitlements WHERE id=${entId}`;
  expect(r.rollover_balance).toBe(1500); // (gap-1)*500 idle + son aktif gün unused 500 → 2 idle*500 + 500 = 1500
});
it("negatif clamp: requests_today > quota (over-serve) → rollover azalmaz", async () => {
  const { userId, model, entId } = await seedDevreden({ dailyQuota: 500, rollover: 1000, requestsToday: 523, lastResetDays: 1 });
  await tryReservePackageSlot(userId, model);
  const [r] = await dbSql`SELECT rollover_balance FROM user_package_entitlements WHERE id=${entId}`;
  expect(r.rollover_balance).toBe(1000); // GREATEST(0,...) → +0
});
```

- [ ] **Step 2: Run → fail**

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
Expected: FAIL

- [ ] **Step 3: tryReservePackageSlot UPDATE SET'ine devir + saatlik CASE'leri ekle (Spec §5)**

Mevcut atomik UPDATE'in SET listesine ekle (mevcut `requests_today` CASE'in YANINA, aynı UPDATE):
```sql
rollover_balance = CASE
  WHEN upe.last_reset_date < CURRENT_DATE AND upe.daily_quota IS NOT NULL
  THEN upe.rollover_balance
       + GREATEST(0, (FLOOR(GREATEST(0, upe.daily_quota - upe.requests_today)::numeric / 50) * 50)::int)
       + (GREATEST(0, (CURRENT_DATE - upe.last_reset_date - 1)) * COALESCE(upe.daily_quota, 0))
  ELSE upe.rollover_balance END,
requests_this_hour = CASE
  WHEN upe.hour_window_start IS NULL OR upe.hour_window_start < date_trunc('hour', now())
  THEN 1 ELSE upe.requests_this_hour + 1 END,
hour_window_start = date_trunc('hour', now()),
```
(mevcut `requests_today = CASE WHEN last_reset_date < CURRENT_DATE THEN 1 ELSE +1 END` ve `last_reset_date = CURRENT_DATE` korunur.)

- [ ] **Step 4: Run → pass**

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
Expected: PASS

- [ ] **Step 5: Concurrency itest — 5 paralel istek tek accrual**

```ts
it("gün dönümünde 5 paralel istek devri 1 kez biriktirir (race yok)", async () => {
  const { userId, model, entId } = await seedDevreden({ dailyQuota: 500, rollover: 0, requestsToday: 100, lastResetDays: 1 });
  await Promise.all(Array.from({length:5}, () => tryReservePackageSlot(userId, model)));
  const [r] = await dbSql`SELECT rollover_balance FROM user_package_entitlements WHERE id=${entId}`;
  expect(r.rollover_balance).toBe(400); // atomik UPDATE + last_reset_date snap → tek accrual
});
```

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/services/entitlement-service.ts src/server/services/entitlement-rollover.itest.ts
git commit -m "feat(devreden): atomic rollover accrual + DB-backed hourly counter in reserve UPDATE"
```

### Task 3.3: releasePackageSlot saatlik iade (simetri) + setEntitlementPaused resume baseline

**Files:**
- Modify: `src/server/services/entitlement-service.ts` (`releasePackageSlot`, `setEntitlementPaused`)
- Test: `src/server/services/entitlement-rollover.itest.ts`

- [ ] **Step 1: Failing itest**

```ts
it("releasePackageSlot saatlik sayacı da iade eder", async () => {
  const { userId, model, entId } = await seedDevreden({ dailyQuota: 500, rollover: 0, requestsToday: 0, saatlik: 150 });
  await tryReservePackageSlot(userId, model); // requests_this_hour=1
  await releasePackageSlot(entId);
  const [r] = await dbSql`SELECT requests_this_hour FROM user_package_entitlements WHERE id=${entId}`;
  expect(r.requests_this_hour).toBe(0);
});
it("resume accrual tabanını sıfırlar (paused günler birikmez)", async () => {
  const { userId, entId } = await seedDevreden({ dailyQuota: 500, rollover: 200, paused: true, lastResetDays: 10 });
  await setEntitlementPaused(userId, entId, false);
  const [r] = await dbSql`SELECT requests_today, requests_this_hour, last_reset_date FROM user_package_entitlements WHERE id=${entId}`;
  expect(r.requests_today).toBe(0);
  expect(r.requests_this_hour).toBe(0);
  expect(new Date(r.last_reset_date).toISOString().slice(0,10)).toBe(new Date().toISOString().slice(0,10));
});
```

- [ ] **Step 2: Run → fail**

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
Expected: FAIL

- [ ] **Step 3: releasePackageSlot + setEntitlementPaused güncelle**

`releasePackageSlot` UPDATE'ine ekle: `requests_this_hour = GREATEST(0, requests_this_hour - 1)` (mevcut `requests_today` azaltma deseninin yanına). `setEntitlementPaused(..., false)` (resume) dalına: `last_reset_date = CURRENT_DATE, requests_today = 0, hour_window_start = now(), requests_this_hour = 0`.

- [ ] **Step 4: Run → pass; Commit**

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
Expected: PASS
```bash
git add src/server/services/entitlement-service.ts src/server/services/entitlement-rollover.itest.ts
git commit -m "feat(devreden): hourly refund symmetry + pause-resume accrual baseline reset"
```

---

## Faz 4 — Grant + Saatlik fren wiring (proxy.ts)

### Task 4.1: grantPackageEntitlement devreden-farkında + ayriSatir

**Files:**
- Modify: `src/server/services/entitlement-service.ts` (`grantPackageEntitlement`)
- Modify: `src/server/services/package-purchase-service.ts` (`ayriSatir` koşulu)
- Test: `src/server/services/entitlement-rollover.itest.ts`

- [ ] **Step 1: Failing itest**

```ts
it("devreden grant: daily_limit_snapshot=quota*gün, daily_quota=quota, saatlik=150, AYRI satır", async () => {
  const { userId } = await seedUser();
  const pkg = await seedDevredenPackage({ gunluk: 500, sure: 30, saatlik: 150 });
  await grantPackageEntitlement(dbSql, { userId, pkg, ... });
  await grantPackageEntitlement(dbSql, { userId, pkg, ... }); // 2. alım
  const rows = await dbSql`SELECT daily_quota, daily_limit_snapshot, saatlik_limit, rollover_balance FROM user_package_entitlements WHERE user_id=${userId}`;
  expect(rows.length).toBe(2); // ayrı satır
  expect(rows[0].daily_quota).toBe(500);
  expect(rows[0].daily_limit_snapshot).toBe(15000);
  expect(rows[0].saatlik_limit).toBe(150);
});
```

- [ ] **Step 2: Run → fail; Step 3: implement**

`grantPackageEntitlement` INSERT'ine devreden dalı: `pkg.devreden` ise `daily_quota = pkg.gunlukIstekLimiti`, `daily_limit_snapshot = pkg.gunlukIstekLimiti * pkg.sureGun`, `rollover_balance = 0`, `saatlik_limit = pkg.saatlikLimit`, `hour_window_start = now()`, `requests_this_hour = 0`. `package-purchase-service` `ayriSatir = forceNewRow || pkg.is_configurable || pkg.devreden`.

- [ ] **Step 4: Run → pass; Commit**

Run: `cd ~/yzapi-devreden && npm run itest -- entitlement-rollover`
```bash
git add src/server/services/entitlement-service.ts src/server/services/package-purchase-service.ts src/server/services/entitlement-rollover.itest.ts
git commit -m "feat(devreden): devreden-aware grant + separate-row purchase"
```

### Task 4.2: proxy.ts saatlik fren — gate 0-satır → RateLimitError 429

**Files:**
- Modify: `src/server/routes/proxy.ts` (3 text call-site; slot null + saatlik aşımı ayrımı)
- Test: `src/server/services/request-guard-service.test.ts` veya proxy itest

- [ ] **Step 1: Failing test — saatlik dolu entitlement'ta 429**

Gate (tryReservePackageSlot) saatlik clause yüzünden 0 satır dönerse, mevcut "kota doldu" yolundan AYRI olarak saatlik kontrolü: entitlement var ama `requests_this_hour >= saatlik_limit && hour_window_start = bu saat` ise `RateLimitError("Saatlik 150 istek hız limitine ulaştınız", retryAfter)`.

```ts
it("saatlik 150 dolunca 429 + Retry-After döner", async () => {
  // seedDevreden saatlik=150, requests_this_hour=150, hour_window_start=now
  // proxy chat call → 429
});
```

- [ ] **Step 2-4: implement + pass**

`proxy.ts`'te paket kapsamı çözülürken: slot null geldiğinde, salt-read bir kontrol (`checkHourlyExceeded(userId, model)`) ile saatlik-aşım mı yoksa kota-bitti mi ayır → saatlik ise `throw new RateLimitError(...)` (Retry-After = saat sonuna kalan saniye). `entitlement-service.ts`'e `checkHourlyExceeded` helper ekle. ⚠️ Para yolu (reserve/settle) DOKUNULMAZ.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/proxy.ts src/server/services/entitlement-service.ts <test>
git commit -m "feat(devreden): hourly rate-limit 429 with Retry-After in proxy"
```

---

## Faz 5 — Panel (frontend)

### Task 5.1: listUserPackagesForPanel devreden alanları + computeDisplayConsumed dalı

**Files:**
- Modify: `src/server/services/entitlement-service.ts` (`listUserPackagesForPanel`, `computeDisplayConsumed`)
- Test: `src/server/services/entitlement-rollover.itest.ts`

- [ ] **Step 1: Failing itest**

```ts
it("panel devreden alanları: bugunKullanilabilir = daily_quota+rollover, kalan = -requests_today", async () => {
  const { userId } = await seedDevreden({ dailyQuota: 500, rollover: 200, requestsToday: 100 });
  const list = await listUserPackagesForPanel(userId);
  const d = list.find(p => p.devreden);
  expect(d.bugunKullanilabilir).toBe(700);
  expect(d.kalan).toBe(600);
  expect(d.devirBakiyesi).toBe(200);
});
```

- [ ] **Step 2-4: implement + pass** — `listUserPackagesForPanel`'e devreden dalı (`gunlukTaban`, `devirBakiyesi`, `bugunKullanilabilir`, `saatlikLimit`, `saatlikKullanilan`); `computeDisplayConsumed` devreden = `requests_today` (günlük). Sağlayıcı/CF iç verisi sızmaz.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/entitlement-service.ts src/server/services/entitlement-rollover.itest.ts
git commit -m "feat(devreden): panel exposes daily_quota + rollover + hourly (gate-consistent)"
```

### Task 5.2: tab-mypackages.jsx + tab-packages.jsx (builder + sabit kartlar) + i18n

**Files:**
- Modify: `src/yapayzekalab/tab-mypackages.jsx` (devreden satır: tavan + devir + saatlik)
- Modify: `src/yapayzekalab/tab-packages.jsx` (builder seçici istek+süre + anlık fiyat; sabit kartlar; rozetler)
- Modify: `src/yapayzekalab/i18n/strings/packages.js` (`packages.rollover`, `packages.perHour`, builder etiketleri TR/EN)
- Test: frontend contract test (`packages` surface) — render snapshot

- [ ] **Step 1: i18n stringleri ekle (TR/EN)** — `rollover: "Devreden"`, `perHour: "Saatlik"`, builder seçici metinleri.

- [ ] **Step 2: tab-mypackages.jsx devreden satır** — `p.devreden` ise ana çubuk `bugün: {bugunKullanilan}/{bugunKullanilabilir}` + "🔄 Devreden hak: {devirBakiyesi}" + "⏱ Saatlik: {saatlikKullanilan}/{saatlikLimit}".

- [ ] **Step 3: tab-packages.jsx** — builder kartı (istek slider 100–10.000/50, süre 2–30; `previewConfigurablePrice` çağrısıyla anlık fiyat) + sabit kartlar (500/1000/2000 × 1/7/14/30); "🔄 Devreden" + "⏱ Saatlik 150" rozetleri.

- [ ] **Step 4: Build + scan:public** — `cd ~/yzapi-devreden && npm run build && npm run scan:public` Expected: temiz (provider leak yok).

- [ ] **Step 5: Commit**

```bash
git add src/yapayzekalab/tab-mypackages.jsx src/yapayzekalab/tab-packages.jsx src/yapayzekalab/i18n/strings/packages.js
git commit -m "feat(devreden): panel + catalog UI (builder selector, fixed cards, badges)"
```

---

## Faz 6 — Seed scripti

### Task 6.1: seed-devreden-codex.ts

**Files:**
- Create: `scripts/seed-devreden-codex.ts`
- Test: manuel (seed idempotent, ON CONFLICT)

- [ ] **Step 1: Seed script yaz** — 12 sabit paket (500/1000/2000 × 1/7/14/30; fiyatlar Spec §2 sabit tablo) + 1 builder şablonu (`is_configurable=true`, min/max 100/10000, min/max süre 2/30, `devreden=true`, `saatlik_limit=150`, cf_catalog_id/cf_api_slug = mevcut cf-codex'ten kopya). `satista=false`. ON CONFLICT (id) `enabled`/`satista`'ya dokunma (açılmış satışı kapatma).

- [ ] **Step 2: Replikada çalıştır + doğrula**

```bash
cd ~/yzapi-devreden && NODE_ENV=development npx tsx scripts/seed-devreden-codex.ts
# psql ile 13 satır + devreden=true + saatlik_limit=150 + satista=false doğrula
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-devreden-codex.ts
git commit -m "feat(devreden): seed 12 fixed + 1 builder devreden Codex packages (satista=false)"
```

---

## Faz 7 — İzole Deploy (canlı = ödeme sistemi)

> ⚠️ 3-QA (≥2 PASS) + **çift onay** olmadan deploy YOK. `LOCAL_SRC=~/yzapi` YASAK. Deploy ONLY `~/yzapi-devreden` (canlı-faithful) değişen dosyalardan.

### Task 7.1: Tam gate + suite (replikada)

- [ ] **Step 1:** `cd ~/yzapi-devreden && npm run lint && npm test && npm run itest && npm run build && npm run scan:public` Expected: hepsi yeşil/temiz.

### Task 7.2: İzolasyon kanıtı + backup + rsync

- [ ] **Step 1: Değişen dosyaları stage'le** (migration, schema.ts, devreden-pricing.ts, custom-package-pricing.ts, package-purchase-service.ts, entitlement-service.ts, proxy.ts, tab-*.jsx, i18n, dist/assets/*). ruflo MCP artefaktlarını sil (`*.rvf*`, `agentdb.rvf`).

- [ ] **Step 2: İzolasyon kanıtı**

```bash
rsync -rlzn --checksum --itemize-changes <stage>/ yzapi-vps:/opt/turkapiprojesi/
```
Expected: YALNIZ beklenen dosyalar listelenir.

- [ ] **Step 3: Canlı backup**

```bash
ssh yzapi-vps 'cd /opt/turkapiprojesi && cp --parents src/server/services/entitlement-service.ts src/server/routes/proxy.ts src/server/services/custom-package-pricing.ts src/server/services/package-purchase-service.ts .deploy/devreden-backup-$(date +%Y%m%dT%H%M%S)/'
```

- [ ] **Step 4: rsync (no -n) + sunucu-içi gate elle**

```bash
rsync -rlz --checksum <stage>/ yzapi-vps:/opt/turkapiprojesi/
ssh yzapi-vps 'cd /opt/turkapiprojesi && npm ci && npm run lint && npm test && npm run build && NODE_ENV=production npm run db:migrate && systemctl restart turkapiprojesi && sleep 3 && curl -s http://127.0.0.1:4568/health'
```
Expected: health 200.

- [ ] **Step 5: Migration kolon doğrulama (CANLI)**

```bash
ssh yzapi-vps 'cd /opt/turkapiprojesi && psql "$(grep ^DATABASE_URL= .env.production | cut -d= -f2-)" -c "SELECT column_name FROM information_schema.columns WHERE table_name='\''user_package_entitlements'\'' AND column_name IN ('\''daily_quota'\'','\''rollover_balance'\'','\''hour_window_start'\'','\''requests_this_hour'\'','\''saatlik_limit'\'')"'
```
Expected: 5 satır. (packages için devreden/saatlik_limit → 2 satır.) **"applied successfully"ye güvenme.**

### Task 7.3: Seed + aktivasyon (CANLI, ayrı/geri-alınabilir)

- [ ] **Step 1: cf_unit_cost anlamı doğrula** (Spec §12 residual): canlı CF probe ile 0.069'un per-istek-TL olduğunu teyit. Per-ünite çıkarsa `devreden-pricing.ts`'e `raw ≥ 3×` guard ekle + yeniden deploy.

- [ ] **Step 2: Seed çalıştır** `ssh yzapi-vps 'cd /opt/turkapiprojesi && NODE_ENV=production npx tsx scripts/seed-devreden-codex.ts'` → 13 satır `satista=false`.

- [ ] **Step 3: Kontrollü test** — bir test kullanıcısına küçük devreden paket grant et; gün-dönümü/saatlik/devir akışını canlıda doğrula (smoke).

- [ ] **Step 4: Satışa aç** — doğrulama PASS sonrası `UPDATE packages SET satista=true WHERE devreden=true` (DB UPDATE, deploy yok, geri-alınabilir).

- [ ] **Step 5: Memory notu + manifest** — targeted rsync manifest'i güncellemez → gerçek canlı durumu memory notuna yaz (`project_yzapi_devreden_paketler`).

---

## Self-Review Notları (yazım sonrası)
- **Spec kapsamı:** §2 fiyat → Faz 2 + Task 6.1; §3 şema → Faz 1; §4 gate → Task 3.1; §5 devir → Task 3.2; §6 saatlik → Task 3.2/4.2; §7 pause → Task 3.3; §8 panel → Faz 5; §9 seed → Faz 6; §10 deploy → Faz 7; §11 test → her görevin TDD adımları; §12 residual → Task 7.3 Step 1 + 450/1g=153 (Task 2.1 TABLE). Kapsam tam.
- **Tip tutarlılığı:** `devredenPrice(n,d)`, `limitStepError(limit, min)`, `daily_quota`/`rollover_balance`/`saatlik_limit`/`hour_window_start`/`requests_this_hour` tüm görevlerde aynı adlarla.
- **Placeholder:** Frontend görevleri (Faz 5 Step 2-3) ve bazı itest helper'ları (`seedDevreden`) prosedürel tarif içeriyor — bunlar implementasyonda `itest-setup.ts`'e somut helper olarak yazılmalı; UI kodu mevcut `tab-*.jsx` desenine uyar. (Money/gate/pricing kritik yollar tam kodlu.)
