import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/yapayzekalab/App.jsx", "utf8");
const accountSource = readFileSync("src/yapayzekalab/tab-account.jsx", "utf8");
const userRouteSource = readFileSync("src/server/routes/user.ts", "utf8");

describe("account balance real-source contract", () => {
  it("does not keep a fake starter balance in app defaults", () => {
    expect(appSource).toContain('"balanceUSD": 0');
    expect(appSource).not.toContain('"balanceUSD": 15.20');
  });

  it("does not use tweak fallback as real account balance", () => {
    expect(accountSource).toContain("const fallbackBalanceUSD = 0;");
  });

  it("returns bakiyeUsd from backend me route", () => {
    expect(userRouteSource).toContain("const bakiyeUsd =");
    expect(userRouteSource).toContain("res.json({ ...safe, bakiyeUsd, ...whatsapp });");
  });
});
