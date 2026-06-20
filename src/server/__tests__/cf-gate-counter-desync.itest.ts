// Regression: CF reseller package counter-desync.
// Bug: gate AND-s `requests_today < daily_limit_snapshot` with the CF-pool clause, but the panel
// shows cf_remaining. For a CF package daily_limit_snapshot is the CF LIFETIME size, so the per-UTC-day
// counter wrongly becomes a lifetime cap → once requests_today hits daily_limit the package locks
// (HTTP 402 "Günlük istek limitiniz doldu") while the panel still shows units → customer 402-with-units.
// Fix: CF packages (cf_units_ordered>0) gate SOLELY on the CF-pool clause (cf_remaining); the daily
// request-counter cap applies ONLY to non-CF (cf_units_ordered=0) packages. Non-CF behavior unchanged;
// the 2026-06-19 deadlock-fix CF-pool clause (incl. 10-min stale-0 self-heal) preserved verbatim.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { checkPackageCoverage, tryReservePackageSlot, listUserPackagesForPanel } from "../services/entitlement-service.js";

const UID = "44444444-4444-4444-4444-444444444444";
const PKG_CF = "cf-gate-itest-cf";
const PKG_PLAIN = "cf-gate-itest-plain";
const MODEL = "gpt-5.5";

type EntOpts = {
  pkg: string;
  dailyLimit: number;
  requestsToday: number;
  cfUnitsOrdered: number; // 0 = non-CF (eski yol); >0 = CF lazy
  cfRemaining: number | null;
  cfRemainingAtMinutesAgo?: number; // undefined → now()
};

async function insertEnt(o: EntOpts): Promise<string> {
  const cfAtExpr =
    o.cfRemainingAtMinutesAgo == null
      ? dbSql`now()`
      : dbSql`now() - (${o.cfRemainingAtMinutesAgo} * interval '1 minute')`;
  const rows = await dbSql<{ id: string }[]>`
    INSERT INTO user_package_entitlements
      (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot, activated_at, expires_at,
       status, requests_today, last_reset_date, cf_units_ordered, cf_remaining, cf_remaining_at)
    VALUES
      (${UID}::uuid, ${o.pkg}, ${o.dailyLimit}, ${JSON.stringify([MODEL])}::jsonb, now(), now() + interval '7 days',
       'active', ${o.requestsToday}, CURRENT_DATE, ${o.cfUnitsOrdered}, ${o.cfRemaining},
       ${o.cfRemaining == null ? null : cfAtExpr})
    RETURNING id
  `;
  return rows[0].id;
}

async function reqToday(id: string): Promise<number> {
  const r = await dbSql<{ requests_today: number }[]>`SELECT requests_today FROM user_package_entitlements WHERE id = ${id}::uuid`;
  return Number(r[0].requests_today);
}

async function clearEnts() {
  await dbSql`DELETE FROM usage_records WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM user_package_entitlements WHERE user_id = ${UID}::uuid`;
}

async function insertUsage(entId: string, status: string, n: number) {
  for (let i = 0; i < n; i++) {
    await dbSql`INSERT INTO usage_records (user_id, model_id, type, status, billed_via, entitlement_id)
                VALUES (${UID}::uuid, ${MODEL}, 'Metin', ${status}, 'package', ${entId}::uuid)`;
  }
}

beforeAll(async () => {
  await clearEnts();
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id IN (${PKG_CF}, ${PKG_PLAIN})`;
  await db.insert(users).values({ id: UID, email: "cf-gate-itest@test.local", adSoyad: "CF Gate Itest", bakiyeTL: "0.0000", durum: "aktif", paygMode: false } as any);
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista, cf_catalog_id, cf_api_slug, cf_manual)
    VALUES (${PKG_CF}, 'CF Gate', 'CodeFast', '', 'request_limit', 120, 7, ${JSON.stringify([MODEL])}::jsonb, 40, true, true, 'cat-cf', 'codex-api', false)
  `;
  await dbSql`
    INSERT INTO packages (id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun, allowed_models, fiyat_tl, enabled, satista)
    VALUES (${PKG_PLAIN}, 'Plain Daily', 'GPT', '', 'request_limit', 50, 7, ${JSON.stringify([MODEL])}::jsonb, 40, true, true)
  `;
});

afterAll(async () => {
  await clearEnts();
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
  await dbSql`DELETE FROM packages WHERE id IN (${PKG_CF}, ${PKG_PLAIN})`;
});

beforeEach(clearEnts);

