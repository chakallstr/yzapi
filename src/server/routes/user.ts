import { Router } from "express";
import { db } from "../db/client.js";
import { users, apiKeys, usageRecords, systemConfig } from "../db/schema.js";
import { eq, and, desc, gte, lte, type SQL } from "drizzle-orm";
import { encryptApiKey, generateApiKey, hashApiKey, decryptApiKey } from "../services/api-key-service.js";
import { writeAudit } from "../services/audit-service.js";
import { getTelegramAccountSummary } from "../services/telegram-bot-service.js";
import { getWhatsappVerificationSummary } from "../services/whatsapp-otp-service.js";
import {
  getMonthlyReport,
  buildMonthlyReportCsv,
  buildMonthlyReportPdf,
} from "../services/report-service.js";
import { extractUsageBreakdown } from "../services/usage-breakdown.js";
import { getUserUsageStats, type UsageStatsWindow } from "../services/user-usage-stats-service.js";
import { listUserEntitlements } from "../services/entitlement-service.js";
import { purchasePackageWithBalance } from "../services/package-purchase-service.js";
import { packagesFeatureEnabled } from "../services/package-service.js";
import { redeemCode } from "../services/redeem-code-service.js";
import { listUserDeliveryOrders } from "../services/account-delivery-service.js";
import { env } from "../lib/env.js";

const router = Router();

// extractUsageBreakdown taşındı → services/usage-breakdown.ts. Test ve dış
// kullanım uyumluluğu için buradan re-export ediliyor (DOKUNULMAZ: upstream no-leak).
export { extractUsageBreakdown } from "../services/usage-breakdown.js";

// ── Paketler (Faz 1) ─────────────────────────────────────────────────────────
// ── AI Chat playground (Faz 3) ───────────────────────────────────────────────
// Panel proxy: kullanıcının aktif yzk_live_ key'ini SUNUCUDA çözer ve kendi
// /v1/chat/completions ucuna iç-forward eder (mevcut billing/paket akışı aynen).
// API key TARAYICIYA çıkmaz. Billing normal (playground = gerçek kullanım).
router.post("/ai-chat", async (req, res, next) => {
  try {
    const keyRows = await db
      .select({ fullKeyCipher: apiKeys.fullKeyCipher })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, req.user!.id), eq(apiKeys.aktif, true)))
      .limit(1);
    if (!keyRows.length || !keyRows[0].fullKeyCipher) {
      res.status(400).json({ error: "Aktif API anahtarı yok. Önce bir API anahtarı oluşturun." });
      return;
    }
    const fullKey = decryptApiKey(keyRows[0].fullKeyCipher);
    const wantStream = (req.body as { stream?: boolean })?.stream === true;

    const upstream = await fetch(`http://127.0.0.1:${env.PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fullKey}` },
      body: JSON.stringify(req.body ?? {}),
    });

    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);

    if (wantStream && upstream.body) {
      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const text = await upstream.text();
      res.send(text);
    }
  } catch (e) {
    next(e);
  }
});

// ── Studio (Faz 4a) — görsel üretim panel proxy (key server-side, ai-chat ile aynı) ──
router.post("/studio", async (req, res, next) => {
  try {
    const keyRows = await db
      .select({ fullKeyCipher: apiKeys.fullKeyCipher })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, req.user!.id), eq(apiKeys.aktif, true)))
      .limit(1);
    if (!keyRows.length || !keyRows[0].fullKeyCipher) {
      res.status(400).json({ error: "Aktif API anahtarı yok. Önce bir API anahtarı oluşturun." });
      return;
    }
    const fullKey = decryptApiKey(keyRows[0].fullKeyCipher);
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const endpoint = raw.endpoint === "edits" ? "edits" : "generations";
    const { endpoint: _omit, ...imageBody } = raw;
    void _omit;

    const upstream = await fetch(`http://127.0.0.1:${env.PORT}/v1/images/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fullKey}` },
      body: JSON.stringify(imageBody),
    });
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    const text = await upstream.text();
    res.send(text);
  } catch (e) {
    next(e);
  }
});

