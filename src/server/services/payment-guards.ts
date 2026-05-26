export interface PaymentLimits {
  minBakiyeTL: string | number;
  maxBakiyeTL: string | number;
}

export type PaymentAmountValidation =
  | { ok: true; amount: number }
  | { ok: false; status: 400; error: string };

export function validatePaymentAmount(miktarTL: unknown, limits: PaymentLimits): PaymentAmountValidation {
  const amount = typeof miktarTL === "string" || typeof miktarTL === "number"
    ? Number(miktarTL)
    : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, error: "Geçerli bir miktar girin." };
  }

  const min = Number(limits.minBakiyeTL);
  const max = Number(limits.maxBakiyeTL);

  if (Number.isFinite(min) && amount < min) {
    return { ok: false, status: 400, error: `Minimum yükleme tutarı ${min} TL.` };
  }
  if (Number.isFinite(max) && amount > max) {
    return { ok: false, status: 400, error: `Maksimum yükleme tutarı ${max} TL.` };
  }

  return { ok: true, amount };
}

export function isIbanConfigured(envLike: {
  IBAN_BANK_NAME?: string;
  IBAN_NUMBER?: string;
  IBAN_OWNER?: string;
}): boolean {
  return Boolean(
    envLike.IBAN_BANK_NAME?.trim() &&
    envLike.IBAN_NUMBER?.trim() &&
    envLike.IBAN_OWNER?.trim()
  );
}
