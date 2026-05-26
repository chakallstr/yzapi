import { describe, expect, it } from "vitest";
import { buildUsdTopupQuote, roundUpTlCharge, roundUpUsdAmount } from "./payment-pricing.js";

describe("payment pricing helpers", () => {
  it("rounds Shopier/IBAN TL collection upward to whole lira", () => {
    expect(roundUpTlCharge(10, 47.23)).toBe(473);
    expect(roundUpTlCharge(2, 47.001)).toBe(95);
    expect(roundUpTlCharge(1, 47)).toBe(47);
  });

  it("keeps usable credit at selected USD x kur, excluding TL rounding delta", () => {
    const quote = buildUsdTopupQuote(10, 47.23);

    expect(quote.amountUsd).toBe(10);
    expect(quote.payableTL).toBe(473);
    expect(quote.creditTL).toBe(472.3);
    expect(quote.roundingTL).toBeCloseTo(0.7, 4);
  });

  it("rounds Cryptomus USD/USDT invoice amount upward to two decimals", () => {
    expect(roundUpUsdAmount(10)).toBe(10);
    expect(roundUpUsdAmount(10.001)).toBe(10.01);
    expect(roundUpUsdAmount(10.999)).toBe(11);
  });
});
