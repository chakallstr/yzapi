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

describe("POST /api/admin/users/:id/role — yalnız owner", () => {
  it("owner bir kullanıcıyı partner yapıp geri alabilir", async () => {
    const promote = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "partner" });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe("partner");

    const demote = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "user" });
    expect(demote.status).toBe(200);
    expect(demote.body.user.role).toBe("user");
  });

  it("partner rol değiştiremez (privilege escalation) → 403", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${partnerToken()}`)
      .send({ role: "partner" });
    expect(res.status).toBe(403);
  });

  it("owner hesabının rolü değiştirilemez", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${OWNER_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "partner" });
    expect(res.status).toBe(400);
  });

  it("geçersiz rol → 400", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${NORMAL_ID}/role`)
      .set("Authorization", `Bearer ${ownerToken()}`)
      .send({ role: "superadmin" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/users/:id — partner owner'ı değiştiremez", () => {
  it("partner owner satırını PATCH edemez → 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${OWNER_ID}`)
      .set("Authorization", `Bearer ${partnerToken()}`)
      .send({ not: "deneme" });
    expect(res.status).toBe(403);
  });
});

describe("Owner bakiyesi partner tarafından korunur", () => {
  it("partner owner'ın bakiyesini değiştiremez → 403", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${OWNER_ID}/bakiye`)
      .set("Authorization", `Bearer ${partnerToken()}`)
      .send({ miktar: 100, aciklama: "test" });
    expect(res.status).toBe(403);
  });
});

describe("Erişim matrisi — partner HTTP zorlaması (3 mount noktası)", () => {
  it.each([
    ["GET", "/api/admin/dashboard"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/audit-logs"],
    ["GET", "/api/admin/config"],          // paylaşımlı okuma
    ["GET", "/api/admin/provider-durumu"], // paylaşımlı okuma
    ["GET", "/api/admin/model-overrides"], // paylaşımlı okuma
    ["GET", "/api/payments/admin/pending-iban"],
    ["GET", "/api/telegram/admin/accounts"],
  ])("partner izinli: %s %s → 403 DEĞİL", async (method, path) => {
    const res = await request(app)[method.toLowerCase() as "get"](path)
      .set("Authorization", `Bearer ${partnerToken()}`);
    expect(res.status).not.toBe(403);
  });

  it.each([
    ["GET", "/api/admin/provider-profiles"],
    ["GET", "/api/admin/api-settings"],
    ["GET", "/api/admin/packages"],
    ["GET", "/api/admin/redeem-codes"],
    ["GET", "/api/admin/delivery-orders"],
    ["POST", "/api/admin/refresh-kur"],
  ])("partner owner-only: %s %s → 403", async (method, path) => {
    const res = await request(app)[method.toLowerCase() as "get" | "post"](path)
      .set("Authorization", `Bearer ${partnerToken()}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("owner aynı owner-only uçlara erişebilir (403 değil)", async () => {
    const res = await request(app).get("/api/admin/provider-profiles")
      .set("Authorization", `Bearer ${ownerToken()}`);
    expect(res.status).not.toBe(403);
  });

  it("rol DB'den her istek okunur → demote anında etki eder", async () => {
    // PARTNER_ID'yi user'a çek, sonra partner-only uca dene → 403
    await db.update(users).set({ role: "user" }).where(eq(users.id, PARTNER_ID));
    const denied = await request(app).get("/api/admin/users")
      .set("Authorization", `Bearer ${partnerToken()}`);
    expect(denied.status).toBe(403); // artık admin değil

    // geri partner yap → tekrar erişir
    await db.update(users).set({ role: "partner" }).where(eq(users.id, PARTNER_ID));
    const allowed = await request(app).get("/api/admin/users")
      .set("Authorization", `Bearer ${partnerToken()}`);
    expect(allowed.status).not.toBe(403);
  });
});
