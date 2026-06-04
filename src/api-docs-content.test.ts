import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = [
  "src/App.tsx",
  "src/yapayzekalab/App.jsx",
  "src/yapayzekalab/tab-home.jsx",
  "src/yapayzekalab/tab-models.jsx",
  "src/yapayzekalab/tab-account.jsx",
  // i18n: customer-facing doc/UI copy now lives in the dictionary fragments.
  "src/yapayzekalab/i18n/strings/home.js",
  "src/yapayzekalab/i18n/strings/models.js",
  "src/yapayzekalab/i18n/strings/account.js",
].map((file) => readFileSync(file, "utf8")).join("\n");

const modelsSource = readFileSync("src/yapayzekalab/tab-models.jsx", "utf8")
  + "\n" + readFileSync("src/yapayzekalab/i18n/strings/models.js", "utf8");
const accountSource = readFileSync("src/yapayzekalab/tab-account.jsx", "utf8")
  + "\n" + readFileSync("src/yapayzekalab/i18n/strings/account.js", "utf8");

describe("API docs content contract", () => {
  it("uses the production YapayZekaLab v1 base URL and live key prefix in examples", () => {
    expect(appSource).not.toContain("https://api.yapayzekalab.com/v1");
    expect(appSource).not.toContain("https://api.yapayzekalab.org/v1");
    expect(appSource).not.toContain("Bearer YOUR_API_KEY");
    expect(appSource).toContain("https://yapayzekalab.org/v1/chat/completions");
    expect(appSource).toContain("Bearer yzk_live_YOUR_KEY");
    expect(appSource).toContain("claude-haiku-4-5-20251001");
  });

  it("documents the adapted public v1 endpoint surface", () => {
    expect(appSource).toContain("/v1/chat/completions");
    expect(appSource).toContain("/v1/responses");
    expect(appSource).toContain("/v1/messages");
    expect(appSource).toMatch(/\/v1\/responses[\s\S]{0,120}JSON hata döner ve ücret yazmaz/i);
    expect(appSource).toMatch(/Görsel ve video endpointleri[\s\S]{0,120}501 JSON hata/i);
  });

  it("explains that image and video endpoints are disabled during provider migration", () => {
    expect(appSource).toMatch(/aktif katalog yalnızca metin modelleridir/i);
    expect(appSource).toMatch(/görsel\/video endpointleri 501 döner/i);
    expect(modelsSource).toMatch(/Görsel\/video endpointleri[\s\S]{0,120}501 JSON hata/i);
  });

  it("does not expose internal multiplier formulas as public sales copy", () => {
    expect(appSource).not.toMatch(/Sağlayıcı maliyeti\s*×/i);
    expect(appSource).not.toMatch(/×\s*3\.0|×\s*2\.3/);
  });

  it("does not present example playground data as a verified live API call", () => {
    expect(appSource).not.toContain("yzk_live_a8f3");
    expect(appSource).not.toMatch(/Playground · canlı test/i);
    expect(appSource).not.toMatch(/sağlayıcı çağrılıyor/i);
    expect(appSource).not.toMatch(/gerçek bir istek yapar \(sandbox\)/i);
    expect(appSource).not.toMatch(/ilk başarılı yanıtın/i);
    expect(appSource).toMatch(/Playground · örnek akış/i);
    expect(appSource).toContain("yzk_live_YOUR_KEY");
  });

  it("keeps the account top-up payment display aligned with backend rounded TL quotes", () => {
    expect(accountSource).toContain("Math.ceil(effectiveAmount * tlRate)");
    expect(accountSource).toContain("roundingTL");
    expect(accountSource).toMatch(/paymentTotalLabel[\s\S]{0,160}payableTL/);
    expect(accountSource).toMatch(/Ödenecek[\s\S]{0,360}paymentTotalLabel/);
    expect(accountSource).not.toContain("tweaks.feePct ?? 5");
    expect(accountSource).not.toMatch(/%5 komisyon|Komisyon %/);
  });

  it("shows payment history with USD credit and rounded TL collection fields", () => {
    expect(accountSource).toContain("Bakiye USD");
    expect(accountSource).toContain("Tahsilat TL");
    expect(accountSource).toContain("Yuvarlama");
    expect(accountSource).toMatch(/creditTL[\s\S]{0,180}amountUsd/);
    expect(accountSource).toMatch(/payableTL[\s\S]{0,180}miktarTL/);
  });
});
