import { Router, Request, Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, dbSql } from "../db/client.js";
import {
  systemConfig,
  users,
  apiKeys,
  plans,
  modelOverrides,
  announcements,
  providerDurumlari,
  auditLogs,
  transactions,
  kurHistory,
  usageRecords,
} from "../db/schema.js";
import { writeAudit } from "../services/audit-service.js";
import { refreshKur } from "../services/kur-service.js";
import { getReconciliationReport } from "../services/reconciliation-service.js";
import { runScan, persistScan, getLatestScan } from "../services/mali-izleme-service.js";
import { runGozcuScan, getOpenFindings, getSignalHistory } from "../services/gozcu/engine.js";
import { executeHealForCheck } from "../services/gozcu/heal/run.js";
import { encryptApiKey, generateApiKey, hashApiKey } from "../services/api-key-service.js";
import { getAdminTrafficAnalytics, type TrafficWindow } from "../services/admin-traffic-service.js";
import {
  getApiKeyPolicySnapshot,
  getApiSettingsSnapshot,
  getRuntimeApiConfig,
  listAdminApiSettingModels,
  listAvailableProviders,
  upsertApiKeyPolicy,
  upsertModelRuntimePolicy,
  upsertSystemApiConfig,
} from "../services/api-settings-service.js";
import { listImplementedProviderIds } from "../services/provider-adapter.js";
import {
  listAllPackages,
  createPackage,
  updatePackage,
  setPackageEnabled,
  deletePackage,
} from "../services/package-service.js";
import { setPackageProviderOverride } from "../services/package-provider-override.js";
import { generateRedeemCodes, listRedeemCodes, setRedeemCodeEnabled, markRedeemCodeCopied } from "../services/redeem-code-service.js";
import { listAllDeliveryOrders, markDeliveryDelivered, cancelDeliveryWithRefund } from "../services/account-delivery-service.js";
import { getRikaResellerStatus } from "../services/rika-reseller-service.js";
import {
  getProviderConfigAdminView,
  saveProviderConfig,
  testProviderConnection,
  listProviderProfiles,
  upsertProviderProfile,
  setActiveProvider,
} from "../services/provider-config-service.js";
import {
  createAddedModel,
  deleteAddedModel,
  listAddedModels,
} from "../services/added-model-service.js";
import {
  getLiveStateSummary,
  getLiveStateTables,
  getLiveStateTableRows,
} from "../services/admin-live-state-service.js";

const router = Router();
const SINGLE_ADMIN_EMAIL = "cix.crazy666@gmail.com";
const ALLOWED_TRAFFIC_WINDOWS = new Set<TrafficWindow>(["24h", "7d", "30d"]);
const DEFAULT_USER_SORT = "kayitTarihi_desc";
const ALLOWED_USER_SORTS = new Set([
  "kayitTarihi_desc",
  "kayitTarihi_asc",
  "sonAktivite_desc",
  "bakiye_desc",
  "bakiye_asc",
  "istek_desc",
  "harcama_desc",
  "email_asc",
]);

function parseTrafficWindow(raw: unknown): TrafficWindow {
  const value = String(raw ?? "24h") as TrafficWindow;
  return ALLOWED_TRAFFIC_WINDOWS.has(value) ? value : "24h";
}

function parseUserSort(raw: unknown): string {
  const value = String(raw ?? DEFAULT_USER_SORT);
  return ALLOWED_USER_SORTS.has(value) ? value : DEFAULT_USER_SORT;
}

function requireOwner(req: Request, res: Response): boolean {
  if (req.adminRole === "owner") return true;
  res.status(403).json({ error: "Owner admin required" });
  return false;
}

function asTime(value: Date | string | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareDateDesc(a: Date | string | null | undefined, b: Date | string | null | undefined): number {
  return asTime(b) - asTime(a);
}

function compareTextAsc(a: string | null | undefined, b: string | null | undefined): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "tr", { sensitivity: "base" });
}

function sortAdminUsers(rows: Array<typeof users.$inferSelect>, sort: string) {
  const selected = parseUserSort(sort);
  return [...rows].sort((a, b) => {
    const newestTie = compareDateDesc(a.kayitTarihi, b.kayitTarihi) || compareTextAsc(a.email, b.email);
    if (selected === "kayitTarihi_asc") return asTime(a.kayitTarihi) - asTime(b.kayitTarihi) || compareTextAsc(a.email, b.email);
    if (selected === "sonAktivite_desc") return compareDateDesc(a.sonAktivite, b.sonAktivite) || newestTie;
    if (selected === "bakiye_desc") return Number(b.bakiyeTL) - Number(a.bakiyeTL) || newestTie;
    if (selected === "bakiye_asc") return Number(a.bakiyeTL) - Number(b.bakiyeTL) || newestTie;
    if (selected === "istek_desc") return Number(b.toplamIstek) - Number(a.toplamIstek) || newestTie;
    if (selected === "harcama_desc") return Number(b.toplamHarcamaTL) - Number(a.toplamHarcamaTL) || newestTie;
    if (selected === "email_asc") return compareTextAsc(a.email, b.email) || newestTie;
    return newestTie;
  });
}

// ── Helper: serialize timestamps to ISO strings ────────────────────────────────
function serializeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    adSoyad: u.adSoyad,
    bakiyeTL: Number(u.bakiyeTL),
    toplamHarcamaTL: Number(u.toplamHarcamaTL),
    toplamIstek: u.toplamIstek,
    durum: u.durum,
    kayitTarihi: u.kayitTarihi instanceof Date ? u.kayitTarihi.toISOString().split("T")[0] : String(u.kayitTarihi),
    kayitTarihiIso: u.kayitTarihi instanceof Date ? u.kayitTarihi.toISOString() : String(u.kayitTarihi),
    sonAktivite: u.sonAktivite instanceof Date ? u.sonAktivite.toISOString() : String(u.sonAktivite),
    plan: u.plan,
    apiKeyCount: u.apiKeyCount,
    not: u.not,
    gunlukLimitTL: u.gunlukLimitTL !== null ? Number(u.gunlukLimitTL) : null,
    role: u.role,
  };
}

function serializeUsageRecord(r: typeof usageRecords.$inferSelect) {
  return {
    id: r.id,
    userId: r.userId,
    apiKeyId: r.apiKeyId,
    modelId: r.modelId,
    type: r.type,
    inputUsage: r.inputUsage,
    outputUsage: r.outputUsage,
    unitsUsage: Number(r.unitsUsage),
    costUsd: Number(r.costUsd),
    costTL: Number(r.costTL),
    remainingTL: r.remainingTL === null ? null : Number(r.remainingTL),
    requestId: r.requestId,
    upstreamRequestId: r.upstreamRequestId,
    errorCode: r.errorCode,
    responseMs: r.responseMs,
    status: r.status,
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
  };
}

function serializeConfig(cfg: typeof systemConfig.$inferSelect) {
  return {
    kur: Number(cfg.kur),
    liveKur: Number(cfg.liveKur),
    kurBuffer: Number(cfg.kurBuffer),
    kurSource: cfg.kurSource,
    autoKurRefresh: cfg.autoKurRefresh,
    kurRefreshIntervalDk: cfg.kurRefreshIntervalDk,
    lastKurRefresh: cfg.lastKurRefresh instanceof Date ? cfg.lastKurRefresh.toISOString() : cfg.lastKurRefresh,
    textCarpan: Number(cfg.textCarpan),
    imageCarpan: Number(cfg.imageCarpan),
    videoCarpan: Number(cfg.videoCarpan),
    platformAdi: cfg.platformAdi,
    destekEmail: cfg.destekEmail,
    paymentWhatsappNumber: cfg.paymentWhatsappNumber,
    cryptoWalletEnabled: cfg.cryptoWalletEnabled,
    cryptoWalletAsset: cfg.cryptoWalletAsset,
    cryptoWalletNetwork: cfg.cryptoWalletNetwork,
    cryptoWalletAddress: cfg.cryptoWalletAddress,
    cryptoWalletMemo: cfg.cryptoWalletMemo,
    maxBakiyeTL: Number(cfg.maxBakiyeTL),
    minBakiyeTL: Number(cfg.minBakiyeTL),
    anomaliEsikTL: Number(cfg.anomaliEsikTL),
    signupBonusEnabled: cfg.signupBonusEnabled,
    signupBonusTL: Number(cfg.signupBonusTL),
    signupBonusMaxPerIp: cfg.signupBonusMaxPerIp,
  };
}

