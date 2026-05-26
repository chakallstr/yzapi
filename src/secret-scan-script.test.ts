import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("secret scan script contract", () => {
  it("defines a local secret scanner that respects git ignore rules", () => {
    const source = readFileSync("scripts/scan-secrets.mjs", "utf8");

    expect(source).toContain("git ls-files -co --exclude-standard");
    expect(source).toContain("redact");
    expect(source).toContain("BEGIN PRIVATE KEY");
    expect(source).toContain("github_pat_");
  });
});
