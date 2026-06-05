# Faz 1 — Paket Satış Çekirdeği Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 🔒 **RELEASE KURALI (DOKUNULMAZ):** Bu plan SADECE lokalde çalışır. `git push` YOK, deploy YOK. `git commit` yalnız **lokal** (push edilmez). Canlıya çıkış kullanıcının **çift onayı** + 3-QA ile. (memory: feedback_deploy_double_approval, feedback_qa_gate_deploy)
> Çalışma dizini: `/Users/ufuk/yzapi` (canlı yedek aynası `yzapi-yedek`'e otomatik kopyalanır). Worktree kullanılmıyor (kullanıcı tercihi).

**Goal:** yzapi'ye request-limit tipi önceden ödemeli paket satışı eklemek; paket kapsamındaki modelde günlük istek kotasından düş, kota/kapsam dışında mevcut PAYG bakiyeye düş.

**Architecture:** Yaklaşım A — para yolu (billing-service reserve/settle/pricing) DOKUNULMAZ; `proxy.ts`'te reserve'den ÖNCE ayrı "paket kota dalı" eklenir. Paket kapsamı varsa atomik kota-rezerv → bakiye reserve atlanır → `usage_records` costTL=0 billed_via='package'. Kapsam/kota yoksa mevcut PAYG aynen.

**Tech Stack:** Express + TypeScript, Drizzle ORM + postgres-js (`db` ORM / `dbSql` raw), PostgreSQL, Vitest (unit + itest), React/JSX SPA (`yapayzekalab/`).

**Spec:** `docs/superpowers/specs/2026-06-04-faz1-paket-satis-design.md`

---

## Dosya Haritası
| Dosya | Sorumluluk | İşlem |
|------|-----------|------|
| `src/server/db/migrations/0019_packages.sql` | şema migration | Create |
| `src/server/db/migrations/meta/_journal.json` | migration journal | Modify |
| `src/server/db/schema.ts` | Drizzle tablo tanımları | Modify |
| `src/server/services/entitlement-service.ts` | kota coverage/reserve/release/usage/list | Create |
| `src/server/services/entitlement-service.test.ts` | unit | Create |
| `src/server/services/package-purchase-service.ts` | bakiyeyle satın alma (debit) | Create |
| `src/server/services/package-purchase-service.test.ts` | unit | Create |
| `src/server/services/package-service.ts` | katalog okuma + admin CRUD | Create |
| `src/server/routes/packages.ts` | public GET katalog | Create |
| `src/server/routes/user.ts` | `/entitlements`, `/packages/:id/purchase` | Modify |
| `src/server/routes/admin.ts` | admin paket CRUD + entitlements | Modify |
| `src/server/app.ts` | packagesRouter mount | Modify |
| `src/server/routes/proxy.ts` | paket kota dalı (chat/messages/responses) + balance-guard skip | Modify |
| `src/yapayzekalab/tab-admin.jsx` | "Paketler" admin section | Modify |
| `src/yapayzekalab/tab-packages.jsx` | kullanıcı paket vitrini | Create |
| `src/yapayzekalab/App.jsx` | `packages` tab | Modify |
| `src/server/jobs/package-maintenance-job.ts` | expiry job | Create |
| `src/server/jobs/index.ts` | job kaydı | Modify |
| `src/server/__tests__/packages-flow.itest.ts` | gerçek-PG senaryoları | Create |
| `src/server/__tests__/packages-noleak.test.ts` | no-leak contract | Create |

---

## Task 1: Şema + Migration 0019

**Files:**
- Create: `src/server/db/migrations/0019_packages.sql`
- Modify: `src/server/db/migrations/meta/_journal.json`
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Migration SQL dosyası yaz**

Create `src/server/db/migrations/0019_packages.sql`:
```sql
-- Faz 1: prepaid request-limit packages + entitlements (PAYG ile birlikte)
CREATE TABLE IF NOT EXISTS "packages" (
  "id" text PRIMARY KEY,
  "ad" text NOT NULL,
  "kategori" text NOT NULL,
  "aciklama" text NOT NULL DEFAULT '',
  "tip" text NOT NULL DEFAULT 'request_limit',
  "gunluk_istek_limiti" integer NOT NULL,
  "sure_gun" integer NOT NULL,
  "allowed_models" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fiyat_tl" numeric(14,4) NOT NULL,
  "fiyat_usd" numeric(14,4),
  "enabled" boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_package_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "package_id" text NOT NULL REFERENCES "packages"("id"),
  "daily_limit_snapshot" integer NOT NULL,
  "allowed_models_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "activated_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "requests_today" integer NOT NULL DEFAULT 0,
  "last_reset_date" date NOT NULL DEFAULT CURRENT_DATE,
  "purchase_transaction_id" uuid REFERENCES "transactions"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "upe_user_status_idx" ON "user_package_entitlements" ("user_id","status");
CREATE INDEX IF NOT EXISTS "upe_status_expires_idx" ON "user_package_entitlements" ("status","expires_at");

ALTER TABLE "usage_records"
  ADD COLUMN IF NOT EXISTS "billed_via" text NOT NULL DEFAULT 'balance',
  ADD COLUMN IF NOT EXISTS "entitlement_id" uuid;

ALTER TABLE "system_config"
  ADD COLUMN IF NOT EXISTS "packages_enabled" boolean NOT NULL DEFAULT true;
```

- [ ] **Step 2: Journal'a 0019 ekle**

`src/server/db/migrations/meta/_journal.json` → `entries` dizisinin SONUNA (0018'den sonra) ekle:
```json
    ,{
      "idx": 19,
      "version": "7",
      "when": 1780953600000,
      "tag": "0019_packages",
      "breakpoints": true
    }
```
(0018 entry'sinin kapanış `}`'inden sonra virgül + bu obje; dizi `]` kapanışından önce.)

- [ ] **Step 3: Drizzle şema ekle (`schema.ts`)**

`schema.ts` importuna `date` ekle (drizzle/pg-core import bloğuna): `date,` satırını ekle. Dosya SONUNA ekle:
```ts
export const packages = pgTable("packages", {
  id: text("id").primaryKey(),
  ad: text("ad").notNull(),
  kategori: text("kategori").notNull(),
  aciklama: text("aciklama").notNull().default(""),
  tip: text("tip").notNull().default("request_limit"),
  gunlukIstekLimiti: integer("gunluk_istek_limiti").notNull(),
  sureGun: integer("sure_gun").notNull(),
  allowedModels: jsonb("allowed_models").notNull().default(sql`'[]'::jsonb`),
  fiyatTL: numeric("fiyat_tl", { precision: 14, scale: 4 }).notNull(),
  fiyatUsd: numeric("fiyat_usd", { precision: 14, scale: 4 }),
  enabled: boolean("enabled").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const userPackageEntitlements = pgTable(
  "user_package_entitlements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    packageId: text("package_id").notNull().references(() => packages.id),
    dailyLimitSnapshot: integer("daily_limit_snapshot").notNull(),
    allowedModelsSnapshot: jsonb("allowed_models_snapshot").notNull().default(sql`'[]'::jsonb`),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().default(sql`now()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("active"),
    requestsToday: integer("requests_today").notNull().default(0),
    lastResetDate: date("last_reset_date").notNull().default(sql`CURRENT_DATE`),
    purchaseTransactionId: uuid("purchase_transaction_id").references(() => transactions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index("upe_user_status_idx").on(t.userId, t.status),
    index("upe_status_expires_idx").on(t.status, t.expiresAt),
  ]
);
```
`usageRecords` tablosuna iki kolon ekle (kapanıştan önce):
```ts
    billedVia: text("billed_via").notNull().default("balance"),
    entitlementId: uuid("entitlement_id"),
```
`systemConfig` tablosuna ekle:
```ts
    packagesEnabled: boolean("packages_enabled").notNull().default(true),
```

- [ ] **Step 4: Test DB'yi ayağa kaldır + migrate**

Run:
```bash
cd /Users/ufuk/yzapi && npm run db:up && npm run db:migrate
```
Expected: "Migrations applied successfully" (0019 dahil, hata yok).

- [ ] **Step 5: Lint**

Run: `cd /Users/ufuk/yzapi && npm run lint`
Expected: tip hatası yok (yeni tablolar import edilebilir).

- [ ] **Step 6: Commit (LOKAL — push YOK)**
```bash
git add src/server/db/migrations/0019_packages.sql src/server/db/migrations/meta/_journal.json src/server/db/schema.ts
git commit -m "feat(packages): faz1 schema — packages + entitlements + usage_records.billed_via"
```

---

## Task 2: entitlement-service (kota mantığı)

**Files:**
- Create: `src/server/services/entitlement-service.ts`
- Test: `src/server/services/entitlement-service.test.ts`

- [ ] **Step 1: Servisi yaz**

Create `src/server/services/entitlement-service.ts`:
```ts
import { db, dbSql } from "../db/client.js";
import { usageRecords } from "../db/schema.js";

export interface PackageCoverage {
  covered: boolean;
  entitlementId?: string;
}

/** Salt-okunur: bu modeli kapsayan, süresi geçmemiş, bugün kotası dolmamış aktif hak var mı? */
export async function checkPackageCoverage(userId: string, modelId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT id FROM user_package_entitlements
    WHERE user_id = ${userId}::uuid
      AND status = 'active'
      AND expires_at > now()
      AND allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
      AND (last_reset_date < CURRENT_DATE OR requests_today < daily_limit_snapshot)
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Atomik: en erken biten kapsayan haktan bir günlük slot rezerve et. */
export async function tryReservePackageSlot(userId: string, modelId: string): Promise<PackageCoverage> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements AS upe
    SET requests_today = CASE WHEN upe.last_reset_date < CURRENT_DATE THEN 1 ELSE upe.requests_today + 1 END,
        last_reset_date = CURRENT_DATE,
        updated_at = now()
    WHERE upe.id = (
      SELECT id FROM user_package_entitlements
      WHERE user_id = ${userId}::uuid
        AND status = 'active'
        AND expires_at > now()
        AND allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
        AND (last_reset_date < CURRENT_DATE OR requests_today < daily_limit_snapshot)
      ORDER BY expires_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING upe.id
  `;
  if (rows.length) return { covered: true, entitlementId: rows[0].id };
  return { covered: false };
}

/** Hata durumunda slot iadesi (K1'in kota ikizi). */
export async function releasePackageSlot(entitlementId: string): Promise<void> {
  await dbSql`
    UPDATE user_package_entitlements
    SET requests_today = GREATEST(requests_today - 1, 0), updated_at = now()
    WHERE id = ${entitlementId}::uuid
  `;
}

/** Paket isteği için usage_records satırı (costTL=0, billed_via='package'). */
export async function recordPackageUsage(opts: {
  userId: string;
  apiKeyId: string;
  modelId: string;
  entitlementId: string;
  inputUsage: number;
  outputUsage: number;
  responseMs: number;
  status: "success" | "error";
  requestId: string;
  upstreamRequestId?: string;
  errorCode?: string;
}): Promise<void> {
  await db.insert(usageRecords).values({
    userId: opts.userId,
    apiKeyId: opts.apiKeyId,
    modelId: opts.modelId,
    type: "Metin",
    inputUsage: opts.inputUsage,
    outputUsage: opts.outputUsage,
    costUsd: "0",
    costTL: "0",
    requestId: opts.requestId,
    upstreamRequestId: opts.upstreamRequestId,
    errorCode: opts.errorCode,
    responseMs: opts.responseMs,
    status: opts.status,
    billedVia: "package",
    entitlementId: opts.entitlementId,
  });
}

export interface ActiveEntitlement {
  id: string;
  packageId: string;
  paketAdi: string;
  kategori: string;
  gunlukLimit: number;
  kalanBugun: number;
  expiresAt: string;
  allowedModels: string[];
}

export async function listUserEntitlements(userId: string): Promise<ActiveEntitlement[]> {
  const rows = await dbSql<any[]>`
    SELECT e.id, e.package_id, p.ad AS paket_adi, p.kategori,
           e.daily_limit_snapshot,
           CASE WHEN e.last_reset_date < CURRENT_DATE THEN 0 ELSE e.requests_today END AS requests_today,
           e.expires_at, e.allowed_models_snapshot
    FROM user_package_entitlements e
    JOIN packages p ON p.id = e.package_id
    WHERE e.user_id = ${userId}::uuid AND e.status = 'active' AND e.expires_at > now()
    ORDER BY e.expires_at ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    packageId: r.package_id,
    paketAdi: r.paket_adi,
    kategori: r.kategori,
    gunlukLimit: Number(r.daily_limit_snapshot),
    kalanBugun: Math.max(0, Number(r.daily_limit_snapshot) - Number(r.requests_today)),
    expiresAt: r.expires_at,
    allowedModels: r.allowed_models_snapshot ?? [],
  }));
}
```

- [ ] **Step 2: Başarısız test yaz**

Create `src/server/services/entitlement-service.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSql = vi.fn();
const mockInsertValues = vi.fn();

