import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_DOC_SECTIONS, buildApiDocsPlainText, OS_LABELS } from "./yapayzekalab/api-docs.js";

const docsSource = readFileSync("src/yapayzekalab/tab-documents.jsx", "utf8");
const dataSource = readFileSync("src/yapayzekalab/api-docs.js", "utf8");

// Tüm clientCards + codeBlocks içinde osVariants taşıyanları topla.
type Variant = { windows?: string; macos?: string; linux?: string };
function collectOsVariants(): { name: string; v: Variant }[] {
  const out: { name: string; v: Variant }[] = [];
  for (const section of API_DOC_SECTIONS as any[]) {
    for (const card of section.clientCards ?? []) {
      if (card.osVariants) out.push({ name: `${section.key}:${card.name}`, v: card.osVariants });
    }
    for (const block of section.codeBlocks ?? []) {
      if (block.osVariants) out.push({ name: `${section.key}:${block.title}`, v: block.osVariants });
    }
  }
  return out;
}

describe("OS install variants contract (Windows / macOS / Linux)", () => {
  it("exposes OS labels for the three target platforms", () => {
    expect(OS_LABELS.windows).toMatch(/windows/i);
    expect(OS_LABELS.macos).toMatch(/mac/i);
    expect(OS_LABELS.linux).toMatch(/linux/i);
  });

  it("provides OS-specific install code for the CLI clients and curl blocks", () => {
    const variants = collectOsVariants();
    // En az: Claude Code + Codex CLI kartları + quickstart/sdk/balance curl blokları.
    expect(variants.length).toBeGreaterThanOrEqual(5);
    // Claude Code ve Codex CLI mutlaka OS varyantı taşımalı.
    const names = variants.map((x) => x.name);
    expect(names.some((n) => n.includes("Claude Code"))).toBe(true);
    expect(names.some((n) => n.includes("Codex CLI"))).toBe(true);
  });

  it("each OS variant has all three platforms filled", () => {
    for (const { name, v } of collectOsVariants()) {
      expect(v.windows, `${name} windows`).toBeTruthy();
      expect(v.macos, `${name} macos`).toBeTruthy();
      expect(v.linux, `${name} linux`).toBeTruthy();
    }
  });

  it("uses the correct platform syntax: PowerShell on Windows, export on unix", () => {
    const claude = (API_DOC_SECTIONS as any[])
      .flatMap((s) => s.clientCards ?? [])
      .find((c) => c.name === "Claude Code");
    expect(claude?.osVariants).toBeTruthy();
    // Windows = PowerShell ($env: / setx), unix = export.
    expect(claude.osVariants.windows).toContain("$env:ANTHROPIC_BASE_URL");
    expect(claude.osVariants.windows).toContain("setx ANTHROPIC_BASE_URL");
    expect(claude.osVariants.macos).toContain('export ANTHROPIC_BASE_URL="https://yapayzekalab.org"');
    // Claude Code DOĞRU token değişkenini kullanmalı (API_KEY değil).
    expect(claude.osVariants.windows).toContain("ANTHROPIC_AUTH_TOKEN");
    expect(claude.osVariants.macos).toContain("ANTHROPIC_AUTH_TOKEN");
  });

  it("Windows curl examples use curl.exe single-line, not backslash continuation", () => {
    const quickstart = (API_DOC_SECTIONS as any[]).find((s) => s.key === "quickstart");
    const curlBlock = quickstart.codeBlocks.find((b: any) => b.osVariants);
    expect(curlBlock.osVariants.windows).toContain("curl.exe");
    expect(curlBlock.osVariants.windows).not.toContain("\\\n"); // backslash line-continuation yok
    // macOS/Linux klasik curl + satır devamı kullanır.
    expect(curlBlock.osVariants.macos).toContain("curl -X POST");
  });

  it("preserves the yzk_live_YOUR_KEY placeholder in every OS variant (no secret leak)", () => {
    for (const { name, v } of collectOsVariants()) {
      const all = `${v.windows}\n${v.macos}\n${v.linux}`;
      // Her varyant ya placeholder taşır ya da hiç key içermez (örn. config.toml dışı).
      if (all.includes("yzk_live_")) {
        expect(all, `${name} placeholder`).toContain("yzk_live_YOUR_KEY");
      }
    }
  });

  it("plain-text export includes per-OS headers so 'copy all' is OS-aware", () => {
    const text = buildApiDocsPlainText();
    expect(text).toContain(`### ${OS_LABELS.windows}`);
    expect(text).toContain(`### ${OS_LABELS.macos}`);
    expect(text).toContain(`### ${OS_LABELS.linux}`);
  });

  it("renders an OS selector and resolves code by selected OS", () => {
    expect(docsSource).toContain("OsTabs");
    expect(docsSource).toContain("codeForOs");
    expect(docsSource).toContain("osChoice");
    // Source placeholder yine korunur (rejected-template-guard ile uyumlu).
    expect(dataSource).toContain("yzk_live_YOUR_KEY");
  });

  it("puts Claude and Codex install shortcuts at the top of the docs hub", () => {
    expect(docsSource).toContain("Claude kurulumu");
    expect(docsSource).toContain("Codex kurulumu");
    expect(docsSource).toContain("id === 'claude-desktop'");
    expect(docsSource).toContain("id === 'codex-desktop'");
  });

  it("does not ask for another key on the docs hub when a user already has one", () => {
    expect(docsSource).toContain("hasKey ? <ApiKeyBox apiKey={myKey} /> : <ApiKeysPanel");
  });
});
