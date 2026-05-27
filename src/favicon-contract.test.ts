import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("favicon contract", () => {
  it("declares a favicon so browsers do not request missing /favicon.ico", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html).toMatch(/<link\s+rel="icon"/);
    expect(html).toContain("data:image/svg+xml");
  });
});
