// Kablolama (wire) contract testi — spec: .kiro/specs/responses-tool-contract-fix/
//
// NEDEN: responses-translation.ts içindeki düzeltmeler SAF fonksiyonlardır ve kendi unit
// testleriyle doğrulanır. Ama üretimde işe yaraması için proxy.ts'in bu köprüleri gerçekten
// kurması gerekir: (1) toolKinds hem stream hem non-stream dönüş çevirisine geçmeli,
// (2) native-degrade kapısı ham Responses gövdesiyle beslenmeli. Bu bağlantılar koparsa
// unit testler YEŞİL kalır ama müşteri hatası geri döner — bu dosya o sessiz regresyonu kilitler.
//
// Kaynak-metin tabanlı contract testi (repodaki *-contract testleriyle aynı desen).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeToolContract } from "../services/responses-translation.js";

const PROXY_PATH = join(dirname(fileURLToPath(import.meta.url)), "proxy.js").replace(/\.js$/, ".ts");
const source = readFileSync(PROXY_PATH, "utf8");

describe("responses araç sözleşmesi kablolaması (proxy.ts)", () => {
  it("deriveToolKinds ve summarizeToolContract import edilir", () => {
    expect(source).toMatch(/import\s*\{[^}]*deriveToolKinds[^}]*\}\s*from\s*"\.\.\/services\/responses-translation\.js"/s);
    expect(source).toMatch(/import\s*\{[^}]*summarizeToolContract[^}]*\}\s*from\s*"\.\.\/services\/responses-translation\.js"/s);
  });

  it("toolKinds ham istek gövdesinden türetilir", () => {
    expect(source).toContain("deriveToolKinds(rawResponsesBody.tools)");
  });

  it("stream dönüş çevirisi toolKinds taşır (responsesMeta)", () => {
    expect(source).toMatch(/const responsesMeta = \{[^}]*toolKinds: responsesToolKinds[^}]*\}/);
  });

  it("non-stream dönüş çevirisi toolKinds taşır", () => {
    expect(source).toMatch(/chatCompletionToResponses\(raw, \{[^}]*toolKinds: responsesToolKinds[^}]*\}\)/);
  });

  it("native-degrade kapısı iki çağrı noktasında da ham gövdeyle beslenir", () => {
    expect(source).toContain("shouldDegradeNativeResponsesForContext(ctx, err, res, rawResponsesBody)");
    expect(source).toContain("isNativeResponsesDegradable(err, res, rawResponsesBody)");
  });

  it("teşhis logu iki noktada da yazılır", () => {
    expect(source).toContain('"responses tool contract"');
    expect(source).toContain('"responses native degrade"');
  });
});

