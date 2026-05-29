import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("home topup navigation contract", () => {
  it("routes the home topup CTA into the account balance section", () => {
    const homeSource = readFileSync("src/yapayzekalab/tab-home.jsx", "utf8");
    const appSource = readFileSync("src/yapayzekalab/App.jsx", "utf8");
    const accountSource = readFileSync("src/yapayzekalab/tab-account.jsx", "utf8");

    expect(homeSource).toContain("onAction?.({ tab: 'account', section: 'account-balance' })");
    expect(appSource).toContain("<HomeTab     ctx={ctx} onTab={selectTab} onAction={onUserAction} />");
    expect(accountSource).toContain("id=\"account-balance\"");
  });
});
