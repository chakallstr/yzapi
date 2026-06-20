/**
 * Admin kullanıcı detay özeti INTEGRATION test (gerçek Postgres).
 *
 * Yalnız `npm run itest` ile çalışır (db:up + migrate gerekir). createApp route
 * ağacını supertest ile sürer. Tek-admin allowlist (cix.crazy666@gmail.com) için
 * gerçek JWT üretir.
 *
 * KİLİTLENEN BUG: /api/admin/users/:id/detail özet kutuları (requestCount,
 * totalCostTL, totalInputTokens/OutputTokens) ÖMÜR-BOYU usage_records'tan
 * hesaplanmalı — önceki kod usageRows.limit(50) üzerinden topluyordu, bu yüzden
 * 50'den fazla isteği olan kullanıcıda panel "50 istek / eksik harcama" gösteriyordu.
 * usageRecords LİSTESİ son 50 kalır (gösterim); summary TÜM geçmişi yansıtır.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { db, dbSql } from "../db/client.js";
import { users, apiKeys, usageRecords } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../services/auth-service.js";

const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ADMIN_EMAIL = "cix.crazy666@gmail.com"; // tek-admin allowlist (DOKUNULMAZ)
const TARGET_KEY_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const TOTAL_RECORDS = 60;       // 50 limit eşiğinin ÜZERİNDE (bug'ı tetikleyen koşul)
const PER_INPUT = 1000;
const PER_OUTPUT = 200;
const PER_COST = 0.5;           // her başarılı kayıt 0.5 TL

const app = createApp();

beforeAll(async () => {
  await dbSql`DELETE FROM usage_records WHERE user_id IN (${TARGET_ID}::uuid, ${ADMIN_ID}::uuid)`;
  await dbSql`DELETE FROM api_keys WHERE user_id IN (${TARGET_ID}::uuid, ${ADMIN_ID}::uuid)`;
  await dbSql`DELETE FROM users WHERE id IN (${TARGET_ID}::uuid, ${ADMIN_ID}::uuid)`;

  await db.insert(users).values([
    { id: ADMIN_ID, email: ADMIN_EMAIL, adSoyad: "Admin", bakiyeTL: "0", durum: "aktif" },
    { id: TARGET_ID, email: "detail-target@test.local", adSoyad: "Detail Target", bakiyeTL: "10.0000", durum: "aktif" },
  ]);

  await db.insert(apiKeys).values({
    id: TARGET_KEY_ID,
    userId: TARGET_ID,
    ad: "detail-key",
    maskedKey: "yzk_live_••••",
    keyHash: "x",
    prefix: "yzk_live_det",
    aktif: true,
  });

  // 60 başarılı usage kaydı yaz (limit(50)'nin ÜZERİNDE).
  for (let i = 0; i < TOTAL_RECORDS; i++) {
    await dbSql`
      INSERT INTO usage_records (user_id, api_key_id, model_id, type, input_usage, output_usage,
        units_usage, cost_usd, cost_tl, request_id, response_ms, status)
      VALUES (${TARGET_ID}::uuid, ${TARGET_KEY_ID}::uuid, 'claude-sonnet-4-6', 'text',
        ${PER_INPUT}, ${PER_OUTPUT}, 0, 0, ${PER_COST}, ${`detail-req-${i}`}, 100, 'success')
    `;
  }
});

afterAll(async () => {
  await dbSql`DELETE FROM usage_records WHERE user_id IN (${TARGET_ID}::uuid, ${ADMIN_ID}::uuid)`;
  await dbSql`DELETE FROM api_keys WHERE user_id IN (${TARGET_ID}::uuid, ${ADMIN_ID}::uuid)`;
  await dbSql`DELETE FROM users WHERE id IN (${TARGET_ID}::uuid, ${ADMIN_ID}::uuid)`;
  await dbSql.end();
});

describe("admin /users/:id/detail — ömür-boyu özet (limit(50) bug kilidi)", () => {
  it("summary 60 kaydın TAMAMINI yansıtır (50'de takılmaz)", async () => {
    const token = signAccessToken({ sub: ADMIN_ID, role: "user" });
    const res = await request(app)
      .get(`/api/admin/users/${TARGET_ID}/detail`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const s = res.body.summary;

    // ÖMÜR-BOYU değerler (60 kayıt) — eskiden hepsi 50'de tavanlanıyordu.
    expect(s.requestCount).toBe(TOTAL_RECORDS);                       // 60, 50 DEĞİL
    expect(s.successfulRequests).toBe(TOTAL_RECORDS);
    expect(s.totalInputTokens).toBe(TOTAL_RECORDS * PER_INPUT);       // 60000, 50000 DEĞİL
    expect(s.totalOutputTokens).toBe(TOTAL_RECORDS * PER_OUTPUT);     // 12000, 10000 DEĞİL
    expect(s.totalTokens).toBe(TOTAL_RECORDS * (PER_INPUT + PER_OUTPUT));
    expect(s.totalCostTL).toBeCloseTo(TOTAL_RECORDS * PER_COST, 4);   // 30.0, 25.0 DEĞİL

    // usageRecords LİSTESİ ise gösterim için son 50 kalır (regresyon değil, tasarım).
    expect(res.body.usageRecords.length).toBe(50);
  });

  it("paket/özet sayıları BAŞARISIZ (status<>success) istekleri SAYMAZ — CF reddi şişirmesin", async () => {
    // 5 başarılı + 3 başarısız (CF LIMIT_EXCEEDED) paket isteği ekle.
    for (let i = 0; i < 5; i++) {
      await dbSql`
        INSERT INTO usage_records (user_id, api_key_id, model_id, type, input_usage, output_usage,
          units_usage, cost_usd, cost_tl, request_id, response_ms, status, billed_via)
        VALUES (${TARGET_ID}::uuid, ${TARGET_KEY_ID}::uuid, 'gpt-5.5', 'text', 10, 5, 0, 0, 0,
          ${`pkg-ok-${i}`}, 100, 'success', 'package')`;
    }
    for (let i = 0; i < 3; i++) {
      await dbSql`
        INSERT INTO usage_records (user_id, api_key_id, model_id, type, input_usage, output_usage,
          units_usage, cost_usd, cost_tl, request_id, response_ms, status, billed_via, error_code)
        VALUES (${TARGET_ID}::uuid, ${TARGET_KEY_ID}::uuid, 'gpt-5.5', 'text', 0, 0, 0, 0, 0,
          ${`pkg-fail-${i}`}, 100, 'error', 'package', 'LIMIT_EXCEEDED')`;
    }

    const token = signAccessToken({ sub: ADMIN_ID, role: "user" });
    const res = await request(app)
      .get(`/api/admin/users/${TARGET_ID}/detail`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.packageRequests).toBe(5);                  // YALNIZ başarılı paket isteği (8 DEĞİL)
    expect(s.packageFailed).toBe(3);                    // başarısız paket isteği ayrı gösterilir
    expect(s.successfulRequests).toBe(TOTAL_RECORDS + 5); // 65 — başarısızlar hariç
    expect(s.failedRequests).toBe(3);
  });
});
