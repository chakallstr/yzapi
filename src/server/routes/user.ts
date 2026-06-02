import { Router } from "express";
import { db } from "../db/client.js";
import { users, apiKeys, usageRecords, systemConfig } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { encryptApiKey, generateApiKey, hashApiKey, decryptApiKey } from "../services/api-key-service.js";
import { writeAudit } from "../services/audit-service.js";
import { getTelegramAccountSummary } from "../services/telegram-bot-service.js";
import { getWhatsappVerificationSummary } from "../services/whatsapp-otp-service.js";
import {
  getMonthlyReport,
  buildMonthlyReportCsv,
  buildMonthlyReportPdf,
} from "../services/report-service.js";

const router = Router();

// Müşteri kullanım geçmişi için GÜVENLİ token kırılımı çıkarıcı.
// raw_usage_json'dan YALNIZ sayısal token alanlarını okur; ham JSON'u (sağlayıcı
// adı / base_url / maliyet / çarpan içerebilir) ASLA dışarı vermez. Böylece
// upstream sızıntı riski sıfır kalır (DOKUNULMAZ: upstream no-leak).
export function extractUsageBreakdown(raw: unknown): {
  cacheReadTokens: number;
  cacheCreateTokens: number;
} {
  const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  if (!raw || typeof raw !== "object") {
    return { cacheReadTokens: 0, cacheCreateTokens: 0 };
  }
  const u = raw as Record<string, unknown>;
  // Anthropic şeması: cache_read_input_tokens / cache_creation_input_tokens.
  // OpenAI şeması: prompt_tokens_details.cached_tokens (cache-read alt kümesi).
  const details = (u.prompt_tokens_details ?? null) as Record<string, unknown> | null;
  const cacheReadTokens =
    toNum(u.cache_read_input_tokens) ||
    toNum(details && typeof details === "object" ? details.cached_tokens : 0);
  const cacheCreateTokens = toNum(u.cache_creation_input_tokens);
  return { cacheReadTokens, cacheCreateTokens };
}

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
        apiKeyId: usageRecords.apiKeyId,
        apiKeyName: apiKeys.ad,
        apiKeyMasked: apiKeys.maskedKey,
        modelId: usageRecords.modelId,
        type: usageRecords.type,
        inputUsage: usageRecords.inputUsage,
        outputUsage: usageRecords.outputUsage,
        unitsUsage: usageRecords.unitsUsage,
        costUsd: usageRecords.costUsd,
        costTL: usageRecords.costTL,
        remainingTL: usageRecords.remainingTL,
        rawUsageJson: usageRecords.rawUsageJson,
        responseMs: usageRecords.responseMs,
        status: usageRecords.status,
        errorCode: usageRecords.errorCode,
        timestamp: usageRecords.timestamp,
      })
      .from(usageRecords)
      .leftJoin(apiKeys, eq(usageRecords.apiKeyId, apiKeys.id))
      .where(eq(usageRecords.userId, req.user!.id))
      .orderBy(desc(usageRecords.timestamp))
      .limit(200);

    res.json(rows.map((r) => {
      const { cacheReadTokens, cacheCreateTokens } = extractUsageBreakdown(r.rawUsageJson);
      const inputUsage = r.inputUsage;
      // Bağlam (cache) kırılımı: faturalanan giriş = taze giriş + cache_read + cache_create.
      // baseInputTokens = faturalanan giriş − cache (negatife düşmez).
      const baseInputTokens = Math.max(0, inputUsage - cacheReadTokens - cacheCreateTokens);
      return {
        id: r.id,
        requestId: r.requestId,
        apiKeyId: r.apiKeyId,
        apiKeyName: r.apiKeyName ?? null,
        apiKeyMasked: r.apiKeyMasked ?? null,
        modelId: r.modelId,
        type: r.type,
        inputUsage,
        outputUsage: r.outputUsage,
        baseInputTokens,
        cacheReadTokens,
        cacheCreateTokens,
        unitsUsage: Number(r.unitsUsage),
        costUsd: Number(r.costUsd),
        costTL: Number(r.costTL),
        remainingTL: r.remainingTL === null ? null : Number(r.remainingTL),
        responseMs: r.responseMs,
        status: r.status,
        errorCode: r.errorCode,
        timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      };
    }));
  } catch (e) { next(e); }
});

// GET /api/user/reports/monthly?month=YYYY-MM[&format=csv|pdf]
router.get("/reports/monthly", async (req, res, next) => {
  try {
    const month = String(req.query.month ?? "").trim() || new Date().toISOString().slice(0, 7);
    const format = String(req.query.format ?? "json").trim().toLowerCase();

    let report;
    try {
      report = await getMonthlyReport(req.user!.id, month);
    } catch (err) {
      if (err instanceof Error && err.message === "invalid_month") {
        res.status(400).json({ error: "month parametresi YYYY-MM biçiminde olmalı." });
        return;
      }
      throw err;
    }

    if (format === "csv") {
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename="yapayzekalab-${month}.csv"`);
      res.send(buildMonthlyReportCsv(report));
      return;
    }

    if (format === "pdf") {
      const pdf = buildMonthlyReportPdf(report);
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", `attachment; filename="yapayzekalab-${month}.pdf"`);
      res.send(pdf);
      return;
    }

    res.json(report);
  } catch (e) { next(e); }
});
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

// GET /api/user/api-keys/:id/reveal
// Owner-only: decrypts the caller's OWN stored key cipher (same re-delivery
// pattern as Telegram) so the panel can pre-fill docs/code examples with the
// user's real key. Scoped strictly by userId; never returns other users' keys.
router.get("/api-keys/:id/reveal", async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await db
      .select({
        id: apiKeys.id,
        ad: apiKeys.ad,
        maskedKey: apiKeys.maskedKey,
        cipher: apiKeys.fullKeyCipher,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, req.user!.id), eq(apiKeys.aktif, true)))
      .limit(1);

    const row = rows[0];
    if (!row) { res.status(404).json({ error: "API key not found" }); return; }

    const plaintext = decryptApiKey(row.cipher);
    if (!plaintext) {
      // Older keys created before cipher storage cannot be revealed.
      res.status(409).json({ error: "key_not_recoverable", maskedKey: row.maskedKey });
      return;
    }

    await writeAudit("user_apikey_reveal", row.id, `Kullanıcı key görüntüledi: ${row.maskedKey}`, req.user!.id);
    res.json({ id: row.id, ad: row.ad, key: plaintext, maskedKey: row.maskedKey });
  } catch (e) { next(e); }
});

export default router;
