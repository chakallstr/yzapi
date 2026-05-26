import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/server/routes/admin.ts", "utf8");

describe("admin billing guard contract", () => {
  it("does not allow direct balance mutation through the generic user patch route", () => {
    expect(source).not.toContain("updates.bakiyeTL");
    expect(source).toContain("Bakiye degisikligi icin /api/admin/users/:id/bakiye endpointini kullanin.");
  });

  it("creates admin API keys as usable hashed keys and returns the full key once", () => {
    const start = source.indexOf('router.post("/api-keys/:userId/create"');
    expect(start).toBeGreaterThan(-1);
    const route = source.slice(start);

    expect(route).toContain("generateApiKey()");
    expect(route).toContain("hashApiKey(fullKey)");
    expect(route).toContain("keyHash,");
    expect(route).toContain("key: fullKey");
    expect(route).not.toContain("keyHash: null");
  });
});
