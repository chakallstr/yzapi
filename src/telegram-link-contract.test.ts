import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telegramRouteSource = readFileSync("src/server/routes/telegram.ts", "utf8");
const userRouteSource = readFileSync("src/server/routes/user.ts", "utf8");
const accountSource = readFileSync("src/yapayzekalab/tab-account.jsx", "utf8");

describe("telegram-site link contract", () => {
  it("exposes explicit link and unlink routes instead of silently creating separate users", () => {
    expect(telegramRouteSource).toContain('router.post("/link-code"');
    expect(telegramRouteSource).toContain('router.post("/unlink"');
    expect(telegramRouteSource).toContain("deepLinkUrl");
    expect(telegramRouteSource).toContain("telegram_not_linked");
  });

  it("returns telegram link summary from the authenticated me route", () => {
    expect(userRouteSource).toContain("telegram:");
    expect(userRouteSource).toContain("linkedAt");
    expect(userRouteSource).toContain("linkMethod");
  });

  it("shows Telegram link controls inside the account panel", () => {
    expect(accountSource).toContain("Telegram bağla");
    expect(accountSource).toContain("Bağlantıyı kaldır");
    expect(accountSource).toContain("/api/telegram/link-code");
    expect(accountSource).toContain("/api/telegram/unlink");
  });

  it("renders the Telegram card above auto-recharge and sandbox cards", () => {
    const telegramIndex = accountSource.indexOf("<TelegramLinkCard");
    const autoRechargeIndex = accountSource.indexOf("<AutoRechargeCard");
    const sandboxIndex = accountSource.indexOf("<SandboxKeyCard");

    expect(telegramIndex).toBeGreaterThan(-1);
    expect(autoRechargeIndex).toBeGreaterThan(-1);
    expect(sandboxIndex).toBeGreaterThan(-1);
    expect(telegramIndex).toBeLessThan(autoRechargeIndex);
    expect(telegramIndex).toBeLessThan(sandboxIndex);
  });
});
