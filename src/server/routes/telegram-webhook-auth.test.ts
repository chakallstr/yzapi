import { describe, expect, it } from "vitest";
import { isTelegramWebhookAuthorized } from "./telegram-webhook-auth.js";

describe("isTelegramWebhookAuthorized (K4)", () => {
  it("rejects in production when no secret is configured", () => {
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: undefined, providedToken: "anything", nodeEnv: "production" }),
    ).toBe(false);
  });

  it("is permissive in dev/test when no secret is configured", () => {
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: undefined, providedToken: undefined, nodeEnv: "development" }),
    ).toBe(true);
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: undefined, providedToken: undefined, nodeEnv: "test" }),
    ).toBe(true);
  });

  it("accepts a matching token when a secret is configured", () => {
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: "s3cret-token", providedToken: "s3cret-token", nodeEnv: "production" }),
    ).toBe(true);
  });

  it("rejects a wrong token when a secret is configured", () => {
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: "s3cret-token", providedToken: "wrong", nodeEnv: "production" }),
    ).toBe(false);
  });

  it("rejects a missing token when a secret is configured", () => {
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: "s3cret-token", providedToken: undefined, nodeEnv: "production" }),
    ).toBe(false);
  });

  it("rejects different-length tokens without throwing (timingSafeEqual length guard)", () => {
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: "s3cret-token", providedToken: "short", nodeEnv: "production" }),
    ).toBe(false);
  });

  it("enforces the secret even in dev once it is configured", () => {
    expect(
      isTelegramWebhookAuthorized({ expectedSecret: "s3cret-token", providedToken: "wrong", nodeEnv: "development" }),
    ).toBe(false);
  });
});
