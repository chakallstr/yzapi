import { describe, expect, it } from "vitest";

describe("telegram-bot-service pure helpers", () => {
  it("parses supported Telegram commands without guessing unsafe defaults", async () => {
    const { parseTelegramCommand } = await import("./telegram-bot-service.js");

    expect(parseTelegramCommand("/start")).toEqual({ type: "start" });
    expect(parseTelegramCommand("/link ABC-123")).toEqual({ type: "link", code: "ABC-123" });
    expect(parseTelegramCommand("/topup 10.50")).toEqual({ type: "topup", amountUsd: 10.5 });
    expect(parseTelegramCommand("/topup")).toEqual({ type: "menu" });
    expect(parseTelegramCommand("hello")).toEqual({ type: "menu" });
  });

  it("builds a balance-first menu with top-up, API key, usage, and support actions", async () => {
    const { buildTelegramMainMenu } = await import("./telegram-bot-service.js");

    const menu = buildTelegramMainMenu();
    const serialized = JSON.stringify(menu);

    expect(serialized).toContain("tg:balance");
    expect(serialized).toContain("tg:topup:5");
    expect(serialized).toContain("tg:apikey");
    expect(serialized).toContain("tg:usage");
    expect(serialized).toContain("tg:support");
    expect(serialized).not.toMatch(/stars/i);
  });

  it("formats API delivery without exposing hashes or hidden provider internals", async () => {
    const { formatApiDeliveryMessage } = await import("./telegram-bot-service.js");

    const created = formatApiDeliveryMessage({
      balanceTL: 455.5,
      fullKey: "yzk_live_secret",
      maskedKey: "yzk_live_sec...cret",
      created: true,
    });
    const existing = formatApiDeliveryMessage({
      balanceTL: 455.5,
      maskedKey: "yzk_live_sec...cret",
      created: false,
    });

    expect(created).toContain("yzk_live_secret");
    expect(existing).not.toContain("yzk_live_secret");
    expect(existing).toContain("yzk_live_sec...cret");
    expect(created).not.toMatch(/hash|provider|900k|secret path/i);
  });
});
