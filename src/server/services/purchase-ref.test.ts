// src/server/services/purchase-ref.test.ts
import { describe, expect, it } from "vitest";
import { istanbulYYMMDD, randomCode, formatPurchaseRef, ALPHABET, generateUniquePurchaseRef } from "./purchase-ref.js";

describe("purchase-ref saf fonksiyonlar", () => {
  it("istanbulYYMMDD: UTC tarihini Europe/Istanbul gününe çevirir", () => {
    expect(istanbulYYMMDD(new Date("2026-06-20T21:30:00Z"))).toBe("260621");
    expect(istanbulYYMMDD(new Date("2026-06-20T09:00:00Z"))).toBe("260620");
  });
  it("randomCode: yalnız belirsizlik-yok alfabeden, istenen uzunlukta üretir", () => {
    for (let i = 0; i < 200; i++) {
      const c = randomCode(4);
      expect(c).toHaveLength(4);
      expect([...c].every((ch) => ALPHABET.includes(ch))).toBe(true);
    }
    expect(ALPHABET).not.toMatch(/[IO01a-z]/);
  });
  it("formatPurchaseRef: YZK-YYMMDD-XXXX biçimi", () => {
    expect(formatPurchaseRef(new Date("2026-06-20T09:00:00Z"), "7K3F")).toBe("YZK-260620-7K3F");
    expect(formatPurchaseRef(new Date("2026-06-20T09:00:00Z"), "7K3F")).toMatch(/^YZK-\d{6}-[A-Z2-9]{4}$/);
  });
});

describe("generateUniquePurchaseRef", () => {
  it("çakışma yoksa ilk denemede ref döner", async () => {
    const calls: string[] = [];
    const fakeSql: any = (_s: TemplateStringsArray, ref: string) => { calls.push(ref); return Promise.resolve([]); };
    const ref = await generateUniquePurchaseRef(fakeSql, new Date("2026-06-20T09:00:00Z"));
    expect(ref).toMatch(/^YZK-260620-[A-Z2-9]{4}$/);
    expect(calls).toHaveLength(1);
  });
  it("çakışmada yeniden üretir, boşalınca döner", async () => {
    let n = 0;
    const fakeSql: any = () => Promise.resolve(n++ === 0 ? [{ "?column?": 1 }] : []);
    const ref = await generateUniquePurchaseRef(fakeSql, new Date("2026-06-20T09:00:00Z"));
    expect(ref).toMatch(/^YZK-260620-[A-Z2-9]{4}$/);
    expect(n).toBe(2);
  });
  it("maxAttempts boyunca hep çakışırsa hata fırlatır", async () => {
    const fakeSql: any = () => Promise.resolve([{ "?column?": 1 }]);
    await expect(generateUniquePurchaseRef(fakeSql, new Date("2026-06-20T09:00:00Z"), 3)).rejects.toThrow(/çakışma/i);
  });
});
