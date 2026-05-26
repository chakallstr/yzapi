import { describe, expect, it } from "vitest";
import { isIbanConfigured, validatePaymentAmount } from "./payment-guards.js";

describe("payment guard helpers", () => {
  const limits = { minBakiyeTL: "10", maxBakiyeTL: "50000" };

  it("rejects invalid, below-minimum, and above-maximum amounts", () => {
    expect(validatePaymentAmount(undefined, limits)).toEqual({
      ok: false,
      status: 400,
      error: "Geçerli bir miktar girin.",
    });
    expect(validatePaymentAmount(5, limits)).toEqual({
      ok: false,
      status: 400,
      error: "Minimum yükleme tutarı 10 TL.",
    });
    expect(validatePaymentAmount(50001, limits)).toEqual({
      ok: false,
      status: 400,
      error: "Maksimum yükleme tutarı 50000 TL.",
    });
  });

  it("accepts amounts inside configured limits", () => {
    expect(validatePaymentAmount("10", limits)).toEqual({ ok: true, amount: 10 });
    expect(validatePaymentAmount(100, limits)).toEqual({ ok: true, amount: 100 });
  });

  it("requires all IBAN fields before exposing bank transfer as enabled", () => {
    expect(isIbanConfigured({ IBAN_BANK_NAME: "Banka", IBAN_NUMBER: "TR00", IBAN_OWNER: "YapayZekaLab" })).toBe(true);
    expect(isIbanConfigured({ IBAN_BANK_NAME: "Banka", IBAN_NUMBER: "", IBAN_OWNER: "YapayZekaLab" })).toBe(false);
  });
});