function serializePlan(p: typeof plans.$inferSelect) {
  return {
    id: p.id,
    ad: p.ad,
    gunlukLimitTL: p.gunlukLimitTL !== null ? Number(p.gunlukLimitTL) : null,
    aylikLimitTL: p.aylikLimitTL !== null ? Number(p.aylikLimitTL) : null,
    izinliModeller: Array.isArray(p.izinliModeller) ? p.izinliModeller : JSON.parse(p.izinliModeller as any ?? "[]"),
    aciklama: p.aciklama,
  };
}

function serializeApiKey(k: typeof apiKeys.$inferSelect, userEmail?: string) {
  return {
    id: k.id,
    userId: k.userId,
    userEmail: userEmail ?? "",
    ad: k.ad,
    maskedKey: k.maskedKey,
    olusturma: k.olusturma instanceof Date ? k.olusturma.toISOString() : String(k.olusturma),
    sonKullanim: k.sonKullanim instanceof Date ? k.sonKullanim.toISOString() : k.sonKullanim,
    aktif: k.aktif,
  };
}

function serializeTransaction(t: typeof transactions.$inferSelect) {
  return {
    id: t.id,
    userId: t.userId,
    userEmail: t.userEmail,
    tip: t.tip,
    miktarTL: Number(t.miktarTL),
    oncekiBakiye: Number(t.oncekiBakiye),
    sonrakiBakiye: Number(t.sonrakiBakiye),
    aciklama: t.aciklama,
    timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp),
  };
}

function serializeAnnouncement(a: typeof announcements.$inferSelect) {
  return {
    id: a.id,
    mesaj: a.mesaj,
    tip: a.tip,
    aktif: a.aktif,
    baslangic: a.baslangic instanceof Date ? a.baslangic.toISOString() : String(a.baslangic),
    bitis: a.bitis instanceof Date ? a.bitis.toISOString() : String(a.bitis),
  };
}

function serializeProvider(p: typeof providerDurumlari.$inferSelect) {
  return {
    provider: p.provider,
    durum: p.durum,
    gecikmeMs: p.gecikmeMs,
    sonKontrol: p.sonKontrol instanceof Date ? p.sonKontrol.toISOString() : String(p.sonKontrol),
    not: p.not,
  };
}

// ── AdminConfig ───────────────────────────────────────────────────────────────
router.get("/config", async (_req, res, next) => {
  try {
    const rows = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "Config not found" });
    res.json(serializeConfig(rows[0]));
  } catch (e) { next(e); }
});

router.post("/config", async (req, res, next) => {
  try {
    const rows = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
    if (!rows.length) return res.status(404).json({ error: "Config not found" });
    const prev = rows[0];

    const body = req.body;
    const updates: Partial<typeof systemConfig.$inferInsert> = {};

    if (body.kur !== undefined) updates.kur = String(body.kur);
    if (body.liveKur !== undefined) updates.liveKur = String(body.liveKur);
    if (body.kurBuffer !== undefined) updates.kurBuffer = String(body.kurBuffer);
    if (body.kurSource !== undefined) updates.kurSource = body.kurSource;
    if (body.autoKurRefresh !== undefined) updates.autoKurRefresh = body.autoKurRefresh;
    if (body.kurRefreshIntervalDk !== undefined) updates.kurRefreshIntervalDk = body.kurRefreshIntervalDk;
    if (body.textCarpan !== undefined) updates.textCarpan = String(body.textCarpan);
    if (body.imageCarpan !== undefined) updates.imageCarpan = String(body.imageCarpan);
    if (body.videoCarpan !== undefined) updates.videoCarpan = String(body.videoCarpan);
    if (body.platformAdi !== undefined) updates.platformAdi = body.platformAdi;
    if (body.destekEmail !== undefined) updates.destekEmail = body.destekEmail;
    if (body.paymentWhatsappNumber !== undefined) updates.paymentWhatsappNumber = String(body.paymentWhatsappNumber ?? "");
    if (body.cryptoWalletEnabled !== undefined) updates.cryptoWalletEnabled = Boolean(body.cryptoWalletEnabled);
    if (body.cryptoWalletAsset !== undefined) updates.cryptoWalletAsset = String(body.cryptoWalletAsset ?? "USDT");
    if (body.cryptoWalletNetwork !== undefined) updates.cryptoWalletNetwork = String(body.cryptoWalletNetwork ?? "TRC20");
    if (body.cryptoWalletAddress !== undefined) updates.cryptoWalletAddress = String(body.cryptoWalletAddress ?? "");
    if (body.cryptoWalletMemo !== undefined) updates.cryptoWalletMemo = String(body.cryptoWalletMemo ?? "");
    if (body.maxBakiyeTL !== undefined) updates.maxBakiyeTL = String(body.maxBakiyeTL);
    if (body.minBakiyeTL !== undefined) updates.minBakiyeTL = String(body.minBakiyeTL);
    if (body.anomaliEsikTL !== undefined) updates.anomaliEsikTL = String(body.anomaliEsikTL);
    if (body.signupBonusEnabled !== undefined) updates.signupBonusEnabled = Boolean(body.signupBonusEnabled);
    if (body.signupBonusTL !== undefined) updates.signupBonusTL = String(Math.max(0, Number(body.signupBonusTL) || 0));
    if (body.signupBonusMaxPerIp !== undefined) updates.signupBonusMaxPerIp = Math.max(0, Math.floor(Number(body.signupBonusMaxPerIp) || 0));
    updates.updatedAt = new Date();

    await db.update(systemConfig).set(updates).where(eq(systemConfig.id, 1));

    const updated = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
    await writeAudit(
      "config_update",
      "AdminConfig",
      `kur: ${prev.kur} → ${updated[0].kur}, textCarpan: ${prev.textCarpan} → ${updated[0].textCarpan}`
    );
    res.json(serializeConfig(updated[0]));
  } catch (e) { next(e); }
});

// ── API Settings ─────────────────────────────────────────────────────────────
router.get("/api-settings", async (_req, res, next) => {
  try {
    const [snapshot, provider] = await Promise.all([
      getApiSettingsSnapshot(),
      getProviderConfigAdminView(),
    ]);
    // provider view exposes only the masked key + base URL + timestamp;
    // never the cipher or plaintext (Requirements 1.2, 2.2, 2.3, 9.1).
    res.json({ ...snapshot, provider });
  } catch (e) { next(e); }
});

