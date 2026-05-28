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

  it("builds a balance-first menu with WebApp top-up, API key, usage, and support actions", async () => {
    const { buildTelegramMainMenu } = await import("./telegram-bot-service.js");

    const menu = buildTelegramMainMenu();
    const serialized = JSON.stringify(menu);

    expect(serialized).toContain("tg:balance");
    expect(serialized).toContain("tg:topup:panel");
    expect(serialized).not.toContain("tg:topup:5");
    expect(serialized).toContain("tg:apikey");
    expect(serialized).toContain("tg:usage");
    expect(serialized).toContain("tg:support");
    expect(serialized).not.toMatch(/stars/i);
  });

  it("builds a Telegram WebApp top-up panel menu", async () => {
    const { buildTelegramTopupPanelMenu } = await import("./telegram-bot-service.js");

    const menu = buildTelegramTopupPanelMenu("https://yapayzekalab.org/telegram/topup");
    const serialized = JSON.stringify(menu);

    expect(serialized).toContain("Paneli Aç");
    expect(serialized).toContain("\"web_app\"");
    expect(serialized).toContain("https://yapayzekalab.org/telegram/topup");
    expect(serialized).toContain("tg:menu");
  });

  it("builds an API key action menu with a change button that keeps the user on Telegram", async () => {
    const { buildTelegramApiKeyMenu } = await import("./telegram-bot-service.js");

    const menu = buildTelegramApiKeyMenu();
    const serialized = JSON.stringify(menu);

    expect(serialized).toContain("Değiştir");
    expect(serialized).toContain("tg:apikey:change");
    expect(serialized).toContain("tg:menu");
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
      fullKey: "yzk_live_existing_secret",
      maskedKey: "yzk_live_sec...cret",
      created: false,
    });
    const rotated = formatApiDeliveryMessage({
      balanceTL: 455.5,
      fullKey: "yzk_live_rotated_secret",
      maskedKey: "yzk_live_rot...cret",
      created: true,
      rotated: true,
    });

    expect(created).toContain("yzk_live_secret");
    expect(created).toContain("<code>yzk_live_secret</code>");
    expect(existing).toContain("yzk_live_existing_secret");
    expect(existing).toContain("<code>yzk_live_existing_secret</code>");
    expect(rotated).toContain("Eski key iptal edildi");
    expect(created).toContain("kopyala");
    expect(created).not.toMatch(/hash|provider|900k|secret path/i);
  });

  it("formats Telegram usage with current balance and recent requests", async () => {
    const { formatTelegramUsageMessage } = await import("./telegram-bot-service.js");

    const message = formatTelegramUsageMessage({
      balanceTL: 93.5,
      usageItems: [
        {
          modelId: "claude-haiku-4-5",
          costTL: 2.25,
          remainingTL: 93.5,
          status: "success",
          timestamp: new Date("2026-05-28T14:10:00.000Z"),
        },
        {
          modelId: "gpt-4o-mini",
          costTL: 0,
          remainingTL: 95.75,
          status: "error",
          timestamp: new Date("2026-05-28T14:08:00.000Z"),
        },
      ],
    });

    expect(message).toContain("Güncel bakiyen: 93.50 TL");
    expect(message).toContain("claude-haiku-4-5");
    expect(message).toContain("-2.25 TL");
    expect(message).toContain("Kalan: 93.50 TL");
    expect(message).toContain("gpt-4o-mini");
    expect(message).toContain("Başarısız");
  });
});