vi.mock("../db/client.js", () => ({
  db: { insert: () => ({ values: mockInsertValues }) },
  dbSql: mockDbSql,
}));

describe("entitlement-service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tryReservePackageSlot returns covered+id when UPDATE returns a row", async () => {
    mockDbSql.mockResolvedValueOnce([{ id: "ent-1" }]);
    const { tryReservePackageSlot } = await import("./entitlement-service.js");
    const res = await tryReservePackageSlot("user-1", "claude-opus-4.8");
    expect(res).toEqual({ covered: true, entitlementId: "ent-1" });
  });

  it("tryReservePackageSlot returns not-covered when UPDATE returns empty (quota exhausted)", async () => {
    mockDbSql.mockResolvedValueOnce([]);
    const { tryReservePackageSlot } = await import("./entitlement-service.js");
    const res = await tryReservePackageSlot("user-1", "claude-opus-4.8");
    expect(res).toEqual({ covered: false });
  });

  it("recordPackageUsage writes a usage row with costTL=0 and billed_via=package", async () => {
    mockInsertValues.mockResolvedValue([]);
    const { recordPackageUsage } = await import("./entitlement-service.js");
    await recordPackageUsage({
      userId: "u", apiKeyId: "k", modelId: "claude-opus-4.8", entitlementId: "e",
      inputUsage: 10, outputUsage: 5, responseMs: 100, status: "success", requestId: "r1",
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ costTL: "0", billedVia: "package", entitlementId: "e" }),
    );
  });
});
```

- [ ] **Step 3: Testi koştur, FAIL gör**

Run: `cd /Users/ufuk/yzapi && npx vitest run src/server/services/entitlement-service.test.ts`
Expected: PASS (servis Step 1'de yazıldı). Eğer import hatası varsa düzelt.

- [ ] **Step 4: Lint + commit (lokal)**
```bash
npm run lint
git add src/server/services/entitlement-service.ts src/server/services/entitlement-service.test.ts
git commit -m "feat(packages): entitlement-service — coverage/reserve/release/usage/list"
```

---

## Task 3: package-purchase-service (bakiyeyle satın alma — DEBIT)

**Files:**
- Create: `src/server/services/package-purchase-service.ts`
- Test: `src/server/services/package-purchase-service.test.ts`

- [ ] **Step 1: Servisi yaz**

Create `src/server/services/package-purchase-service.ts`:
```ts
import { randomUUID } from "node:crypto";
import { dbSql } from "../db/client.js";
import { InsufficientBalanceError, AppError } from "../lib/errors.js";

