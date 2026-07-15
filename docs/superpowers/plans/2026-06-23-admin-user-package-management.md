# Admin Kullanıcı Paket Yönetimi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin panelinde bir kullanıcının detayında her pakete satır-içi aksiyonlar (ekle/değiştir/iptal/iade/yenile/sil) ekleyerek owner'ın istediği paketi istediği miktarda yönetebilmesini sağlamak.

**Architecture:** Tüm yeni backend mantığı **yeni** `admin-entitlement-service.ts` dosyasına izole edilir (canlıda `main`'in ÖNÜNDE olan `entitlement-service.ts`'i DÜZENLEMEMEK için — o dosyaya yalnız okuma amaçlı import ile dokunulur). Yeni owner-only route'lar `admin.ts`'e eklenir (fail-closed RBAC → izin haritası değişmez). Frontend yeni `tab-admin-user-packages.jsx` bileşenine izole edilir; `tab-admin.jsx`'e yalnız tek import + tek render satırı girer (kontamine dosyada minimum diff). Para hareketleri mevcut atomik `dbSql.begin` + `FOR UPDATE` + idempotency-key desenini birebir yeniden kullanır.

**Tech Stack:** Express + TypeScript, postgres-js raw SQL (`dbSql`), Vitest (unit + itest gerçek Postgres), React/JSX SPA (Vite), `authFetch`/`adminRequest` istemci sarmalayıcı.

**Spec:** `docs/superpowers/specs/2026-06-23-admin-user-package-management-design.md`

**⚠️ Canlı-lokal ayrışma (deploy için kritik):** `entitlement-service.ts`, `codefast-provisioning-service.ts`, `proxy.ts` canlıda lokal `main`'in ÖNÜNDE (R-3 + CF havuz fix). Bu plan bu üç dosyayı **DEĞİŞTİRMEZ**. `admin.ts` + `tab-admin.jsx` pre-kirli/kontamine — Faz 4 deploy bölümüne bak.

---

## File Structure

