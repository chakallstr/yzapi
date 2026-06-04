/**
 * User language preference INTEGRATION test (real Postgres).
 * Drives the production route tree (createApp) via supertest with a real user JWT.
 * Verifies: users.lang defaults to 'tr', GET /me returns it, PATCH /me {lang}
 * persists + validates, and PATCH /me with no fields is rejected.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../services/auth-service.js";

const UID = "77777777-7777-7777-7777-777777777777";
const app = createApp();
const token = signAccessToken({ sub: UID, role: "user" });
const auth = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);

async function cleanup() {
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({ id: UID, email: "lang@test.local", adSoyad: "Lang User", bakiyeTL: "0", durum: "aktif" } as never);
});

afterAll(cleanup);

describe("user language preference (real PG)", () => {
  it("defaults to tr and is returned by GET /me", async () => {
    const res = await auth(request(app).get("/api/user/me"));
    expect(res.status).toBe(200);
    expect(res.body.lang).toBe("tr");
  });

  it("PATCH /me persists a valid lang change", async () => {
    const res = await auth(request(app).patch("/api/user/me").send({ lang: "en" }));
    expect(res.status).toBe(200);
    expect(res.body.lang).toBe("en");
    const row = await db.select({ lang: users.lang }).from(users).where(eq(users.id, UID)).limit(1);
    expect(row[0].lang).toBe("en");
  });

  it("PATCH /me rejects an invalid lang", async () => {
    const res = await auth(request(app).patch("/api/user/me").send({ lang: "fr" }));
    expect(res.status).toBe(400);
    // unchanged in DB
    const row = await db.select({ lang: users.lang }).from(users).where(eq(users.id, UID)).limit(1);
    expect(row[0].lang).toBe("en");
  });

  it("PATCH /me with no updatable fields is rejected", async () => {
    const res = await auth(request(app).patch("/api/user/me").send({}));
    expect(res.status).toBe(400);
  });

  it("PATCH /me still updates adSoyad alongside lang", async () => {
    const res = await auth(request(app).patch("/api/user/me").send({ adSoyad: "Yeni Ad", lang: "tr" }));
    expect(res.status).toBe(200);
    expect(res.body.adSoyad).toBe("Yeni Ad");
    expect(res.body.lang).toBe("tr");
  });
});
