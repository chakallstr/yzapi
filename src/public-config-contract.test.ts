import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPublicConfigResponse } from "./server/routes/settings.js";

describe("public config contract", () => {
  it("exposes only safe public UI fields", () => {
    const response = buildPublicConfigResponse({
      kur: "47.084289",
      updatedAt: new Date("2026-05-27T00:00:00.000Z"),
    });

    expect(response).toEqual({
      kur: 47.084289,
      updatedAt: "2026-05-27T00:00:00.000Z",
      source: "system_config",
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/secret|api[_-]?key|password|token/i);
    expect(serialized).not.toMatch(/billingRatio|textBillingRatio|carpan|buffer|admin/i);
  });

  it("keeps the public-config fetch stable instead of refetching on every log tick", () => {
    const source = readFileSync("src/yapayzekalab/App.jsx", "utf8");

    expect(source).toContain("fetch('/api/public-config')");
    expect(source).toContain("useCallback");
    expect(source).toMatch(/const setValue = useCallback\(/);
  });
});
