import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("telegram float contract", () => {
  it("keeps a left-side telegram float visible on every page", () => {
    const source = readFileSync("src/yapayzekalab/App.jsx", "utf8");
    const shell = readFileSync("src/yapayzekalab/i18n/strings/app-shell.js", "utf8");

    expect(source).toContain("const TelegramFloat =");
    // i18n: aria-label now uses a dict key; the TR string still ships in the fragment.
    expect(source).toContain("appShell.float.telegramAria");
    expect(shell).toContain("Telegram botunu aç");
    expect(source).toContain("left: 20");
    expect(source).toContain("<TelegramFloat");
  });
});
