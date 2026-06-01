import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// OSB credentials must be set BEFORE importing the service (env is parsed at import).
process.env.SHOPIER_OSB_USERNAME = "osb_user_demo";
process.env.SHOPIER_OSB_PASSWORD = "osb_pass_demo";
process.env.SHOPIER_OSB_PRODUCT_MAP = JSON.stringify({
  "47233749": { priceTL: 899, creditTL: 899 },
  "47233947": { priceTL: 299, creditTL: 299 },
});

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const USER = "osb_user_demo";
const PASS = "osb_pass_demo";

function encode(obj: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
  const hash = createHmac("sha256", PASS).update(encoded + USER).digest("hex");
  return { encoded, hash };
}
function named(obj: Record<string, unknown>) {
  const e = encode(obj);
  return { res: e.encoded, hash: e.hash };
}

describe("verifyOsbNotification — Shopier official OSB HMAC", () => {
  it("validates the openssl-confirmed GOLDEN vector (algorithm not self-referential)", async () => {
    const { verifyOsbNotification } = await import("./shopier-service.js");
    // res = base64('{"email":"m@x.com","orderid":"G1","productid":"47233749","price":"899","istest":"0"}')
    // hash independently computed via: printf '%s' "<res><user>" | openssl dgst -sha256 -hmac "<pass>"
    const res = Buffer.from(
      '{"email":"m@x.com","orderid":"G1","productid":"47233749","price":"899","istest":"0"}',
      "utf8",
    ).toString("base64");
    const GOLDEN_HASH = "e67b2d7dd6dbaadda2794b308cbcd1f14c8a15edaf5e12c9ddfae120aceab193";
    const r = verifyOsbNotification({ res, hash: GOLDEN_HASH });
    expect(r.valid).toBe(true);
    expect(r.payload?.orderid).toBe("G1");
    expect(r.payload?.productid).toBe("47233749");
  });

  it("rejects a one-char tampered hash", async () => {
    const { verifyOsbNotification } = await import("./shopier-service.js");
    const b = named({ orderid: "X1", productid: "47233749", price: "899" });
    b.hash = b.hash.slice(0, -1) + (b.hash.slice(-1) === "a" ? "b" : "a");
    expect(verifyOsbNotification(b).valid).toBe(false);
  });

  it("rejects uppercased hex (Shopier sends lowercase)", async () => {
    const { verifyOsbNotification } = await import("./shopier-service.js");
    const b = named({ orderid: "X2", productid: "47233749", price: "899" });
    b.hash = b.hash.toUpperCase();
    expect(verifyOsbNotification(b).valid).toBe(false);
  });

  it("rejects truncated/empty hash without throwing", async () => {
    const { verifyOsbNotification } = await import("./shopier-service.js");
    const b = named({ orderid: "X3", productid: "47233749", price: "899" });
    expect(verifyOsbNotification({ res: b.res, hash: b.hash.slice(0, 8) }).valid).toBe(false);
    expect(verifyOsbNotification({ res: b.res, hash: "" }).valid).toBe(false);
  });

  it("returns missing_fields when neither named nor positional body present", async () => {
    const { verifyOsbNotification } = await import("./shopier-service.js");
    expect(verifyOsbNotification({ foo: "bar" }).reason).toBe("missing_fields");
  });

  it("returns bad_payload for a validly-signed but non-JSON payload", async () => {
    const { verifyOsbNotification } = await import("./shopier-service.js");
    const encoded = "@@@not-base64-json@@@";
    const hash = createHmac("sha256", PASS).update(encoded + USER).digest("hex");
    const r = verifyOsbNotification({ res: encoded, hash });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("bad_payload");
  });
});

describe("normalizeOsbBody — multi wire-format", () => {
  it("normalizes named, positional-obj, bracket-literal and array forms identically", async () => {
    const { normalizeOsbBody } = await import("./shopier-service.js");
    const e = encode({ orderid: "N1", productid: "47233749", price: "899" });
    const named = normalizeOsbBody({ res: e.encoded, hash: e.hash });
    const positional = normalizeOsbBody({ 0: { value: e.encoded }, 1: { value: e.hash } });
    const bracket = normalizeOsbBody({ "0[value]": e.encoded, "1[value]": e.hash });
    const array = normalizeOsbBody([{ value: e.encoded }, { value: e.hash }]);
    for (const n of [named, positional, bracket, array]) {
      expect(n).not.toBeNull();
      expect(n!.encoded).toBe(e.encoded);
      expect(n!.hash).toBe(e.hash);
    }
  });

  it("returns null for unrecognized shapes", async () => {
    const { normalizeOsbBody } = await import("./shopier-service.js");
    expect(normalizeOsbBody(null)).toBeNull();
    expect(normalizeOsbBody("string")).toBeNull();
    expect(normalizeOsbBody({ res: "only" })).toBeNull();
  });
});

describe("isOsbTestOrder — conservative test detection", () => {
  it('treats only "0"/"false"/""/absent as real orders', async () => {
    const { isOsbTestOrder } = await import("./shopier-service.js");
    expect(isOsbTestOrder("0")).toBe(false);
    expect(isOsbTestOrder("false")).toBe(false);
    expect(isOsbTestOrder("")).toBe(false);
    expect(isOsbTestOrder(undefined)).toBe(false);
    expect(isOsbTestOrder(null)).toBe(false);
  });

  it("treats 1 / true / '1' / 'true' / 'yes' as test orders (no credit)", async () => {
    const { isOsbTestOrder } = await import("./shopier-service.js");
    expect(isOsbTestOrder(1)).toBe(true);
    expect(isOsbTestOrder(true)).toBe(true);
    expect(isOsbTestOrder("1")).toBe(true);
    expect(isOsbTestOrder("true")).toBe(true);
    expect(isOsbTestOrder("yes")).toBe(true);
  });
});

describe("getOsbProductMap / resolveOsbProduct", () => {
  beforeEach(async () => {
    const { resetOsbProductMapCache } = await import("./shopier-service.js");
    resetOsbProductMapCache();
  });

  it("resolves a configured product to its price/credit pair", async () => {
    const { resolveOsbProduct } = await import("./shopier-service.js");
    expect(resolveOsbProduct("47233749")).toEqual({ priceTL: 899, creditTL: 899 });
    expect(resolveOsbProduct("47233947")).toEqual({ priceTL: 299, creditTL: 299 });
  });

  it("returns null for unknown product ids", async () => {
    const { resolveOsbProduct } = await import("./shopier-service.js");
    expect(resolveOsbProduct("999999")).toBeNull();
    expect(resolveOsbProduct(undefined)).toBeNull();
  });
});
