import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const docsSource = readFileSync("src/yapayzekalab/tab-documents.jsx", "utf8");
const dataSource = readFileSync("src/yapayzekalab/api-docs.js", "utf8");
const combined = `${docsSource}\n${dataSource}`;

describe("documents tab content contract", () => {
  it("provides a clear step-by-step getting-started doc surface", () => {
    expect(combined).toContain("API Dokümantasyonu");
    expect(combined).toContain("sıfırdan adım adım");
    expect(combined).toContain("API bağlantısını 5 dakikada kur");
  });

  it("uses YapayZekaLab production endpoint and live key format", () => {
    expect(combined).toContain("https://yapayzekalab.org/v1");
    expect(combined).toContain("Authorization: Bearer yzk_live_YOUR_KEY");
    expect(combined).toContain("/v1/balance");
    expect(combined).toContain("/v1/messages");
  });

  it("documents supported coding clients including Codex CLI and Claude Code", () => {
    expect(combined).toContain("Cline");
    expect(combined).toContain("Kilo Code");
    expect(combined).toContain("OpenCode");
    expect(combined).toContain("Roo Code");
    expect(combined).toContain("Codex CLI");
    expect(combined).toContain("Claude Code");
    // Claude Code artık desteklenir: Anthropic-uyumlu /v1/messages + env akışı.
    expect(combined).toContain("ANTHROPIC_BASE_URL");
    expect(combined).toContain("ANTHROPIC_AUTH_TOKEN");
  });

  it("contains deeper sdk, error and billing documentation blocks", () => {
    expect(combined).toContain("Node.js · OpenAI SDK");
    expect(combined).toContain("Python · OpenAI istemcisi");
    expect(combined).toContain("X-YZ-Remaining-USD");
    expect(combined).toContain("Sık görülen hata cevapları");
    expect(combined).toContain("Kod kopyala");
    expect(combined).toContain("Kopyalandı");
  });

  it("lets the table of contents scroll to the selected document block", () => {
    expect(docsSource).toContain("navigateToDoc");
    expect(docsSource).toContain("scrollIntoView");
    expect(docsSource).toContain("window.history.replaceState");
    expect(docsSource).toContain("onClick={() => navigateToDoc(doc.key)}");
  });
});
