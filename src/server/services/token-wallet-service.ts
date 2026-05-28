import type { MasterModel } from "../../master-models.js";
import type { UsageInfo } from "./billing-service.js";
import type { ComputedPrice } from "../../pricing.js";
import { env } from "../lib/env.js";

export const SOLD_PACKAGE_TOKENS = env.SOLD_PACKAGE_TOKENS;
export const INTERNAL_GRANTED_TOKENS = env.INTERNAL_GRANTED_TOKENS;
export const PACKAGE_GRANT_RATIO = INTERNAL_GRANTED_TOKENS / SOLD_PACKAGE_TOKENS;
export const TOKEN_WALLET_BILLING_BASIS = "base_text_equivalent";

export type TokenWalletMode = typeof env.TOKEN_WALLET_MODE;

function roundTokenInteger(value: number): number {
  return Math.max(0, Math.ceil(value));
}

export function tokenWalletMode(): TokenWalletMode {
  return env.TOKEN_WALLET_MODE;
}

export function isTokenWalletShadowMode(): boolean {
  return tokenWalletMode() === "shadow";
}

export function isTokenWalletEnforced(): boolean {
  return tokenWalletMode() === "enforce";
}

export function isTokenWalletEnabled(): boolean {
  return tokenWalletMode() !== "disabled";
}

export function grantedPackageTokens(packageCount = 1): number {
  return Math.round(INTERNAL_GRANTED_TOKENS * packageCount);
}

export function grantedTokensFromUsd(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return 0;
  return roundTokenInteger((amountUsd / env.TOKEN_WALLET_BASE_USD_PER_M) * 1_000_000);
}

export function grantedTokensFromTl(creditTL: number, kur: number): number {
  if (!Number.isFinite(creditTL) || creditTL <= 0) return 0;
  if (!Number.isFinite(kur) || kur <= 0) return 0;
  return grantedTokensFromUsd(creditTL / kur);
}

export function billableTokensFromCostUsd(costUsd: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  return roundTokenInteger((costUsd / env.TOKEN_WALLET_BASE_USD_PER_M) * 1_000_000);
}

export function tokenMultiplierFromPriceUsd(priceUsdPerMillion: number): number {
  if (!Number.isFinite(priceUsdPerMillion) || priceUsdPerMillion <= 0) return 1;
  return Math.round((priceUsdPerMillion / env.TOKEN_WALLET_BASE_USD_PER_M) * 10_000) / 10_000;
}

export function tokenPolicyForModel(model: MasterModel, price: ComputedPrice) {
  const textInputUsd = price.input?.usd ?? model.customerInputUsd ?? 0;
  const textOutputUsd = price.output?.usd ?? model.customerOutputUsd ?? textInputUsd;
  const basisUsdPerMillion = Math.max(textInputUsd, textOutputUsd, env.TOKEN_WALLET_BASE_USD_PER_M);

  return {
    billingBasis: TOKEN_WALLET_BILLING_BASIS,
    baseUsdPerMillion: env.TOKEN_WALLET_BASE_USD_PER_M,
    basisUsdPerMillion,
    inputMultiplier: tokenMultiplierFromPriceUsd(textInputUsd || env.TOKEN_WALLET_BASE_USD_PER_M),
    outputMultiplier: tokenMultiplierFromPriceUsd(textOutputUsd || env.TOKEN_WALLET_BASE_USD_PER_M),
  };
}

export function buildUsageTokenMetrics(opts: {
  model: MasterModel;
  usage: UsageInfo;
  price: ComputedPrice;
  costUsd: number;
}) {
  const promptTokens = opts.usage.promptTokens ?? 0;
  const completionTokens = opts.usage.completionTokens ?? 0;
  const billableTokens = billableTokensFromCostUsd(opts.costUsd);

  return {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    billableTokens,
    reservedTokens: billableTokens,
    settledTokens: billableTokens,
    policy: tokenPolicyForModel(opts.model, opts.price),
  };
}