export interface PurchaseResult {
  entitlementId: string;
  newBalanceTL: number;
}

export async function purchasePackageWithBalance(
  userId: string,
  packageId: string,
): Promise<PurchaseResult> {
  const pkgRows = await dbSql<any[]>`
    SELECT id, ad, fiyat_tl, sure_gun, gunluk_istek_limiti, allowed_models, enabled, tip
    FROM packages WHERE id = ${packageId} LIMIT 1
  `;
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];
  if (!pkg.enabled) throw new AppError(400, "Paket satışta değil");
  if (pkg.tip !== "request_limit") throw new AppError(400, "Bu paket tipi henüz desteklenmiyor");

  const fiyatTL = Number(pkg.fiyat_tl);
  const allowedJson = JSON.stringify(pkg.allowed_models ?? []);

  return await dbSql.begin(async (txSql) => {
    const updated = await txSql<{ bakiye_tl: string; email: string }[]>`
      UPDATE users
      SET bakiye_tl = bakiye_tl - ${fiyatTL}::numeric, son_aktivite = now()
      WHERE id = ${userId}::uuid AND bakiye_tl >= ${fiyatTL}::numeric
      RETURNING bakiye_tl, email
    `;
    if (!updated.length) throw new InsufficientBalanceError("Paket için yeterli bakiye yok");
    const newBalance = Number(updated[0].bakiye_tl);
    const prevBalance = newBalance + fiyatTL;

    const txRows = await txSql<{ id: string }[]>`
      INSERT INTO transactions
        (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
      VALUES
        (${userId}::uuid, ${updated[0].email}, 'paket_satin_alma', ${-fiyatTL}::numeric,
         ${prevBalance}::numeric, ${newBalance}::numeric, ${"Paket: " + pkg.ad}, 'bakiye',
         ${"pkg_purchase_" + randomUUID()})
      RETURNING id
    `;
    const txId = txRows[0].id;

    const existing = await txSql<{ id: string }[]>`
      SELECT id FROM user_package_entitlements
      WHERE user_id = ${userId}::uuid AND package_id = ${packageId}
        AND status = 'active' AND expires_at > now()
      ORDER BY expires_at DESC LIMIT 1
    `;

    let entitlementId: string;
    if (existing.length) {
      const ext = await txSql<{ id: string }[]>`
        UPDATE user_package_entitlements
        SET expires_at = expires_at + (${pkg.sure_gun}::int * interval '1 day'),
            daily_limit_snapshot = ${pkg.gunluk_istek_limiti}::int,
            allowed_models_snapshot = ${allowedJson}::jsonb,
            purchase_transaction_id = ${txId}::uuid,
            updated_at = now()
        WHERE id = ${existing[0].id}::uuid
        RETURNING id
      `;
      entitlementId = ext[0].id;
    } else {
      const ins = await txSql<{ id: string }[]>`
        INSERT INTO user_package_entitlements
          (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot,
           activated_at, expires_at, status, requests_today, last_reset_date, purchase_transaction_id)
        VALUES
          (${userId}::uuid, ${packageId}, ${pkg.gunluk_istek_limiti}::int, ${allowedJson}::jsonb,
           now(), now() + (${pkg.sure_gun}::int * interval '1 day'), 'active', 0, CURRENT_DATE, ${txId}::uuid)
        RETURNING id
      `;
      entitlementId = ins[0].id;
    }
    return { entitlementId, newBalanceTL: newBalance };
  });
}
```

- [ ] **Step 2: Başarısız test yaz**

Create `src/server/services/package-purchase-service.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InsufficientBalanceError } from "../lib/errors.js";

const mockDbSql = vi.fn();
const mockBegin = vi.fn();
const mockTxSql = vi.fn();

vi.mock("../db/client.js", () => ({
  db: {},
  dbSql: Object.assign(mockDbSql, { begin: mockBegin }),
}));