describe("CF package gate counter-desync (real PG)", () => {
  it("CF package: requests_today AT daily_limit but cf_remaining>0 → COVERED (not locked by the daily counter)", async () => {
    await insertEnt({ pkg: PKG_CF, dailyLimit: 120, requestsToday: 120, cfUnitsOrdered: 120, cfRemaining: 120 });
    expect(await checkPackageCoverage(UID, MODEL)).toBe(true);
    const res = await tryReservePackageSlot(UID, MODEL);
    expect(res.covered).toBe(true);
  });

  it("non-CF package: requests_today AT daily_limit → NOT covered (per-day cap preserved, no regression)", async () => {
    await insertEnt({ pkg: PKG_PLAIN, dailyLimit: 50, requestsToday: 50, cfUnitsOrdered: 0, cfRemaining: null });
    expect(await checkPackageCoverage(UID, MODEL)).toBe(false);
    const res = await tryReservePackageSlot(UID, MODEL);
    expect(res.covered).toBe(false);
  });

  it("CF package: cf_remaining=0 FRESH → NOT covered (CF truly exhausted; deadlock-fix block preserved)", async () => {
    await insertEnt({ pkg: PKG_CF, dailyLimit: 120, requestsToday: 5, cfUnitsOrdered: 120, cfRemaining: 0, cfRemainingAtMinutesAgo: 1 });
    expect(await checkPackageCoverage(UID, MODEL)).toBe(false);
    expect((await tryReservePackageSlot(UID, MODEL)).covered).toBe(false);
  });

  it("CF package: cf_remaining=0 STALE (>10min) → COVERED (self-heal supap preserved)", async () => {
    await insertEnt({ pkg: PKG_CF, dailyLimit: 120, requestsToday: 5, cfUnitsOrdered: 120, cfRemaining: 0, cfRemainingAtMinutesAgo: 20 });
    expect(await checkPackageCoverage(UID, MODEL)).toBe(true);
    expect((await tryReservePackageSlot(UID, MODEL)).covered).toBe(true);
  });

  it("tryReservePackageSlot still increments requests_today for the unlocked CF package (telemetry)", async () => {
    const id = await insertEnt({ pkg: PKG_CF, dailyLimit: 120, requestsToday: 120, cfUnitsOrdered: 120, cfRemaining: 30 });
    const res = await tryReservePackageSlot(UID, MODEL);
    expect(res.covered).toBe(true);
    expect(res.entitlementId).toBe(id);
    expect(await reqToday(id)).toBe(121); // increments past the daily_limit (no longer a CF gate)
  });
});

describe("CF panel display reflects real usage when mirror is stale (real PG)", () => {
  async function panelFor(entId: string) {
    const all = await listUserPackagesForPanel(UID);
    return all.find((p) => p.id === entId)!;
  }

  it("stale mirror (cf_remaining==cf_units_ordered → cfConsumed=0) + 40 success → kullanilan=40, NOT 0", async () => {
    const id = await insertEnt({ pkg: PKG_CF, dailyLimit: 120, requestsToday: 3, cfUnitsOrdered: 120, cfRemaining: 120 });
    await insertUsage(id, "success", 40);
    await insertUsage(id, "error", 5); // hatalar sayılmaz
    const p = await panelFor(id);
    expect(p.kullanilan).toBe(40);
    expect(p.kalan).toBe(80);
  });

  it("successes exceed limit → kullanilan clamped to limit, kalan=0", async () => {
    const id = await insertEnt({ pkg: PKG_CF, dailyLimit: 120, requestsToday: 0, cfUnitsOrdered: 120, cfRemaining: 120 });
    await insertUsage(id, "success", 200);
    const p = await panelFor(id);
    expect(p.kullanilan).toBe(120);
    expect(p.kalan).toBe(0);
  });

  it("fresh mirror with CF-consumption > successes → trusts CF mirror", async () => {
    const id = await insertEnt({ pkg: PKG_CF, dailyLimit: 200, requestsToday: 5, cfUnitsOrdered: 200, cfRemaining: 50 });
    await insertUsage(id, "success", 10);
    const p = await panelFor(id);
    expect(p.kullanilan).toBe(150); // 200-50 CF consumed dominates 10 successes
    expect(p.kalan).toBe(50);
  });

  it("truly unused CF package (0 success, mirror NULL) → kullanilan=0 (no false consumption)", async () => {
    const id = await insertEnt({ pkg: PKG_CF, dailyLimit: 100, requestsToday: 0, cfUnitsOrdered: 100, cfRemaining: null });
    const p = await panelFor(id);
    expect(p.kullanilan).toBe(0);
    expect(p.kalan).toBe(100);
  });
});
