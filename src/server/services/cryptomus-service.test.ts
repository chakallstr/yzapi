import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// Set required env vars
process.env.CRYPTOMUS_API_KEY = "test-cryptomus-api-key";
process.env.CRYPTOMUS_MERCHANT_ID = "test-merchant-id";

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ kur: "50" }]),
        })),
      })),
    })),
  },
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

// Helper: build valid webhook body + signature
function buildWebhookBody(data: Record<string, unknown>): Record<string, unknown> {
  const apiKey = "test-cryptomus-api-key";
  const json = JSON.stringify(data).replace(/\//g, "\\/");
  const b64 = Buffer.from(json).toString("base64");
  const sign = createHash("md5").update(b64 + apiKey).digest("hex");
  return { ...data, sign };
}

describe("verifyWebhook — cryptomus signature", () => {
  it("returns valid=true for correct signature", async () => {
    const { verifyWebhook } = await import("./cryptomus-service.js");
    const body = buildWebhookBody({
      order_id: "payment-uuid-123",
      status: "paid",
      amount: "10.00",
      currency: "USD",
    });
    const result = verifyWebhook(body);
    expect(result.valid).toBe(true);
  });

  it("returns valid=false for tampered signature", async () => {
    const { verifyWebhook } = await import("./cryptomus-service.js");
    const body = buildWebhookBody({ order_id: "payment-123", status: "paid" });
    const tampered = { ...body, sign: "0000000000000000000000000000000000000000" };
    const result = verifyWebhook(tampered as Record<string, unknown>);
    expect(result.valid).toBe(false);
  });

  it("returns valid=false when sign is missing", async () => {
    const { verifyWebhook } = await import("./cryptomus-service.js");
    const result = verifyWebhook({ order_id: "test", status: "paid" });
    expect(result.valid).toBe(false);
  });

  it("strips sign from payload before verify", async () => {
    const { verifyWebhook } = await import("./cryptomus-service.js");
    const body = buildWebhookBody({ order_id: "test", amount: "5.00" });
    const result = verifyWebhook(body);
    expect(result.valid).toBe(true);
    expect(result.payload).not.toHaveProperty("sign");
    expect(result.payload).toHaveProperty("order_id", "test");
  });

  it("handles PHP-escaped forward slashes in URL values", async () => {
    const { verifyWebhook } = await import("./cryptomus-service.js");
    // Body containing forward slashes that PHP would escape
    const data = {
      order_id: "test/order/123",
      callback_url: "https://example.com/webhook",
      status: "paid",
    };
    const body = buildWebhookBody(data);
    const result = verifyWebhook(body);
    expect(result.valid).toBe(true);
  });

  it("returns valid=false when API key not configured", async () => {
    const origKey = process.env.CRYPTOMUS_API_KEY;
    delete process.env.CRYPTOMUS_API_KEY;
    vi.resetModules();

    const { verifyWebhook } = await import("./cryptomus-service.js");
    const result = verifyWebhook({ order_id: "test", sign: "anything" });
    expect(result.valid).toBe(false);

    process.env.CRYPTOMUS_API_KEY = origKey;
    vi.resetModules();
  });
});
