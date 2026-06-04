import { describe, it, expect } from "vitest";
import { buildWelcomeEmail, buildLowBalanceEmail, buildPaymentReceiptEmail } from "./email-service.js";

const PAYMENT = {
  miktarTL: 100, kdvTL: 18, netTL: 82, metod: "IBAN", refKod: "r1",
  transactionId: "tx-1", amountUsd: 2, kurAtPayment: 47, roundingTL: 1,
};

describe("customer email localization", () => {
  it("welcome email: tr default vs en", () => {
    const tr = buildWelcomeEmail({ email: "a@x.com", adSoyad: "Ada" });
    expect(tr.subject).toBe("YapayZekaLab'a Hoş Geldiniz!");
    expect(tr.html).toContain("Hemen Başla");

    const en = buildWelcomeEmail({ email: "a@x.com", adSoyad: "Ada", lang: "en" });
    expect(en.subject).toBe("Welcome to YapayZekaLab!");
    expect(en.html).toContain("Get Started");
    expect(en.html).toContain("Ada"); // name preserved
  });

  it("low-balance email: tr default vs en, amounts preserved", () => {
    const tr = buildLowBalanceEmail({ email: "a@x.com", adSoyad: "Ada" }, 3.5, 5);
    expect(tr.subject).toContain("Düşük Bakiye");
    expect(tr.html).toContain("Bakiye Yükle");
    expect(tr.html).toContain("₺3.50");

    const en = buildLowBalanceEmail({ email: "a@x.com", adSoyad: "Ada", lang: "en" }, 3.5, 5);
    expect(en.subject).toContain("Low Balance Alert");
    expect(en.html).toContain("Top Up");
    expect(en.html).toContain("₺3.50"); // amount unchanged
  });

  it("payment receipt: tr default vs en, money values preserved", () => {
    const tr = buildPaymentReceiptEmail({ email: "a@x.com", adSoyad: "Ada" }, PAYMENT);
    expect(tr.subject).toContain("Ödeme Makbuzu");
    expect(tr.html).toContain("Ödeme Yöntemi");
    expect(tr.html).toContain("KDV");
    expect(tr.html).toContain("₺100.00");

    const en = buildPaymentReceiptEmail({ email: "a@x.com", adSoyad: "Ada", lang: "en" }, PAYMENT);
    expect(en.subject).toContain("Payment Receipt");
    expect(en.html).toContain("Payment Method");
    expect(en.html).toContain("VAT");
    expect(en.html).toContain("₺100.00"); // amount unchanged
    expect(en.html).toContain("$2.00"); // usd row localized but value intact
  });

  it("invalid lang falls back to tr", () => {
    const r = buildWelcomeEmail({ email: "a@x.com", adSoyad: "Ada", lang: "fr" as never });
    expect(r.subject).toBe("YapayZekaLab'a Hoş Geldiniz!");
  });
});
