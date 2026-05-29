import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const docsSource = readFileSync("src/yapayzekalab/tab-documents.jsx", "utf8");
const dataSource = readFileSync("src/yapayzekalab/api-docs.js", "utf8");
const combined = `${docsSource}\n${dataSource}`;

describe("documents tab content contract", () => {
  it("adapts the Claude Popusk docs flow to YapayZekaLab", () => {
    expect(combined).toContain("Claude Popusk akışı");
    expect(combined).toContain("API bağlantısını 5 dakikada kur");
    expect(combined).toContain("docs.claude-popusk.shop");
  });

  it("uses YapayZekaLab production endpoint and live key format", () => {
    expect(combined).toContain("https://yapayzekalab.org/v1");
    expect(combined).toContain("Authorization: Bearer yzk_live_YOUR_KEY");
    expect(combined).toContain("/v1/balance");
    expect(combined).toContain("/v1/messages");
  });

  it("documents supported coding clients and the Claude Code limitation note", () => {
    expect(combined).toContain("Cline");
    expect(combined).toContain("Kilo Code");
    expect(combined).toContain("OpenCode");
    expect(combined).toContain("Roo Code");
    expect(combined).toContain("Claude Code");
    expect(combined).toContain("Bu yayındaki kararlı dokümantasyon OpenAI-uyumlu istemcilere odaklanır.");
  });
});
