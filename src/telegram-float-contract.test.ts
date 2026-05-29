import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("telegram float contract", () => {
  it("keeps a left-side telegram float visible on every page", () => {
    const source = readFileSync("src/yapayzekalab/App.jsx", "utf8");

    expect(source).toContain("const TelegramFloat =");
    expect(source).toContain("aria-label=\"Telegram botunu aç\"");
    expect(source).toContain("left: 20");
    expect(source).toContain("<TelegramFloat");
  });
});
