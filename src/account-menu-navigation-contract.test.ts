import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("account menu navigation contract", () => {
  it("maps profile menu items to explicit account section ids", () => {
    const appSource = readFileSync("src/yapayzekalab/App.jsx", "utf8");
    const accountSource = readFileSync("src/yapayzekalab/tab-account.jsx", "utf8");

    expect(appSource).toContain("section: 'account-balance'");
    expect(appSource).toContain("section: 'account-keys'");
    expect(appSource).toContain("section: 'account-usage'");
    expect(appSource).toContain("section: 'account-settings'");
    expect(accountSource).toContain("const targetId = goto.startsWith('account-') ? goto : `account-${goto}`;");
  });
});