router.post("/api-settings", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (body.activeProviderId && !listImplementedProviderIds().includes(String(body.activeProviderId))) {
      return res.status(400).json({ error: "Desteklenmeyen aktif provider seçimi." });
    }

    // Provider_Config write-only fields (Requirements 1.1, 2.1, 2.4, 2.6).
    // saveProviderConfig validates the base URL (400) and rejects empty-string
    // keys (400); a write attempt is always audited (Requirement 1.4).
    const hasProviderBaseUrl = Object.prototype.hasOwnProperty.call(body, "providerBaseUrl");
    const hasProviderApiKey = Object.prototype.hasOwnProperty.call(body, "providerApiKey");
    let providerView: Awaited<ReturnType<typeof getProviderConfigAdminView>> | undefined;
    if (hasProviderBaseUrl || hasProviderApiKey) {
      try {
        providerView = await saveProviderConfig({
          ...(hasProviderBaseUrl ? { providerBaseUrl: body.providerBaseUrl } : {}),
          ...(hasProviderApiKey ? { providerApiKey: body.providerApiKey } : {}),
        });
        await writeAudit(
          "provider_config_update",
          "system_api_config",
          `baseUrlChanged: ${hasProviderBaseUrl}, apiKeyChanged: ${hasProviderApiKey}`,
        );
      } catch (providerErr) {
        // Audit the attempt even when validation fails (Requirement 1.4).
        await writeAudit(
          "provider_config_update",
          "system_api_config",
          `rejected: ${providerErr instanceof Error ? providerErr.message : "invalid input"}`,
        );
        throw providerErr;
      }
    }

    const updated = await upsertSystemApiConfig(body);
    await writeAudit("api_settings_update", "system_api_config", `activeProviderId: ${updated.activeProviderId}`);
    res.json(providerView ? { ...updated, provider: providerView } : updated);
  } catch (e) { next(e); }
});

// ── Provider config: connection test (read-only probe, persists nothing) ───────
router.post("/provider/test-connection", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await testProviderConnection({
      ...(body.providerBaseUrl !== undefined ? { providerBaseUrl: body.providerBaseUrl } : {}),
      ...(body.providerApiKey !== undefined ? { providerApiKey: body.providerApiKey } : {}),
    });
    res.json(result);
  } catch (e) { next(e); }
});

// ── Provider profiles: metro ⇄ closerouter active-provider switch (R-panel) ────
// Each view exposes only the masked key — never the cipher or plaintext.
router.get("/provider-profiles", async (_req, res, next) => {
  try {
    res.json(await listProviderProfiles());
  } catch (e) { next(e); }
});

router.post("/provider-profiles", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    // upsertProviderProfile validates the base URL (400) and rejects empty-string
    // keys (400); the apiKey is write-only (omitted → cipher unchanged).
    try {
      const view = await upsertProviderProfile({
        id: String(body.id ?? ""),
        ...(body.label !== undefined ? { label: String(body.label) } : {}),
        ...(body.baseUrl !== undefined ? { baseUrl: String(body.baseUrl) } : {}),
        ...(Object.prototype.hasOwnProperty.call(body, "apiKey") ? { apiKey: body.apiKey } : {}),
        ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
        ...(body.supportedModelIds !== undefined ? { supportedModelIds: body.supportedModelIds } : {}),
        ...(body.modelMap !== undefined ? { modelMap: body.modelMap } : {}),
      });
      await writeAudit(
        "provider_profile_upsert",
        view.id,
        `baseUrlChanged: ${body.baseUrl !== undefined}, apiKeyChanged: ${Boolean(body.apiKey)}`,
      );
      res.json(view);
    } catch (upsertErr) {
      // Audit the attempt even when validation fails.
      await writeAudit(
        "provider_profile_upsert",
        String(body.id ?? "unknown"),
        `rejected: ${upsertErr instanceof Error ? upsertErr.message : "invalid input"}`,
      );
      throw upsertErr;
    }
  } catch (e) { next(e); }
});

// ── GPT-5.5/5.4 routing switch (Rika ↔ primary GPT provider) ─────────────
const GPT55_ROUTE_MODELS = ['gpt-5.5', 'gpt-5.5-2026-04-23', 'gpt-5.4', 'gpt-5.4-2026-03-05'];
const GPT_PRIMARY_ID = 'closerouter';
type GptRoutingTarget = 'primary' | 'backup';

function parseGptRoutingTarget(value: string): GptRoutingTarget | null {
  if (value === 'primary' || value === 'popusk') return 'primary';
  if (value === 'backup' || value === 'rika') return 'backup';
  return null;
}

router.get("/gpt-routing", async (_req, res, next) => {
  try {
    const list = await listProviderProfiles();
    const primary = list.find((p) => p.id === GPT_PRIMARY_ID);
    const inPrimary = (primary?.supportedModelIds ?? []).includes('gpt-5.5');
    res.json({ target: inPrimary ? 'primary' : 'backup' });
  } catch (e) { next(e); }
});

router.post("/gpt-routing", async (req, res, next) => {
  try {
    const target = parseGptRoutingTarget(String((req.body ?? {}).target ?? ''));
    if (!target) {
      res.status(400).json({ error: 'target must be primary or backup' }); return;
    }
    const list = await listProviderProfiles();
    const primary = list.find((p) => p.id === GPT_PRIMARY_ID);
    const current = primary?.supportedModelIds ?? [];
    const next = target === 'primary'
      ? [...new Set([...current, ...GPT55_ROUTE_MODELS])]
      : current.filter((m) => !GPT55_ROUTE_MODELS.includes(m));
    await upsertProviderProfile({ id: GPT_PRIMARY_ID, supportedModelIds: next });
    await writeAudit('gpt_routing_switch', GPT_PRIMARY_ID, `target: ${target}`);
    res.json({ target });
  } catch (e) { next(e); }
});

router.post("/provider-profiles/activate", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const id = String(body.id ?? "");
    try {
      const view = await setActiveProvider(id);
      await writeAudit("provider_profile_activate", view.id, `activeProviderId: ${view.id}`);
      res.json(view);
    } catch (activateErr) {
      // Audit the attempt even when it is rejected (unknown/disabled provider).
      await writeAudit(
        "provider_profile_activate",
        id || "unknown",
        `rejected: ${activateErr instanceof Error ? activateErr.message : "invalid input"}`,
      );
      throw activateErr;
    }
  } catch (e) { next(e); }
});

// ── Added models (additive catalog layer) ──────────────────────────────────────
router.get("/added-models", async (_req, res, next) => {
  try {
    res.json(await listAddedModels());
  } catch (e) { next(e); }
});