router.post("/redeem", async (req, res, next) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code?.trim()) {
      res.status(400).json({ error: "Kod gerekli" });
      return;
    }
    const result = await redeemCode(req.user!.id, code);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.get("/delivery-orders", async (req, res, next) => {
  try {
    res.json(await listUserDeliveryOrders(req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.get("/entitlements", async (req, res, next) => {
  try {
    res.json(await listUserEntitlements(req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.post("/packages/:id/purchase", async (req, res, next) => {
  try {
    if (!(await packagesFeatureEnabled())) {
      res.status(404).json({ error: "Paket özelliği kapalı" });
      return;
    }
    const idempotencyKey = req.header("Idempotency-Key") || undefined;
    const contact = (req.body as { contact?: string })?.contact;
    const result = await purchasePackageWithBalance(req.user!.id, req.params.id, idempotencyKey, contact);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

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

// PATCH /api/user/me — update display name and/or language preference (both optional)
router.patch("/me", async (req, res, next) => {
  try {
    const updates: { adSoyad?: string; lang?: string; updatedAt?: Date } = {};
    const auditParts: string[] = [];

    if (req.body?.adSoyad !== undefined) {
      const adSoyad = String(req.body.adSoyad || "").trim();
      if (!adSoyad || adSoyad.length < 2) {
        res.status(400).json({ error: "Ad soyad en az 2 karakter olmalı." });
        return;
      }
      updates.adSoyad = adSoyad;
      auditParts.push(`ad: ${adSoyad}`);
    }

    if (req.body?.lang !== undefined) {
      const lang = String(req.body.lang);
      if (lang !== "tr" && lang !== "en") {
        res.status(400).json({ error: "Geçersiz dil tercihi (tr veya en)." });
        return;
      }
      updates.lang = lang;
      auditParts.push(`dil: ${lang}`);
    }

    if (auditParts.length === 0) {
      res.status(400).json({ error: "Güncellenecek alan yok." });
      return;
    }

    updates.updatedAt = new Date();

    const updatedRows = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.user!.id))
      .returning();

    if (!updatedRows.length) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await writeAudit("user_profile_update", req.user!.id, `Kullanıcı profilini güncelledi (${auditParts.join(", ")})`, req.user!.id);

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
    // Sayfalama + filtre (hepsi salt-okuma, kullanıcının KENDİ kayıtları).
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const model = String(req.query.model ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const fromRaw = String(req.query.from ?? "").trim();
    const toRaw = String(req.query.to ?? "").trim();
    const fromDate = fromRaw ? new Date(fromRaw) : null;
    const toDate = toRaw ? new Date(toRaw) : null;

    const conditions: SQL[] = [eq(usageRecords.userId, req.user!.id)];
    if (model) conditions.push(eq(usageRecords.modelId, model));
    if (status) conditions.push(eq(usageRecords.status, status));
    if (fromDate && !Number.isNaN(fromDate.getTime())) conditions.push(gte(usageRecords.timestamp, fromDate));
    if (toDate && !Number.isNaN(toDate.getTime())) conditions.push(lte(usageRecords.timestamp, toDate));

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
      .where(and(...conditions))
      .orderBy(desc(usageRecords.timestamp))
      .limit(limit)
      .offset(offset);

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

// GET /api/user/usage-stats?window=hour|day|week|month
// Tüm geçmiş üzerinden (200-cap YOK) sunucu-tarafı agregat: overview, zaman
// serisi (maliyet/token/başarı-hata), top modeller ve ay-başından-bugüne toplam.
// Yalnız kullanıcının KENDİ kayıtları; ham JSON / provider adı sızdırmaz.
router.get("/usage-stats", async (req, res, next) => {
  try {
    const allowed: UsageStatsWindow[] = ["hour", "day", "week", "month"];
    const windowParam = String(req.query.window ?? "day").trim();
    const window = (allowed.includes(windowParam as UsageStatsWindow) ? windowParam : "day") as UsageStatsWindow;
    const stats = await getUserUsageStats(req.user!.id, window);
    res.json(stats);
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
