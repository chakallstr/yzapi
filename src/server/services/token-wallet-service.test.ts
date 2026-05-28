import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/env.js", () => ({
  env: {
    TOKEN_WALLET_MODE: "disabled",
    TOKEN_WALLET_BASE_USD_PER_M: 0.64,
    SOLD_PACKAGE_TOKENS: 900_000,
    INTERNAL_GRANTED_TOKENS: 1_000_000,
  },
}));

describe("token wallet helpers", () => {
  it("maps sold package to internal granted package ratio", async () => {
    const svc = await import("./token-wallet-service.js");
    expect(svc.SOLD_PACKAGE_TOKENS).toBe(900_000);
    expect(svc.INTERNAL_GRANTED_TOKENS).toBe(1_000_000);
    expect(svc.grantedPackageTokens()).toBe(1_000_000);
  });

  it("grants token balance from USD topup using base rate", async () => {
    const svc = await import("./token-wallet-service.js");
    expect(svc.grantedTokensFromUsd(0.64)).toBe(1_000_000);
    expect(svc.grantedTokensFromUsd(1.28)).toBe(2_000_000);
  });

  it("derives billable tokens from cost usd", async () => {
    const svc = await import("./token-wallet-service.js");
    expect(svc.billableTokensFromCostUsd(0.64)).toBe(1_000_000);
    expect(svc.billableTokensFromCostUsd(1.28)).toBe(2_000_000);
  });
});
