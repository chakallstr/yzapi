import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/yapayzekalab/App.jsx", "utf8");
const legalSource = readFileSync("src/yapayzekalab/legal-docs.js", "utf8");
// i18n: login consent text moved to the app-shell dictionary fragment.
const shell = readFileSync("src/yapayzekalab/i18n/strings/app-shell.js", "utf8");
const combined = `${appSource}\n${legalSource}\n${shell}`;

describe("legal content contract", () => {
  it("contains footer legal documents and modal labels", () => {
    expect(combined).toContain("KVKK Aydınlatma Metni");
    expect(combined).toContain("Kullanıcı Sözleşmesi");
    expect(combined).toContain("Gizlilik Politikası");
    expect(combined).toContain("Mesafeli Satış Bilgilendirmesi");
  });

  it("contains operator details provided for the site", () => {
    expect(combined).toContain("admin@seslab.com.tr");
    expect(combined).toContain("0531 931 07 81");
    expect(combined).toContain("Fiziksel adres, vergi numarası ve MERSİS bilgisi şu an paylaşılmamaktadır.");
  });

  it("shows login acceptance notice", () => {
    // wiring intact (consent rendered via i18n key) + TR string still shipped in the dict.
    expect(appSource).toContain("appShell.login.consent");
    expect(shell).toContain("Giriş yaparak KVKK Aydınlatma Metni, Gizlilik Politikası, Kullanıcı Sözleşmesi ve Mesafeli Satış koşullarını kabul etmiş sayılırsınız.");
  });
});
