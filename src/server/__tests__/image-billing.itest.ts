import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, dbSql } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { MasterModel } from "../../master-models.js";

const UID = "55555555-5555-5555-5555-555555555555";
const KEY_ID = "55550000-0000-0000-0000-000000000001";
const MODEL: MasterModel = {
  id: "test-img-itest",
  name: "Test Img",
  provider: "x",
  type: "Görsel",
  context: "—",
  endpoints: ["images"],
  providerImageInputUsd: 0.04,
};

async function bal(): Promise<number> {
  const r = await db.select({ b: users.bakiyeTL }).from(users).where(eq(users.id, UID)).limit(1);
  return Number(r[0]?.b ?? 0);
}

async function cleanup() {
  await dbSql`DELETE FROM usage_records WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM transactions WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM api_keys WHERE user_id = ${UID}::uuid`;
  await dbSql`DELETE FROM users WHERE id = ${UID}::uuid`;
}

beforeAll(async () => {
  await dbSql`
    INSERT INTO system_config (id, kur, live_kur, kur_buffer, text_carpan, image_carpan, video_carpan)
    VALUES (1, 47, 47, 0.03, 3.0, 3.0, 3.0)
    ON CONFLICT (id) DO UPDATE SET live_kur = 47, kur_buffer = 0.03, image_carpan = 3.0
  `;
  await cleanup();
  await db.insert(users).values({ id: UID, email: "img@test.local", adSoyad: "Img", bakiyeTL: "100.0000", durum: "aktif" } as never);
  await dbSql`
    INSERT INTO api_keys (id, user_id, ad, masked_key, key_hash, prefix, aktif)
    VALUES (${KEY_ID}::uuid, ${UID}::uuid, 'itest', 'yzk_live_***img', 'hash_img_itest', 'yzk_live_', true)
  `;
});

afterAll(cleanup);

describe("chargeImage (real PG)", () => {
  it("charges a per-image fee and debits balance (image_carpan applied)", async () => {
    const { chargeImage } = await import("../services/image-billing-service.js");
    // perImageTL = 0.04 × imageCarpan(3) × sellKur(47×1.03) = 0.04×3×48.41 ≈ 5.8092
    const r = await chargeImage({ userId: UID, apiKeyId: KEY_ID, model: MODEL, imageRequestId: "img_it1", imageCount: 1, responseMs: 50, status: "success" });
    expect(r.costTL).toBeGreaterThan(0);
    expect(r.alreadyCharged).toBe(false);
    expect(await bal()).toBeCloseTo(100 - r.costTL, 4);
  });

  it("is idempotent for the same imageRequestId (no double charge)", async () => {
    const { chargeImage } = await import("../services/image-billing-service.js");
    const before = await bal();
    const r = await chargeImage({ userId: UID, apiKeyId: KEY_ID, model: MODEL, imageRequestId: "img_it1", imageCount: 1, responseMs: 50, status: "success" });
    expect(r.alreadyCharged).toBe(true);
    expect(await bal()).toBe(before);
  });

  it("no_charge writes a cost-0 usage row and does not debit", async () => {
    const { chargeImage } = await import("../services/image-billing-service.js");
    const before = await bal();
    const r = await chargeImage({ userId: UID, apiKeyId: KEY_ID, model: MODEL, imageRequestId: "img_it_err", imageCount: 0, responseMs: 50, status: "no_charge" });
    expect(r.costTL).toBe(0);
    expect(await bal()).toBe(before);
    const rows = await dbSql`SELECT cost_tl, type FROM usage_records WHERE request_id = 'img_it_err'`;
    expect(rows.length).toBe(1);
    expect(Number(rows[0].cost_tl)).toBe(0);
  });
});
