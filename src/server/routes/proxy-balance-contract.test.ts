import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proxySource = readFileSync("src/server/routes/proxy.ts", "utf8");
const indexSource = readFileSync("src/server/index.ts", "utf8");

describe("proxy balance contract", () => {
  it("exposes an authenticated balance endpoint for API key users", () => {
    expect(proxySource).toContain('router.get("/balance"');
    expect(proxySource).toContain('object: "balance"');
    expect(proxySource).toContain('remainingUSD');
    expect(indexSource).toContain('/^\\/balance$/');
  });

  it("returns remaining USD as a billing header on successful JSON requests", () => {
    expect(proxySource).toContain('X-YZ-Remaining-USD');
    expect(proxySource).toContain('setExtendedBillingHeaders');
  });
});
