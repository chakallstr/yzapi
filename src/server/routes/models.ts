import { Router } from "express";
import { db } from "../db/client.js";
import { announcements, modelOverrides, modelRuntimePolicies } from "../db/schema.js";
import { and, eq, lte, gte } from "drizzle-orm";
import { computePrice } from "../../pricing.js";
import { buildPricingConfig } from "../services/pricing-service.js";
import { getActiveCatalogModels } from "../services/added-model-service.js";

const router = Router();

// GET /api/models — active text models with computed pricing
router.get("/models", async (_req, res, next) => {
  try {
    const cfg = await buildPricingConfig();

    const mergedModels = await getActiveCatalogModels();
    const overrides = await db.select().from(modelOverrides);
    const runtimePolicies = await db.select().from(modelRuntimePolicies);
    const overrideMap = new Map(overrides.map((o) => [o.modelId, o]));
    const runtimeMap = new Map(runtimePolicies.map((o) => [o.modelId, o]));

    const result = mergedModels.map((m) => {
      const ovr = overrideMap.get(m.id);
      const runtime = runtimeMap.get(m.id);
      const patched = { ...m };
      if (ovr) {
        if (m.type === "Metin") {
          if (ovr.inputUsdOverride !== null) patched.customerInputUsd = Number(ovr.inputUsdOverride);
          if (ovr.outputUsdOverride !== null) patched.customerOutputUsd = Number(ovr.outputUsdOverride);
        } else if (m.type === "Görsel") {
          if (ovr.inputUsdOverride !== null) patched.providerImageInputUsd = Number(ovr.inputUsdOverride);
          if (ovr.outputUsdOverride !== null) patched.providerImageOutputUsd = Number(ovr.outputUsdOverride);
        }
      }
      if (runtime?.contextOverrideTokens && runtime.contextOverrideTokens > 0) {
        patched.contextTokens = runtime.contextOverrideTokens;
      }
      if (runtime?.maxOutputTokens && runtime.maxOutputTokens > 0) {
        patched.maxOutputTokens = runtime.maxOutputTokens;
      }
      return {
        ...patched,
        computed: computePrice(patched, cfg),
        enabled: (ovr ? ovr.enabled !== false : true) && (runtime ? runtime.enabled !== false : true),
      };
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
});

// GET /api/announcements/active — public active announcements
router.get("/announcements/active", async (_req, res, next) => {
  try {
    const now = new Date();
    const active = await db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.aktif, true),
          lte(announcements.baslangic, now),
          gte(announcements.bitis, now)
        )
      );

    res.json(
      active.map((a) => ({
        id: a.id,
        mesaj: a.mesaj,
        tip: a.tip,
        aktif: a.aktif,
        baslangic: a.baslangic?.toISOString() ?? "",
        bitis: a.bitis?.toISOString() ?? "",
      }))
    );
  } catch (e) {
    next(e);
  }
});

export default router;
