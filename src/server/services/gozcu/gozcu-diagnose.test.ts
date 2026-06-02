// Gözcü — teşhis güvenliği (scrub) + kod-kontrat verify testleri (DB gerektirmez).

import { describe, it, expect } from "vitest";
import { scrub, extractJson } from "./diagnose.js";
import { verifyAllContracts, CONTRACTS_BY_CHECK } from "./contracts/index.js";

describe("gozcu scrub (secret/PII redaksiyonu)", () => {
  it("OpenAI/Bearer/JWT anahtarlarını maskeler", () => {
    const out = scrub("key=sk-abcd1234efgh5678 ve Authorization: Bearer abcdef123456ghijkl");
    expect(out).not.toContain("sk-abcd1234efgh5678");
    expect(out).not.toContain("Bearer abcdef123456ghijkl");
    expect(out).toContain("[REDACTED]");
  });

  it("JWT ve provider codename'i maskeler", () => {
    const out = scrub("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 ve closerouter_live_xyz123");
    expect(out).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    expect(out).not.toContain("closerouter_live_xyz123");
  });

  it("e-posta adreslerini maskeler", () => {
    const out = scrub("kullanıcı kerim545498@gmail.com bakiyesi");
    expect(out).not.toContain("kerim545498@gmail.com");
    expect(out).toContain("[email]");
  });

  it("zararsız metni bozmaz", () => {
    expect(scrub("ledger_drift = 0.0 TL, eşik aşılmadı")).toBe("ledger_drift = 0.0 TL, eşik aşılmadı");
  });
});

describe("gozcu extractJson (omniroute LLM çıktısı ayrıştırma)", () => {
  it("```json fence'li çıktıyı ayrıştırır (omniroute Claude'ları böyle döndürüyor)", () => {
    expect(extractJson('```json\n{"rootCause":"x","confidence":0.9}\n```')).toEqual({
      rootCause: "x",
      confidence: 0.9,
    });
  });
  it("düz JSON'u ayrıştırır (gemini-flash böyle döndürüyor)", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("önek/sonek metni olan JSON'u kurtarır", () => {
    expect(extractJson('İşte yanıt: {"a":1} umarım faydalı olur')).toEqual({ a: 1 });
  });
  it("JSON yoksa null döndürür", () => {
    expect(extractJson("hiç json yok burada")).toBeNull();
  });
});

describe("gozcu kod-kontratları", () => {
  it("verifyAllContracts hatasız çalışır ve dizi döndürür", async () => {
    const results = await verifyAllContracts();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("proxy/billed-tokens-floor kontratı gerçek repo'da GEÇER (resolveBilledPromptTokens mevcut)", async () => {
    const results = await verifyAllContracts();
    const floor = results.find((r) => r.id === "proxy/billed-tokens-floor");
    expect(floor).toBeDefined();
    expect(floor?.ok).toBe(true);
  });

  it("CONTRACTS_BY_CHECK k1 için en az bir kontrat içerir", () => {
    expect((CONTRACTS_BY_CHECK.get("k1") ?? []).length).toBeGreaterThan(0);
  });
});
