import { createHash, createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUIRED_ENV = {
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  JWT_SECRET: "x".repeat(40),
  APP_BASE_URL: "https://yapayzekalab.org",
  CRYPTO_PAY_API_TOKEN: "123456789:crypto-pay-token",
};

describe("crypto-pay-service", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CRYPTO_PAY_API_BASE_URL;
    delete process.env.CRYPTO_PAY_ACCEPTED_ASSETS;
  });

  it("creates a fiat USD Crypto Pay invoice without allowing anonymous payer data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        result: {
          invoice_id: 42,
          hash: "hash-42",
          status: "active",
          currency_type: "fiat",
          fiat: "USD",
          amount: "10.50",
          bot_invoice_url: "https://t.me/CryptoBot?start=abc",
          mini_app_invoice_url: "https://t.me/CryptoBot/app?startapp=abc",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createCryptoPayInvoice } = await import("./crypto-pay-service.js");
    const invoice = await createCryptoPayInvoice({
      paymentId: "00000000-0000-0000-0000-000000000042",
      amountUsd: 10.5,
      description: "YapayZekaLab bakiye yükleme",
    });

    expect(invoice.invoiceId).toBe("42");
    expect(invoice.payUrl).toBe("https://t.me/CryptoBot/app?startapp=abc");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://pay.crypt.bot/api/createInvoice");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Crypto-Pay-API-Token"]).toBe(REQUIRED_ENV.CRYPTO_PAY_API_TOKEN);
    expect(JSON.parse(String(init.body))).toMatchObject({
      currency_type: "fiat",
      fiat: "USD",
      amount: "10.50",
      payload: "00000000-0000-0000-0000-000000000042",
      allow_comments: false,
      allow_anonymous: false,
      paid_btn_name: "callback",
    });
  });

  it("verifies Crypto Pay webhook signatures over the exact raw JSON body", async () => {
    const update = {
      update_id: 1,
      update_type: "invoice_paid",
      request_date: "2026-05-28T12:00:00Z",
      payload: {
        invoice_id: 42,
        status: "paid",
        payload: "00000000-0000-0000-0000-000000000042",
        amount: "10.50",
        fiat: "USD",
      },
    };
    const rawBody = JSON.stringify(update);
    const secret = createHash("sha256").update(REQUIRED_ENV.CRYPTO_PAY_API_TOKEN).digest();
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    const { verifyCryptoPayWebhook } = await import("./crypto-pay-service.js");

    expect(verifyCryptoPayWebhook(rawBody, { "crypto-pay-api-signature": signature })).toBe(true);
    expect(verifyCryptoPayWebhook(rawBody.replace("10.50", "99.00"), { "crypto-pay-api-signature": signature })).toBe(false);
  });

  it("extracts only paid invoice updates", async () => {
    const { getPaidCryptoPayInvoice } = await import("./crypto-pay-service.js");

    expect(getPaidCryptoPayInvoice({ update_type: "invoice_paid", payload: { invoice_id: 42, status: "paid" } })).toMatchObject({
      invoice_id: 42,
      status: "paid",
    });
    expect(getPaidCryptoPayInvoice({ update_type: "invoice_paid", payload: { invoice_id: 42, status: "active" } })).toBeNull();
    expect(getPaidCryptoPayInvoice({ update_type: "transfer_created", payload: { invoice_id: 42, status: "paid" } })).toBeNull();
  });
});
