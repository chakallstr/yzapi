import { Router } from "express";
import { db } from "../db/client.js";
import { announcements, modelOverrides } from "../db/schema.js";
import { and, eq, lte, gte } from "drizzle-orm";
import { MASTER_MODELS } from "../../master-models.js";
import { computePrice } from "../../pricing.js";
import { buildPricingConfig } from "../services/pricing-service.js";

const router = Router();

// GET /api/models — active text models with computed pricing
router.get("/models", async (_req, res, next) => {
  try {
    const cfg = await buildPricingConfig();

    const overrides = await db.select().from(modelOverrides);
    const overrideMap = new Map(overrides.map((o) => [o.modelId, o]));

    const result = MASTER_MODELS.map((m) => {
      const ovr = overrideMap.get(m.id);
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
      return {
        ...patched,
        computed: computePrice(patched, cfg),
        enabled: ovr ? ovr.enabled : true,
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
