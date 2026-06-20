import { describe, it, expect } from "vitest";
import {
  compressToolText,
  compressToolOutputs,
  maybeCompressToolOutputs,
  TOKEN_SAVER_DEFAULTS,
  type TokenSaverConfig,
} from "./token-saver.js";

const ESC = String.fromCharCode(27);
const CFG: TokenSaverConfig = {
  enabled: true,
  maxToolOutputChars: TOKEN_SAVER_DEFAULTS.maxToolOutputChars,
  headLines: TOKEN_SAVER_DEFAULTS.headLines,
  tailLines: TOKEN_SAVER_DEFAULTS.tailLines,
};

describe("compressToolText — kayıpsız temizlik", () => {
  it("NORMAL metni (parantez/boşluk/kod) ASLA bozmaz", () => {
    const code = 'const arr = [1, 2, 3];\nif (x) { return arr[0]; }\n  indented line';
    expect(compressToolText(code, CFG)).toBe(code);
  });

  it("ANSI renk kodlarını siler ama metni korur", () => {
    const input = `${ESC}[32m✓ Build OK${ESC}[0m`;
    expect(compressToolText(input, CFG)).toBe("✓ Build OK");
  });

  it("art arda 3+ tekrarlayan satırı katlar", () => {
    const input = "Compiling...\nCompiling...\nCompiling...\nCompiling...\ndone";
    const out = compressToolText(input, CFG);
    expect(out).toContain("Compiling...  (x4 tekrar)");
    expect(out).toContain("done");
    expect(out.split("\n").length).toBe(2);
  });

  it("2 tekrarı KATLAMAZ (yalnız 3+)", () => {
    const input = "warn\nwarn\nok";
    expect(compressToolText(input, CFG)).toBe(input);
  });

  it("fazla boş satırları tek boşa indirir + trailing whitespace atar", () => {
    const input = "line1   \n\n\n\nline2";
    expect(compressToolText(input, CFG)).toBe("line1\n\nline2");
  });

  it("eşik altındaki çıktıyı kırpmaz", () => {
    const input = "kısa çıktı\nsatır 2";
    expect(compressToolText(input, CFG)).toBe(input);
  });

  it("eşiği aşan dev çıktıyı baş/son koruyarak kırpar", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `log satırı ${i} ${"x".repeat(20)}`);
    const input = lines.join("\n");
    const out = compressToolText(input, CFG);
    expect(out.length).toBeLessThan(input.length);
    expect(out).toContain("log satırı 0 ");
    expect(out).toContain("log satırı 4999 ");
    expect(out).toContain("satır kısaltıldı");
    // baş 200 + işaret + son 200
    expect(out.split("\n").length).toBe(TOKEN_SAVER_DEFAULTS.headLines + 1 + TOKEN_SAVER_DEFAULTS.tailLines);
  });

  it("idempotent — iki kez sıkıştırmak aynı sonucu verir", () => {
    const input = `${ESC}[31mERR${ESC}[0m\n\n\n\nx\nx\nx\nx`;
    const once = compressToolText(input, CFG);
    expect(compressToolText(once, CFG)).toBe(once);
  });
});