// Dört-sınıf teşhis enstrümanı — spec görev 8.2 / 8.3 / 8.4
// Bu köprüler koparsa sayaçlar sessizce 0 kalır ve canlıda hangi hata sınıfının aktif
// olduğu ölçülemez (fix'in işe yaradığı iddia edilemez).
describe("responses araç çağrısı telemetrisi kablolaması (proxy.ts)", () => {
  it("sayaç ve sınıflandırma yardımcıları import edilir", () => {
    expect(source).toMatch(/import\s*\{[^}]*countResponseToolCalls[^}]*\}\s*from\s*"\.\.\/services\/responses-translation\.js"/s);
    expect(source).toMatch(/import\s*\{[^}]*createResponsesStreamStats[^}]*\}\s*from\s*"\.\.\/services\/responses-translation\.js"/s);
    expect(source).toMatch(/import\s*\{[^}]*isSuspiciousToolOutcome[^}]*\}\s*from\s*"\.\.\/services\/responses-translation\.js"/s);
  });

  it("stream dalı translator sayaç toplayıcısını meta üzerinden taşır (item F)", () => {
    expect(source).toContain("createResponsesStreamStats()");
    expect(source).toMatch(/const responsesMeta = \{[^}]*stats: responsesToolStats[^}]*\}/);
  });

  it("iki dal da tek ortak sonuç logunu kullanır (stream + non-stream)", () => {
    expect(source.match(/logResponsesToolOutcome\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3); // tanım + 2 çağrı
    expect(source).toContain("emittedToolItems");
    expect(source).toContain("mappedToolCount");
    expect(source).toContain("toolCallCount");
  });

  it("sonuç logu finishReason ve sınıflandırma reason alanını taşır (8.2/8.4)", () => {
    // Bu alanlar olmadan canlı raporda halüsinasyon ile sahte başarı ayırt edilemez.
    expect(source).toMatch(/const fields = \{[\s\S]*?finishReason: o\.finishReason[\s\S]*?reason: suspicious/);
    expect(source).toContain("tools_dropped_and_no_tool_call");
    expect(source).toContain("no_tool_call_despite_tools");
  });

  it("non-stream dalı upstream yanıtından tool_call sayar (8.2)", () => {
    expect(source).toMatch(/toolCallCount: countResponseToolCalls\(raw, native === true\)/);
  });

  it("sonuç logu düşen araç tiplerini de taşır (tool-routing korelasyonu)", () => {
    expect(source).toMatch(/droppedToolTypes: toolContract\.droppedToolTypes/);
    expect(source).toMatch(/droppedToolTypes: native === true \? \[\] : toolContract\.droppedToolTypes/);
  });

  it("sahte başarı alarmı tek warn satırı olarak kalır", () => {
    expect(source).toContain('"responses tool contract suspicious success"');
    expect(source.match(/"responses tool contract suspicious success"/g)?.length).toBe(1);
    expect(source).toContain("isSuspiciousToolOutcome(");
  });

  it("rapor script'inin okuduğu alanlar log sözleşmesinde var (görev 8.1 tüketici sözleşmesi)", () => {
    // scripts/responses-tool-contract-report.mjs bu alan adlarına göre sınıflandırma yapar;
    // adlar değişirse script sessizce 0 sayar ve canlı ölçüm yanlış olur.
    expect(source).toMatch(/const fields = \{[\s\S]*?status: o\.status[\s\S]*?native: o\.native[\s\S]*?\}/);
    expect(source).toMatch(/\{ requestId, stream: true, degraded, lossyToolTypes: translationLossyToolTypes\(/);
    expect(source).toMatch(/\{ requestId, stream: false, degraded, lossyToolTypes: translationLossyToolTypes\(/);
  });

  it("stream dalında sayaçlar billing settle'dan SONRA loglanır (para yolu değişmez)", () => {
    const streamLog = source.indexOf("emittedToolItems: responsesToolStats.emittedToolItems");
    const settle = source.indexOf("status: streamStatus");
    expect(settle).toBeGreaterThan(0);
    expect(streamLog).toBeGreaterThan(settle);
  });
});

describe("teşhis logu sızıntı güvenliği", () => {
  it("özet yalnız tip/sayı taşır — araç adı, argüman veya içerik taşımaz", () => {
    const summary = summarizeToolContract({
      tools: [
        { type: "custom", name: "gizli_arac_adi" },
        { type: "function", name: "diger_gizli_ad", parameters: { type: "object" } },
        { type: "web_search" },
      ],
      tool_choice: { type: "function", name: "gizli_arac_adi" },
      input: "müşteri prompt metni",
      instructions: "gizli sistem talimatı",
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("gizli_arac_adi");
    expect(serialized).not.toContain("diger_gizli_ad");
    expect(serialized).not.toContain("müşteri prompt metni");
    expect(serialized).not.toContain("gizli sistem talimatı");

    expect(summary).toEqual({
      toolCount: 3,
      mappedToolCount: 2,
      declaredToolTypes: ["custom", "function", "web_search"],
      mappedToolTypes: ["custom", "function"],
      droppedToolTypes: ["web_search"],
      toolChoiceKind: "function",
    });
  });

  it("araçsız istekte özet boş listelerle döner", () => {
    expect(summarizeToolContract({ input: "x" })).toEqual({
      toolCount: 0,
      mappedToolCount: 0,
      declaredToolTypes: [],
      mappedToolTypes: [],
      droppedToolTypes: [],
      toolChoiceKind: "none",
    });
  });
});