router.post("/added-models", async (req, res, next) => {
  try {
    const body = req.body ?? {};
    // ConflictError (409) on duplicate id is surfaced by the central error handler.
    const created = await createAddedModel({
      modelId: String(body.modelId ?? ""),
      name: String(body.name ?? ""),
      providerLabel: String(body.providerLabel ?? ""),
      inputUsd: Number(body.inputUsd ?? 0),
      outputUsd: Number(body.outputUsd ?? 0),
      type: body.type === "Görsel" ? "Görsel" : "Metin",
      imagePriceUsd: body.imagePriceUsd != null ? Number(body.imagePriceUsd) : 0,
      enabled: body.enabled,
    });
    await writeAudit("added_model_create", created.modelId, `name: ${created.name}`);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.delete("/added-models/:modelId", async (req, res, next) => {
  try {
    const { modelId } = req.params;
    // BadRequestError (400) when targeting a MASTER id is surfaced by the error handler.
    await deleteAddedModel(modelId);
    await writeAudit("added_model_delete", modelId, "Ek model silindi");
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.get("/api-settings/providers", async (_req, res, next) => {
  try {
    const [providers, runtimeConfig] = await Promise.all([
      listAvailableProviders(),
      getRuntimeApiConfig(),
    ]);
    res.json({
      activeProviderId: runtimeConfig.activeProviderId,
      providers: providers.map((provider) => ({
        ...provider,
        active: provider.id === runtimeConfig.activeProviderId,
      })),
    });
  } catch (e) { next(e); }
});

router.get("/api-settings/models", async (_req, res, next) => {
  try {
    res.json(await listAdminApiSettingModels());
  } catch (e) { next(e); }
});

router.post("/api-settings/models/:id", async (req, res, next) => {
  try {
    const modelId = String(req.params.id);
    const body = req.body ?? {};
    const updated = await upsertModelRuntimePolicy(modelId, {
      pricingEnabled: body.pricingEnabled,
      inputUsdOverride: body.inputUsdOverride ?? null,
      outputUsdOverride: body.outputUsdOverride ?? null,
      runtimeEnabled: body.runtimeEnabled,
      contextOverrideTokens: body.contextOverrideTokens ?? null,
      maxOutputTokens: body.maxOutputTokens ?? null,
      allowStreaming: body.allowStreaming ?? null,
    });
    await writeAudit("api_model_policy_update", modelId, "API yönetimi modeli güncellendi");
    res.json(updated);
  } catch (e) { next(e); }
});

router.get("/api-settings/api-keys/:id/policy", async (req, res, next) => {
  try {
    const snapshot = await getApiKeyPolicySnapshot(String(req.params.id));
    if (!snapshot.apiKey) {
      return res.status(404).json({ error: "API key bulunamadı" });
    }
    res.json(snapshot);
  } catch (e) { next(e); }
});

router.post("/api-settings/api-keys/:id/policy", async (req, res, next) => {
  try {
    const apiKeyId = String(req.params.id);
    const body = req.body ?? {};
    const updated = await upsertApiKeyPolicy(apiKeyId, {
      perKeyPerMinute: body.perKeyPerMinute ?? null,
      maxContextTokens: body.maxContextTokens ?? null,
      maxOutputTokens: body.maxOutputTokens ?? null,
      allowedModels: body.allowedModels ?? [],
      dailySpendLimitTL: body.dailySpendLimitTL ?? null,
      monthlySpendLimitTL: body.monthlySpendLimitTL ?? null,
      allowStreaming: body.allowStreaming ?? null,
    });
    await writeAudit("api_key_policy_update", apiKeyId, "API key politikası güncellendi");
    res.json(updated);
  } catch (e) { next(e); }
});

// ── Model Overrides ───────────────────────────────────────────────────────────
router.get("/model-overrides", async (_req, res, next) => {
  try {
    const rows = await db.select().from(modelOverrides);
    res.json(rows.map((o) => ({
      modelId: o.modelId,
      enabled: o.enabled,
      inputUsdOverride: o.inputUsdOverride !== null ? Number(o.inputUsdOverride) : null,
      outputUsdOverride: o.outputUsdOverride !== null ? Number(o.outputUsdOverride) : null,
      notlar: o.notlar,
    })));
  } catch (e) { next(e); }
});

router.post("/model-overrides", async (req, res, next) => {
  try {
    const { modelId, enabled, inputUsdOverride, outputUsdOverride, notlar } = req.body;
    const values = {
      modelId,
      enabled: enabled ?? true,
      inputUsdOverride: inputUsdOverride !== undefined && inputUsdOverride !== null ? String(inputUsdOverride) : null,
      outputUsdOverride: outputUsdOverride !== undefined && outputUsdOverride !== null ? String(outputUsdOverride) : null,
      notlar: notlar ?? "",
      updatedAt: new Date(),
    };
    await db
      .insert(modelOverrides)
      .values(values)
      .onConflictDoUpdate({ target: modelOverrides.modelId, set: values });
    await writeAudit("model_override_upsert", modelId, `enabled: ${enabled}`);
    res.json({ modelId, enabled, inputUsdOverride: inputUsdOverride ?? null, outputUsdOverride: outputUsdOverride ?? null, notlar: notlar ?? "" });
  } catch (e) { next(e); }
});

router.delete("/model-overrides/:modelId", async (req, res, next) => {
  try {
    const { modelId } = req.params;
    await db.delete(modelOverrides).where(eq(modelOverrides.modelId, modelId));
    await writeAudit("model_override_delete", modelId, "Override silindi");
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Users ─────────────────────────────────────────────────────────────────────
router.get("/users", async (req, res, next) => {
  try {
    const { search, plan, durum, sort } = req.query as Record<string, string>;
    let rows = await db.select().from(users);

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (u) => u.email.toLowerCase().includes(q) || u.adSoyad.toLowerCase().includes(q)
      );
    }
    if (plan) rows = rows.filter((u) => u.plan === plan);
    if (durum) rows = rows.filter((u) => u.durum === durum);
    rows = sortAdminUsers(rows, sort);

    res.json(rows.map(serializeUser));
  } catch (e) { next(e); }
});

router.get("/users/:id/detail", async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!userRows.length) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const user = userRows[0];
    const [keyRows, usageRows, txRows, usageAggRows, pkgAggRows] = await Promise.all([
      db.select().from(apiKeys).where(eq(apiKeys.userId, id)).orderBy(desc(apiKeys.olusturma)),
      db.select().from(usageRecords).where(eq(usageRecords.userId, id)).orderBy(desc(usageRecords.timestamp)).limit(50),
      db.select().from(transactions).where(eq(transactions.userId, id)).orderBy(desc(transactions.timestamp)).limit(50),
      // Ömür-boyu (limit'siz) toplamlar: panel özet kutuları SON 50 kayıttan değil,
      // kullanıcının TÜM usage geçmişinden hesaplanmalı (önceki bug: limit(50) yüzünden
      // 154 istek "50", ₺17.55 harcama "₺1.28" görünüyordu). Billing'e dokunmaz; salt okuma.
      dbSql<{
        total_requests: string;
        successful_requests: string;
        failed_requests: string;
        total_input_tokens: string;
        total_output_tokens: string;
        total_cost_tl: string;
      }[]>`
        SELECT
          COUNT(*) AS total_requests,
          COUNT(*) FILTER (WHERE status = 'success') AS successful_requests,
          COUNT(*) FILTER (WHERE status <> 'success') AS failed_requests,
          COALESCE(SUM(input_usage), 0) AS total_input_tokens,
          COALESCE(SUM(output_usage), 0) AS total_output_tokens,
          COALESCE(SUM(cost_tl), 0) AS total_cost_tl
        FROM usage_records
        WHERE user_id = ${id}::uuid
      `,
      dbSql<{ package_requests: string; active_entitlements: string }[]>`
        SELECT
          (SELECT COUNT(*) FROM usage_records WHERE user_id = ${id}::uuid AND billed_via = 'package') AS package_requests,
          (SELECT COUNT(*) FROM user_package_entitlements WHERE user_id = ${id}::uuid AND status = 'active' AND expires_at > now()) AS active_entitlements
      `,
    ]);

    const modelMap = new Map<string, {
      modelId: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costTL: number;
      lastStatus: string;
      lastSeen: string;
    }>();

    for (const row of usageRows) {
      const key = row.modelId;
      const current = modelMap.get(key) ?? {
        modelId: row.modelId,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costTL: 0,
        lastStatus: row.status,
        lastSeen: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
      };
      current.requests += 1;
      current.inputTokens += row.inputUsage ?? 0;
      current.outputTokens += row.outputUsage ?? 0;
      current.totalTokens += (row.inputUsage ?? 0) + (row.outputUsage ?? 0);
      current.costTL += Number(row.costTL ?? 0);
      current.lastStatus = row.status;
      modelMap.set(key, current);
    }

    const modelStats = [...modelMap.values()].sort((a, b) => b.costTL - a.costTL);
    // Ömür-boyu özet (limit'siz aggregate'ten). modelStats ve usageRecords listesi
    // SON 50 kaydı yansıtır (son aktivite görünümü); özet kutuları TÜM geçmişi gösterir.
    const agg = usageAggRows[0] ?? {
      total_requests: "0", successful_requests: "0", failed_requests: "0",
      total_input_tokens: "0", total_output_tokens: "0", total_cost_tl: "0",
    };
    const totalRequests = Number(agg.total_requests);
    const successfulRequests = Number(agg.successful_requests);
    const failedRequests = Number(agg.failed_requests);
    const totalInputTokens = Number(agg.total_input_tokens);
    const totalOutputTokens = Number(agg.total_output_tokens);
    const totalCostTL = Number(agg.total_cost_tl);
    const userCode = user.id ? `u-${String(user.id).replace(/-/g, "").slice(0, 8)}` : null;
    const pkgAgg = pkgAggRows[0] ?? { package_requests: "0", active_entitlements: "0" };

    res.json({
      user: serializeUser(user),
      userCode,
      summary: {
        requestCount: totalRequests,
        successfulRequests,
        failedRequests,
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        totalCostTL,
        activeApiKeyCount: keyRows.filter((row) => row.aktif).length,
        totalApiKeyCount: keyRows.length,
        packageRequests: Number(pkgAgg.package_requests),
        activeEntitlements: Number(pkgAgg.active_entitlements),
      },
      apiKeys: keyRows.map((row) => serializeApiKey(row, user.email)),
      usageRecords: usageRows.map(serializeUsageRecord),
      transactions: txRows.map(serializeTransaction),
      modelStats,
    });
  } catch (e) { next(e); }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updates: Partial<typeof users.$inferInsert> = {};

    const existingRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existingRows.length) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    const existingUser = existingRows[0];

    if (
      req.adminRole === "partner" &&
      String(existingUser.email || "").trim().toLowerCase() === SINGLE_ADMIN_EMAIL
    ) {
      return res.status(403).json({ error: "Ortak, sahip hesabını değiştiremez." });
    }

    if (
      body.durum !== undefined &&
      String(existingUser.email || "").trim().toLowerCase() === SINGLE_ADMIN_EMAIL &&
      body.durum !== "aktif"
    ) {
      return res.status(400).json({ error: "Tek admin hesabı askıya alınamaz." });
    }

    if (body.adSoyad !== undefined) updates.adSoyad = body.adSoyad;
    if (body.durum !== undefined) updates.durum = body.durum;
    if (body.plan !== undefined) updates.plan = body.plan;
    if (body.not !== undefined) updates.not = body.not;
    if (body.gunlukLimitTL !== undefined) updates.gunlukLimitTL = body.gunlukLimitTL !== null ? String(body.gunlukLimitTL) : null;
    if (body.bakiyeTL !== undefined) {
      res.status(400).json({ error: "Bakiye degisikligi icin /api/admin/users/:id/bakiye endpointini kullanin." });
      return;
    }
    updates.updatedAt = new Date();

    const updated = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    await writeAudit("user_update", id, `Güncellendi: ${Object.keys(body).join(", ")}`, req.user!.id);
    res.json(serializeUser(updated[0]));
  } catch (e) { next(e); }
});

router.post("/users/:id/bakiye", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { miktar, aciklama } = req.body as { miktar: number; aciklama: string };

    const userRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!userRows.length) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    const user = userRows[0];

    if (
      req.adminRole === "partner" &&
      String(user.email || "").trim().toLowerCase() === SINGLE_ADMIN_EMAIL
    ) {
      return res.status(403).json({ error: "Ortak, sahip hesabının bakiyesini değiştiremez." });
    }

    const once = Number(user.bakiyeTL);
    const sonraki = Math.max(0, once + miktar);

    await db.update(users).set({ bakiyeTL: String(sonraki), updatedAt: new Date() }).where(eq(users.id, id));

    const tx = await db.insert(transactions).values({
      userId: id,
      userEmail: user.email,
      tip: miktar >= 0 ? "manuel" : "kullanim",
      miktarTL: String(miktar),
      oncekiBakiye: String(once),
      sonrakiBakiye: String(sonraki),
      aciklama: aciklama || (miktar >= 0 ? "Manuel yükleme" : "Manuel düşüm"),
    }).returning();

    await writeAudit("bakiye_update", id, `${miktar >= 0 ? "+" : ""}${miktar} TL, ${once} → ${sonraki}`, req.user!.id);

    const updatedUser = await db.select().from(users).where(eq(users.id, id)).limit(1);
    res.json({ user: serializeUser(updatedUser[0]), hareket: serializeTransaction(tx[0]) });
  } catch (e) { next(e); }
});