describe("compressToolOutputs — kapsam (yalnız tool çıktısı)", () => {
  it("role:'tool' mesajını sıkıştırır, user/assistant'a DOKUNMAZ", () => {
    const userCode = "lütfen şunu düzelt: const a = [1,2,3];   "; // trailing space korunmalı (user)
    const body = {
      messages: [
        { role: "user", content: userCode },
        { role: "assistant", content: "tamam   " },
        { role: "tool", content: `${ESC}[32mok${ESC}[0m\n\n\n\ndone` },
      ],
    };
    const saved = compressToolOutputs(body, CFG);
    expect(saved).toBeGreaterThan(0);
    // user ve assistant AYNEN kalır (kullanıcı niyeti korunur)
    expect(body.messages[0].content).toBe(userCode);
    expect(body.messages[1].content).toBe("tamam   ");
    // tool temizlendi
    expect(body.messages[2].content).toBe("ok\n\ndone");
  });

  it("Anthropic tool_result bloklarını sıkıştırır", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "kullanıcı metni   " },
            { type: "tool_result", content: `${ESC}[33mwarn${ESC}[0m\n\n\nx` },
          ],
        },
      ],
    };
    const saved = compressToolOutputs(body, CFG);
    expect(saved).toBeGreaterThan(0);
    const blocks = body.messages[0].content as any[];
    expect(blocks[0].text).toBe("kullanıcı metni   "); // text bloğu (user) DOKUNULMAZ
    expect(blocks[1].content).toBe("warn\n\nx"); // tool_result temizlendi
  });

  it("Anthropic tool_result.content = [{type:text}] dizisini de sıkıştırır", () => {
    const rep = "uzun tekrarlayan uyarı satırı";
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "tool_result", content: [{ type: "text", text: `${rep}\n${rep}\n${rep}\n${rep}` }] }],
        },
      ],
    };
    compressToolOutputs(body, CFG);
    const blocks = body.messages[0].content as any[];
    expect(blocks[0].content[0].text).toContain("(x4 tekrar)");
  });
});

describe("güvenlik / hata toleransı", () => {
  it("messages yoksa / bozuk gövde → throw etmez, 0 döner", () => {
    expect(compressToolOutputs({} as any, CFG)).toBe(0);
    expect(compressToolOutputs({ messages: "değil-dizi" } as any, CFG)).toBe(0);
    expect(compressToolOutputs({ messages: [null, 42, "x"] } as any, CFG)).toBe(0);
  });

  it("maybeCompressToolOutputs — flag kapalıyken NO-OP", () => {
    const body = { messages: [{ role: "tool", content: "x\nx\nx\nx" }] };
    const saved = maybeCompressToolOutputs(body, { tokenSaverEnabled: false });
    expect(saved).toBe(0);
    expect(body.messages[0].content).toBe("x\nx\nx\nx"); // değişmedi
  });

  it("maybeCompressToolOutputs — flag açıkken sıkıştırır (ANSI temizler)", () => {
    const body = { messages: [{ role: "tool", content: `${ESC}[32mok${ESC}[0m\n\n\n\ndone` }] };
    const saved = maybeCompressToolOutputs(body, { tokenSaverEnabled: true });
    expect(saved).toBeGreaterThan(0);
    expect(body.messages[0].content).toBe("ok\n\ndone");
  });

  it("maybeCompressToolOutputs — null/undefined config & body güvenli", () => {
    expect(maybeCompressToolOutputs(null, { tokenSaverEnabled: true })).toBe(0);
    expect(maybeCompressToolOutputs({ messages: [] }, null)).toBe(0);
    expect(maybeCompressToolOutputs({ messages: [] }, undefined)).toBe(0);
  });

  it("ReDoS guard — BEL'siz çok sayıda ESC] (OSC) HIZLI biter (katastrofik backtracking yok)", () => {
    // 600KB BEL'siz ESC] — sınırsız OSC regex'inde saniyelerce CPU yerdi.
    const evil = `${ESC}]`.repeat(300_000);
    const start = Date.now();
    const out = compressToolText(evil, CFG);
    const ms = Date.now() - start;
    expect(ms).toBeLessThan(1000); // 1sn altı (eskiden ~40sn ReDoS)
    expect(out.length).toBeLessThan(evil.length);
  });

  it("ReDoS guard — dev tek-satır girdi pre-cap ile sınırlanır", () => {
    const huge = "a".repeat(500_000); // 500KB tek satır, ESC yok
    const start = Date.now();
    const out = compressToolText(huge, CFG);
    expect(Date.now() - start).toBeLessThan(500);
    expect(out.length).toBeLessThan(huge.length);
    expect(out).toContain("karakter kısaltıldı");
  });
});
