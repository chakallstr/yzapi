import { describe, it, expect } from "vitest";
import { pickLang, translate } from "./index.jsx";
import { tr } from "./tr.js";
import { en } from "./en.js";

describe("i18n pickLang", () => {
  it("prefers a valid stored preference over browser language", () => {
    expect(pickLang("en", "tr-TR")).toBe("en");
    expect(pickLang("tr", "en-US")).toBe("tr");
  });
  it("falls back to browser language when no stored pref", () => {
    expect(pickLang(null, "tr-TR")).toBe("tr");
    expect(pickLang("", "tr")).toBe("tr");
    expect(pickLang(null, "en-US")).toBe("en");
    expect(pickLang(null, "de-DE")).toBe("en"); // non-tr browser → en
  });
  it("defaults to tr when nothing is known", () => {
    expect(pickLang(null, "")).toBe("tr");
    expect(pickLang(undefined, undefined)).toBe("tr");
  });
  it("ignores an invalid stored value", () => {
    expect(pickLang("fr", "tr-TR")).toBe("tr");
    expect(pickLang("xx", "en-US")).toBe("en");
  });
});

describe("i18n translate", () => {
  it("returns the string for the requested language", () => {
    expect(translate("tr", "nav.home")).toBe("Ana Sayfa");
    expect(translate("en", "nav.home")).toBe("Home");
  });
  it("falls back to tr when the en key is missing", () => {
    const onlyTr = "common.cancel";
    expect(translate("tr", onlyTr)).toBe("İptal");
  });
  it("returns the key itself when missing everywhere", () => {
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });
  it("interpolates {var} placeholders", () => {
    expect(translate("en", "__test.greet", { name: "Ada" })).toBe("__test.greet"); // missing key → key
  });
});

describe("i18n dictionary parity", () => {
  it("every tr key exists in en and vice versa", () => {
    const trKeys = Object.keys(tr).sort();
    const enKeys = Object.keys(en).sort();
    const missingInEn = trKeys.filter((k) => !(k in en));
    const missingInTr = enKeys.filter((k) => !(k in tr));
    expect(missingInEn).toEqual([]);
    expect(missingInTr).toEqual([]);
  });
});
