/**
 * signup-bonus INTEGRATION test (real Postgres).
 *
 * Yeni üye deneme bonusu (signup-bonus-service) için gerçek DB davranışını
 * doğrular. `npm run itest` ile çalışır (db:up + migrate 0014 gerekir).
 *
 * KANITLAR:
 *   1. DISABLED: system_config.signup_bonus_enabled=false iken bonus verilmez,
 *      bakiye değişmez, grant satırı oluşmaz.
 *   2. GRANTED: enabled iken yeni kullanıcıya tam tutar eklenir, transactions'a
 *      tip='bonus' pozitif satır yazılır, grant satırı + transaction_id bağlanır.
 *   3. TEK SEFER: aynı kullanıcıya ikinci çağrı 'already_granted' döner; bakiye
 *      ve transaction sayısı DEĞİŞMEZ (idempotent).
 *   4. DRIFT=0: bonus alan kullanıcı per-user reconciliation drift'ine 0 katkı
 *      yapar (bakiye == ledger). Global drift bonus işleminden etkilenmez.
 *   5. IP LİMİTİ: aynı ip_hash ile signup_bonus_max_per_ip kadar bonus verildikten
 *      sonra yeni kullanıcı 'ip_limit' alır, bakiyesi değişmez.
 *   6. RACE-SAFE: aynı kullanıcıya eşzamanlı iki çağrıda yalnız biri 'granted',
 *      diğeri 'already_granted'; toplam tek bonus eklenir.
 *
 * CLEANUP: afterAll, oluşturduğu kullanıcıları/grant/transaction satırlarını siler
 * ve system_config bonus alanlarını snapshot'tan geri yükler.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { grantSignupBonusIfEligible } from "../services/signup-bonus-service.js";
import { getReconciliationReport } from "../services/reconciliation-service.js";

const U1 = "c1111111-1111-1111-1111-111111111111";
const U2 = "c2222222-2222-2222-2222-222222222222";
const U3 = "c3333333-3333-3333-3333-333333333333";
const U4 = "c4444444-4444-4444-4444-444444444444";
const ALL_IDS = [U1, U2, U3, U4];

const BONUS_TL = 10;
const MAX_PER_IP = 2;

let cfgSnapshot: { enabled: boolean; tl: string; maxPerIp: number } | null = null;

async function seedUser(id: string, email: string) {
  await dbSql`DELETE FROM signup_bonus_grants WHERE user_id = ${id}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${id}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${id}::uuid`;
  await db.insert(users).values({ id, email, adSoyad: "ITest Bonus", bakiyeTL: "0", durum: "aktif" });
}

async function getBalance(id: string): Promise<number> {
  const rows = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, id)).limit(1);
  return Number(rows[0]?.b ?? NaN);
}

async function countBonusTx(id: string): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM transactions WHERE user_id = ${id}::uuid AND tip = 'bonus'
  `;
  return Number(rows[0].c);
}

async function setBonusConfig(enabled: boolean, tl: number, maxPerIp: number) {
  await dbSql`
    UPDATE system_config
    SET signup_bonus_enabled = ${enabled}, signup_bonus_tl = ${String(tl)}::numeric, signup_bonus_max_per_ip = ${maxPerIp}
    WHERE id = 1
  `;
}

beforeAll(async () => {
  await dbSql`INSERT INTO system_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  const rows = await dbSql<{ enabled: boolean; tl: string; max_per_ip: number }[]>`
    SELECT signup_bonus_enabled AS enabled, signup_bonus_tl AS tl, signup_bonus_max_per_ip AS max_per_ip
    FROM system_config WHERE id = 1 LIMIT 1
  `;
  cfgSnapshot = rows[0]
    ? { enabled: rows[0].enabled, tl: String(rows[0].tl), maxPerIp: Number(rows[0].max_per_ip) }
    : null;

  for (const [i, id] of ALL_IDS.entries()) {
    await seedUser(id, `itest-bonus-${i}@test.local`);
  }
});

afterAll(async () => {
  for (const id of ALL_IDS) {
    await dbSql`DELETE FROM signup_bonus_grants WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM transactions WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${id}::uuid`;
  }
  if (cfgSnapshot) {
    await dbSql`
      UPDATE system_config
      SET signup_bonus_enabled = ${cfgSnapshot.enabled},
          signup_bonus_tl = ${cfgSnapshot.tl}::numeric,
          signup_bonus_max_per_ip = ${cfgSnapshot.maxPerIp}
      WHERE id = 1
    `;
  }
  await dbSql.end();
});

describe("signup bonus — disabled", () => {
  beforeEach(async () => {
    await setBonusConfig(false, BONUS_TL, MAX_PER_IP);
    await seedUser(U1, "itest-bonus-0@test.local");
  });

  it("kapalıyken bonus vermez, bakiye değişmez, grant oluşmaz", async () => {
    const res = await grantSignupBonusIfEligible(U1, { ip: "1.1.1.1" });
    expect(res.outcome).toBe("disabled");
    expect(await getBalance(U1)).toBeCloseTo(0, 4);
    expect(await countBonusTx(U1)).toBe(0);
    const grants = await dbSql<{ ok: number }[]>`SELECT 1 AS ok FROM signup_bonus_grants WHERE user_id = ${U1}::uuid`;
    expect(grants.length).toBe(0);
  });

  it("tutar 0 veya negatifse bonus verilmez (disabled), bakiye değişmez", async () => {
    await setBonusConfig(true, 0, MAX_PER_IP); // enabled ama tutar 0
    const res = await grantSignupBonusIfEligible(U1, { ip: "1.1.1.2" });
    expect(res.outcome).toBe("disabled");
    expect(await getBalance(U1)).toBeCloseTo(0, 4);
    expect(await countBonusTx(U1)).toBe(0);
  });
});

describe("signup bonus — granted + idempotent + drift", () => {
  beforeEach(async () => {
    await setBonusConfig(true, BONUS_TL, MAX_PER_IP);
    await seedUser(U2, "itest-bonus-1@test.local");
  });

  it("yeni kullanıcıya tam tutar ekler + tip='bonus' pozitif ledger satırı + drift=0", async () => {
    const before = await getBalance(U2);
    const res = await grantSignupBonusIfEligible(U2, { ip: "2.2.2.2" });

    expect(res.outcome).toBe("granted");
    expect(res.amountTL).toBe(BONUS_TL);
    expect(res.transactionId).toBeTruthy();

    const after = await getBalance(U2);
    expect(after - before).toBeCloseTo(BONUS_TL, 4);

    // Ledger satırı pozitif, tip='bonus', tutar eşit.
    const txId = res.transactionId!;
    const txRows = await dbSql<{ tip: string; miktar_tl: string }[]>`
      SELECT tip, miktar_tl FROM transactions WHERE id = ${txId}
    `;
    expect(txRows[0].tip).toBe("bonus");
    expect(Number(txRows[0].miktar_tl)).toBeCloseTo(BONUS_TL, 4);

    // grant satırı transaction'a bağlı.
    const grantRows = await dbSql<{ transaction_id: string; amount_tl: string }[]>`
      SELECT transaction_id, amount_tl FROM signup_bonus_grants WHERE user_id = ${U2}::uuid
    `;
    expect(grantRows[0].transaction_id).toBe(res.transactionId);
    expect(Number(grantRows[0].amount_tl)).toBeCloseTo(BONUS_TL, 4);

    // DRIFT=0: bu kullanıcı reconciliation drift listesinde YOK (bakiye==ledger).
    const report = await getReconciliationReport();
    const drift = report.userDrifts.find((u) => u.userId === U2);
    expect(drift).toBeUndefined();
  });

  it("ikinci çağrı already_granted döner; bakiye ve bonus tx sayısı değişmez", async () => {
    const first = await grantSignupBonusIfEligible(U2, { ip: "2.2.2.2" });
    expect(first.outcome).toBe("granted");
    const balAfterFirst = await getBalance(U2);
    const txAfterFirst = await countBonusTx(U2);

    const second = await grantSignupBonusIfEligible(U2, { ip: "2.2.2.2" });
    expect(second.outcome).toBe("already_granted");
    expect(await getBalance(U2)).toBeCloseTo(balAfterFirst, 4);
    expect(await countBonusTx(U2)).toBe(txAfterFirst);
    expect(txAfterFirst).toBe(1);
  });

  it("aynı kullanıcıya eşzamanlı iki çağrıda yalnız biri granted (race-safe), tek bonus eklenir", async () => {
    const before = await getBalance(U2);
    const [a, b] = await Promise.all([
      grantSignupBonusIfEligible(U2, { ip: "2.2.2.2" }),
      grantSignupBonusIfEligible(U2, { ip: "2.2.2.2" }),
    ]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(["already_granted", "granted"]);
    expect((await getBalance(U2)) - before).toBeCloseTo(BONUS_TL, 4);
    expect(await countBonusTx(U2)).toBe(1);
  });
});

describe("signup bonus — IP limiti (abuse)", () => {
  beforeEach(async () => {
    await setBonusConfig(true, BONUS_TL, MAX_PER_IP);
    await seedUser(U2, "itest-bonus-1@test.local");
    await seedUser(U3, "itest-bonus-2@test.local");
    await seedUser(U4, "itest-bonus-3@test.local");
  });

  it("aynı IP'den max sınırı aşılınca yeni kullanıcı ip_limit alır, bakiyesi değişmez", async () => {
    const ip = "9.9.9.9";
    // MAX_PER_IP=2 → ilk iki kullanıcı alır.
    const r1 = await grantSignupBonusIfEligible(U2, { ip });
    const r2 = await grantSignupBonusIfEligible(U3, { ip });
    expect(r1.outcome).toBe("granted");
    expect(r2.outcome).toBe("granted");

    // Üçüncü kullanıcı aynı IP → reddedilir.
    const before = await getBalance(U4);
    const r3 = await grantSignupBonusIfEligible(U4, { ip });
    expect(r3.outcome).toBe("ip_limit");
    expect(await getBalance(U4)).toBeCloseTo(before, 4);
    expect(await countBonusTx(U4)).toBe(0);
    const grants = await dbSql<{ ok: number }[]>`SELECT 1 AS ok FROM signup_bonus_grants WHERE user_id = ${U4}::uuid`;
    expect(grants.length).toBe(0);
  });

  it("aynı IP'den eşzamanlı çağrılarda limit ATOMİK korunur (TOCTOU yok)", async () => {
    const ip = "8.8.8.8";
    // MAX_PER_IP=2; üç kullanıcı aynı anda dener → en çok 2'si granted olmalı.
    const [a, b, c] = await Promise.all([
      grantSignupBonusIfEligible(U2, { ip }),
      grantSignupBonusIfEligible(U3, { ip }),
      grantSignupBonusIfEligible(U4, { ip }),
    ]);
    const grantedCount = [a, b, c].filter((r) => r.outcome === "granted").length;
    const limitCount = [a, b, c].filter((r) => r.outcome === "ip_limit").length;
    expect(grantedCount).toBe(MAX_PER_IP); // tam 2 granted
    expect(limitCount).toBe(1); // 1 ip_limit
    // DB'de bu IP için tam MAX_PER_IP grant satırı (fazlası rollback ile geri alındı).
    const ipGrants = await dbSql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM signup_bonus_grants
      WHERE user_id IN (${U2}::uuid, ${U3}::uuid, ${U4}::uuid)
    `;
    expect(Number(ipGrants[0].c)).toBe(MAX_PER_IP);
  });
});
