import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/yapayzekalab/App.jsx", "utf8");

describe("real notifications contract", () => {
  it("removes hardcoded notification mock data", () => {
    expect(source).not.toContain("seedNotifs");
    expect(source).not.toContain("Yeni API anahtarı oluşturuldu");
    expect(source).not.toContain("Claude Opus 4.7 fiyatı güncellendi");
  });

  it("reads active announcements from backend", () => {
    expect(source).toContain("/api/announcements/active");
    expect(source).toContain("Aktif admin duyurusu yok.");
    expect(source).toContain("Admin duyuruları anlık yayınlanır");
  });
});
