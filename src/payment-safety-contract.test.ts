import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("payment safety contract", () => {
  it("uses a 5 USD minimum top-up (frontend + backend aligned) and 250 TL config defaults", () => {
    expect(source("./server/db/schema.ts")).toMatch(/minBakiyeTL:.*default\("250"\)/);
    expect(source("./server/db/seed.ts")).toContain('minBakiyeTL: "250"');
    expect(source("./server/routes/payments.ts")).toContain('minBakiyeTL: "250"');
    // Min ödeme USD-bazlı: panel UI (MIN_USD) ile backend quote guard (MIN_TOPUP_USD) hizalı olmalı
    expect(source("./server/routes/payments.ts")).toContain("const MIN_TOPUP_USD = 5");
    expect(source("./yapayzekalab/tab-account.jsx")).toContain("const MIN_USD = 5");
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
    expect(account).toMatch(/açıklama kısmını lütfen boş bırak/i);
    expect(account).toContain("WhatsApp");
    expect(account).not.toContain("IBAN ödeme bildirimi oluşturuldu.");
    expect(account).not.toMatch(/referans kodunu ödeme açıklamasına yaz/i);

    expect(paymentsRoute).toContain("buildPaymentNotification");
    expect(paymentsRoute).toContain("paymentWhatsappNumber");
    expect(paymentsRoute).toContain("cryptoWalletAddress");
    expect(paymentsRoute).not.toMatch(/Havale açıklamasına.*referans/i);
    expect(paymentsRoute).not.toMatch(/Transfer açıklaması.*referans/i);
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

  it("keeps Shopier collection in TRY while preserving USD balance quote metadata", () => {
    const paymentsRoute = source("./server/routes/payments.ts");
    const shopierService = source("./server/services/shopier-service.ts");

    expect(paymentsRoute).toContain("const { quote, amountValidation } = await buildQuoteFromRequest");
    expect(paymentsRoute).toContain('metod: "shopier"');
    expect(paymentsRoute).toContain("miktarTL: String(quote.payableTL)");
    expect(paymentsRoute).toContain("amountUsd: String(quote.amountUsd)");
    expect(paymentsRoute).toContain("creditTL: String(quote.creditTL)");
    expect(paymentsRoute).toMatch(/buildCheckoutForm\(\{[\s\S]{0,180}miktarTL:\s*quote\.payableTL/);

    expect(shopierService).toContain("const currency = 0; // TRY");
    expect(shopierService).toContain("total_order_value: opts.miktarTL");
    expect(shopierService).toContain("product_name: `Bakiye Yukleme — ${opts.miktarTL} TL`");
  });

  it("notifies admin (odeme_yapildi) on a successful Shopier callback credit, but not on replay", () => {
    const paymentsRoute = source("./server/routes/payments.ts");

    // Callback success site: after creditUserBalance("shopier", ...) returns, a notifyAdmin
    // with kind "odeme_yapildi" must fire — guarded so a replay (alreadyCredited) does NOT notify.
    expect(paymentsRoute).toMatch(
      /credit\.success\s*&&\s*!credit\.alreadyCredited[\s\S]{0,260}notifyAdmin\(\{[\s\S]{0,260}kind:\s*"odeme_yapildi"/,
    );
    expect(paymentsRoute).toMatch(/kind:\s*"odeme_yapildi"[\s\S]{0,300}Shopier kart/);
  });

  it("notifies admin (odeme_yapildi) on a successful Shopier OSB auto-credit, but not on replay", () => {
    const paymentsRoute = source("./server/routes/payments.ts");

    // OSB success site: same guard — fresh credit (success && !alreadyCredited) notifies once;
    // an already-credited replay must not re-notify.
    expect(paymentsRoute).toMatch(
      /credit\.success\s*&&\s*!credit\.alreadyCredited[\s\S]{0,260}notifyAdmin\(\{[\s\S]{0,260}kind:\s*"odeme_yapildi"[\s\S]{0,260}Shopier OSB/,
    );
  });

  it("routes an OSB productId mapped to a package through grantOsbPackageEntitlement (not balance), guarded by product.packageId", () => {
    const paymentsRoute = source("./server/routes/payments.ts");
    const shopierService = source("./server/services/shopier-service.ts");
    const grantService = source("./server/services/shopier-osb-package-service.ts");

    // B2.1: OSB map value carries an OPTIONAL packageId (balance entries keep working).
    expect(shopierService).toMatch(/packageId\?:\s*string/);
    expect(shopierService).toMatch(/typeof v\.packageId === "string"/);

    // INERT GUARD: the package branch only runs when product.packageId is set;
    // otherwise the existing creditUserBalance path is reached unchanged.
    expect(paymentsRoute).toMatch(/if\s*\(product\.packageId\)\s*\{/);
    expect(paymentsRoute).toContain("grantOsbPackageEntitlement");
    expect(paymentsRoute).toContain("loadPackageForGrantDb");
    expect(paymentsRoute).toContain("grantEntitlementDb");
    // package grant uses the osb_<orderid> idempotency anchor (exactly-once)
    expect(grantService).toContain("`osb_${args.orderId}`");
    // fresh grant → odeme_yapildi; not on replay (already)
    expect(grantService).toMatch(/if\s*\(!r\.already\)[\s\S]{0,120}notifyPaid/);

    // B2.2: inactive / not-for-sale / unknown package → no grant, dead-letter + odeme_sorunu
    expect(grantService).toMatch(/enabled\s*\|\|\s*pkg\.satista === false/);
    expect(grantService).toContain('reason: "unknown_package"');
    expect(grantService).toContain('reason: "package_not_sellable"');
    expect(grantService).toMatch(/recordDeadLetter\([\s\S]{0,200}notifyProblem/);
    expect(paymentsRoute).toMatch(/notifyProblem[\s\S]{0,200}kind:\s*"odeme_sorunu"/);
  });

  it("keeps the OSB balance path inert when no productId maps to a package (current prod config)", () => {
    const paymentsRoute = source("./server/routes/payments.ts");
    // The classic balance credit (creditUserBalance + odeme_yapildi "Shopier OSB") is
    // still present and is what runs when product.packageId is undefined.
    expect(paymentsRoute).toMatch(/const credit = await creditUserBalance\([\s\S]{0,200}"shopier_osb"/);
    expect(paymentsRoute).toMatch(/credit\.success\s*&&\s*!credit\.alreadyCredited[\s\S]{0,260}kind:\s*"odeme_yapildi"[\s\S]{0,260}Shopier OSB/);
  });

  it("supports a safe Shopier OSB relay without breaking an existing Shopier service", () => {
    const paymentsRoute = source("./server/routes/payments.ts");
    const env = source("./server/lib/env.ts");
    const exampleEnv = source("../.env.example");

    expect(env).toContain("SHOPIER_OSB_FALLBACK_URL");
    expect(exampleEnv).toContain("SHOPIER_OSB_FALLBACK_URL");
    expect(paymentsRoute).toContain('"/shopier/osb"');
    expect(paymentsRoute).toContain("forwardShopierOsbFallback");
    expect(paymentsRoute).toContain("env.SHOPIER_OSB_FALLBACK_URL");
    expect(paymentsRoute).toContain("new URLSearchParams");
    expect(paymentsRoute).toContain("application/x-www-form-urlencoded");
    expect(paymentsRoute).toContain("forwarded: true");
    expect(paymentsRoute).toContain("mode: \"json\"");
    expect(paymentsRoute).toMatch(/if\s*\(result\.status !== "success"\)[\s\S]{0,600}paymentRowsForFailure/);
    expect(paymentsRoute).toMatch(/paymentRowsForFailure\.length[\s\S]{0,240}forwardShopierOsbFallback/);
  });
});
