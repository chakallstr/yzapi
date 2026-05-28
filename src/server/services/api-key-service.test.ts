import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("api-key-service encryption helpers", () => {
  it("encrypts and decrypts full API keys for Telegram redelivery", async () => {
    const { decryptApiKey, encryptApiKey } = await import("./api-key-service.js");

    const fullKey = ["yzk", "live", "0123456789abcdef012345"].join("_");
    const cipher = encryptApiKey(fullKey);

    expect(cipher).not.toContain(fullKey);
    expect(decryptApiKey(cipher)).toBe(fullKey);
  });

  it("returns null for invalid encrypted API key payloads", async () => {
    const { decryptApiKey } = await import("./api-key-service.js");

    expect(decryptApiKey("not-a-valid-payload")).toBeNull();
  });

  it("requires active user status during API key validation", () => {
    const source = readFileSync("src/server/services/api-key-service.ts", "utf8");
    expect(source).toContain('if (user.durum !== "aktif") continue;');
  });
});