router.post("/users/:id/role", async (req, res, next) => {
  try {
    // Defense-in-depth: izin haritası partner'ı zaten engeller; burada ikinci kontrol.
    if (req.adminRole !== "owner") {
      return res.status(403).json({ error: "Yalnız sahip rol değiştirebilir." });
    }
    const { id } = req.params;
    const role = String((req.body as { role?: string }).role ?? "");
    if (role !== "partner" && role !== "user") {
      return res.status(400).json({ error: "Geçersiz rol. 'partner' veya 'user' olmalı." });
    }

    const userRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!userRows.length) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    const target = userRows[0];

    if (String(target.email || "").trim().toLowerCase() === SINGLE_ADMIN_EMAIL) {
      return res.status(400).json({ error: "Sahip hesabının rolü değiştirilemez." });
    }

    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
    await writeAudit("user_role_change", id, `rol → ${role}`, req.user!.id);

    const updated = await db.select().from(users).where(eq(users.id, id)).limit(1);
    res.json({ user: serializeUser(updated[0]) });
  } catch (e) { next(e); }
});

// ── Bakiye Hareketleri ────────────────────────────────────────────────────────
router.get("/bakiye-hareketleri", async (req, res, next) => {
  try {
    const { userId, tip } = req.query as Record<string, string>;
    let rows = await db.select().from(transactions).orderBy(desc(transactions.timestamp));
    if (userId) rows = rows.filter((h) => h.userId === userId);
    if (tip) rows = rows.filter((h) => h.tip === tip);
    res.json(rows.map(serializeTransaction));
  } catch (e) { next(e); }
});

// ── Announcements ─────────────────────────────────────────────────────────────
router.get("/announcements", async (_req, res, next) => {
  try {
    const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt));
    res.json(rows.map(serializeAnnouncement));
  } catch (e) { next(e); }
});

router.post("/announcements", async (req, res, next) => {
  try {
    const { mesaj, tip, aktif, baslangic, bitis } = req.body;
    const inserted = await db.insert(announcements).values({
      mesaj,
      tip: tip ?? "bilgi",
      aktif: aktif ?? true,
      baslangic: new Date(baslangic),
      bitis: new Date(bitis),
    }).returning();
    await writeAudit("announcement_create", inserted[0].id, mesaj.slice(0, 60));
    res.status(201).json(serializeAnnouncement(inserted[0]));
  } catch (e) { next(e); }
});

router.patch("/announcements/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updates: Partial<typeof announcements.$inferInsert> = {};
    if (body.mesaj !== undefined) updates.mesaj = body.mesaj;
    if (body.tip !== undefined) updates.tip = body.tip;
    if (body.aktif !== undefined) updates.aktif = body.aktif;
    if (body.baslangic !== undefined) updates.baslangic = new Date(body.baslangic);
    if (body.bitis !== undefined) updates.bitis = new Date(body.bitis);

    const updated = await db.update(announcements).set(updates).where(eq(announcements.id, id)).returning();
    if (!updated.length) return res.status(404).json({ error: "Duyuru bulunamadı" });
    await writeAudit("announcement_update", id, `aktif: ${updated[0].aktif}`);
    res.json(serializeAnnouncement(updated[0]));
  } catch (e) { next(e); }
});

