import { Router } from "express";
import { db } from "../db/client.js";
import { users, apiKeys, usageRecords, systemConfig } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { encryptApiKey, generateApiKey, hashApiKey } from "../services/api-key-service.js";
import { writeAudit } from "../services/audit-service.js";
import { getTelegramAccountSummary } from "../services/telegram-bot-service.js";
import { getWhatsappVerificationSummary } from "../services/whatsapp-otp-service.js";

const router = Router();

async function buildUserMePayload(userId: string, safe: Record<string, unknown>) {
  const configRows = await db
    .select({ kur: systemConfig.kur })
    .from(systemConfig)
    .where(eq(systemConfig.id, 1))
    .limit(1);
  const kur = Number(configRows[0]?.kur ?? 0);
  const bakiyeTL = Number(safe.bakiyeTL ?? 0);
  const bakiyeUsd = kur > 0 ? bakiyeTL / kur : 0;
  const userCode = safe.id ? `u-${String(safe.id).replace(/-/g, "").slice(0, 8)}` : null;
  const [whatsapp, telegramSummary] = await Promise.all([
    getWhatsappVerificationSummary(userId),
    getTelegramAccountSummary(userId),
  ]);
  return {
    ...safe,
    bakiyeUsd,
    userCode,
    telegram: {
      linked: telegramSummary.linked,
      telegramId: telegramSummary.telegramId,
      username: telegramSummary.username,
      linkedAt: telegramSummary.linkedAt,
      status: telegramSummary.status,
      linkMethod: telegramSummary.linkMethod,
      botUrl: telegramSummary.botUrl,
    },
    ...whatsapp,
  };
}

// GET /api/user/me
router.get("/me", async (req, res, next) => {
  try {
    const rows = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "User not found" }); return; }
    const { passwordHash, ...safe } = rows[0];
    void passwordHash; // explicitly consumed
    res.json(await buildUserMePayload(req.user!.id, safe));
  } catch (e) { next(e); }
});

// PATCH /api/user/me
router.patch("/me", async (req, res, next) => {
  try {
    const adSoyad = String(req.body?.adSoyad || "").trim();
    if (!adSoyad || adSoyad.length < 2) {
      res.status(400).json({ error: "Ad soyad en az 2 karakter olmalı." });
      return;
    }

    const updatedRows = await db
      .update(users)
      .set({ adSoyad, updatedAt: new Date() })
      .where(eq(users.id, req.user!.id))
      .returning();

    if (!updatedRows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await writeAudit("user_profile_update", req.user!.id, `Kullanıcı profil adını güncelledi: ${adSoyad}`, req.user!.id);

    const { passwordHash, ...safe } = updatedRows[0];
    void passwordHash;
    res.json(await buildUserMePayload(req.user!.id, safe));
  } catch (e) { next(e); }
});

// GET /api/user/api-keys
router.get("/api-keys", async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: apiKeys.id,
        ad: apiKeys.ad,
        maskedKey: apiKeys.maskedKey,
        fullKeyCipher: apiKeys.fullKeyCipher,
        prefix: apiKeys.prefix,
        olusturma: apiKeys.olusturma,
        sonKullanim: apiKeys.sonKullanim,
        aktif: apiKeys.aktif,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, req.user!.id), eq(apiKeys.aktif, true)));
    res.json(rows.map((row) => ({
      id: row.id,
      ad: row.ad,
      maskedKey: row.maskedKey,
      prefix: row.prefix,
      olusturma: row.olusturma,
      sonKullanim: row.sonKullanim,
      aktif: row.aktif,
    })));
  } catch (e) { next(e); }
});

// GET /api/user/usage-records
router.get("/usage-records", async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: usageRecords.id,
        requestId: usageRecords.requestId,
        modelId: usageRecords.modelId,
        type: usageRecords.type,
        inputUsage: usageRecords.inputUsage,
        outputUsage: usageRecords.outputUsage,
        unitsUsage: usageRecords.unitsUsage,
        costTL: usageRecords.costTL,
        remainingTL: usageRecords.remainingTL,
        responseMs: usageRecords.responseMs,
        status: usageRecords.status,
        errorCode: usageRecords.errorCode,
        timestamp: usageRecords.timestamp,
      })
      .from(usageRecords)
      .where(eq(usageRecords.userId, req.user!.id))
      .orderBy(desc(usageRecords.timestamp))
      .limit(100);

    res.json(rows.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      modelId: r.modelId,
      type: r.type,
      inputUsage: r.inputUsage,
      outputUsage: r.outputUsage,
      unitsUsage: Number(r.unitsUsage),
      costTL: Number(r.costTL),
      remainingTL: r.remainingTL === null ? null : Number(r.remainingTL),
      responseMs: r.responseMs,
      status: r.status,
      errorCode: r.errorCode,
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    })));
  } catch (e) { next(e); }
});

// POST /api/user/api-keys
router.post("/api-keys", async (req, res, next) => {
  try {
    const { ad } = req.body as { ad?: string };
    if (!ad?.trim()) { res.status(400).json({ error: "ad (name) is required" }); return; }

    const { fullKey, prefix, maskedKey } = generateApiKey();
    const keyHash = await hashApiKey(fullKey);
    const fullKeyCipher = encryptApiKey(fullKey);

    const inserted = await db.insert(apiKeys).values({
      userId: req.user!.id,
      ad: ad.trim(),
      maskedKey,
      keyHash,
      fullKeyCipher,
      prefix,
    }).returning();

    const row = inserted[0];
    await writeAudit("user_apikey_create", row.id, `Kullanıcı key oluşturdu: ${maskedKey}`, req.user!.id);

    res.status(201).json({
      key: fullKey,
      masked: maskedKey,
      id: row.id,
      ad: row.ad,
      olusturma: row.olusturma,
    });
  } catch (e) { next(e); }
});

// POST /api/user/api-keys/:id/revoke
router.post("/api-keys/:id/revoke", async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await db
      .update(apiKeys)
      .set({ aktif: false })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, req.user!.id)))
      .returning();

    if (!updated.length) { res.status(404).json({ error: "API key not found" }); return; }
    await writeAudit("user_apikey_revoke", id, `Kullanıcı key iptal etti: ${updated[0].maskedKey}`, req.user!.id);

    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
