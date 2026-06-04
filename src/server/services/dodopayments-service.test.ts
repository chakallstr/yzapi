import { describe, it, expect, vi } from "vitest";
import { createHmac } from "crypto";

const RAW_SECRET = "supersecretkey-1234567890";

vi.mock("../lib/env.js", () => ({
  env: {
    DODO_API_KEY: undefined,
    DODO_WEBHOOK_SECRET: "whsec_" + Buffer.from(RAW_SECRET).toString("base64"),
  },
}));
vi.mock("../lib/logger.js", () => ({ logger: { error: () => {}, warn: () => {}, info: () => {} } }));

describe("dodopayments-service", () => {
  it("dodoConfigured is false without API key", async () => {
    const { dodoConfigured } = await import("./dodopayments-service.js");
    expect(dodoConfigured()).toBe(false);
  });

  it("verifyDodoWebhook validates a correct standard-webhooks signature", async () => {
    const { verifyDodoWebhook } = await import("./dodopayments-service.js");
    const id = "msg_1";
    const ts = "1700000000";
    const raw = JSON.stringify({ type: "payment.succeeded", data: { metadata: { paymentId: "p1" } } });
    const sig = createHmac("sha256", Buffer.from(RAW_SECRET)).update(`${id}.${ts}.${raw}`).digest("base64");
    const r = verifyDodoWebhook({ id, timestamp: ts, signature: `v1,${sig}` }, raw);
    expect(r.valid).toBe(true);
  });

  it("verifyDodoWebhook rejects a bad signature", async () => {
    const { verifyDodoWebhook } = await import("./dodopayments-service.js");
    const r = verifyDodoWebhook({ id: "m", timestamp: "1", signature: "v1,ZGVhZGJlZWY=" }, "{}");
    expect(r.valid).toBe(false);
  });

  it("verifyDodoWebhook rejects when headers missing", async () => {
    const { verifyDodoWebhook } = await import("./dodopayments-service.js");
    expect(verifyDodoWebhook({}, "{}").valid).toBe(false);
  });
});
