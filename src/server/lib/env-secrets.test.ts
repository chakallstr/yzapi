import { describe, expect, it } from "vitest";
import { envSchema } from "./env.js";

// Minimal valid base; production secret-separation rules are layered on top.
const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_SECRET: "jwt-secret-at-least-32-characters-long!!",
  APP_BASE_URL: "http://localhost:4567",
};

describe("env production secret separation (Y4)", () => {
  it("rejects production without a dedicated API_KEY_ENCRYPTION_SECRET", () => {
    const result = envSchema.safeParse({ ...base, NODE_ENV: "production" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("API_KEY_ENCRYPTION_SECRET"))).toBe(true);
    }
  });

  it("rejects production when API_KEY_ENCRYPTION_SECRET equals JWT_SECRET", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      API_KEY_ENCRYPTION_SECRET: base.JWT_SECRET,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("API_KEY_ENCRYPTION_SECRET"))).toBe(true);
    }
  });

  it("accepts production with a distinct API_KEY_ENCRYPTION_SECRET", () => {
    const result = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      API_KEY_ENCRYPTION_SECRET: "dedicated-api-key-secret-32-chars-min!!",
    });
    expect(result.success).toBe(true);
  });

  it("requires WHATSAPP_OTP_HASH_SECRET in production only when OTP is enabled", () => {
    const okWhenDisabled = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      API_KEY_ENCRYPTION_SECRET: "dedicated-api-key-secret-32-chars-min!!",
      WHATSAPP_OTP_ENABLED: "false",
    });
    expect(okWhenDisabled.success).toBe(true);

    const failsWhenEnabled = envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      API_KEY_ENCRYPTION_SECRET: "dedicated-api-key-secret-32-chars-min!!",
      WHATSAPP_OTP_ENABLED: "true",
    });
    expect(failsWhenEnabled.success).toBe(false);
    if (!failsWhenEnabled.success) {
      expect(failsWhenEnabled.error.issues.some((i) => i.path.includes("WHATSAPP_OTP_HASH_SECRET"))).toBe(true);
    }
  });

  it("allows dev/test to fall back to JWT_SECRET (no separation required)", () => {
    const result = envSchema.safeParse({ ...base, NODE_ENV: "development" });
    expect(result.success).toBe(true);
  });
});