- **Create** `src/server/services/admin-entitlement-service.ts` — tüm admin paket-yönetim servis fonksiyonları (grant/update/cancel/refund/delete/renew). Tek sorumluluk: admin-tetikli entitlement mutasyonları, atomik + idempotent + audit-dostu (audit route'ta yazılır).
- **Create** `src/server/services/__tests__/admin-entitlement-service.itest.ts` — gerçek-Postgres itest (para + entitlement satır mutasyonları).
- **Modify** `src/server/routes/admin.ts` — 6 yeni owner-only route (grant/update/cancel/refund/renew/delete). Pre-kirli dosya (Faz 4).
- **Create** `src/server/routes/__tests__/admin-entitlements.test.ts` — supertest route testi (yetki + happy-path; `createApp` factory).
- **Create** `src/yapayzekalab/tab-admin-user-packages.jsx` — `UserPackagesPanel` bileşeni + 3 modal (Ekle / Düzenle / İptal-İade).
- **Modify** `src/yapayzekalab/tab-admin.jsx` — tek import + detay panelindeki "Paketler" bloğunu `<UserPackagesPanel/>` ile değiştir. Pre-kirli dosya (Faz 4).

---

## Sabitlenen sözleşmeler (tüm task'lar bunlara uyar)

```ts
// admin-entitlement-service.ts public API
export interface AdminGrantParams {
  userId: string;
  packageId: string;            // taban/şablon paket (allowedModels + CF kablolama + kategori ondan)
  dailyLimit?: number;          // override; yoksa pkg.gunluk_istek_limiti
  durationDays?: number;        // override; yoksa pkg.sure_gun
  charge: "gift" | "balance";
  chargeTL?: number;            // charge==="balance" iken zorunlu (>0)
  adminId: string;
  note: string;                 // zorunlu audit notu
  idempotencyKey?: string;      // yoksa randomUUID
}
export interface AdminGrantResult { entitlementId: string; newBalanceTL: number; chargedTL: number; duplicate?: boolean; }
export type RefundMode = "full" | "partial" | "none";
export interface AdminMoneyResult { refundedTL: number; newBalanceTL: number; }
export interface AdminUpdateFields {
  dailyLimit?: number;
  remaining?: number;           // SADECE non-CF (cf_units_ordered=0); CF'de 400
  expiresAt?: string;           // ISO 8601
  paused?: boolean;
  status?: "active" | "cancelled";
}
```

İdempotency anahtarları: grant = `admin_grant_<idempotencyKey>` · cancel iade = `admin_cancel_<entId>` · standalone iade = `admin_refund_<entId>_<YYYYMMDD>`. Transaction `tip`: balance-charge grant/renew = `paket_satin_alma`; gift grant/renew = `admin_hediye` (miktar 0); iade = `iade`.

---

## Faz 1 — Servis katmanı (yeni dosya + itest)

### Task 1: Yeni servis dosyası iskeleti + grant (gift)

**Files:**
- Create: `src/server/services/admin-entitlement-service.ts`
- Test: `src/server/services/__tests__/admin-entitlement-service.itest.ts`

- [ ] **Step 1: Postgres'i başlat (itest ön-koşulu)**

Run: `cd /Users/ufuk/yzapi && npm run db:up && npm run db:migrate`
Expected: container up, "Migrations applied successfully". (Bayat `.pgdata` hatası olursa: `docker rm -f yzapi-postgres-1 && rm -rf .pgdata && npm run db:up`, sonra migrate.)

- [ ] **Step 2: Failing itest yaz (gift grant yeni satır açar, bakiye değişmez)**

```ts
// src/server/services/__tests__/admin-entitlement-service.itest.ts
import { describe, it, expect, beforeAll } from "vitest";
import { dbSql } from "../../db/client.js";
import { adminGrantEntitlement } from "../admin-entitlement-service.js";

async function mkUser(balance: number): Promise<string> {
  const rows = await dbSql<{ id: string }[]>`
    INSERT INTO users (email, sifre_hash, bakiye_tl, durum)
    VALUES (${"t" + Math.floor(Math.random() * 1e9) + "@x.io"}, 'x', ${balance}::numeric, 'aktif')
    RETURNING id`;
  return rows[0].id;
}
async function mkPackage(id: string, fiyat: number): Promise<void> {
  await dbSql`
    INSERT INTO packages (id, ad, kategori, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista)
    VALUES (${id}, ${"Test " + id}, 'GPT', 'request_limit', 100, 30, ${JSON.stringify(["gpt-5.5"])}::jsonb, ${fiyat}::numeric, true, true)
    ON CONFLICT (id) DO NOTHING`;
}

describe("adminGrantEntitlement", () => {
  beforeAll(async () => { await mkPackage("test-grant-pkg", 100); });

  it("gift: yeni satır açar, bakiyeye DOKUNMAZ, admin_hediye tx yazar", async () => {
    const userId = await mkUser(500);
    const res = await adminGrantEntitlement({
      userId, packageId: "test-grant-pkg", charge: "gift",
      adminId: "admin-1", note: "telafi", dailyLimit: 250, durationDays: 7,
    });
    expect(res.chargedTL).toBe(0);
    expect(res.newBalanceTL).toBe(500);
    const ent = await dbSql<any[]>`SELECT daily_limit_snapshot, status FROM user_package_entitlements WHERE id = ${res.entitlementId}::uuid`;
    expect(Number(ent[0].daily_limit_snapshot)).toBe(250);
    expect(ent[0].status).toBe("active");
    const tx = await dbSql<any[]>`SELECT tip, miktar_tl FROM transactions WHERE user_id = ${userId}::uuid AND tip = 'admin_hediye'`;
    expect(tx.length).toBe(1);
    expect(Number(tx[0].miktar_tl)).toBe(0);
  });
});
```

- [ ] **Step 3: Run → fail (modül yok)**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: FAIL — `Cannot find module '../admin-entitlement-service.js'`.

- [ ] **Step 4: Servis dosyasını oluştur (grant)**

```ts
// src/server/services/admin-entitlement-service.ts
import { randomUUID } from "node:crypto";
import { dbSql } from "../db/client.js";
import { AppError, InsufficientBalanceError } from "../lib/errors.js";
import { grantPackageEntitlement } from "./entitlement-service.js";
import { generateUniquePurchaseRef } from "./purchase-ref.js";

export interface AdminGrantParams {
  userId: string;
  packageId: string;
  dailyLimit?: number;
  durationDays?: number;
  charge: "gift" | "balance";
  chargeTL?: number;
  adminId: string;
  note: string;
  idempotencyKey?: string;
}
export interface AdminGrantResult { entitlementId: string; newBalanceTL: number; chargedTL: number; duplicate?: boolean; }

/** Admin: kullanıcıya paket VER (her zaman yeni satır). charge=gift → bakiye sabit; balance → chargeTL düş. */
export async function adminGrantEntitlement(p: AdminGrantParams): Promise<AdminGrantResult> {
  if (!p.note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  const idem = (p.idempotencyKey && p.idempotencyKey.trim()) || randomUUID();
  const txKey = "admin_grant_" + idem;

  const pkgRows = await dbSql<any[]>`
    SELECT id, ad, gunluk_istek_limiti, sure_gun, allowed_models FROM packages WHERE id = ${p.packageId} LIMIT 1`;
  if (!pkgRows.length) throw new AppError(404, "Paket bulunamadı");
  const pkg = pkgRows[0];

  const limit = p.dailyLimit != null ? Math.floor(p.dailyLimit) : Number(pkg.gunluk_istek_limiti);
  const days = p.durationDays != null ? Math.floor(p.durationDays) : Number(pkg.sure_gun);
  if (!(limit > 0)) throw new AppError(400, "Günlük limit > 0 olmalı");
  if (!(days > 0)) throw new AppError(400, "Süre (gün) > 0 olmalı");

  let chargeTL = 0;
  if (p.charge === "balance") {
    chargeTL = Number(p.chargeTL);
    if (!(chargeTL > 0)) throw new AppError(400, "Tahsil tutarı > 0 olmalı");
  }

  // İdempotent ön-kontrol
  const dup = await dbSql<{ id: string }[]>`SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1`;
  if (dup.length) {
    const ent = await dbSql<{ id: string }[]>`SELECT id FROM user_package_entitlements WHERE purchase_transaction_id = ${dup[0].id}::uuid LIMIT 1`;
    const bal = await dbSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${p.userId}::uuid LIMIT 1`;
    return { entitlementId: ent[0]?.id ?? "", newBalanceTL: Number(bal[0]?.bakiye_tl ?? 0), chargedTL: chargeTL, duplicate: true };
  }

  try {
    return await dbSql.begin(async (txSql) => {
      let newBalance: number;
      let email: string;
      if (p.charge === "balance") {
        const upd = await txSql<{ bakiye_tl: string; email: string }[]>`
          UPDATE users SET bakiye_tl = bakiye_tl - ${chargeTL}::numeric, son_aktivite = now()
          WHERE id = ${p.userId}::uuid AND bakiye_tl >= ${chargeTL}::numeric
          RETURNING bakiye_tl, email`;
        if (!upd.length) throw new InsufficientBalanceError("Tahsil için yeterli bakiye yok");
        newBalance = Number(upd[0].bakiye_tl); email = upd[0].email;
      } else {
        const u = await txSql<{ bakiye_tl: string; email: string }[]>`SELECT bakiye_tl, email FROM users WHERE id = ${p.userId}::uuid LIMIT 1`;
        if (!u.length) throw new AppError(404, "Kullanıcı bulunamadı");
        newBalance = Number(u[0].bakiye_tl); email = u[0].email;
      }
      const prev = p.charge === "balance" ? newBalance + chargeTL : newBalance;
      const ref = await generateUniquePurchaseRef(txSql, new Date());
      const txRows = await txSql<{ id: string }[]>`
        INSERT INTO transactions
          (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key, purchase_ref, package_id)
        VALUES
          (${p.userId}::uuid, ${email}, ${p.charge === "balance" ? "paket_satin_alma" : "admin_hediye"},
           ${p.charge === "balance" ? -chargeTL : 0}::numeric, ${prev}::numeric, ${newBalance}::numeric,
           ${(p.charge === "balance" ? "Admin paket (tahsil): " : "Admin hediye: ") + pkg.ad + " — " + p.note}, 'bakiye',
           ${txKey}, ${ref}, ${p.packageId})
        RETURNING id`;
      const { entitlementId } = await grantPackageEntitlement(txSql, {
        userId: p.userId, packageId: p.packageId, sureGun: days, gunlukIstekLimiti: limit,
        allowedModels: pkg.allowed_models ?? [], purchaseTransactionId: txRows[0].id,
      }, true /* ayriSatir: admin grant HER ZAMAN yeni satır */);
      return { entitlementId, newBalanceTL: newBalance, chargedTL: chargeTL };
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      const t = await dbSql<{ id: string }[]>`SELECT id FROM transactions WHERE idempotency_key = ${txKey} LIMIT 1`;
      const ent = await dbSql<{ id: string }[]>`SELECT id FROM user_package_entitlements WHERE purchase_transaction_id = ${t[0]?.id}::uuid LIMIT 1`;
      const bal = await dbSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${p.userId}::uuid LIMIT 1`;
      return { entitlementId: ent[0]?.id ?? "", newBalanceTL: Number(bal[0]?.bakiye_tl ?? 0), chargedTL: chargeTL, duplicate: true };
    }
    throw e;
  }
}
```

- [ ] **Step 5: Run → pass**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/admin-entitlement-service.ts src/server/services/__tests__/admin-entitlement-service.itest.ts
git commit -m "feat(admin): adminGrantEntitlement (gift) + itest"
```

### Task 2: grant (balance) + idempotency itest

**Files:**
- Modify: `src/server/services/__tests__/admin-entitlement-service.itest.ts`

- [ ] **Step 1: Failing itest ekle (balance düşer + aynı idempotencyKey iki kez = tek tahsil)**

```ts
it("balance: chargeTL düşer + aynı idempotencyKey iki kez TEK tahsil", async () => {
  const userId = await mkUser(500);
  const key = "dupe-" + userId;
  const r1 = await adminGrantEntitlement({ userId, packageId: "test-grant-pkg", charge: "balance", chargeTL: 120, adminId: "a", note: "n", idempotencyKey: key });
  expect(r1.newBalanceTL).toBe(380);
  const r2 = await adminGrantEntitlement({ userId, packageId: "test-grant-pkg", charge: "balance", chargeTL: 120, adminId: "a", note: "n", idempotencyKey: key });
  expect(r2.duplicate).toBe(true);
  const bal = await dbSql<any[]>`SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid`;
  expect(Number(bal[0].bakiye_tl)).toBe(380); // ikinci çağrı tekrar tahsil ETMEDİ
});
```

- [ ] **Step 2: Run → pass (kod zaten idempotency destekliyor)**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: PASS (2 tests). Fail ederse Task 1 idempotency dalını düzelt.

- [ ] **Step 3: Commit**

```bash
git add src/server/services/__tests__/admin-entitlement-service.itest.ts
git commit -m "test(admin): grant balance + idempotency"
```

### Task 3: adminUpdateEntitlement (limit/remaining/expiry/paused/status)

**Files:**
- Modify: `src/server/services/admin-entitlement-service.ts`
- Modify: `src/server/services/__tests__/admin-entitlement-service.itest.ts`

- [ ] **Step 1: Failing itest yaz**

```ts
import { adminUpdateEntitlement } from "../admin-entitlement-service.js";

it("update: non-CF remaining → requests_today = limit - remaining; CF remaining → 400", async () => {
  const userId = await mkUser(0);
  const g = await adminGrantEntitlement({ userId, packageId: "test-grant-pkg", charge: "gift", adminId: "a", note: "n", dailyLimit: 100, durationDays: 30 });
  await adminUpdateEntitlement(g.entitlementId, { dailyLimit: 200, remaining: 150, paused: true }, "admin-1", "ayar");
  const e = await dbSql<any[]>`SELECT daily_limit_snapshot, requests_today, paused FROM user_package_entitlements WHERE id = ${g.entitlementId}::uuid`;
  expect(Number(e[0].daily_limit_snapshot)).toBe(200);
  expect(Number(e[0].requests_today)).toBe(50); // 200 - 150
  expect(e[0].paused).toBe(true);

  // CF entitlement (cf_units_ordered>0) → remaining reddi
  await dbSql`UPDATE user_package_entitlements SET cf_units_ordered = 50 WHERE id = ${g.entitlementId}::uuid`;
  await expect(adminUpdateEntitlement(g.entitlementId, { remaining: 10 }, "a", "n")).rejects.toThrow(/CF/);
});
```

- [ ] **Step 2: Run → fail (fonksiyon yok)**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: FAIL — `adminUpdateEntitlement is not a function`.

- [ ] **Step 3: Fonksiyonu ekle**

```ts
export interface AdminUpdateFields {
  dailyLimit?: number;
  remaining?: number;
  expiresAt?: string;
  paused?: boolean;
  status?: "active" | "cancelled";
}

/** Admin: mevcut entitlement'ı düzenle. remaining SADECE non-CF (cf_units_ordered=0). */
export async function adminUpdateEntitlement(entId: string, f: AdminUpdateFields, _adminId: string, note: string): Promise<{ ok: true }> {
  if (!note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  return await dbSql.begin(async (txSql) => {
    const rows = await txSql<any[]>`
      SELECT daily_limit_snapshot, cf_units_ordered FROM user_package_entitlements WHERE id = ${entId}::uuid LIMIT 1 FOR UPDATE`;
    if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
    const cur = rows[0];
    const isCf = Number(cur.cf_units_ordered) > 0;

    if (f.dailyLimit != null) {
      if (!(f.dailyLimit > 0)) throw new AppError(400, "Günlük limit > 0 olmalı");
      await txSql`UPDATE user_package_entitlements SET daily_limit_snapshot = ${Math.floor(f.dailyLimit)}::int, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.remaining != null) {
      if (isCf) throw new AppError(400, "CF paketinde kalan kota elle düzenlenemez (CF havuzu/ayna). Telafi için 'Yenile/Ekle' kullanın.");
      const limit = f.dailyLimit != null ? Math.floor(f.dailyLimit) : Number(cur.daily_limit_snapshot);
      const used = Math.max(0, limit - Math.floor(f.remaining));
      await txSql`UPDATE user_package_entitlements SET requests_today = ${used}::int, last_reset_date = CURRENT_DATE, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.expiresAt != null) {
      const d = new Date(f.expiresAt);
      if (Number.isNaN(d.getTime())) throw new AppError(400, "Geçersiz bitiş tarihi");
      await txSql`UPDATE user_package_entitlements SET expires_at = ${d.toISOString()}::timestamptz, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.paused != null) {
      await txSql`UPDATE user_package_entitlements SET paused = ${f.paused}, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    if (f.status != null) {
      if (f.status !== "active" && f.status !== "cancelled") throw new AppError(400, "Geçersiz durum");
      await txSql`UPDATE user_package_entitlements SET status = ${f.status}, updated_at = now() WHERE id = ${entId}::uuid`;
    }
    return { ok: true as const };
  });
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/admin-entitlement-service.ts src/server/services/__tests__/admin-entitlement-service.itest.ts
git commit -m "feat(admin): adminUpdateEntitlement + itest"
```

### Task 4: cancel (+ refund) ve standalone refund + delete

**Files:**
- Modify: `src/server/services/admin-entitlement-service.ts`
- Modify: `src/server/services/__tests__/admin-entitlement-service.itest.ts`

- [ ] **Step 1: Failing itest yaz**

```ts
import { adminCancelEntitlement, adminRefundEntitlement, adminDeleteEntitlement } from "../admin-entitlement-service.js";

it("cancel full: status=cancelled + tam fiyat iadesi + idempotent (ikinci cancel tekrar iade etmez)", async () => {
  const userId = await mkUser(500);
  const g = await adminGrantEntitlement({ userId, packageId: "test-grant-pkg", charge: "balance", chargeTL: 100, adminId: "a", note: "n" });
  expect(g.newBalanceTL).toBe(400);
  const c1 = await adminCancelEntitlement(g.entitlementId, "full", undefined, "admin-1", "müşteri istedi");
  expect(c1.refundedTL).toBe(100);
  expect(c1.newBalanceTL).toBe(500);
  const e = await dbSql<any[]>`SELECT status FROM user_package_entitlements WHERE id = ${g.entitlementId}::uuid`;
  expect(e[0].status).toBe("cancelled");
  const c2 = await adminCancelEntitlement(g.entitlementId, "full", undefined, "admin-1", "tekrar"); // idempotent
  const bal = await dbSql<any[]>`SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid`;
  expect(Number(bal[0].bakiye_tl)).toBe(500); // çift iade YOK
});

it("delete: satır tamamen gider", async () => {
  const userId = await mkUser(0);
  const g = await adminGrantEntitlement({ userId, packageId: "test-grant-pkg", charge: "gift", adminId: "a", note: "n" });
  await adminDeleteEntitlement(g.entitlementId, "admin-1");
  const e = await dbSql<any[]>`SELECT id FROM user_package_entitlements WHERE id = ${g.entitlementId}::uuid`;
  expect(e.length).toBe(0);
});
```

- [ ] **Step 2: Run → fail (fonksiyonlar yok)**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: FAIL — `adminCancelEntitlement is not a function`.

- [ ] **Step 3: Fonksiyonları ekle**

```ts
export type RefundMode = "full" | "partial" | "none";
export interface AdminMoneyResult { refundedTL: number; newBalanceTL: number; }

/** Ortak iade çekirdeği: idempotent bakiye+iade tx (tek transaction). amount<=0 → iade yok. */
async function doRefund(txSql: any, userId: string, amount: number, idemKey: string, aciklama: string): Promise<{ refundedTL: number; newBalanceTL: number }> {
  if (!(amount > 0)) {
    const b = await txSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid LIMIT 1`;
    return { refundedTL: 0, newBalanceTL: Number(b[0]?.bakiye_tl ?? 0) };
  }
  const dup = await txSql<{ id: string }[]>`SELECT id FROM transactions WHERE idempotency_key = ${idemKey} LIMIT 1`;
  if (dup.length) {
    const b = await txSql<{ bakiye_tl: string }[]>`SELECT bakiye_tl FROM users WHERE id = ${userId}::uuid LIMIT 1`;
    return { refundedTL: 0, newBalanceTL: Number(b[0]?.bakiye_tl ?? 0) }; // zaten iade edildi
  }
  const upd = await txSql<{ bakiye_tl: string; email: string }[]>`
    UPDATE users SET bakiye_tl = bakiye_tl + ${amount}::numeric, updated_at = now()
    WHERE id = ${userId}::uuid RETURNING bakiye_tl, email`;
  if (!upd.length) throw new AppError(404, "Kullanıcı bulunamadı");
  const newBalance = Number(upd[0].bakiye_tl);
  await txSql`
    INSERT INTO transactions (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
    VALUES (${userId}::uuid, ${upd[0].email}, 'iade', ${amount}::numeric,
            ${(newBalance - amount).toFixed(4)}::numeric, ${newBalance.toFixed(4)}::numeric, ${aciklama}, 'bakiye', ${idemKey})`;
  return { refundedTL: amount, newBalanceTL: newBalance };
}

/** Entitlement'ın satın-alma tutarını (tam-iade için) çöz. */
async function resolveFullAmount(txSql: any, entId: string): Promise<{ userId: string; amount: number; status: string }> {
  const rows = await txSql<any[]>`
    SELECT e.user_id, e.status, t.miktar_tl
    FROM user_package_entitlements e LEFT JOIN transactions t ON t.id = e.purchase_transaction_id
    WHERE e.id = ${entId}::uuid LIMIT 1 FOR UPDATE OF e`;
  if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
  return { userId: rows[0].user_id, amount: Math.abs(Number(rows[0].miktar_tl) || 0), status: rows[0].status };
}

/** İptal (+iade seçimi): status=cancelled + opsiyonel iade. İdempotent (admin_cancel_<entId>). */
export async function adminCancelEntitlement(entId: string, refund: RefundMode, amountTL: number | undefined, _adminId: string, note: string): Promise<AdminMoneyResult> {
  if (!note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  return await dbSql.begin(async (txSql) => {
    const { userId, amount: fullAmount } = await resolveFullAmount(txSql, entId);
    await txSql`UPDATE user_package_entitlements SET status = 'cancelled', expires_at = now(), updated_at = now() WHERE id = ${entId}::uuid AND status <> 'cancelled'`;
    let toRefund = 0;
    if (refund === "full") toRefund = fullAmount;
    else if (refund === "partial") { toRefund = Number(amountTL); if (!(toRefund > 0)) throw new AppError(400, "Kısmi iade tutarı > 0 olmalı"); }
    return await doRefund(txSql, userId, toRefund, "admin_cancel_" + entId, "Paket iptal iadesi — " + note);
  });
}

/** Standalone iade: paket AKTİF kalır, sadece para iade. Günde 1 (admin_refund_<entId>_<gün>). */
export async function adminRefundEntitlement(entId: string, refund: Exclude<RefundMode, "none">, amountTL: number | undefined, _adminId: string, note: string): Promise<AdminMoneyResult> {
  if (!note?.trim()) throw new AppError(400, "Audit notu zorunlu");
  return await dbSql.begin(async (txSql) => {
    const { userId, amount: fullAmount } = await resolveFullAmount(txSql, entId);
    const toRefund = refund === "full" ? fullAmount : Number(amountTL);
    if (!(toRefund > 0)) throw new AppError(400, "İade tutarı > 0 olmalı");
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return await doRefund(txSql, userId, toRefund, "admin_refund_" + entId + "_" + day, "Paket iadesi — " + note);
  });
}

/** Hard delete (yanlış/test kaydı). Geçmiş kalmaz; transactions (FK soft) korunur. */
export async function adminDeleteEntitlement(entId: string, _adminId: string): Promise<{ ok: true }> {
  const rows = await dbSql<{ id: string }[]>`DELETE FROM user_package_entitlements WHERE id = ${entId}::uuid RETURNING id`;
  if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
  return { ok: true };
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/admin-entitlement-service.ts src/server/services/__tests__/admin-entitlement-service.itest.ts
git commit -m "feat(admin): cancel/refund/delete entitlement + itest"
```

### Task 5: adminRenewEntitlement (gift/balance)

**Files:**
- Modify: `src/server/services/admin-entitlement-service.ts`
- Modify: `src/server/services/__tests__/admin-entitlement-service.itest.ts`

- [ ] **Step 1: Failing itest yaz**

```ts
import { adminRenewEntitlement } from "../admin-entitlement-service.js";

it("renew gift: aynı paketten YENİ satır, bakiye sabit", async () => {
  const userId = await mkUser(300);
  const g = await adminGrantEntitlement({ userId, packageId: "test-grant-pkg", charge: "gift", adminId: "a", note: "n", dailyLimit: 100, durationDays: 30 });
  const r = await adminRenewEntitlement(g.entitlementId, "gift", undefined, "admin-1", "yenile");
  expect(r.newBalanceTL).toBe(300);
  expect(r.entitlementId).not.toBe(g.entitlementId); // yeni satır
  const cnt = await dbSql<any[]>`SELECT count(*)::int AS n FROM user_package_entitlements WHERE user_id = ${userId}::uuid AND package_id = 'test-grant-pkg'`;
  expect(cnt[0].n).toBe(2);
});
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: FAIL — `adminRenewEntitlement is not a function`.

- [ ] **Step 3: Fonksiyonu ekle (mevcut adminGrantEntitlement'i çağırır)**

```ts
/** Admin yenileme: entitlement'ın paketinden YENİ satır (snapshot limit/süre korunur). gift = ücretsiz. */
export async function adminRenewEntitlement(entId: string, charge: "gift" | "balance", chargeTL: number | undefined, adminId: string, note: string): Promise<AdminGrantResult> {
  const rows = await dbSql<any[]>`
    SELECT e.user_id, e.package_id, e.daily_limit_snapshot, e.activated_at, e.expires_at
    FROM user_package_entitlements e WHERE e.id = ${entId}::uuid LIMIT 1`;
  if (!rows.length) throw new AppError(404, "Paket (entitlement) bulunamadı");
  const e = rows[0];
  const ms = new Date(e.expires_at).getTime() - new Date(e.activated_at).getTime();
  const days = Math.max(1, Math.round(ms / 86_400_000));
  return adminGrantEntitlement({
    userId: e.user_id, packageId: e.package_id, dailyLimit: Number(e.daily_limit_snapshot), durationDays: days,
    charge, chargeTL, adminId, note: "Yenileme: " + note,
  });
}
```

- [ ] **Step 4: Run → pass; sonra TÜM unit suite regresyon**

Run: `npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts`
Expected: PASS (6 tests).
Run: `npm test`
Expected: tüm unit testler PASS (yeni dosya itest-only; unit suite kırılmamalı).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/admin-entitlement-service.ts src/server/services/__tests__/admin-entitlement-service.itest.ts
git commit -m "feat(admin): adminRenewEntitlement + itest"
```

---

## Faz 2 — Route katmanı (admin.ts) + supertest

### Task 6: 6 owner-only route + import

**Files:**
- Modify: `src/server/routes/admin.ts` (yeni route'lar; `account-delivery` import satırının yakınına ekleme)
- Test: `src/server/routes/__tests__/admin-entitlements.test.ts`

- [ ] **Step 1: Failing supertest yaz (yetki: token yok → 401)**

```ts
// src/server/routes/__tests__/admin-entitlements.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";

describe("admin entitlement routes", () => {
  const app = createApp();
  it("POST /api/admin/users/:id/entitlements auth'suz → 401", async () => {
    const res = await request(app).post("/api/admin/users/00000000-0000-0000-0000-000000000000/entitlements").send({ packageId: "x", charge: "gift", note: "n" });
    expect(res.status).toBe(401);
  });
  it("PATCH /api/admin/entitlements/:id auth'suz → 401", async () => {
    const res = await request(app).patch("/api/admin/entitlements/00000000-0000-0000-0000-000000000000").send({ paused: true });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run → fail (route yok → 404 değil 401 bekleniyor; route eklenince 401 olur)**

Run: `npx vitest run src/server/routes/__tests__/admin-entitlements.test.ts`
Expected: FAIL — route yokken catch-all 404 döner, test 401 bekler.

- [ ] **Step 3: Import ekle (admin.ts satır ~46 yakını, account-delivery import'unun altına)**

```ts
import {
  adminGrantEntitlement, adminUpdateEntitlement, adminCancelEntitlement,
  adminRefundEntitlement, adminRenewEntitlement, adminDeleteEntitlement,
  type RefundMode,
} from "../services/admin-entitlement-service.js";
```

- [ ] **Step 4: Route'ları ekle (admin.ts'te `/delivery-orders/:id/cancel` route'unun ALTINA, satır ~1665 civarı)**

```ts
// ── Admin: kullanıcı paket (entitlement) yönetimi (owner-only) ──────────────
router.post("/users/:id/entitlements", async (req, res, next) => {
  try {
    if (!requireOwner(req, res)) return;
    const b = req.body as { packageId?: string; dailyLimit?: number; durationDays?: number; charge?: "gift" | "balance"; chargeTL?: number; note?: string; idempotencyKey?: string };
    if (!b?.packageId) return res.status(400).json({ error: "packageId zorunlu" });
    if (b.charge !== "gift" && b.charge !== "balance") return res.status(400).json({ error: "charge 'gift' veya 'balance' olmalı" });
    if (!b.note?.trim()) return res.status(400).json({ error: "Audit notu zorunlu" });
    const result = await adminGrantEntitlement({
      userId: req.params.id, packageId: b.packageId, dailyLimit: b.dailyLimit, durationDays: b.durationDays,
      charge: b.charge, chargeTL: b.chargeTL, adminId: req.user!.id, note: b.note, idempotencyKey: b.idempotencyKey,
    });
    await writeAudit("entitlement_grant", req.params.id, `${b.charge} paket ${b.packageId} (₺${result.chargedTL}) — ${b.note}`, req.user!.id);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.patch("/entitlements/:entId", async (req, res, next) => {
  try {
    if (!requireOwner(req, res)) return;
    const b = req.body as { dailyLimit?: number; remaining?: number; expiresAt?: string; paused?: boolean; status?: "active" | "cancelled"; note?: string };
    if (!b?.note?.trim()) return res.status(400).json({ error: "Audit notu zorunlu" });
    await adminUpdateEntitlement(req.params.entId, b, req.user!.id, b.note);
    await writeAudit("entitlement_update", req.params.entId, `${Object.keys(b).filter((k) => k !== "note").join(",")} — ${b.note}`, req.user!.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/entitlements/:entId/cancel", async (req, res, next) => {
  try {
    if (!requireOwner(req, res)) return;
    const b = req.body as { refund?: RefundMode; amountTL?: number; note?: string };
    const refund: RefundMode = b?.refund ?? "none";
    if (!b?.note?.trim()) return res.status(400).json({ error: "Audit notu zorunlu" });
    const result = await adminCancelEntitlement(req.params.entId, refund, b.amountTL, req.user!.id, b.note);
    await writeAudit("entitlement_cancel", req.params.entId, `iptal+${refund} iade ₺${result.refundedTL} — ${b.note}`, req.user!.id);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.post("/entitlements/:entId/refund", async (req, res, next) => {
  try {
    if (!requireOwner(req, res)) return;
    const b = req.body as { refund?: "full" | "partial"; amountTL?: number; note?: string };
    const refund = b?.refund ?? "partial";
    if (!b?.note?.trim()) return res.status(400).json({ error: "Audit notu zorunlu" });
    const result = await adminRefundEntitlement(req.params.entId, refund, b.amountTL, req.user!.id, b.note);
    await writeAudit("entitlement_refund", req.params.entId, `${refund} iade ₺${result.refundedTL} — ${b.note}`, req.user!.id);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.post("/entitlements/:entId/renew", async (req, res, next) => {
  try {
    if (!requireOwner(req, res)) return;
    const b = req.body as { charge?: "gift" | "balance"; chargeTL?: number; note?: string };
    if (b?.charge !== "gift" && b?.charge !== "balance") return res.status(400).json({ error: "charge 'gift' veya 'balance' olmalı" });
    if (!b.note?.trim()) return res.status(400).json({ error: "Audit notu zorunlu" });
    const result = await adminRenewEntitlement(req.params.entId, b.charge, b.chargeTL, req.user!.id, b.note);
    await writeAudit("entitlement_renew", req.params.entId, `${b.charge} yenile (₺${result.chargedTL}) — ${b.note}`, req.user!.id);
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.delete("/entitlements/:entId", async (req, res, next) => {
  try {
    if (!requireOwner(req, res)) return;
    await adminDeleteEntitlement(req.params.entId, req.user!.id);
    await writeAudit("entitlement_delete", req.params.entId, "Entitlement silindi", req.user!.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Run → pass (401 auth gate)**

Run: `npx vitest run src/server/routes/__tests__/admin-entitlements.test.ts`
Expected: PASS (2 tests). adminAuth token olmadan 401 döndürür.

- [ ] **Step 6: lint + tüm unit suite**

Run: `npm run lint && npm test`
Expected: tsc 0 hata; tüm unit testler PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/routes/admin.ts src/server/routes/__tests__/admin-entitlements.test.ts
git commit -m "feat(admin): owner-only entitlement yönetim route'ları + auth testi"
```

---

## Faz 3 — Frontend (yeni bileşen + minimal tab-admin entegrasyonu)

### Task 7: UserPackagesPanel bileşeni (liste + aksiyon menüsü + modallar)

**Files:**
- Create: `src/yapayzekalab/tab-admin-user-packages.jsx`

- [ ] **Step 1: Bileşen dosyasını oluştur**

```jsx
// src/yapayzekalab/tab-admin-user-packages.jsx
import React, { useState } from "react";
import { Caption } from "./shared.jsx";

const DURUM_META = {
  active: { label: "AKTİF", color: "#16a34a" },
  cancelled: { label: "İPTAL", color: "#dc2626" },
  expired: { label: "SÜRESİ DOLDU", color: "#6b7280" },
  revoked: { label: "İPTAL", color: "#dc2626" },
};
function durumMeta(s) { return DURUM_META[s] || { label: String(s || "").toUpperCase(), color: "#6b7280" }; }
function safeDate(d) { try { return d ? new Date(d).toLocaleDateString("tr-TR") : "—"; } catch { return "—"; } }

/**
 * Admin kullanıcı-detayında paket yönetimi.
 * props: userId, entitlements (detail.entitlements), token, adminRequest, packages (katalog), onChanged()
 */
export function UserPackagesPanel({ userId, entitlements, token, adminRequest, packages, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState(null); // {type:'add'|'edit'|'cancel'|'refund'|'renew', ent?}

  const call = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); onChanged && (await onChanged()); setModal(null); }
    catch (e) { setErr(e.message || "İşlem başarısız"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Paketler</div>
          <Caption>Aktif + geçmiş paketler — düzenle / iptal / iade / yenile / sil</Caption>
        </div>
        <button disabled={busy} onClick={() => setModal({ type: "add" })}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #4f46e5", background: "#4f46e5", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
          + Paket Ekle
        </button>
      </div>
      {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 6 }}>{err}</div>}

      {(entitlements || []).map((ent) => {
        const meta = durumMeta(ent.status || ent.durum);
        const unit = ent.cfLazy ? "ünite" : "istek";
        return (
          <div key={ent.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px,1fr) 100px 160px 150px auto", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line, #eee)" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{ent.paketAdi}</div>
              <div style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{ent.kategori}</div>
            </div>
            <span style={{ color: meta.color, fontWeight: 600, fontSize: 12 }}>{meta.label}</span>
            <div style={{ fontSize: 12 }}>{Number(ent.gunlukLimit) > 0 ? `${ent.kalan} / ${ent.gunlukLimit} ${unit}` : "—"}</div>
            <div style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{safeDate(ent.activatedAt)} → {safeDate(ent.expiresAt)}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <ActBtn onClick={() => setModal({ type: "edit", ent })}>Değiştir</ActBtn>
              <ActBtn onClick={() => call(() => adminRequest(`/api/admin/entitlements/${ent.id}`, token, { method: "PATCH", body: { paused: !ent.paused, note: ent.paused ? "devam" : "duraklat" } }))}>{ent.paused ? "Devam" : "Duraklat"}</ActBtn>
              <ActBtn onClick={() => setModal({ type: "renew", ent })}>Yenile</ActBtn>
              <ActBtn onClick={() => setModal({ type: "cancel", ent })}>İptal</ActBtn>
              <ActBtn onClick={() => setModal({ type: "refund", ent })}>İade</ActBtn>
              <ActBtn danger onClick={() => { if (window.confirm("Bu paket kaydı tamamen SİLİNECEK (geçmiş kalmaz). Emin misin?")) call(() => adminRequest(`/api/admin/entitlements/${ent.id}`, token, { method: "DELETE" })); }}>Sil</ActBtn>
            </div>
          </div>
        );
      })}
      {(!entitlements || !entitlements.length) && <Caption>Paket yok.</Caption>}

      {modal && <PackageModal modal={modal} packages={packages} busy={busy} err={err}
        onClose={() => setModal(null)}
        onSubmit={(payload) => {
          if (modal.type === "add") return call(() => adminRequest(`/api/admin/users/${userId}/entitlements`, token, { method: "POST", body: payload }));
          if (modal.type === "edit") return call(() => adminRequest(`/api/admin/entitlements/${modal.ent.id}`, token, { method: "PATCH", body: payload }));
          if (modal.type === "cancel") return call(() => adminRequest(`/api/admin/entitlements/${modal.ent.id}/cancel`, token, { method: "POST", body: payload }));
          if (modal.type === "refund") return call(() => adminRequest(`/api/admin/entitlements/${modal.ent.id}/refund`, token, { method: "POST", body: payload }));
          if (modal.type === "renew") return call(() => adminRequest(`/api/admin/entitlements/${modal.ent.id}/renew`, token, { method: "POST", body: payload }));
        }} />}
    </div>
  );
}

function ActBtn({ children, onClick, danger }) {
  return <button onClick={onClick} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${danger ? "#dc2626" : "var(--line,#ccc)"}`, background: "transparent", color: danger ? "#dc2626" : "var(--ink-1,#111)", cursor: "pointer", fontSize: 11 }}>{children}</button>;
}
```

- [ ] **Step 2: Modal bileşenini aynı dosyaya ekle (form alanları modal.type'a göre)**

```jsx
function Field({ label, children }) {
  return <label style={{ display: "block", marginBottom: 8, fontSize: 12 }}><div style={{ marginBottom: 2, color: "var(--ink-2,#444)" }}>{label}</div>{children}</label>;
}
const inputStyle = { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line,#ccc)", fontSize: 13 };

function PackageModal({ modal, packages, busy, err, onClose, onSubmit }) {
  const [pkgId, setPkgId] = useState((packages && packages[0] && packages[0].id) || "");
  const [dailyLimit, setDailyLimit] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [charge, setCharge] = useState("gift");
  const [chargeTL, setChargeTL] = useState("");
  const [remaining, setRemaining] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [refund, setRefund] = useState("full");
  const [amountTL, setAmountTL] = useState("");
  const [note, setNote] = useState("");

  const titles = { add: "Paket Ekle", edit: "Paketi Değiştir", cancel: "Paketi İptal Et", refund: "İade", renew: "Paketi Yenile" };
  const num = (v) => (v === "" ? undefined : Number(v));

  const submit = () => {
    if (!note.trim()) return; // route da reddeder
    if (modal.type === "add") return onSubmit({ packageId: pkgId, dailyLimit: num(dailyLimit), durationDays: num(durationDays), charge, chargeTL: charge === "balance" ? num(chargeTL) : undefined, note });
    if (modal.type === "edit") return onSubmit({ dailyLimit: num(dailyLimit), remaining: num(remaining), expiresAt: expiresAt || undefined, note });
    if (modal.type === "cancel") return onSubmit({ refund, amountTL: refund === "partial" ? num(amountTL) : undefined, note });
    if (modal.type === "refund") return onSubmit({ refund, amountTL: refund === "partial" ? num(amountTL) : undefined, note });
    if (modal.type === "renew") return onSubmit({ charge, chargeTL: charge === "balance" ? num(chargeTL) : undefined, note });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-1,#fff)", borderRadius: 12, padding: 20, width: 360, maxWidth: "92vw" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{titles[modal.type]}</div>

        {modal.type === "add" && (<>
          <Field label="Paket (şablon — modeller/CF ondan)"><select style={inputStyle} value={pkgId} onChange={(e) => setPkgId(e.target.value)}>{(packages || []).map((p) => <option key={p.id} value={p.id}>{p.ad} ({p.kategori})</option>)}</select></Field>
          <Field label="Günlük limit / kota (boş = paket varsayılanı)"><input style={inputStyle} type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="örn. 500" /></Field>
          <Field label="Süre (gün, boş = paket varsayılanı)"><input style={inputStyle} type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="örn. 30" /></Field>
        </>)}

        {modal.type === "edit" && (<>
          <Field label="Günlük limit (boş = değişmez)"><input style={inputStyle} type="number" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} /></Field>
          <Field label="Kalan kota (sadece CF olmayan; boş = değişmez)"><input style={inputStyle} type="number" value={remaining} onChange={(e) => setRemaining(e.target.value)} /></Field>
          <Field label="Bitiş tarihi (boş = değişmez)"><input style={inputStyle} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value ? new Date(e.target.value).toISOString() : "")} /></Field>
        </>)}

        {(modal.type === "cancel" || modal.type === "refund") && (<>
          <Field label="İade"><select style={inputStyle} value={refund} onChange={(e) => setRefund(e.target.value)}>
            <option value="full">Tam fiyat</option>
            <option value="partial">Kısmi (elle tutar)</option>
            {modal.type === "cancel" && <option value="none">İade yok (sadece iptal)</option>}
          </select></Field>
          {refund === "partial" && <Field label="İade tutarı (₺)"><input style={inputStyle} type="number" value={amountTL} onChange={(e) => setAmountTL(e.target.value)} /></Field>}
        </>)}

        {(modal.type === "add" || modal.type === "renew") && (<>
          <Field label="Ücretlendirme"><select style={inputStyle} value={charge} onChange={(e) => setCharge(e.target.value)}>
            <option value="gift">Ücretsiz hediye</option>
            <option value="balance">Bakiyeden tahsil et</option>
          </select></Field>
          {charge === "balance" && <Field label="Tahsil tutarı (₺)"><input style={inputStyle} type="number" value={chargeTL} onChange={(e) => setChargeTL(e.target.value)} /></Field>}
        </>)}

        <Field label="Not (zorunlu — audit)"><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="neden?" /></Field>
        {err && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line,#ccc)", background: "transparent", cursor: "pointer" }}>Vazgeç</button>
          <button onClick={submit} disabled={busy || !note.trim()} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #4f46e5", background: "#4f46e5", color: "#fff", cursor: "pointer", fontWeight: 600 }}>{busy ? "..." : "Uygula"}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: lint (tsc JSX'i kapsamaz ama import çözümü için build smoke)**

Run: `npm run lint`
Expected: tsc 0 hata (yeni .jsx tsc kapsamı dışı; mevcut TS kırılmamalı).

- [ ] **Step 4: Commit**

```bash
git add src/yapayzekalab/tab-admin-user-packages.jsx
git commit -m "feat(admin-ui): UserPackagesPanel bileşeni (paket ekle/değiştir/iptal/iade/yenile/sil)"
```

### Task 8: tab-admin.jsx entegrasyonu (minimal diff)

**Files:**
- Modify: `src/yapayzekalab/tab-admin.jsx` (import + "Paketler" bloğunun yerine bileşen)

- [ ] **Step 1: Import ekle (tab-admin.jsx üst import bloğuna)**

```jsx
import { UserPackagesPanel } from "./tab-admin-user-packages.jsx";
```

- [ ] **Step 2: Detay panelindeki "Paketler" render bloğunu değiştir (mevcut ~665-699 satır)**

Mevcut `detail.entitlements.map(...)` ile "Paketler" başlığını içeren bloğu şu tek render ile değiştir (katalog `packages` state'i admin zaten "Paketler" sekmesinde `GET /api/admin/packages`'ten çekiyor; yoksa `adminRequest('/api/admin/packages', token)` ile bir kez yükle ve state'te tut):

```jsx
<UserPackagesPanel
  userId={u.id}
  entitlements={detail.entitlements}
  token={getAdminToken()}
  adminRequest={adminRequest}
  packages={adminPackages /* GET /api/admin/packages sonucu; satın-alınabilir + tüm paketler */}
  onChanged={() => loadDetail(u.id)}
/>
```

Not: `loadDetail` mevcut detay-yükleme fonksiyonudur (toggleDetail içinde çağrılan). `adminPackages` yoksa: bileşen mount'unda `useEffect` ile `adminRequest('/api/admin/packages', getAdminToken())` çekilip `packages` prop'una geçilebilir; alternatif olarak `tab-admin.jsx`'te bir kez yükleyip cache'le.

- [ ] **Step 3: Build smoke (panel + server birlikte derlenir)**

Run: `npm run build`
Expected: `dist/assets/index-*.js` üretilir, hata yok. (Lokal v25 GC `ERR_INVALID_STATE` verirse `NODE_OPTIONS="--max-old-space-size=8192" npm run build` ile tekrar dene.)

- [ ] **Step 4: scan:public (sızıntı yok)**

Run: `npm run scan:public`
Expected: PASS — provider/maliyet sızıntısı yok.

- [ ] **Step 5: Commit**

```bash
git add src/yapayzekalab/tab-admin.jsx
git commit -m "feat(admin-ui): kullanıcı detayına UserPackagesPanel entegrasyonu"
```

---

## Faz 4 — Doğrulama + kontaminasyon-güvenli deploy

### Task 9: Tam yerel doğrulama

- [ ] **Step 1: Lint + unit + itest + build + scan**

```bash
npm run lint && npm test \
  && npx vitest run --config vitest.itest.config.ts src/server/services/__tests__/admin-entitlement-service.itest.ts \
  && npm run build && npm run scan:public
```
Expected: hepsi PASS.

- [ ] **Step 2: 3-QA (≥2 PASS) — agent-team workflow**

`yeniapi/.kiro/steering/agent-team-workflow.md` uyarınca 3 QA ajanı LOKAL diff üzerinde koşar (ajanlar VPS'e ssh ATMAZ — fail2ban; lokal dosyaları ver). Para-yolu odak: idempotency (çift iade/çift tahsil yok), owner-only yetki, CF-remaining reddi, atomiklik.

### Task 10: Kontaminasyon-güvenli izole deploy (yzapi-vps)

**⚠️ `LOCAL_SRC=~/yzapi bash scripts/sync-deploy.sh` YASAK** — `entitlement-service.ts`/`proxy.ts`/`codefast-provisioning-service.ts` canlıda lokal main'in ÖNÜNDE (R-3 + CF havuz fix). Bu plan o 3 dosyaya DOKUNMAZ ama `sync-deploy.sh` tüm working tree'yi gönderir → onları GERİ ALIR. Bu yüzden **hedeflenmiş (targeted) rsync** ile YALNIZ kendi dosyalarımız gönderilir.

Gönderilecek YENİ dosyalar (temiz, pre-kirli değil): `src/server/services/admin-entitlement-service.ts`, `src/yapayzekalab/tab-admin-user-packages.jsx`, test dosyaları (testler deploy'a gerekmez — opsiyonel).
Gönderilecek KONTAMİNE dosyalar (canlıdan indir + hunk uygula): `src/server/routes/admin.ts`, `src/yapayzekalab/tab-admin.jsx`.

- [ ] **Step 1: Canlı kontamine dosyaları indir**

```bash
mkdir -p /tmp/yz-live
scp yzapi-vps:/opt/turkapiprojesi/src/server/routes/admin.ts /tmp/yz-live/admin.ts
scp yzapi-vps:/opt/turkapiprojesi/src/yapayzekalab/tab-admin.jsx /tmp/yz-live/tab-admin.jsx
```

- [ ] **Step 2: Sadece kendi hunk'larını canlı kopyaya uygula**

`/tmp/yz-live/admin.ts`'e Task 6'daki import + 6 route'u Edit ile ekle (working-tree admin.ts'i değil — o admin-live-state ile kontamine). `/tmp/yz-live/tab-admin.jsx`'e Task 8'deki import + tek render değişikliğini uygula. Yeni dosyaları stage dizinine kopyala:

```bash
mkdir -p /tmp/yz-stage/src/server/services /tmp/yz-stage/src/server/routes /tmp/yz-stage/src/yapayzekalab
cp src/server/services/admin-entitlement-service.ts /tmp/yz-stage/src/server/services/
cp src/yapayzekalab/tab-admin-user-packages.jsx /tmp/yz-stage/src/yapayzekalab/
cp /tmp/yz-live/admin.ts /tmp/yz-stage/src/server/routes/admin.ts
cp /tmp/yz-live/tab-admin.jsx /tmp/yz-stage/src/yapayzekalab/tab-admin.jsx
```

- [ ] **Step 3: İzolasyon kanıtı (YALNIZ 4 dosya görünmeli)**

```bash
rsync -rlzn --checksum --itemize-changes /tmp/yz-stage/ yzapi-vps:/opt/turkapiprojesi/
```
Expected: çıktıda SADECE `admin-entitlement-service.ts`, `tab-admin-user-packages.jsx`, `admin.ts`, `tab-admin.jsx`. Başka dosya görünürse DUR.

- [ ] **Step 4: Canlı yedek + gerçek rsync**

```bash
ssh yzapi-vps 'cd /opt/turkapiprojesi && mkdir -p .deploy/admin-pkg-mgmt-backup && cp --parents src/server/routes/admin.ts src/yapayzekalab/tab-admin.jsx .deploy/admin-pkg-mgmt-backup/ 2>/dev/null; true'
rsync -rlz --checksum /tmp/yz-stage/ yzapi-vps:/opt/turkapiprojesi/
```

- [ ] **Step 5: Sunucu-içi gate (elle)**

```bash
ssh yzapi-vps 'cd /opt/turkapiprojesi && npm run lint && npm test && npm run build && npm run scan:public && systemctl restart turkapiprojesi && sleep 3 && curl -fsS http://127.0.0.1:4568/health'
```
Expected: lint 0 hata, testler PASS, build OK, scan temiz, health 200. (db:migrate gerekmiyor — migration YOK.)

- [ ] **Step 6: Canlı duman testi (owner token ile)**

Owner panelinden bir kullanıcı detayını aç → "+ Paket Ekle" (ücretsiz hediye, küçük limit) → satır görünür → "Değiştir" ile limit/kalan değiştir → "İptal" (iade yok) → "Sil". Her adımda detay yenilenmeli; ledger'da `admin_hediye`/`iade` kayıtları doğru. (Gerçek para etkisi olan adımları gerçek müşteride YAPMA — test kullanıcısı kullan.)

- [ ] **Step 7: Çift onay + deploy-guard**

`deploy-guard.js` modunu kontrol et; Ufuk'un çift-OK'u alınmadan canlı restart yapma. Targeted rsync **manifest'i GÜNCELLEMEZ** → gerçek canlı durumu memory notuna yaz (yeni dosyalar + admin.ts/tab-admin.jsx hunk'ları).

---

## Self-Review (yazıldıktan sonra)

**Spec kapsamı:** Ekle (gift/balance, katalog+override) → Task 1/2/7/8 ✓. Değiştir (limit/kalan/bitiş/durum) → Task 3/7 ✓. İptal (+iade) → Task 4/6/7 ✓. İade (tek başına) → Task 4/6/7 ✓. Yenile (gift/balance) → Task 5/6/7 ✓. Sil → Task 4/6/7 ✓. Owner-only → fail-closed RBAC + `requireOwner` (Task 6) ✓. Atomik+idempotent+audit → service `dbSql.begin`/idempotency + `writeAudit` (Task 4/6) ✓. CF kalan-kota kapalı → Task 3 (400) ✓. Migration yok → ✓ (status/tip text). Kontaminasyon-güvenli deploy → Task 10 ✓.

**Placeholder taraması:** Yok — her step çalışır kod/komut içerir.

**Tip tutarlılığı:** `adminGrantEntitlement`/`adminUpdateEntitlement`/`adminCancelEntitlement`/`adminRefundEntitlement`/`adminRenewEntitlement`/`adminDeleteEntitlement` adları service (Faz 1) → route import (Task 6) → frontend `adminRequest` path'leri (Task 7) boyunca tutarlı. `RefundMode`/`AdminGrantParams` tek tanım, route'ta yeniden kullanılır.

**Açık nokta:** Frontend `packages` prop kaynağı (`adminPackages`) tab-admin.jsx'te zaten `GET /api/admin/packages` ile yükleniyorsa onu geç; yoksa Task 8 Step 2 notundaki `useEffect` fallback'ini bileşene ekle.