router.delete("/announcements/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.delete(announcements).where(eq(announcements.id, id));
    await writeAudit("announcement_delete", id, "Duyuru silindi");
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Provider Durumu ───────────────────────────────────────────────────────────
router.get("/provider-durumu", async (_req, res, next) => {
  try {
    const rows = await db.select().from(providerDurumlari);
    res.json(rows.map(serializeProvider));
  } catch (e) { next(e); }
});

router.patch("/provider-durumu/:provider", async (req, res, next) => {
  try {
    const { provider } = req.params;
    const body = req.body;
    const updates: Partial<typeof providerDurumlari.$inferInsert> = { sonKontrol: new Date() };
    if (body.durum !== undefined) updates.durum = body.durum;
    if (body.gecikmeMs !== undefined) updates.gecikmeMs = body.gecikmeMs;
    if (body.not !== undefined) updates.not = body.not;

    const updated = await db.update(providerDurumlari).set(updates).where(eq(providerDurumlari.provider, provider)).returning();
    if (!updated.length) return res.status(404).json({ error: "Provider bulunamadı" });
    await writeAudit("provider_update", provider, `durum: ${updated[0].durum}`);
    res.json(serializeProvider(updated[0]));
  } catch (e) { next(e); }
});

// ── Audit Logs ────────────────────────────────────────────────────────────────
router.get("/audit-logs", async (_req, res, next) => {
  try {
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(50);
    res.json(rows.map((a) => ({
      id: a.id,
      action: a.action,
      hedef: a.hedef,
      ozet: a.ozet,
      timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : String(a.timestamp),
    })));
  } catch (e) { next(e); }
});

// ── Live State (owner-only) ───────────────────────────────────────────────────
router.get("/live-state/summary", async (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    res.json(await getLiveStateSummary());
  } catch (e) { next(e); }
});

router.get("/live-state/tables", async (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    res.json(await getLiveStateTables());
  } catch (e) { next(e); }
});

router.get("/live-state/table/:table", async (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    const result = await getLiveStateTableRows(req.params.table, req.query);
    await writeAudit(
      "live_state_table_read",
      req.params.table,
      `limit=${result.limit} offset=${result.offset} order=${result.order}`,
      req.admin?.sub,
    );
    res.json(result);
  } catch (e) { next(e); }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get("/dashboard", async (_req, res, next) => {
  try {
    const allUsers = await db.select().from(users);
    const allAnnouncements = await db.select().from(announcements);
    const allProviders = await db.select().from(providerDurumlari);
    const recentAudit = await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(5);

    const totalBakiye = allUsers.reduce((s, u) => s + Number(u.bakiyeTL), 0);
    const totalIstek = allUsers.reduce((s, u) => s + u.toplamIstek, 0);
    const aktifDuyuru = allAnnouncements.filter((a) => a.aktif).length;

    const yesterday = new Date(Date.now() - 86400000);
    const allTx = await db.select().from(transactions);
    const bugunIstek = allTx.filter((h) => new Date(h.timestamp) > yesterday).length;

    res.json({
      toplamKullanici: allUsers.length,
      toplamBakiyeTL: totalBakiye,
      bugunIstek,
      aktifDuyuru,
      toplamIstek: totalIstek,
      providerDurumlari: allProviders.map(serializeProvider),
      sonAuditLogs: recentAudit.map((a) => ({
        id: a.id,
        action: a.action,
        hedef: a.hedef,
        ozet: a.ozet,
        timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : String(a.timestamp),
      })),
    });
  } catch (e) { next(e); }
});

router.get("/traffic", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    res.json(await getAdminTrafficAnalytics(window));
  } catch (e) { next(e); }
});

router.get("/traffic/overview", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    const data = await getAdminTrafficAnalytics(window);
    res.json(data.overview);
  } catch (e) { next(e); }
});

router.get("/traffic/timeseries", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    const data = await getAdminTrafficAnalytics(window);
    res.json(data.timeseries);
  } catch (e) { next(e); }
});

router.get("/traffic/models", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    const data = await getAdminTrafficAnalytics(window);
    res.json(data.models);
  } catch (e) { next(e); }
});

router.get("/traffic/providers", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    const data = await getAdminTrafficAnalytics(window);
    res.json(data.providers);
  } catch (e) { next(e); }
});

router.get("/traffic/users", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    const data = await getAdminTrafficAnalytics(window);
    res.json(data.users);
  } catch (e) { next(e); }
});

router.get("/traffic/api-keys", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    const data = await getAdminTrafficAnalytics(window);
    res.json(data.apiKeys);
  } catch (e) { next(e); }
});

router.get("/traffic/errors", async (req, res, next) => {
  try {
    const window = parseTrafficWindow((req.query as Record<string, string>).window);
    const data = await getAdminTrafficAnalytics(window);
    res.json(data.errors);
  } catch (e) { next(e); }
});

// ── Reconciliation ───────────────────────────────────────────────────────────
router.get("/reconciliation", async (_req, res, next) => {
  try {
    const report = await getReconciliationReport();
    res.json(report);
  } catch (e) { next(e); }
});

router.get("/reconciliation/export", async (_req, res, next) => {
  try {
    const report = await getReconciliationReport();
    const rows = [
      ["generatedAt", report.generatedAt],
      ["status", report.status],
      ["users", String(report.totals.users)],
      ["currentBalanceTL", String(report.totals.currentBalanceTL)],
      ["ledgerBalanceTL", String(report.totals.ledgerBalanceTL)],
      ["driftTL", String(report.totals.driftTL)],
      ["creditsTL", String(report.totals.creditsTL)],
      ["debitsTL", String(report.totals.debitsTL)],
      ["usageRecordsTL", String(report.totals.usageRecordsTL)],
      ["usageRecordCount", String(report.totals.usageRecordCount)],
      ["errorUsageCount", String(report.totals.errorUsageCount)],
      ["streamMissingUsageCount", String(report.totals.streamMissingUsageCount)],
      ["upstreamErrorCount", String(report.totals.upstreamErrorCount)],
      [],
      ["userId", "email", "currentBalanceTL", "ledgerBalanceTL", "driftTL"],
      ...report.userDrifts.map((row) => [
        row.userId,
        row.email,
        String(row.currentBalanceTL),
        String(row.ledgerBalanceTL),
        String(row.driftTL),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="reconciliation-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

// ── KUR ───────────────────────────────────────────────────────────────────────
router.post("/refresh-kur", async (_req, res, next) => {
  try {
    const entry = await refreshKur("manual");
    if (!entry) return res.status(502).json({ error: "Kur çekilemedi" });
    res.json(entry);
  } catch (e) { next(e); }
});

router.get("/kur-history", async (_req, res, next) => {
  try {
    const rows = await db.select().from(kurHistory).orderBy(desc(kurHistory.timestamp)).limit(24);
    res.json(rows.map((k) => ({
      timestamp: k.timestamp instanceof Date ? k.timestamp.toISOString() : String(k.timestamp),
      liveKur: Number(k.liveKur),
      sellKur: Number(k.sellKur),
      source: k.source,
    })));
  } catch (e) { next(e); }
});

// ── Plans ─────────────────────────────────────────────────────────────────────
router.get("/plans", async (_req, res, next) => {
  try {
    const rows = await db.select().from(plans);
    res.json(rows.map(serializePlan));
  } catch (e) { next(e); }
});

router.patch("/plans/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updates: Partial<typeof plans.$inferInsert> = {};
    if (body.ad !== undefined) updates.ad = body.ad;
    if (body.gunlukLimitTL !== undefined) updates.gunlukLimitTL = body.gunlukLimitTL !== null ? String(body.gunlukLimitTL) : null;
    if (body.aylikLimitTL !== undefined) updates.aylikLimitTL = body.aylikLimitTL !== null ? String(body.aylikLimitTL) : null;
    if (body.izinliModeller !== undefined) updates.izinliModeller = body.izinliModeller;
    if (body.aciklama !== undefined) updates.aciklama = body.aciklama;

    const updated = await db.update(plans).set(updates).where(eq(plans.id, id)).returning();
    if (!updated.length) return res.status(404).json({ error: "Plan bulunamadı" });
    await writeAudit("plan_update", id, `Güncellendi: ${Object.keys(body).join(", ")}`);
    res.json(serializePlan(updated[0]));
  } catch (e) { next(e); }
});

// ── API Keys ──────────────────────────────────────────────────────────────────
router.get("/api-keys", async (req, res, next) => {
  try {
    const { userId } = req.query as Record<string, string>;
    const keyRows = userId
      ? await db.select().from(apiKeys).where(eq(apiKeys.userId, userId))
      : await db.select().from(apiKeys);

    // Enrich with user email
    const userIds = [...new Set(keyRows.map((k) => k.userId))];
    const userRows = userIds.length
      ? await db.select({ id: users.id, email: users.email }).from(users)
      : [];
    const emailMap = new Map(userRows.map((u) => [u.id, u.email]));

    res.json(keyRows.map((k) => serializeApiKey(k, emailMap.get(k.userId))));
  } catch (e) { next(e); }
});

router.post("/api-keys/revoke/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await db.update(apiKeys).set({ aktif: false }).where(eq(apiKeys.id, id)).returning();
    if (!updated.length) return res.status(404).json({ error: "API key bulunamadı" });
    await writeAudit("apikey_revoke", id, `Key iptal edildi: ${updated[0].maskedKey}`);
    const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, updated[0].userId)).limit(1);
    res.json(serializeApiKey(updated[0], userRows[0]?.email));
  } catch (e) { next(e); }
});

