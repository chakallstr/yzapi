import { describe, expect, it } from "vitest";
import { redactPaths } from "./logger.js";

describe("logger redaction contract", () => {
  it("redacts API credentials from HTTP request logs", () => {
    expect(redactPaths).toContain("req.headers.authorization");
    expect(redactPaths).toContain("req.headers.cookie");
    expect(redactPaths).toContain("req.headers['x-api-key']");
    expect(redactPaths).toContain("req.headers['proxy-authorization']");
    expect(redactPaths).toContain("req.headers['x-telegram-init-data']");
  });

  it("redacts common payment/provider secret fields from structured logs", () => {
    expect(redactPaths).toEqual(expect.arrayContaining([
      "token",
      "apiKey",
      "api_key",
      "signature",
      "sign",
    ]));
  });
});
