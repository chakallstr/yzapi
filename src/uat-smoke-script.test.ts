import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("qa:uat script contract", () => {
  it("defines a reusable browser UAT smoke command", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["qa:uat"]).toBe("node scripts/yapayzekalab-uat-smoke.mjs");
  });

  it("uses Chrome channel and writes safe Turkish reports", () => {
    const source = readFileSync("scripts/yapayzekalab-uat-smoke.mjs", "utf8");

    expect(source).toContain("channel: process.env.PLAYWRIGHT_CHANNEL ?? \"chrome\"");
    expect(source).toContain("qa-artifacts");
    expect(source).toContain("YapayZekaLab UAT Smoke Raporu");
    expect(source).toContain("Admin Girişi");
    expect(source).toContain("/docs");
  });
});