router.post("/api-keys/:userId/create", async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { ad } = req.body as { ad: string };
    const { fullKey, prefix, maskedKey } = generateApiKey();
    const keyHash = await hashApiKey(fullKey);
    const fullKeyCipher = encryptApiKey(fullKey);

    const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userRows.length) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const inserted = await db.insert(apiKeys).values({
      userId,
      ad: ad || "yeni-key",
      maskedKey,
      keyHash,
      fullKeyCipher,
      prefix,
      aktif: true,
    }).returning();

    await writeAudit("apikey_create", userId, `Yeni key: ${maskedKey}`);
    res.status(201).json({
      ...serializeApiKey(inserted[0], userRows[0].email),
      key: fullKey,
    });
  } catch (e) { next(e); }
});

// ── Canlı Mali İzleme (canli-mali-izleme spec) ────────────────────────────────
// Tümü adminAuth + requireWhatsappVerified arkasında (app.ts mount). Tek-admin
// allowlist adminAuth'ta zorlanır. Upstream maliyet/marj yalnız bu admin uçlarında;
// public/v1'e sızmaz. Secret kolon döndürülmez. Servis salt-okunur (yalnız izleme tablosu yazar).
router.get("/mali-izleme/son", async (_req, res, next) => {
  try {
    const latest = await getLatestScan();
    res.json(latest ?? { verdict: null, checks: [], findings: [], message: "Henüz tarama yok." });
  } catch (e) { next(e); }
});

router.get("/mali-izleme/canli-akis", async (_req, res, next) => {
  try {
    const rows = await dbSql<{
      istek: string; tin: string; tout: string; gelir_tl: string; satis_usd: string;
    }[]>`
      SELECT count(*)::text AS istek,
        COALESCE(SUM(input_usage),0)::text AS tin,
        COALESCE(SUM(output_usage),0)::text AS tout,
        COALESCE(SUM(cost_tl::numeric),0)::text AS gelir_tl,
        COALESCE(SUM(cost_usd::numeric),0)::text AS satis_usd
      FROM usage_records WHERE timestamp >= now() - interval '15 minutes' AND status='success'
    `;
    const r = rows[0] ?? { istek: "0", tin: "0", tout: "0", gelir_tl: "0", satis_usd: "0" };
    res.json({
      pencere: "son 15 dakika",
      istek: Number(r.istek),
      inputToken: Number(r.tin),
      outputToken: Number(r.tout),
      gelirTL: Number(r.gelir_tl),
      satisUsd: Number(r.satis_usd),
      not: "Marj ≈ TAHMİNİ; upstream API gideri admin-only (maliyet tabanı sabiti).",
    });
  } catch (e) { next(e); }
});

router.post("/mali-izleme/tara", async (_req, res, next) => {
  try {
    const result = await runScan("on_demand");
    await persistScan(result);
    await writeAudit("mali_izleme_tara", "on_demand", `verdict: ${result.verdict}, bulgu: ${result.findings.length}`);
    res.json(result);
  } catch (e) {
    // On-demand hata → 500; son özet bozulmaz (persist çağrılmadı).
    next(e);
  }
});

router.get("/mali-izleme/gecmis", async (_req, res, next) => {
  try {
    const rows = await dbSql<{ scan_at: string; verdict: string; finding_count: string; duration_ms: string; trigger: string }[]>`
      SELECT scan_at::text, verdict, jsonb_array_length(findings_json)::text AS finding_count,
        duration_ms::text, scan_trigger AS trigger
      FROM mali_izleme_taramalari ORDER BY scan_at DESC LIMIT 50
    `;
    res.json(rows.map((r) => ({
      scanAt: r.scan_at,
      verdict: r.verdict,
      findingCount: Number(r.finding_count),
      durationMs: Number(r.duration_ms),
      trigger: r.trigger,
    })));
  } catch (e) { next(e); }
});

// ── Gözcü (Sentinel) — sistem nöbetçisi panel API'leri ────────────────────────
// adminAuth + requireWhatsappVerified arkasında (app.ts mount). Salt-okunur izleme;
// mutasyonlar (tara/ack/snooze) writeAudit'lenir. Para hareketi YOK.
router.get("/gozcu/son", async (_req, res, next) => {
  try {
    const [hist, findings] = await Promise.all([getSignalHistory(1), getOpenFindings()]);
    res.json({ latest: hist[0] ?? null, findings });
  } catch (e) { next(e); }
});

router.get("/gozcu/findings", async (_req, res, next) => {
  try {
    res.json(await getOpenFindings());
  } catch (e) { next(e); }
});

router.get("/gozcu/gecmis", async (_req, res, next) => {
  try {
    res.json(await getSignalHistory(100));
  } catch (e) { next(e); }
});

router.post("/gozcu/tara", async (_req, res, next) => {
  try {
    const result = await runGozcuScan("on_demand");
    await writeAudit("gozcu_tara", "on_demand", `verdict: ${result.verdict}, kırmızı: ${result.redCount}, sarı: ${result.yellowCount}`);
    res.json(result);
  } catch (e) { next(e); }
});

