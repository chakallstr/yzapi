export interface UsdTopupQuote {
  amountUsd: number;
  kur: number;
  payableTL: number;
  creditTL: number;
  roundingTL: number;
}

function assertPositiveMoney(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function roundUpTlCharge(amountUsd: number, kur: number): number {
  assertPositiveMoney(amountUsd, "amountUsd");
  assertPositiveMoney(kur, "kur");
  return Math.ceil(amountUsd * kur);
}

export function roundUpUsdAmount(amountUsd: number): number {
  assertPositiveMoney(amountUsd, "amountUsd");
  return Math.ceil(amountUsd * 100) / 100;
}

export function buildUsdTopupQuote(amountUsd: number, kur: number): UsdTopupQuote {
  const creditTL = round4(amountUsd * kur);
  const payableTL = roundUpTlCharge(amountUsd, kur);

  return {
    amountUsd,
    kur,
    payableTL,
    creditTL,
    roundingTL: round4(payableTL - creditTL),
  };
}
