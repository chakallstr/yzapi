import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/yapayzekalab/tab-admin.jsx", "utf8");

describe("admin override ui contract", () => {
  it("shows selected model current pricing before save", () => {
    expect(source).toContain("Geçerli fiyat");
    expect(source).toContain("Etkin fiyat");
  });

  it("supports editing and removing existing overrides", () => {
    expect(source).toContain("Düzenle");
    expect(source).toContain("Override kaldır");
    expect(source).toContain("Pasifleştir");
  });

  it("shows save progress and result feedback", () => {
    expect(source).toContain("Kaydediliyor");
    expect(source).toContain("Override kaydedildi");
  });

  it("normalizes decimal comma input before saving overrides", () => {
    expect(source).toContain("normalizeDecimalInput");
    expect(source).toContain("replace(',', '.')");
    expect(source).toContain("inputMode=\"decimal\"");
  });
});
