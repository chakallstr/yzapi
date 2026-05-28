import { db } from "../db/client.js";
import { systemConfig, modelOverrides as modelOverridesTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { MasterModel } from "../../master-models.js";
import { computePrice, type PricingConfig } from "../../pricing.js";

export async function buildPricingConfig(): Promise<PricingConfig> {
  const rows = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
  if (!rows.length) throw new Error("system_config row missing");
  const cfg = rows[0];
  return {
    kur: Number(cfg.kur),
    liveKur: Number(cfg.liveKur),
    kurBuffer: Number(cfg.kurBuffer),
    textCarpan: Number(cfg.textCarpan),
    imageCarpan: Number(cfg.imageCarpan),
    videoCarpan: Number(cfg.videoCarpan),
  };
}

export async function applyOverride(m: MasterModel): Promise<MasterModel> {
  const rows = await db
    .select()
    .from(modelOverridesTable)
    .where(eq(modelOverridesTable.modelId, m.id))
    .limit(1);
  if (!rows.length) return m;
  const ovr = rows[0];
  const patched = { ...m };
  if (m.type === "Metin") {
    if (ovr.inputUsdOverride !== null) patched.customerInputUsd = Number(ovr.inputUsdOverride);
    if (ovr.outputUsdOverride !== null) patched.customerOutputUsd = Number(ovr.outputUsdOverride);
  } else if (m.type === "Görsel") {
    if (ovr.inputUsdOverride !== null) patched.providerImageInputUsd = Number(ovr.inputUsdOverride);
    if (ovr.outputUsdOverride !== null) patched.providerImageOutputUsd = Number(ovr.outputUsdOverride);
  }
  return patched;
}

export { computePrice };
