import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("payment safety contract", () => {
  it("uses 250 TL as the default minimum top-up everywhere", () => {
    expect(source("./server/db/schema.ts")).toMatch(/minBakiyeTL:.*default\("250"\)/);
    expect(source("./server/db/seed.ts")).toContain('minBakiyeTL: "250"');
    expect(source("./server/routes/payments.ts")).toContain('minBakiyeTL: "250"');
    expect(source("./yapayzekalab/tab-account.jsx")).toContain("const MIN_USD = 2");
    expect(source("./yapayzekalab/tab-account.jsx")).toContain("amountUsd");
  });

  it("does not acknowledge a paid Cryptomus webhook when balance credit fails", () => {
    const payments = source("./server/routes/payments.ts");

    expect(payments).toMatch(/const\s+credit\s*=\s*await\s+creditUserBalance/);
    expect(payments).toMatch(/!credit\.success\s*&&\s*!credit\.alreadyCredited/);
    expect(payments).toContain('res.status(500).json({ error: "Bakiye yüklenirken hata oluştu." })');
    expect(payments).not.toContain('logger.info({ body }, "Cryptomus webhook received")');
    expect(payments).not.toContain('logger.warn({ body }, "Cryptomus webhook signature invalid")');
  });

  it("describes gross usable balance consistently in payment receipt emails", () => {
    const emailService = source("./server/services/email-service.ts");

    expect(emailService).toContain("Kullanılabilir bakiyenize <strong>₺${payment.miktarTL.toFixed(2)}</strong> eklendi.");
    expect(emailService).toContain("Ödenen Tutar");
    expect(emailService).toContain("Kullanılabilir Bakiye");
    expect(emailService).toContain("payment.miktarTL.toFixed(2)");
  });

  it("uses backend payment method availability before enabling modal actions", () => {
    const app = source("./yapayzekalab/tab-account.jsx");

    expect(app).toContain("paymentMethods");
    expect(app).toContain("/api/payments/methods");
    expect(app).toContain("paymentMethodEnabled");
    expect(app).toContain("Ödeme yöntemi şu an kapalı");
    expect(app).not.toContain("setTweak('balanceUSD', balanceUSD + effectiveAmount)");
  });

  it("shows manual IBAN/crypto instructions and WhatsApp payment notification instead of a reference-only alert", () => {
    const account = source("./yapayzekalab/tab-account.jsx");
    const paymentsRoute = source("./server/routes/payments.ts");

    expect(account).toContain("paymentInstruction");
    expect(account).toContain("buildWhatsAppPaymentLink");
    expect(account).toContain("Banka");
    expect(account).toContain("IBAN");
    expect(account).toContain("Alıcı");
    expect(account).toContain("Referans");
    expect(account).toContain("WhatsApp");
    expect(account).not.toContain("IBAN ödeme bildirimi oluşturuldu.");

    expect(paymentsRoute).toContain("buildPaymentNotification");
    expect(paymentsRoute).toContain("paymentWhatsappNumber");
    expect(paymentsRoute).toContain("cryptoWalletAddress");
  });

  it("lets admins configure manual payment notification and crypto wallet instructions without changing provider secrets", () => {
    const schema = source("./server/db/schema.ts");
    const adminRoute = source("./server/routes/admin.ts");
    const adminUi = source("./yapayzekalab/tab-admin.jsx");

    expect(schema).toContain("paymentWhatsappNumber");
    expect(schema).toContain("cryptoWalletEnabled");
    expect(schema).toContain("cryptoWalletNetwork");
    expect(schema).toContain("cryptoWalletAsset");
    expect(schema).toContain("cryptoWalletAddress");
    expect(schema).toContain("cryptoWalletMemo");

    expect(adminRoute).toContain("paymentWhatsappNumber");
    expect(adminRoute).toContain("cryptoWalletAddress");
    expect(adminUi).toContain("AdminPaymentSettings");
    expect(adminUi).toContain("paymentWhatsappNumber");
    expect(adminUi).toContain("cryptoWalletAddress");
    expect(adminUi).not.toContain("SHOPIER_API_KEY");
    expect(adminUi).not.toContain("CRYPTOMUS_API_KEY");
  });

  it("keeps payment callbacks and metadata safe for USD top-ups", () => {
    const paymentsRoute = source("./server/routes/payments.ts");
    const schema = source("./server/db/schema.ts");

    expect(schema).toContain("amountUsd");
    expect(schema).toContain("payableTL");
    expect(schema).toContain("creditTL");
    expect(schema).toContain("kurAtPayment");
    expect(schema).toContain("roundingTL");

    expect(paymentsRoute).toContain("amountUsd");
    expect(paymentsRoute).toContain("buildUsdTopupQuote");
    expect(paymentsRoute).toContain("safeShopierCallbackLog");
    expect(paymentsRoute).toContain("safeProviderPayload");
    expect(paymentsRoute).toContain("adminPaymentNotificationEmail");
    expect(paymentsRoute).not.toContain('logger.info({ body }, "Shopier callback received")');
    expect(paymentsRoute).not.toContain('logger.warn({ body }, "Shopier callback signature invalid")');
  });

  it("verifies provider-paid amounts before crediting Shopier and Cryptomus payments", () => {
    const paymentsRoute = source("./server/routes/payments.ts");
    const shopierService = source("./server/services/shopier-service.ts");

    expect(shopierService).toContain("total_order_value");
    expect(shopierService).toContain("paidTL");
    expect(paymentsRoute).toContain("Shopier callback amount mismatch");
    expect(paymentsRoute).toContain("Shopier callback currency mismatch");
    expect(paymentsRoute).toContain("Cryptomus webhook amount mismatch");
    expect(paymentsRoute).toContain("Cryptomus webhook currency mismatch");
    expect(paymentsRoute).toContain("Cryptomus webhook target currency mismatch");
    expect(paymentsRoute).toMatch(/result\.paidTL[\s\S]{0,260}expectedPaidTL/);
    expect(paymentsRoute).toMatch(/paidAmountUsd[\s\S]{0,320}expectedAmountUsd/);
  });
});
