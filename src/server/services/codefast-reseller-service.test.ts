import { describe, it, expect, vi, beforeEach } from "vitest";

// env needs the key set so the client doesn't short-circuit with 503.
vi.mock("../lib/env.js", () => ({
  env: {
    CODEFAST_RESELLER_BASE_URL: "https://reseller-api.codefast.app",
    CODEFAST_RESELLER_API_KEY: "cf_res_live_test",
  },
}));

describe("codefast-reseller-service", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cfQuote posts items with bearer auth and parses reseller_cost_amount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          reseller_cost_amount: 1035,
          original_amount: 1150,
          discount_percent: 10,
          currency: "TRY",
          manual_review_required: false,
          items: [{ catalog_id: "c1", reseller_cost_amount: 1035, fulfillment_status: "auto_fulfilled" }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { cfQuote } = await import("./codefast-reseller-service.js");
    const q = await cfQuote([{ catalog_id: "c1", limit_amount: 500, duration_days: 30 }]);
    expect(q.reseller_cost_amount).toBe(1035);
    expect(q.discount_percent).toBe(10);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://reseller-api.codefast.app/v1/orders/quote");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer cf_res_live_test");
    expect(JSON.parse(init.body)).toEqual({ items: [{ catalog_id: "c1", limit_amount: 500, duration_days: 30 }] });
  });

  it("cfCreateOrder sends Idempotency-Key and create_customer_api_key:true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: "ord1", status: "completed", manual_review_required: false, reseller_cost_amount: 1035, customer_api_key: "cf_rc_live_abc", items: [] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { cfCreateOrder } = await import("./codefast-reseller-service.js");
    const o = await cfCreateOrder(
      { external_customer_id: "u1", external_order_id: "o1", items: [{ catalog_id: "c1", limit_amount: 500, duration_days: 30 }] },
      "idem-key-1",
    );
    expect(o.customer_api_key).toBe("cf_rc_live_abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/orders");
    expect(init.headers["Idempotency-Key"]).toBe("idem-key-1");
    expect(JSON.parse(init.body).create_customer_api_key).toBe(true);
  });

  it("throws CodefastError on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => "no balance" }));
    const { cfCreateOrder, CodefastError } = await import("./codefast-reseller-service.js");
    await expect(
      cfCreateOrder({ external_customer_id: "u1", external_order_id: "o1", items: [{ catalog_id: "c1", limit_amount: 500, duration_days: 30 }] }, "idem1"),
    ).rejects.toBeInstanceOf(CodefastError);
  });

  it("throws CodefastError on success:false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: false }) }));
    const { cfCatalog, CodefastError } = await import("./codefast-reseller-service.js");
    await expect(cfCatalog()).rejects.toBeInstanceOf(CodefastError);
  });
});
