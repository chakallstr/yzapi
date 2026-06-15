/**
 * IBAN iki-aşamalı bildirim INTEGRATION test (real PG, npm run itest).
 * confirm: sahiplik + 1/dk rate-limit + uuid guard; init: 60sn dedup.
 * notifyAdmin yapılandırılmamışsa no-op (gerçek WhatsApp gitmez) — güvenli.
 *
 * Rate-limit kovaları in-memory/global olduğundan her senaryo AYRI userId kullanır.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, payments } from "../db/schema.js";
import { signAccessToken } from "../services/auth-service.js";

const app = createApp();
const U1 = "d1000000-0000-0000-0000-000000000001"; // confirm happy + 429
const U2 = "d1000000-0000-0000-0000-000000000002"; // ownership 404
const U3 = "d1000000-0000-0000-0000-000000000003"; // dedup (init)
const U4 = "d1000000-0000-0000-0000-000000000004"; // bad-uuid 404 (ayrı kova — rate-limit ÖNCE çalışır)
const tok = (id: string) => signAccessToken({ sub: id, role: "user" });
const ibanReady = Boolean(process.env.IBAN_NUMBER && process.env.IBAN_BANK_NAME);

async function seedUser(id: string, email: string) {
  await db.insert(users).values({ id, email, adSoyad: "IT", bakiyeTL: "0", durum: "aktif", role: "user" });
}
async function seedIbanPayment(userId: string): Promise<string> {
  const rows = await db
    .insert(payments)
    .values({
      userId,
      metod: "iban",
      miktarTL: "478",
      kdvTL: "0",
      netTL: "478",
      amountUsd: "10",
      payableTL: "478",
      creditTL: "10",
      kurAtPayment: "47.8",
      roundingTL: "0",
      durum: "bekliyor",
      idempotencyKey: `IT-${userId.slice(0, 8)}-${Math.floor(Math.random() * 1e6)}`,
    })
    .returning({ id: payments.id });
  return rows[0].id;
}
async function cleanup() {
  for (const id of [U1, U2, U3, U4]) {
    await dbSql`UPDATE payments SET transaction_id = NULL WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM pending_iban_payments WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM payments WHERE user_id = ${id}::uuid`;
    await dbSql`DELETE FROM users WHERE id = ${id}::uuid`;
  }
}

beforeAll(async () => {
  await cleanup();
  await seedUser(U1, "iban-it1@test.local");
  await seedUser(U2, "iban-it2@test.local");
  await seedUser(U3, "iban-it3@test.local");
  await seedUser(U4, "iban-it4@test.local");
});
afterAll(cleanup);

describe("POST /api/payments/iban/confirm", () => {
  it("sahibinin geçerli ödemesi → 200 {ok:true}, ikinci çağrı → 429 (1/dk)", async () => {
    const pid = await seedIbanPayment(U1);
    const first = await request(app)
      .post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U1)}`)
      .send({ paymentId: pid });
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    const second = await request(app)
      .post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U1)}`)
      .send({ paymentId: pid });
    expect(second.status).toBe(429);
  });

  // NOT: rate-limit sahiplik kontrolünden ÖNCE çalışır (rastgele id taraması da throttle'lanır),
  // bu yüzden iki 404 senaryosu AYRI kullanıcı (=ayrı kova) kullanır.
  it("başka kullanıcının/olmayan ödemesi → 404", async () => {
    const otherPid = await seedIbanPayment(U1); // U1'e ait
    const notOwned = await request(app)
      .post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U2)}`)
      .send({ paymentId: otherPid });
    expect(notOwned.status).toBe(404);
  });

  it("geçersiz uuid → 404", async () => {
    const badUuid = await request(app)
      .post("/api/payments/iban/confirm")
      .set("Authorization", `Bearer ${tok(U4)}`)
      .send({ paymentId: "not-a-uuid" });
    expect(badUuid.status).toBe(404);
  });
});

describe("POST /api/payments/iban/init dedup", () => {
  (ibanReady ? it : it.skip)("60sn içinde aynı tutar → aynı paymentId + tek pending satır", async () => {
    const body = { amountUsd: 10 };
    const r1 = await request(app)
      .post("/api/payments/iban/init")
      .set("Authorization", `Bearer ${tok(U3)}`)
      .send(body);
    expect(r1.status).toBe(200);
    const r2 = await request(app)
      .post("/api/payments/iban/init")
      .set("Authorization", `Bearer ${tok(U3)}`)
      .send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.paymentId).toBe(r1.body.paymentId);
    const cnt = await dbSql<{ c: string }[]>`SELECT COUNT(*)::text AS c FROM pending_iban_payments WHERE user_id = ${U3}::uuid`;
    expect(Number(cnt[0].c)).toBe(1);
  });
});