router.post("/gozcu/findings/:id/ack", async (req, res, next) => {
  try {
    const who = req.user?.email ?? req.admin?.sub ?? "admin";
    const rows = await dbSql<{ check_name: string }[]>`
      UPDATE gozcu_findings SET status='ack', acked_by=${who} WHERE id=${req.params.id}::uuid RETURNING check_name
    `;
    if (!rows.length) return res.status(404).json({ error: "Bulgu bulunamadı" });
    await writeAudit("gozcu_ack", rows[0].check_name, `acked by ${who}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post("/gozcu/findings/:id/snooze", async (req, res, next) => {
  try {
    const hours = Math.max(1, Math.min(720, Number((req.body as { hours?: unknown })?.hours ?? 24)));
    const who = req.user?.email ?? "admin";
    const rows = await dbSql<{ check_name: string }[]>`
      UPDATE gozcu_findings
      SET status='snoozed', snoozed_until = now() + (${hours} || ' hours')::interval, acked_by=${who}
      WHERE id=${req.params.id}::uuid RETURNING check_name
    `;
    if (!rows.length) return res.status(404).json({ error: "Bulgu bulunamadı" });
    await writeAudit("gozcu_snooze", rows[0].check_name, `${hours}sa erteleme by ${who}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// İnsan-onaylı tek-tık müdahale (para-hareketi heal'ler için onay yolu). Tüm güvenlik
// rayları (rate-limit/guard/dryRun/cap/audit) executeHealForCheck içinde uygulanır.
router.post("/gozcu/findings/:id/heal", async (req, res, next) => {
  try {
    const who = req.user?.email ?? req.admin?.sub ?? "admin";
    const rows = await dbSql<{ check_name: string }[]>`
      SELECT check_name FROM gozcu_findings WHERE id=${req.params.id}::uuid
    `;
    if (!rows.length) return res.status(404).json({ error: "Bulgu bulunamadı" });
    const result = await executeHealForCheck(rows[0].check_name, who);
    res.status(result.ok ? 200 : 409).json(result);
  } catch (e) { next(e); }
});

// ── Paketler (Faz 1) ─────────────────────────────────────────────────────────
router.get("/packages", async (_req, res, next) => {
  try {
    const rows = await listAllPackages();
    // Key cipher'ı admin'e bile dönmez — yalnız "set'li mi" bilgisi (providerKeySet)
    res.json(rows.map(({ providerApiKeyCipher, ...rest }) => ({
      ...rest,
      providerKeySet: Boolean(providerApiKeyCipher),
    })));
  } catch (e) {
    next(e);
  }
});

router.post("/packages", async (req, res, next) => {
  try {
    const b = req.body as Record<string, unknown>;
    if (!String(b?.id ?? "").trim() || !String(b?.ad ?? "").trim() || !String(b?.kategori ?? "").trim()) {
      res.status(400).json({ error: "id, ad, kategori zorunlu" });
      return;
    }
    if (!(Number(b.gunlukIstekLimiti) > 0) || !(Number(b.sureGun) > 0) || !(Number(b.fiyatTL) >= 0)) {
      res.status(400).json({ error: "gunlukIstekLimiti, sureGun, fiyatTL geçersiz" });
      return;
    }
    const created = await createPackage({
      id: String(b.id).trim(),
      ad: String(b.ad).trim(),
      kategori: String(b.kategori).trim(),
      aciklama: b.aciklama != null ? String(b.aciklama) : "",
      gunlukIstekLimiti: Number(b.gunlukIstekLimiti),
      sureGun: Number(b.sureGun),
      allowedModels: Array.isArray(b.allowedModels) ? (b.allowedModels as string[]) : [],
      fiyatTL: Number(b.fiyatTL),
      fiyatUsd: b.fiyatUsd != null ? Number(b.fiyatUsd) : null,
      enabled: b.enabled !== false,
      satista: b.satista !== false,
      displayOrder: Number(b.displayOrder ?? 0),
    });
    await writeAudit("admin_package_create", created.id, `Paket oluşturuldu: ${created.id}`, req.user!.id);
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.patch("/packages/:id", async (req, res, next) => {
  try {
    const updated = await updatePackage(req.params.id, req.body as Record<string, unknown>);
    if (!updated) {
      res.status(404).json({ error: "Paket bulunamadı" });
      return;
    }
    await writeAudit("admin_package_update", req.params.id, `Paket güncellendi: ${req.params.id}`, req.user!.id);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.post("/packages/:id/toggle", async (req, res, next) => {
  try {
    const enabled = (req.body as Record<string, unknown>)?.enabled === true;
    await setPackageEnabled(req.params.id, enabled);
    await writeAudit("admin_package_toggle", req.params.id, `Paket ${enabled ? "açıldı" : "kapatıldı"}: ${req.params.id}`, req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Paket-bazlı upstream override: endpoint + API key (şifreli saklanır, asla geri dönmez).
 *  providerBaseUrl: ""/null → temizle; providerApiKey: undefined → dokunma, ""/null → temizle. */
router.post("/packages/:id/provider", async (req, res, next) => {
  try {
    const b = req.body as { providerBaseUrl?: string | null; providerApiKey?: string | null };
    const ok = await setPackageProviderOverride(req.params.id, {
      providerBaseUrl: b?.providerBaseUrl,
      providerApiKey: b?.providerApiKey,
    });
    if (!ok) {
      res.status(404).json({ error: "Paket bulunamadı" });
      return;
    }
    await writeAudit("admin_package_provider", req.params.id, `Paket upstream override güncellendi: ${req.params.id}`, req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete("/packages/:id", async (req, res, next) => {
  try {
    await deletePackage(req.params.id);
    await writeAudit("admin_package_delete", req.params.id, `Paket kapatıldı (silme): ${req.params.id}`, req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── Hediye/Geçiş Kodları (Faz 2) ─────────────────────────────────────────────
router.get("/redeem-codes", async (_req, res, next) => {
  try {
    res.json(await listRedeemCodes());
  } catch (e) {
    next(e);
  }
});

router.post("/redeem-codes", async (req, res, next) => {
  try {
    const b = req.body as Record<string, unknown>;
    const tip = b.tip === "package" ? "package" : "balance";
    const result = await generateRedeemCodes({
      tip,
      amountTL: b.amountTL != null ? Number(b.amountTL) : undefined,
      packageId: b.packageId != null ? String(b.packageId) : undefined,
      count: Number(b.count ?? 1),
      prefix: b.prefix != null ? String(b.prefix) : undefined,
      maxUses: b.maxUses != null ? Number(b.maxUses) : undefined,
      perUserOnce: b.perUserOnce !== false,
      expiresAt: b.expiresAt != null ? String(b.expiresAt) : null,
      aciklama: b.aciklama != null ? String(b.aciklama) : undefined,
    });
    await writeAudit("admin_redeem_codes_create", "redeem", `${result.codes.length} kod üretildi (${tip})`, req.user!.id);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/redeem-codes/:id/toggle", async (req, res, next) => {
  try {
    const enabled = (req.body as Record<string, unknown>)?.enabled === true;
    await setRedeemCodeEnabled(req.params.id, enabled);
    await writeAudit("admin_redeem_code_toggle", req.params.id, `Kod ${enabled ? "açıldı" : "kapatıldı"}`, req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/redeem-codes/:id/copied", async (req, res, next) => {
  try {
    await markRedeemCodeCopied(req.params.id);
    await writeAudit("admin_redeem_code_copied", req.params.id, "Kod kopyalandı (dağıtıldı işaretlendi)", req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/redeem-codes/:id/uses", async (req, res, next) => {
  try {
    const rows = await dbSql<{ id: string; used_at: string; email: string; ad_soyad: string | null }[]>`
      SELECT rcu.id, rcu.redeemed_at, u.email, u.ad_soyad
      FROM redeem_code_uses rcu
      JOIN users u ON u.id = rcu.user_id
      WHERE rcu.code_id = ${req.params.id}::uuid
      ORDER BY rcu.redeemed_at DESC
    `;
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ── Hesap-teslim siparişleri (Faz 6) ─────────────────────────────────────────
router.get("/delivery-orders", async (_req, res, next) => {
  try {
    res.json(await listAllDeliveryOrders());
  } catch (e) {
    next(e);
  }
});

router.post("/delivery-orders/:id/deliver", async (req, res, next) => {
  try {
    const b = req.body as { teslimPayload?: string; not?: string };
    if (!b?.teslimPayload?.trim()) {
      res.status(400).json({ error: "teslimPayload (kimlik/aktivasyon) zorunlu" });
      return;
    }
    await markDeliveryDelivered(req.params.id, req.user!.id, b.teslimPayload, b.not);
    await writeAudit("delivery_mark_delivered", req.params.id, "Hesap-teslim siparişi teslim edildi", req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/delivery-orders/:id/cancel", async (req, res, next) => {
  try {
    const b = req.body as { not?: string };
    const result = await cancelDeliveryWithRefund(req.params.id, req.user!.id, b?.not);
    await writeAudit("delivery_cancel_refund", req.params.id, `İptal + iade ₺${result.refundedTL}`, req.user!.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

// ── Rika Reseller API ─────────────────────────────────────────────────────────
router.get("/rika/reseller-status", async (_req, res, next) => {
  try {
    res.json(await getRikaResellerStatus());
  } catch (e) { next(e); }
});

export default router;
