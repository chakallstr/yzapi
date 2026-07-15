/**
 * Toplu havale-bildirimi silme INTEGRATION test (real PG, npm run itest).
 *
 * Kapsanan sözleşme:
 *  - owner: bekliyor + reddedildi siler, onaylandi'ya (bakiye yüklenmiş) DOKUNMAZ.
 *  - yanıt: { requested, deleted, blocked } — onaylandi = blocked.
 *  - boş/geçersiz ids → 400.
 *  - owner-only: partner (approve/reject yapabilir) bile 403; normal kullanıcı 403.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, pendingIbanPayments } from "../db/schema.js";
import { signAccessToken } from "../services/auth-service.js";
import { ADMIN_EMAIL } from "../middleware/admin-auth.js";

const app = createApp();

const OWNER = "d2000000-0000-0000-0000-000000000001";
const PARTNER = "d2000000-0000-0000-0000-000000000002";
const NORMAL = "d2000000-0000-0000-0000-000000000003"; // hem 403 testi hem iban satırlarının FK sahibi
const tok = (id: string) => signAccessToken({ sub: id, role: "user" });

const REF_BEKLIYOR = "IT-BULKDEL-BEKLIYOR";
const REF_ONAYLANDI = "IT-BULKDEL-ONAYLANDI";
const REF_REDDEDILDI = "IT-BULKDEL-REDDEDILDI";

async function seedUser(id: string, email: string, role: "user" | "partner") {
  await db.insert(users).values({ id, email, adSoyad: "IT", bakiyeTL: "0", durum: "aktif", role });
}

async function seedIban(userId: string, referansKodu: string, durum: string): Promise<string> {
  const rows = await db
    .insert(pendingIbanPayments)
    .values({ userId, miktarTL: "478", kdvTL: "0", referansKodu, durum })
    .returning({ id: pendingIbanPayments.id });
  return rows[0].id;
}

async function cleanup() {
  await dbSql`DELETE FROM pending_iban_payments WHERE referans_kodu IN (${REF_BEKLIYOR}, ${REF_ONAYLANDI}, ${REF_REDDEDILDI})`;
  for (const id of [OWNER, PARTNER, NORMAL]) {
    await dbSql`DELETE FROM users WHERE id = ${id}::uuid`;
  }
}

beforeAll(async () => {
  await cleanup();
  await seedUser(OWNER, ADMIN_EMAIL, "user"); // owner e-postayla tanınır, DB rolü 'user'
  await seedUser(PARTNER, "bulkdel-partner@test.local", "partner");
  await seedUser(NORMAL, "bulkdel-normal@test.local", "user");
});
afterAll(cleanup);

describe("POST /api/payments/admin/pending-iban/bulk-delete", () => {
  it("owner: bekliyor+reddedildi silinir, onaylandi KORUNUR", async () => {
    const idBekliyor = await seedIban(NORMAL, REF_BEKLIYOR, "bekliyor");
    const idOnaylandi = await seedIban(NORMAL, REF_ONAYLANDI, "onaylandi");
    const idReddedildi = await seedIban(NORMAL, REF_REDDEDILDI, "reddedildi");

    const res = await request(app)
      .post("/api/payments/admin/pending-iban/bulk-delete")
      .set("Authorization", `Bearer ${tok(OWNER)}`)
      .send({ ids: [idBekliyor, idOnaylandi, idReddedildi] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ requested: 3, deleted: 2, blocked: 1 });

    const survivors = await dbSql<{ id: string; durum: string }[]>`
      SELECT id::text, durum FROM pending_iban_payments
      WHERE id IN (${idBekliyor}::uuid, ${idOnaylandi}::uuid, ${idReddedildi}::uuid)`;
    expect(survivors).toHaveLength(1);
    expect(survivors[0].id).toBe(idOnaylandi);
    expect(survivors[0].durum).toBe("onaylandi");
  });

  it("boş ids → 400", async () => {
    const res = await request(app)
      .post("/api/payments/admin/pending-iban/bulk-delete")
      .set("Authorization", `Bearer ${tok(OWNER)}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("ids dizi değilse → 400", async () => {
    const res = await request(app)
      .post("/api/payments/admin/pending-iban/bulk-delete")
      .set("Authorization", `Bearer ${tok(OWNER)}`)
      .send({ ids: "hepsi" });
    expect(res.status).toBe(400);
  });

  it("owner-only: partner (approve/reject yetkili) bile 403", async () => {
    const res = await request(app)
      .post("/api/payments/admin/pending-iban/bulk-delete")
      .set("Authorization", `Bearer ${tok(PARTNER)}`)
      .send({ ids: ["d2000000-0000-0000-0000-0000000000ff"] });
    expect(res.status).toBe(403);
  });

  it("normal kullanıcı → 403", async () => {
    const res = await request(app)
      .post("/api/payments/admin/pending-iban/bulk-delete")
      .set("Authorization", `Bearer ${tok(NORMAL)}`)
      .send({ ids: ["d2000000-0000-0000-0000-0000000000ff"] });
    expect(res.status).toBe(403);
  });
});