describe("purchasePackageWithBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBegin.mockImplementation(async (fn: (s: typeof mockTxSql) => unknown) => fn(mockTxSql));
  });

  it("throws InsufficientBalanceError when balance UPDATE returns empty", async () => {
    mockDbSql.mockResolvedValueOnce([
      { id: "p1", ad: "Codex", fiyat_tl: "40", sure_gun: 1, gunluk_istek_limiti: 500, allowed_models: ["gpt-5.5"], enabled: true, tip: "request_limit" },
    ]);
    mockTxSql.mockResolvedValueOnce([]); // balance debit returns empty = insufficient
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    await expect(purchasePackageWithBalance("u1", "p1")).rejects.toThrow(InsufficientBalanceError);
  });

  it("creates entitlement and returns new balance on success", async () => {
    mockDbSql.mockResolvedValueOnce([
      { id: "p1", ad: "Codex", fiyat_tl: "40", sure_gun: 1, gunluk_istek_limiti: 500, allowed_models: ["gpt-5.5"], enabled: true, tip: "request_limit" },
    ]);
    mockTxSql
      .mockResolvedValueOnce([{ bakiye_tl: "60", email: "u@x.com" }]) // debit
      .mockResolvedValueOnce([{ id: "tx1" }])                          // transactions insert
      .mockResolvedValueOnce([])                                       // existing entitlement: none
      .mockResolvedValueOnce([{ id: "ent1" }]);                        // insert entitlement
    const { purchasePackageWithBalance } = await import("./package-purchase-service.js");
    const res = await purchasePackageWithBalance("u1", "p1");
    expect(res).toEqual({ entitlementId: "ent1", newBalanceTL: 60 });
  });
});
```

- [ ] **Step 3: Testi koştur**

Run: `npx vitest run src/server/services/package-purchase-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Lint + commit (lokal)**
```bash
npm run lint
git add src/server/services/package-purchase-service.ts src/server/services/package-purchase-service.test.ts
git commit -m "feat(packages): package-purchase-service — atomic balance debit + entitlement"
```

---

## Task 4: package-service (katalog + admin CRUD) + routes

**Files:**
- Create: `src/server/services/package-service.ts`
- Create: `src/server/routes/packages.ts`
- Modify: `src/server/routes/user.ts`
- Modify: `src/server/routes/admin.ts`
- Modify: `src/server/app.ts`

- [ ] **Step 1: package-service yaz**

Create `src/server/services/package-service.ts`:
```ts
import { db, dbSql } from "../db/client.js";
import { packages } from "../db/schema.js";
import { eq } from "drizzle-orm";

/** Public katalog: yalnız enabled paketler, gizli alan yok. */
export async function listPublicPackages() {
  const rows = await dbSql<any[]>`
    SELECT id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun,
           allowed_models, fiyat_tl, fiyat_usd, display_order
    FROM packages WHERE enabled = true
    ORDER BY display_order ASC, ad ASC
  `;
  return rows.map(publicShape);
}

export async function getPublicPackage(id: string) {
  const rows = await dbSql<any[]>`
    SELECT id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun,
           allowed_models, fiyat_tl, fiyat_usd, display_order
    FROM packages WHERE id = ${id} AND enabled = true LIMIT 1
  `;
  return rows.length ? publicShape(rows[0]) : null;
}

function publicShape(r: any) {
  return {
    id: r.id, ad: r.ad, kategori: r.kategori, aciklama: r.aciklama, tip: r.tip,
    gunlukIstekLimiti: Number(r.gunluk_istek_limiti), sureGun: Number(r.sure_gun),
    allowedModels: r.allowed_models ?? [], fiyatTL: Number(r.fiyat_tl),
    fiyatUsd: r.fiyat_usd != null ? Number(r.fiyat_usd) : null, displayOrder: Number(r.display_order),
  };
}

/** Admin: tüm paketler (enabled dahil/hariç). */
export async function listAllPackages() {
  return await db.select().from(packages);
}

export interface PackageInput {
  id: string; ad: string; kategori: string; aciklama?: string;
  gunlukIstekLimiti: number; sureGun: number; allowedModels: string[];
  fiyatTL: number; fiyatUsd?: number | null; enabled?: boolean; displayOrder?: number;
}

export async function createPackage(input: PackageInput) {
  const inserted = await db.insert(packages).values({
    id: input.id, ad: input.ad, kategori: input.kategori, aciklama: input.aciklama ?? "",
    tip: "request_limit",
    gunlukIstekLimiti: input.gunlukIstekLimiti, sureGun: input.sureGun,
    allowedModels: input.allowedModels,
    fiyatTL: String(input.fiyatTL), fiyatUsd: input.fiyatUsd != null ? String(input.fiyatUsd) : null,
    enabled: input.enabled ?? true, displayOrder: input.displayOrder ?? 0,
  }).returning();
  return inserted[0];
}

export async function updatePackage(id: string, patch: Partial<PackageInput>) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.ad !== undefined) set.ad = patch.ad;
  if (patch.kategori !== undefined) set.kategori = patch.kategori;
  if (patch.aciklama !== undefined) set.aciklama = patch.aciklama;
  if (patch.gunlukIstekLimiti !== undefined) set.gunlukIstekLimiti = patch.gunlukIstekLimiti;
  if (patch.sureGun !== undefined) set.sureGun = patch.sureGun;
  if (patch.allowedModels !== undefined) set.allowedModels = patch.allowedModels;
  if (patch.fiyatTL !== undefined) set.fiyatTL = String(patch.fiyatTL);
  if (patch.fiyatUsd !== undefined) set.fiyatUsd = patch.fiyatUsd != null ? String(patch.fiyatUsd) : null;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.displayOrder !== undefined) set.displayOrder = patch.displayOrder;
  const updated = await db.update(packages).set(set).where(eq(packages.id, id)).returning();
  return updated[0] ?? null;
}

export async function setPackageEnabled(id: string, enabled: boolean) {
  await db.update(packages).set({ enabled, updatedAt: new Date() }).where(eq(packages.id, id));
}

export async function deletePackage(id: string) {
  // güvenli: disable (entitlement FK'ları korunur)
  await setPackageEnabled(id, false);
}
```

- [ ] **Step 2: Public katalog router yaz**

Create `src/server/routes/packages.ts`:
```ts
import { Router } from "express";
import { listPublicPackages, getPublicPackage } from "../services/package-service.js";

const router = Router();

router.get("/packages", async (_req, res, next) => {
  try {
    res.json(await listPublicPackages());
  } catch (e) { next(e); }
});

router.get("/packages/:id", async (req, res, next) => {
  try {
    const pkg = await getPublicPackage(req.params.id);
    if (!pkg) { res.status(404).json({ error: "Paket bulunamadı" }); return; }
    res.json(pkg);
  } catch (e) { next(e); }
});

export default router;
```

- [ ] **Step 3: app.ts'e mount et**

`src/server/app.ts`'te diğer `app.use("/api", ...)` satırlarının yanına ekle (modelsRouter'dan sonra):
```ts
  app.use("/api", packagesRouter);
```
ve dosya başındaki router import'larına ekle:
```ts
import packagesRouter from "./routes/packages.js";
```

