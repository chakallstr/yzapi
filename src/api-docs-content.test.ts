import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/App.tsx", "utf8");

describe("API docs content contract", () => {
  it("uses the production YapayZekaLab v1 base URL and live key prefix in examples", () => {
    expect(appSource).not.toContain("https://api.yapayzekalab.com/v1");
    expect(appSource).not.toContain("Bearer YOUR_API_KEY");
    expect(appSource).toContain("https://yapayzekalab.org/v1/chat/completions");
    expect(appSource).toContain("Bearer yzk_live_YOUR_KEY");
  });

  it("explains that video endpoints are beta or limited instead of fully production-ready", () => {
    expect(appSource).toMatch(/Video[\s\S]{0,160}(beta|sınırlı|501)/i);
    expect(appSource).toMatch(/video API endpointleri aktif değilse 501 dönebilir/i);
  });
});
