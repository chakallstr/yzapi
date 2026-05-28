import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/yapayzekalab/App.jsx", "utf8");

describe("legal content contract", () => {
  it("contains footer legal documents and modal labels", () => {
    expect(source).toContain("KVKK Aydınlatma Metni");
    expect(source).toContain("Kullanıcı Sözleşmesi");
    expect(source).toContain("Gizlilik Politikası");
    expect(source).toContain("Mesafeli Satış Bilgilendirmesi");
  });

  it("contains operator details provided for the site", () => {
    expect(source).toContain("admin@seslab.com.tr");
    expect(source).toContain("0531 931 07 81");
    expect(source).toContain("Fiziksel adres, vergi numarası ve MERSİS bilgisi şu an paylaşılmamaktadır.");
  });

  it("shows login acceptance notice", () => {
    expect(source).toContain("Giriş yaparak KVKK Aydınlatma Metni, Gizlilik Politikası, Kullanıcı Sözleşmesi ve Mesafeli Satış koşullarını kabul etmiş sayılırsınız.");
  });
});