- [ ] **Step 4: user.ts'e entitlements + purchase ekle**

`src/server/routes/user.ts` import bloğuna:
```ts
import { listUserEntitlements } from "../services/entitlement-service.js";
import { purchasePackageWithBalance } from "../services/package-purchase-service.js";
```
Router'a iki endpoint ekle (mevcut `router.post("/api-keys", ...)` desenini izle):
```ts
router.get("/entitlements", async (req, res, next) => {
  try {
    res.json(await listUserEntitlements(req.user!.id));
  } catch (e) { next(e); }
});

router.post("/packages/:id/purchase", async (req, res, next) => {
  try {
    const result = await purchasePackageWithBalance(req.user!.id, req.params.id);
    res.status(201).json(result);
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: admin.ts'e paket CRUD ekle**

`src/server/routes/admin.ts` import bloğuna:
```ts
import { listAllPackages, createPackage, updatePackage, setPackageEnabled, deletePackage } from "../services/package-service.js";
```
Router'a ekle (mevcut admin endpoint desenini izle; `writeAudit` varsa kullan):
```ts
router.get("/packages", async (_req, res, next) => {
  try { res.json(await listAllPackages()); } catch (e) { next(e); }
});

router.post("/packages", async (req, res, next) => {
  try {
    const b = req.body as any;
    if (!b?.id?.trim() || !b?.ad?.trim() || !b?.kategori?.trim()) { res.status(400).json({ error: "id, ad, kategori zorunlu" }); return; }
    if (!(Number(b.gunlukIstekLimiti) > 0) || !(Number(b.sureGun) > 0) || !(Number(b.fiyatTL) >= 0)) { res.status(400).json({ error: "gunlukIstekLimiti, sureGun, fiyatTL geçersiz" }); return; }
    const created = await createPackage({
      id: String(b.id).trim(), ad: String(b.ad).trim(), kategori: String(b.kategori).trim(),
      aciklama: b.aciklama ?? "", gunlukIstekLimiti: Number(b.gunlukIstekLimiti), sureGun: Number(b.sureGun),
      allowedModels: Array.isArray(b.allowedModels) ? b.allowedModels : [], fiyatTL: Number(b.fiyatTL),
      fiyatUsd: b.fiyatUsd != null ? Number(b.fiyatUsd) : null, enabled: b.enabled !== false,
      displayOrder: Number(b.displayOrder ?? 0),
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.patch("/packages/:id", async (req, res, next) => {
  try {
    const updated = await updatePackage(req.params.id, req.body as any);
    if (!updated) { res.status(404).json({ error: "Paket bulunamadı" }); return; }
    res.json(updated);
  } catch (e) { next(e); }
});

router.post("/packages/:id/toggle", async (req, res, next) => {
  try {
    await setPackageEnabled(req.params.id, (req.body as any)?.enabled === true);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete("/packages/:id", async (req, res, next) => {
  try { await deletePackage(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});
```

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: hata yok.

- [ ] **Step 7: Commit (lokal)**
```bash
git add src/server/services/package-service.ts src/server/routes/packages.ts src/server/routes/user.ts src/server/routes/admin.ts src/server/app.ts
git commit -m "feat(packages): catalog service + public/user/admin routes"
```

---

## Task 5: Enforcement — proxy paket kota dalı

**Files:**
- Modify: `src/server/routes/proxy.ts`

> Bu task DOKUNULMAZ-bitişik. `billing-service`'i DEĞİŞTİRME. Sadece `proxy.ts`'e dal ekle.

- [ ] **Step 1: proxy.ts'i oku (anchor'ları bul)**

Read `src/server/routes/proxy.ts`. Şu anchor'ları bul:
- `enforceRequestGuards` fonksiyon tanımı (~satır 153) ve balance pre-guard (`if (runtimeConfig.insufficientBalanceBlockEnabled && balance <= 0)` ~satır 191).
- `/chat/completions` handler'ında `buildRequestGuard(...)` → `reserveUsageBudget(...)` → `settleReservedUsage(...)` bloğu.

- [ ] **Step 2: import ekle**

`proxy.ts` import bloğuna:
```ts
import { checkPackageCoverage, tryReservePackageSlot, releasePackageSlot, recordPackageUsage } from "../services/entitlement-service.js";
```

- [ ] **Step 3: enforceRequestGuards'a packageCovers ekle**

`enforceRequestGuards` opts tipine ekle: `packageCovers?: boolean;`
Balance pre-guard koşulunu güncelle:
```ts
  if (runtimeConfig.insufficientBalanceBlockEnabled && balance <= 0 && !opts.packageCovers) {
    throw new InsufficientBalanceError("Insufficient balance to process request");
  }
```

- [ ] **Step 4: /chat/completions handler'ına paket dalı ekle**

`enforceRequestGuards` çağrısından ÖNCE coverage hesapla; çağrıya flag geçir:
```ts
    const packageCovers = model ? await checkPackageCoverage(userId, /*canonical sonrası*/ model) : false;
    const enforcement = await enforceRequestGuards({
      userId, apiKeyId, ipAddress: req.ip, modelId: model, endpoint: "chat",
      body: req.body as Record<string, unknown>,
      packageCovers,
    });
```
> Not: `checkPackageCoverage` canonical model id ister. `model` ham gelebilir; coverage'ı `enforcement.masterModel.id` ile DOĞRULAMAK daha güvenli. Pratik: önce ham `model` ile coverage (balance-guard skip için yeterli), kesin rezerv `masterModel.id` ile (Step 5). Yanlış-pozitif coverage zararsız (gerçek rezerv başarısızsa bakiyeye düşer).

`buildRequestGuard(...)` SONRASI, `reserveUsageBudget(...)` ÖNCESİ paket dalını ekle ve reserve/settle'ı koşullu yap:
```ts
    // === PAKET KOTA DALI (reserve'den ÖNCE) ===
    const pkg = await tryReservePackageSlot(userId, masterModel.id);
    let billedViaPackage = pkg.covered;
    const entitlementId = pkg.entitlementId;

    if (!billedViaPackage) {
      await reserveUsageBudget({
        userId, apiKeyId, model: masterModel,
        usage: { promptTokens: guard.contextTokens, completionTokens: guard.reservedCompletionTokens },
        requestId,
      });
    }
```
Forward başarısından SONRA (non-stream settle bloğunda) ve hata yolunda (catch) şu deseni uygula:
```ts
    // SUCCESS:
    if (billedViaPackage) {
      await recordPackageUsage({
        userId, apiKeyId, modelId: masterModel.id, entitlementId: entitlementId!,
        inputUsage: /*usage.prompt*/ inputTokens, outputUsage: /*usage.completion*/ outputTokens,
        responseMs: Date.now() - start, status: "success", requestId, upstreamRequestId,
      });
    } else {
      await settleReservedUsage({ /* mevcut argümanlar, status: "success" */ });
    }
```
```ts
    // CATCH (hata):
    if (billedViaPackage && entitlementId) {
      await releasePackageSlot(entitlementId);
      await recordPackageUsage({
        userId, apiKeyId, modelId: masterModel.id, entitlementId,
        inputUsage: 0, outputUsage: 0, responseMs: Date.now() - start,
        status: "error", requestId, errorCode: (err as any)?.code ?? "upstream_error",
      });
    } else {
      await settleReservedUsage({ /* mevcut argümanlar, status: "error" */ });
    }
```
> `billedViaPackage`/`entitlementId` değişkenlerini handler scope'unun başında `let billedViaPackage = false; let entitlementId: string | undefined;` ile tanımla ki catch erişebilsin.
> Stream yolunda da aynı: paket modunda `reserveUsageBudget` çağrılmaz; stream bitince `recordPackageUsage(success)`, stream hatasında `releasePackageSlot + recordPackageUsage(error)`.

- [ ] **Step 5: /messages ve /responses handler'larına aynı dalı uygula**

`/messages` (handleTextJsonEndpoint) ve `/responses` (handleResponsesEndpoint) handler'larında aynı paket dalını (Step 4) uygula — Claude Code `/v1/messages` kullandığı için bu ŞART. Her birinde: coverage → enforce flag → tryReservePackageSlot → koşullu reserve → success/catch'te package/balance ayrımı.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: hata yok (değişkenler tanımlı, tipler uyumlu).

- [ ] **Step 7: Mevcut billing testleri yeşil mi?**

Run: `npm test`
Expected: tüm unit testler PASS (billing-service testleri dahil — DOKUNULMAZ korundu).

- [ ] **Step 8: Commit (lokal)**
```bash
git add src/server/routes/proxy.ts
git commit -m "feat(packages): proxy package-quota branch before reserve (chat/messages/responses)"
```

---

## Task 6: Feature flag (packages_enabled)

**Files:**
- Modify: `src/server/routes/packages.ts`
- Modify: `src/server/routes/user.ts`

- [ ] **Step 1: Flag kontrolü ekle**

`packages.ts` ve user.ts purchase endpoint'inde, paket özelliği kapalıysa 404/410 dön. Basit yardımcı (`package-service.ts`'e ekle):
```ts
export async function packagesFeatureEnabled(): Promise<boolean> {
  const rows = await dbSql<{ packages_enabled: boolean }[]>`SELECT packages_enabled FROM system_config WHERE id = 1 LIMIT 1`;
  return rows.length ? rows[0].packages_enabled !== false : true;
}
```
`GET /packages`, `GET /packages/:id`, `POST /packages/:id/purchase` başında:
```ts
    if (!(await packagesFeatureEnabled())) { res.status(404).json({ error: "Paket özelliği kapalı" }); return; }
```
(import: `import { packagesFeatureEnabled } from "../services/package-service.js";`)

- [ ] **Step 2: Lint + commit (lokal)**
```bash
npm run lint
git add src/server/services/package-service.ts src/server/routes/packages.ts src/server/routes/user.ts
git commit -m "feat(packages): packages_enabled feature flag gate"
```

---

## Task 7: Admin "Paketler" section (frontend)

**Files:**
- Modify: `src/yapayzekalab/tab-admin.jsx`

- [ ] **Step 1: ADMIN_SECTIONS'a ekle**

`tab-admin.jsx` `ADMIN_SECTIONS` dizisine (örn. `overrides`'tan sonra) ekle:
```jsx
  { id: 'packages', label: 'Paketler', Ico: I.Layers },
```

- [ ] **Step 2: Section component yaz (AdminAddedModels desenini izle)**

`tab-admin.jsx`'e yeni component ekle (AdminAddedModels yapısını birebir izleyerek):
```jsx
const AdminPackages = ({ token }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ id: '', ad: '', kategori: '', aciklama: '', gunlukIstekLimiti: '', sureGun: '', allowedModels: '', fiyatTL: '', displayOrder: '0' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const list = await adminRequest('/api/admin/packages', token); setRows(Array.isArray(list) ? list : []); }
    catch (e) { setError(e.message || 'Paketler alınamadı.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [token]);

  const create = async () => {
    if (!form.id.trim() || !form.ad.trim() || !form.kategori.trim()) { setError('id, ad, kategori zorunlu'); return; }
    setSaving(true); setError(''); setSaved('');
    try {
      await adminRequest('/api/admin/packages', token, { method: 'POST', body: {
        id: form.id.trim(), ad: form.ad.trim(), kategori: form.kategori.trim(), aciklama: form.aciklama,
        gunlukIstekLimiti: Number(form.gunlukIstekLimiti), sureGun: Number(form.sureGun),
        allowedModels: form.allowedModels.split(',').map(s => s.trim()).filter(Boolean),
        fiyatTL: Number(form.fiyatTL), displayOrder: Number(form.displayOrder || 0),
      }});
      setForm({ id: '', ad: '', kategori: '', aciklama: '', gunlukIstekLimiti: '', sureGun: '', allowedModels: '', fiyatTL: '', displayOrder: '0' });
      setSaved('Paket eklendi.'); await load();
    } catch (e) { setError(e.message || 'Paket eklenemedi.'); }
    finally { setSaving(false); }
  };

  const toggle = async (row) => {
    try { await adminRequest(`/api/admin/packages/${encodeURIComponent(row.id)}/toggle`, token, { method: 'POST', body: { enabled: !row.enabled } }); await load(); }
    catch (e) { setError(e.message || 'Durum değiştirilemedi.'); }
  };

  const remove = async (row) => {
    if (!window.confirm(`${row.id} paketi kapatılsın mı?`)) return;
    try { await adminRequest(`/api/admin/packages/${encodeURIComponent(row.id)}`, token, { method: 'DELETE' }); await load(); }
    catch (e) { setError(e.message || 'Paket silinemedi.'); }
  };

  return (
    <Card pad={18}>
      <Caption>Paketler</Caption>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      {saved && <div style={{ color: 'var(--ok)' }}>{saved}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8, margin: '12px 0' }}>
        <input placeholder="id (slug)" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} />
        <input placeholder="ad" value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} />
        <input placeholder="kategori" value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} />
        <input placeholder="günlük istek" value={form.gunlukIstekLimiti} onChange={e => setForm({ ...form, gunlukIstekLimiti: e.target.value })} />
        <input placeholder="süre (gün)" value={form.sureGun} onChange={e => setForm({ ...form, sureGun: e.target.value })} />
        <input placeholder="fiyat ₺" value={form.fiyatTL} onChange={e => setForm({ ...form, fiyatTL: e.target.value })} />
        <input placeholder="modeller (virgülle)" value={form.allowedModels} onChange={e => setForm({ ...form, allowedModels: e.target.value })} />
        <input placeholder="sıra" value={form.displayOrder} onChange={e => setForm({ ...form, displayOrder: e.target.value })} />
      </div>
      <button disabled={saving} onClick={create}>{saving ? 'Ekleniyor…' : 'Paket Ekle'}</button>
      {loading ? <div>Yükleniyor…</div> : (
        <table style={{ width: '100%', marginTop: 12 }}>
          <thead><tr><th>id</th><th>ad</th><th>kategori</th><th>limit/gün</th><th>süre</th><th>₺</th><th>durum</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.ad}</td><td>{r.kategori}</td>
                <td>{r.gunlukIstekLimiti}</td><td>{r.sureGun}g</td><td>{Number(r.fiyatTL)}</td>
                <td>{r.enabled ? 'Açık' : 'Kapalı'}</td>
                <td>
                  <button onClick={() => toggle(r)}>{r.enabled ? 'Kapat' : 'Aç'}</button>
                  <button onClick={() => remove(r)}>Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};
```

- [ ] **Step 3: Render satırı ekle**

Section render bloğuna (chained `&&`, AdminAddedModels'in yanına) ekle:
```jsx
        {section === 'packages' && <AdminPackages token={token} />}
```

- [ ] **Step 4: Build (frontend derleniyor mu?)**

Run: `cd /Users/ufuk/yzapi && NODE_OPTIONS="--max-old-space-size=8192" npm run build`
Expected: build başarılı (GC crash olursa retry — CLAUDE.md). Hata yoksa devam.

- [ ] **Step 5: Commit (lokal)**
```bash
git add src/yapayzekalab/tab-admin.jsx
git commit -m "feat(packages): admin Paketler section (CRUD + toggle)"
```

---

## Task 8: Kullanıcı `tab-packages.jsx` (vitrin)

**Files:**
- Create: `src/yapayzekalab/tab-packages.jsx`
- Modify: `src/yapayzekalab/App.jsx`

- [ ] **Step 1: tab-packages.jsx yaz**

Create `src/yapayzekalab/tab-packages.jsx`:
```jsx
import { useEffect, useMemo, useState } from 'react';
import { I, Card, Chip, Caption } from './shared.jsx';
import { apiJson } from './auth-client.js';

export function PackagesTab({ ctx }) {
  const [packages, setPackages] = useState([]);
  const [ents, setEnts] = useState([]);
  const [cat, setCat] = useState('Tümü');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [pkgs, entitlements] = await Promise.all([
        fetch('/api/packages').then(r => r.json()).catch(() => []),
        apiJson('/api/user/entitlements').catch(() => []),
      ]);
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setEnts(Array.isArray(entitlements) ? entitlements : []);
    } catch (e) { setError(e.message || 'Paketler alınamadı.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => {
    const counts = { 'Tümü': packages.length };
    packages.forEach(p => { counts[p.kategori] = (counts[p.kategori] || 0) + 1; });
    return Object.entries(counts);
  }, [packages]);

  const visible = cat === 'Tümü' ? packages : packages.filter(p => p.kategori === cat);

  const buy = async (id) => {
    setBusyId(id); setError('');
    try {
      await apiJson(`/api/user/packages/${encodeURIComponent(id)}/purchase`, { method: 'POST' });
      await load();
    } catch (e) {
      if (e.status === 402) setError('Yetersiz bakiye. Önce bakiye yükleyin.');
      else setError(e.message || 'Satın alma başarısız.');
    } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Caption>Paketler</Caption>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}

      {ents.length > 0 && (
        <Card pad={16}>
          <Caption>Aktif Paketlerim</Caption>
          {ents.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>{e.paketAdi} <Chip>{e.kategori}</Chip></span>
              <span>Bugün kalan: {e.kalanBugun}/{e.gunlukLimit} · bitiş: {new Date(e.expiresAt).toLocaleDateString('tr-TR')}</span>
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {categories.map(([c, n]) => (
          <button key={c} onClick={() => setCat(c)} style={{ fontWeight: cat === c ? 700 : 400 }}>{c} {n}</button>
        ))}
      </div>

      {loading ? <div>Yükleniyor…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {visible.map(p => (
            <Card key={p.id} pad={16}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{p.ad}</strong><Chip>{p.kategori}</Chip>
              </div>
              <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>{p.aciklama}</p>
              <div style={{ fontSize: 13 }}>{p.gunlukIstekLimiti} istek/gün · {p.sureGun} gün</div>
              <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0' }}>₺{p.fiyatTL}</div>
              <button disabled={busyId === p.id} onClick={() => buy(p.id)}>
                {busyId === p.id ? 'Alınıyor…' : 'Bakiye ile al'}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: App.jsx'e tab ekle**

`App.jsx` `tabs` dizisine (models'tan sonra) ekle:
```jsx
    { id: 'packages', label: 'Paketler', Ico: I.Layers },
```
Tab body render'a ekle:
```jsx
        {tab === 'packages' && <PackagesTab ctx={ctx} />}
```
Import ekle (App.jsx tepesi):
```jsx
import { PackagesTab } from './tab-packages.jsx';
```
(Not: `packages` herkese açık vitrin; satın alma `apiJson` zaten auth gerektirir. `PROTECTED_TABS`'a EKLEME — vitrin login'siz görülebilsin, satın alma login ister.)

- [ ] **Step 3: Build**

Run: `NODE_OPTIONS="--max-old-space-size=8192" npm run build`
Expected: başarılı.

- [ ] **Step 4: Commit (lokal)**
```bash
git add src/yapayzekalab/tab-packages.jsx src/yapayzekalab/App.jsx
git commit -m "feat(packages): user Paketler tab (catalog + buy + active entitlements)"
```

---

## Task 9: Expiry job

**Files:**
- Create: `src/server/jobs/package-maintenance-job.ts`
- Modify: `src/server/jobs/index.ts`

- [ ] **Step 1: Job yaz**

Create `src/server/jobs/package-maintenance-job.ts`:
```ts
import cron from "node-cron";
import { dbSql } from "../db/client.js";
import { logger } from "../lib/logger.js";

export async function runPackageMaintenance(): Promise<number> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements
    SET status = 'expired', updated_at = now()
    WHERE status = 'active' AND expires_at <= now()
    RETURNING id
  `;
  return rows.length;
}

export function startPackageMaintenanceJob() {
  cron.schedule("5 0 * * *", async () => {
    try {
      const n = await runPackageMaintenance();
      if (n > 0) logger.info(`[package-maintenance] ${n} entitlement expired`);
    } catch (e) {
      logger.error(`[package-maintenance] failed: ${(e as Error).message}`);
    }
  });
}
```
> `node-cron` ve `logger` import yollarını mevcut bir job dosyasıyla (örn. `low-balance-scan-job.ts`) doğrula; farklıysa eşleştir.

- [ ] **Step 2: index.ts'e kaydet**

`src/server/jobs/index.ts`'te `startAllJobs()` içine ekle (NODE_ENV==='test' skip desenine uy):
```ts
  startPackageMaintenanceJob();
```
ve import:
```ts
import { startPackageMaintenanceJob } from "./package-maintenance-job.js";
```

- [ ] **Step 3: Lint + commit (lokal)**
```bash
npm run lint
git add src/server/jobs/package-maintenance-job.ts src/server/jobs/index.ts
git commit -m "feat(packages): daily expiry maintenance job"
```

---

## Task 10: Integration + no-leak testleri (gerçek PG)

**Files:**
- Create: `src/server/__tests__/packages-flow.itest.ts`
- Create: `src/server/__tests__/packages-noleak.test.ts`

- [ ] **Step 1: itest yaz (money-flow.itest.ts desenini izle)**

Create `src/server/__tests__/packages-flow.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import nock from "nock";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const UID = "22222222-2222-2222-2222-222222222222";
const PKG = "test-codex-itest";
const app = createApp();

async function balance(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}

beforeAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
  await db.insert(users).values({ id: UID, email: "pkg@test.local", adSoyad: "Pkg Test", bakiyeTL: "100.0000", durum: "aktif" } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled)
    VALUES (${PKG}, 'Test Codex', 'GPT/Codex', '', 'request_limit', 2, 1, ${JSON.stringify(["gpt-5.5"])}::jsonb, 40, true)
  `;
});

afterAll(async () => {
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id = ${PKG}`;
});

describe("package purchase + quota", () => {
  it("purchase debits balance atomically and creates entitlement", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    const res = await purchasePackageWithBalance(UID, PKG);
    expect(res.newBalanceTL).toBe(60);
    expect(await balance()).toBe(60);
    const ent = await dbSql`SELECT * FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
    expect(ent.length).toBe(1);
  });

  it("reserves quota up to daily limit then stops covering", async () => {
    const { tryReservePackageSlot, checkPackageCoverage } = await import("../services/entitlement-service.js");
    expect(await checkPackageCoverage(UID, "gpt-5.5")).toBe(true);
    expect((await tryReservePackageSlot(UID, "gpt-5.5")).covered).toBe(true);
    expect((await tryReservePackageSlot(UID, "gpt-5.5")).covered).toBe(true);
    // limit=2 → 3.'de kapsam yok
    expect((await tryReservePackageSlot(UID, "gpt-5.5")).covered).toBe(false);
  });

  it("does not cover a model outside allowed_models", async () => {
    const { checkPackageCoverage } = await import("../services/entitlement-service.js");
    expect(await checkPackageCoverage(UID, "claude-opus-4.8")).toBe(false);
  });

  it("insufficient balance rejects purchase", async () => {
    const { purchasePackageWithBalance } = await import("../services/package-purchase-service.js");
    await dbSql`UPDATE users SET bakiye_tl = 0 WHERE id = ${UID}::uuid`;
    await expect(purchasePackageWithBalance(UID, PKG)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: itest koştur**

Run:
```bash
cd /Users/ufuk/yzapi && npm run db:up && npm run db:migrate && npx vitest run --config vitest.itest.config.ts src/server/__tests__/packages-flow.itest.ts
```
Expected: 4 test PASS.

- [ ] **Step 3: no-leak contract testi yaz**

Create `src/server/__tests__/packages-noleak.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("packages no-leak", () => {
  it("package-service public shape excludes provider/cost secrets", () => {
    const src = readFileSync(join(process.cwd(), "src/server/services/package-service.ts"), "utf8");
    // publicShape yalnız beyaz-liste alan döndürmeli; provider/base_url/maliyet sızmamalı
    expect(src).not.toMatch(/base_?url/i);
    expect(src).not.toMatch(/provider.*(cost|maliyet)/i);
  });
});
```

- [ ] **Step 4: no-leak testi koştur + tüm unit**

Run: `npm test`
Expected: tüm unit testler (yeni dahil) PASS.

- [ ] **Step 5: scan:public (built bundle no-leak)**

Run: `NODE_OPTIONS="--max-old-space-size=8192" npm run build && npm run scan:public`
Expected: sızıntı yok.

- [ ] **Step 6: Commit (lokal)**
```bash
git add src/server/__tests__/packages-flow.itest.ts src/server/__tests__/packages-noleak.test.ts
git commit -m "test(packages): itest quota/purchase flow + no-leak contract"
```

---

## Final Doğrulama (release DEĞİL — sadece lokal yeşil)
- [ ] `npm run lint` temiz
- [ ] `npm test` tüm unit PASS (billing DOKUNULMAZ regresyonu yok)
- [ ] `npm run itest` (paket + mevcut money-flow) PASS
- [ ] `npm run build && npm run scan:public` sızıntı yok
- [ ] Manuel duman: admin paket ekle → kullanıcı "Bakiye ile al" → kapsanan modele `/v1/messages` isteği kotadan düşer (bakiye sabit) → kota bitince bakiyeye düşer
- [ ] 🔒 **Deploy YOK** — kabul kriterleri sağlandıktan sonra kullanıcının çift onayı + 3-QA ile canlıya.

---

## Self-Review (yazım sonrası)
- **Spec coverage:** §3 şema→T1; entitlement-service §4→T2; satın alma §4→T3; katalog/route §6→T4; enforcement §5→T5; feature flag §8→T6; admin §7→T7; user UI §7→T8; job §9→T9; testler §10→T10. ✔ tüm spec maddeleri kapsanıyor.
- **Placeholder:** kod blokları gerçek; proxy edit'lerinde "mevcut argümanlar" notları executor'ın gerçek dosyayı okumasını gerektirir (anchor'lar net) — bu plan kabul edilebilir sınırda, çünkü proxy handler gövdeleri repoda mevcut ve T5/Step1 "oku" adımı var.
- **Tip tutarlılığı:** `tryReservePackageSlot`/`checkPackageCoverage`/`recordPackageUsage`/`releasePackageSlot` isimleri T2 tanımı ile T5 kullanımı eşleşiyor; `purchasePackageWithBalance` T3↔T4 eşleşiyor; `billedVia`/`entitlementId` kolonları T1 şema ile T2 insert eşleşiyor.
