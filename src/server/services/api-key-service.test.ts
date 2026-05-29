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

  it("decrypts ciphers written under an old secret (rotation fallback) (Y4)", async () => {
    const { decryptApiKey, encryptApiKey } = await import("./api-key-service.js");

    const fullKey = ["yzk", "live", "fedcba9876543210fedcba"].join("_");
    const oldSecret = "old-dedicated-api-key-secret-32-chars-min!";
    const newSecret = "new-dedicated-api-key-secret-32-chars-min!";

    // Cipher written under the previous secret.
    const oldCipher = encryptApiKey(fullKey, oldSecret);

    // Primary alone (new secret) cannot read it…
    expect(decryptApiKey(oldCipher, [newSecret])).toBeNull();
    // …but the rotation list (new + old) recovers the plaintext.
    expect(decryptApiKey(oldCipher, [newSecret, oldSecret])).toBe(fullKey);
  });

  it("does not decrypt with the wrong secret (Y4 separation)", async () => {
    const { decryptApiKey, encryptApiKey } = await import("./api-key-service.js");

    const fullKey = ["yzk", "live", "0011223344556677889900"].join("_");
    const cipher = encryptApiKey(fullKey, "secret-A-dedicated-32-characters-long!!");

    expect(decryptApiKey(cipher, ["secret-B-dedicated-32-characters-long!!"])).toBeNull();
  });

  it("requires active user status during API key validation", () => {
    const source = readFileSync("src/server/services/api-key-service.ts", "utf8");
    expect(source).toContain('if (user.durum !== "aktif") continue;');
  });
});
