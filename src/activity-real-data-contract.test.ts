import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/yapayzekalab/tab-activity.jsx", "utf8");

describe("activity tab real data contract", () => {
  it("reads real usage records instead of fake counters", () => {
    expect(source).toContain("apiJson('/api/user/usage-records')");
    expect(source).not.toContain("value={14022}");
    expect(source).not.toContain("Bu ay %42 tasarruf fırsatı");
    expect(source).not.toContain("Saniye başına ortalama 14.2 istek");
  });

  it("shows empty-state messaging for new accounts", () => {
    expect(source).toContain("Yeni hesaplarda bu ekran sıfırdan başlar.");
    expect(source).toContain("Henüz çağrı yapılmadı.");
    expect(source).toContain("Henüz kullanım kaydı yok.");
  });
});
