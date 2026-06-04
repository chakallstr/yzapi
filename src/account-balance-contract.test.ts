import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/yapayzekalab/App.jsx", "utf8");
const accountSource = readFileSync("src/yapayzekalab/tab-account.jsx", "utf8");
const userRouteSource = readFileSync("src/server/routes/user.ts", "utf8");
// i18n: menu labels moved to the app-shell dictionary fragment.
const shellStrings = readFileSync("src/yapayzekalab/i18n/strings/app-shell.js", "utf8");

describe("account balance real-source contract", () => {
  it("does not keep a fake starter balance in app defaults", () => {
    expect(appSource).toContain('"balanceUSD": 0');
    expect(appSource).not.toContain('"balanceUSD": 15.20');
  });

  it("does not use tweak fallback as real account balance", () => {
    expect(accountSource).toContain("const fallbackBalanceUSD = 0;");
  });

  it("returns bakiyeUsd and a stable userCode from backend me route", () => {
    expect(userRouteSource).toContain("const bakiyeUsd =");
    expect(userRouteSource).toContain('const userCode = safe.id ? `u-${String(safe.id).replace(/-/g, "").slice(0, 8)}` : null;');
    expect(userRouteSource).toContain("async function buildUserMePayload");
    expect(userRouteSource).toContain("res.json(await buildUserMePayload(req.user!.id, safe));");
  });

  it("routes profile menu items to real account sections", () => {
    // section routing is the real contract (unchanged by i18n); labels are now dict keys.
    expect(appSource).toContain("appShell.user.itemKeys");
    expect(appSource).toContain("section: 'account-keys'");
    expect(appSource).toContain("appShell.user.itemSettings");
    expect(appSource).toContain("section: 'account-settings'");
    expect(shellStrings).toContain("API anahtarları");
    expect(shellStrings).toContain("Hesap ayarları");
    expect(accountSource).toContain('id="account-keys"');
    expect(accountSource).toContain('id="account-settings"');
  });

  it("uses the real display name in the top-right account trigger instead of a hardcoded label", () => {
    // display name is profile-derived; only the final fallback is now an i18n key.
    expect(appSource).toContain("const displayName = profile?.adSoyad || profile?.email?.split('@')[0] || t('appShell.user.fallbackName');");
    expect(appSource).not.toContain("<div style={{ fontSize: 12, fontWeight: 500 }}>Hesabım</div>");
  });

  it("exposes editable account settings actions in the account panel", () => {
    expect(accountSource).toContain("Profili kaydet");
    expect(accountSource).toContain("/api/user/me");
  });
});
