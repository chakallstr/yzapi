import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { TelegramWebAppAuthError, validateTelegramWebAppInitData } from "./telegram-webapp-auth-service.js";

const BOT_TOKEN = "123456:ABCDEF_test_bot_token";
const NOW_SEC = 1_800_000_000;

function signedInitData(params: Record<string, string>, token = BOT_TOKEN): string {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const search = new URLSearchParams(params);
  search.set("hash", hash);
  return search.toString();
}

describe("telegram webapp init data validation", () => {
  it("validates signed Telegram initData and returns a Telegram actor", () => {
    const initData = signedInitData({
      auth_date: String(NOW_SEC - 60),
      query_id: "AAE-test",
      user: JSON.stringify({ id: 7075241777, first_name: "Sesli", username: "seslitr" }),
    });

    const result = validateTelegramWebAppInitData(initData, {
      botToken: BOT_TOKEN,
      now: new Date(NOW_SEC * 1000),
    });

    expect(result.actor).toEqual({ id: 7075241777, first_name: "Sesli", username: "seslitr" });
    expect(result.queryId).toBe("AAE-test");
  });

  it("rejects tampered initData hashes", () => {
    const initData = signedInitData({
      auth_date: String(NOW_SEC - 60),
      user: JSON.stringify({ id: 1, first_name: "Valid" }),
    }).replace("Valid", "Mallory");

    expect(() => validateTelegramWebAppInitData(initData, {
      botToken: BOT_TOKEN,
      now: new Date(NOW_SEC * 1000),
    })).toThrow(TelegramWebAppAuthError);
  });

  it("rejects missing user, stale auth_date, and future auth_date", () => {
    const stale = signedInitData({
      auth_date: String(NOW_SEC - 90_000),
      user: JSON.stringify({ id: 1, first_name: "Old" }),
    });
    const future = signedInitData({
      auth_date: String(NOW_SEC + 120),
      user: JSON.stringify({ id: 1, first_name: "Future" }),
    });
    const noUser = signedInitData({ auth_date: String(NOW_SEC - 60) });

    for (const initData of [stale, future, noUser]) {
      expect(() => validateTelegramWebAppInitData(initData, {
        botToken: BOT_TOKEN,
        now: new Date(NOW_SEC * 1000),
      })).toThrow(TelegramWebAppAuthError);
    }
  });
});
