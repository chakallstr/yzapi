import type { MasterModel } from "./master-models";

export interface PricingConfig {
  kur: number;
  liveKur: number;
  kurBuffer: number;
  textCarpan: number;
  imageCarpan: number;
  videoCarpan: number;
}

export interface PricePoint {
  usd: number;
  tl: number;
}

export interface ComputedPrice {
  unit: "1M token" | "image" | "sec";
  input?: PricePoint;
  output?: PricePoint;
  perResolution?: {
    default?: PricePoint;
    "480p"?: PricePoint;
    "720p"?: PricePoint;
    "1080p"?: PricePoint;
  };
}

function toTL(usd: number, cfg: PricingConfig): number {
  const sellKur = cfg.liveKur * (1 + cfg.kurBuffer);
  return usd * sellKur;
}

function computeTextPrice(m: MasterModel, cfg: PricingConfig): ComputedPrice {
  const result: ComputedPrice = { unit: "1M token" };
  if (m.customerInputUsd !== undefined) {
    result.input = { usd: m.customerInputUsd, tl: toTL(m.customerInputUsd, cfg) };
  } else if (m.providerInputUsd !== undefined) {
    const usd = m.providerInputUsd * cfg.textCarpan;
    result.input = { usd, tl: toTL(usd, cfg) };
  }
  if (m.customerOutputUsd !== undefined) {
    result.output = { usd: m.customerOutputUsd, tl: toTL(m.customerOutputUsd, cfg) };
  } else if (m.providerOutputUsd !== undefined) {
    const usd = m.providerOutputUsd * cfg.textCarpan;
    result.output = { usd, tl: toTL(usd, cfg) };
  }
  return result;
}

function computeImagePrice(m: MasterModel, cfg: PricingConfig): ComputedPrice {
  const result: ComputedPrice = { unit: "image" };
  if (m.providerImageInputUsd !== undefined) {
    const usd = m.providerImageInputUsd * cfg.imageCarpan;
    result.input = { usd, tl: toTL(usd, cfg) };
  }
  if (m.providerImageOutputUsd !== undefined) {
    const usd = m.providerImageOutputUsd * cfg.imageCarpan;
    result.output = { usd, tl: toTL(usd, cfg) };
  }
  return result;
}

function computeVideoPrice(m: MasterModel, cfg: PricingConfig): ComputedPrice {
  const result: ComputedPrice = { unit: "sec", perResolution: {} };
  const ps = m.providerPerSecond;
  if (!ps) return result;
  const resolutions = ["default", "480p", "720p", "1080p"] as const;
  for (const res of resolutions) {
    const raw = ps[res];
    if (raw !== undefined) {
      const usd = raw * cfg.videoCarpan;
      result.perResolution![res] = { usd, tl: toTL(usd, cfg) };
    }
  }
  return result;
}

export function computePrice(m: MasterModel, cfg: PricingConfig): ComputedPrice {
  if (m.type === "Metin") return computeTextPrice(m, cfg);
  if (m.type === "Görsel") return computeImagePrice(m, cfg);
  return computeVideoPrice(m, cfg);
}
