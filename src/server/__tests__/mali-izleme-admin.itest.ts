/**
 * Mali İzleme — Admin API uçları itest (Task 5).
 *
 * /api/admin/mali-izleme/{son,canli-akis,tara,gecmis} uçlarının:
 *  - tek-admin token ile 200 döndüğünü,
 *  - anonim (token yok) → 401, non-admin token → 403,
 *  - POST /tara'nın 1 satır persist ettiğini ve para tablolarını DEĞİŞTİRMEDİĞİNİ,
 *  - yanıtlarda secret kolon sızıntısı olmadığını doğrular.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../services/auth-service.js";
import { ADMIN_EMAIL } from "../middleware/admin-auth.js";

const app = createApp();
const ADMIN_USER_ID = "b2222222-2222-2222-2222-222222222222";
const NONADMIN_USER_ID = "b3333333-3333-3333-3333-333333333333";

beforeAll(async () => {
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE SET kur=47, live_kur=47, kur_buffer=0.03
  `;
  await dbSql`DELETE FROM users WHERE id IN (${ADMIN_USER_ID}::uuid, ${NONADMIN_USER_ID}::uuid)`;
  await db.insert(users).values([
    { id: ADMIN_USER_ID, email: ADMIN_EMAIL, adSoyad: "Admin İzleme", bakiyeTL: "0", durum: "aktif" },
    { id: NONADMIN_USER_ID, email: "izleme-nonadmin@test.local", adSoyad: "NonAdmin", bakiyeTL: "0", durum: "aktif" },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await dbSql`DELETE FROM users WHERE id IN (${ADMIN_USER_ID}::uuid, ${NONADMIN_USER_ID}::uuid)`;
  await dbSql.end();
});

const adminToken = () => signAccessToken({ sub: ADMIN_USER_ID, role: "user" });
const nonAdminToken = () => signAccessToken({ sub: NONADMIN_USER_ID, role: "user" });

describe("Mali İzleme admin uçları — yetkilendirme (R16)", () => {
  const endpoints: { method: "get" | "post"; path: string }[] = [
    { method: "get", path: "/api/admin/mali-izleme/son" },
    { method: "get", path: "/api/admin/mali-izleme/canli-akis" },
    { method: "post", path: "/api/admin/mali-izleme/tara" },
    { method: "get", path: "/api/admin/mali-izleme/gecmis" },
  ];

  it("token YOK → 401 (adminAuth)", async () => {
    for (const ep of endpoints) {
      const res = await request(app)[ep.method](ep.path);
      expect(res.status).toBe(401);
    }
  });

  it("non-admin token → 403 (tek-admin allowlist)", async () => {
    for (const ep of endpoints) {
      const res = await request(app)[ep.method](ep.path).set("Authorization", `Bearer ${nonAdminToken()}`);
      expect(res.status).toBe(403);
    }
  });
});

describe("Mali İzleme admin uçları — tek-admin işlevsellik (R15/R17)", () => {
  it("POST /tara → 200 ScanResult + 1 satır persist + para tabloları DEĞİŞMEZ", async () => {
    const txBefore = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM transactions`;
    const usageBefore = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM usage_records`;
    const scanBefore = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM mali_izleme_taramalari`;

    const res = await request(app).post("/api/admin/mali-izleme/tara").set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(["SORUN_YOK", "DIKKAT", "SORUN_VAR"]).toContain(res.body.verdict);
    expect(Array.isArray(res.body.checks)).toBe(true);
    expect(res.body.checks.length).toBeGreaterThanOrEqual(11);

    const txAfter = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM transactions`;
    const usageAfter = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM usage_records`;
    const scanAfter = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM mali_izleme_taramalari`;

    expect(txAfter[0].c).toBe(txBefore[0].c); // para tabloları değişmedi (salt-okunur)
    expect(usageAfter[0].c).toBe(usageBefore[0].c);
    expect(Number(scanAfter[0].c)).toBe(Number(scanBefore[0].c) + 1); // yalnız izleme +1
  });

  it("GET /son → son tarama özetini döndürür", async () => {
    await request(app).post("/api/admin/mali-izleme/tara").set("Authorization", `Bearer ${adminToken()}`);
    const res = await request(app).get("/api/admin/mali-izleme/son").set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(["SORUN_YOK", "DIKKAT", "SORUN_VAR"]).toContain(res.body.verdict);
  });

  it("GET /canli-akis → 15dk özeti (gelir/token) döndürür", async () => {
    const res = await request(app).get("/api/admin/mali-izleme/canli-akis").set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("istek");
    expect(res.body).toHaveProperty("gelirTL");
    expect(typeof res.body.istek).toBe("number");
  });

  it("GET /gecmis → tarama listesi (LIMIT 50) döndürür", async () => {
    const res = await request(app).get("/api/admin/mali-izleme/gecmis").set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(50);
  });

  it("SECRET SIZINTI YOK: hiçbir yanıt cipher/hash/DATABASE_URL içermez (R16.4)", async () => {
    const paths = ["/api/admin/mali-izleme/son", "/api/admin/mali-izleme/canli-akis", "/api/admin/mali-izleme/gecmis"];
    const banned = /cipher|password_hash|DATABASE_URL|postgres:\/\/|yzk_live_[a-z0-9]/i;
    for (const p of paths) {
      const res = await request(app).get(p).set("Authorization", `Bearer ${adminToken()}`);
      expect(JSON.stringify(res.body)).not.toMatch(banned);
    }
  });
});
