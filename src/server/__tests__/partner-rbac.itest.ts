import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../services/auth-service.js";

const app = createApp();

const OWNER_ID = "c0000000-0000-0000-0000-000000000001";
const PARTNER_ID = "c0000000-0000-0000-0000-000000000002";
const NORMAL_ID = "c0000000-0000-0000-0000-000000000003";
const OWNER_EMAIL = "cix.crazy666@gmail.com"; // tek-admin allowlist (DOKUNULMAZ)

const ownerToken = () => signAccessToken({ sub: OWNER_ID, role: "user" });
const partnerToken = () => signAccessToken({ sub: PARTNER_ID, role: "user" });
const normalToken = () => signAccessToken({ sub: NORMAL_ID, role: "user" });

beforeAll(async () => {
  await dbSql`DELETE FROM users WHERE id IN (${OWNER_ID}::uuid, ${PARTNER_ID}::uuid, ${NORMAL_ID}::uuid) OR email IN (${OWNER_EMAIL}, ${"ortak-rbac@test.local"}, ${"normal-rbac@test.local"})`;
  await db.insert(users).values([
    { id: OWNER_ID, email: OWNER_EMAIL, adSoyad: "Owner", bakiyeTL: "0", durum: "aktif", role: "user" },
    { id: PARTNER_ID, email: "ortak-rbac@test.local", adSoyad: "Ortak", bakiyeTL: "0", durum: "aktif", role: "partner" },
    { id: NORMAL_ID, email: "normal-rbac@test.local", adSoyad: "Normal", bakiyeTL: "0", durum: "aktif", role: "user" },
  ]);
});

afterAll(async () => {
  await dbSql`DELETE FROM users WHERE id IN (${OWNER_ID}::uuid, ${PARTNER_ID}::uuid, ${NORMAL_ID}::uuid) OR email IN (${OWNER_EMAIL}, ${"ortak-rbac@test.local"}, ${"normal-rbac@test.local"})`;
});

describe("GET /api/admin/me — rol + allowedTabs", () => {
  it("owner: role=owner ve 18 sekmenin tamamı", async () => {
    const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("owner");
    expect(res.body.allowedTabs).toContain("providers");
    expect(res.body.allowedTabs).toContain("packages");
    expect(res.body.allowedTabs.length).toBe(18);
  });

  it("partner: role=partner ve yalnız izinli sekmeler (owner-only YOK)", async () => {
    const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${partnerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("partner");
    expect(res.body.allowedTabs).toContain("users");
    expect(res.body.allowedTabs).toContain("payments");
    expect(res.body.allowedTabs).not.toContain("providers");
    expect(res.body.allowedTabs).not.toContain("packages");
    expect(res.body.allowedTabs).not.toContain("kur");
  });

  it("normal kullanıcı: /me 403", async () => {
    const res = await request(app).get("/api/admin/me").set("Authorization", `Bearer ${normalToken()}`);
    expect(res.status).toBe(403);
  });
});
