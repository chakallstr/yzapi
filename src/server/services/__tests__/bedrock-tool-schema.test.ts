// Bedrock araç şeması çevirisi — birim testleri (Görev 2.1).
// bkz. .kiro/specs/sonnet-46-unlimited-hardening/{requirements,design}.md
//
// NEDEN: `bedrockToolsFromRequest` / `bedrockToolChoiceFromRequest` diskte commit'siz ve
// test edilmemiş geldi. Golden korpus (Görev 1) yalnız "davranış değişmedi"yi kanıtlar,
// davranışın DOĞRU olduğunu kanıtlamaz. Bu dosya kabul ölçütlerini (R1.1, R1.2, R1.4,
// R1.6) tek tek iddiaya çevirir.
//
// KAPSAM: yalnız iki saf fonksiyon. Gövde bütünlüğü (tool_choice kapısı) Görev 2.3'te.

import { describe, it, expect } from "vitest";

import {
  bedrockToolsFromRequest,
  bedrockToolChoiceFromRequest,
} from "../closerouter-service.js";

// ── R1.1: Anthropic şeması dokunulmaz ─────────────────────────────────────────

describe("bedrockToolsFromRequest — Anthropic şeması (R1.1)", () => {
  it("{name, input_schema} aracını bit-bit korur", () => {
    const tool = {
      name: "write_file",
      description: "dosya yaz",
      input_schema: {
        type: "object",
        properties: { path: { type: "string" }, contents: { type: "string" } },
        required: ["path"],
      },
    };

    const out = bedrockToolsFromRequest([tool]);

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(tool);
    // Referans korunur → hiçbir alan eklenmedi/çıkarılmadı/yeniden yazılmadı.
    expect(out[0]).toBe(tool);
  });

  it("description olmayan Anthropic aracına description EKLEMEZ", () => {
    const tool = { name: "shell", input_schema: { type: "object", properties: {} } };

    const out = bedrockToolsFromRequest([tool]);

    expect(out[0]).toEqual(tool);
    expect(Object.keys(out[0] as object)).toEqual(["name", "input_schema"]);
  });

  it("input_schema boş nesne olsa bile Anthropic kabul eder (undefined değil)", () => {
    const tool = { name: "noop", input_schema: {} };

    expect(bedrockToolsFromRequest([tool])).toEqual([tool]);
  });

  it("Anthropic aracına ait bilinmeyen ek alanlar korunur", () => {
    const tool = {
      name: "read_file",
      input_schema: { type: "object", properties: {} },
      cache_control: { type: "ephemeral" },
    };

    expect(bedrockToolsFromRequest([tool])).toEqual([tool]);
  });
});

// ── R1.2: OpenAI şeması çevrilir ──────────────────────────────────────────────

describe("bedrockToolsFromRequest — OpenAI şeması (R1.2)", () => {
  it("{type:'function', function:{name, description, parameters}} → {name, description, input_schema}", () => {
    const out = bedrockToolsFromRequest([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "dosya oku",
          parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        },
      },
    ]);

    expect(out).toEqual([
      {
        name: "read_file",
        description: "dosya oku",
        input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    ]);
  });

  it("parameters yoksa boş şema üretir ({type:'object', properties:{}})", () => {
    const out = bedrockToolsFromRequest([{ type: "function", function: { name: "ping" } }]);

    expect(out).toEqual([{ name: "ping", input_schema: { type: "object", properties: {} } }]);
  });

  it("parameters nesne değilse (string/null) boş şemaya düşer", () => {
    const out = bedrockToolsFromRequest([
      { type: "function", function: { name: "a", parameters: "bozuk" } },
      { type: "function", function: { name: "b", parameters: null } },
    ]);

    expect(out).toEqual([
      { name: "a", input_schema: { type: "object", properties: {} } },
      { name: "b", input_schema: { type: "object", properties: {} } },
    ]);
  });

  it("description yoksa alan hiç eklenmez", () => {
    const out = bedrockToolsFromRequest([
      { type: "function", function: { name: "ping", parameters: { type: "object", properties: {} } } },
    ]);

    expect(Object.keys(out[0] as object)).toEqual(["name", "input_schema"]);
  });

  it("description string değilse alan eklenmez", () => {
    const out = bedrockToolsFromRequest([
      { type: "function", function: { name: "ping", description: 42 } },
    ]);

    expect(out[0]).not.toHaveProperty("description");
  });

  it("function alanı eksik/bozuk ya da isim yoksa araç düşer", () => {
    expect(
      bedrockToolsFromRequest([
        { type: "function" },
        { type: "function", function: null },
        { type: "function", function: "x" },
        { type: "function", function: {} },
        { type: "function", function: { name: "" } },
        { type: "function", function: { name: 7 } },
      ]),
    ).toEqual([]);
  });

  it("araç olmayan girdiler (null, string, sayı) sessizce düşer", () => {
    expect(bedrockToolsFromRequest([null, undefined, "tool", 5, true])).toEqual([]);
  });

  it("boş dizi boş dizi döner", () => {
    expect(bedrockToolsFromRequest([])).toEqual([]);
  });
});

// ── R1.6: Yerleşik tipler düşer ───────────────────────────────────────────────

describe("bedrockToolsFromRequest — yerleşik tipler düşer (R1.6)", () => {
  const BUILTINS = [
    { type: "web_search" },
    { type: "image_generation" },
    { type: "local_shell" },
    { type: "custom", custom: { name: "grammar" } },
  ];

  for (const tool of BUILTINS) {
    it(`${tool.type} düşer`, () => {
      expect(bedrockToolsFromRequest([tool])).toEqual([]);
    });
  }

  it("yalnız yerleşik tipler verildiğinde çıktı BOŞTUR (tool_choice kapısının ön koşulu)", () => {
    expect(bedrockToolsFromRequest(BUILTINS)).toEqual([]);
  });

  it("web_search'ün ayar alanları taşıması onu kurtarmaz", () => {
    expect(
      bedrockToolsFromRequest([{ type: "web_search", search_context_size: "high", filters: {} }]),
    ).toEqual([]);
  });
});

// ── Hibrit dizi: her araç kendi kuralıyla ─────────────────────────────────────

describe("bedrockToolsFromRequest — hibrit dizi (R1.1 + R1.2 + R1.6)", () => {
  it("Anthropic korunur, OpenAI çevrilir, yerleşik düşer; sıra bozulmaz", () => {
    const anthropic = { name: "write_file", input_schema: { type: "object", properties: {} } };

    const out = bedrockToolsFromRequest([
      anthropic,
      { type: "web_search" },
      { type: "function", function: { name: "read_file", parameters: { type: "object", properties: { p: { type: "string" } } } } },
      { type: "local_shell" },
      { type: "function", function: { name: "shell", description: "kabuk" } },
    ]);

    expect(out).toEqual([
      anthropic,
      { name: "read_file", input_schema: { type: "object", properties: { p: { type: "string" } } } },
      { name: "shell", description: "kabuk", input_schema: { type: "object", properties: {} } },
    ]);
  });

  it("hem name+input_schema hem type:'function' taşıyan araç ANTHROPIC sayılır (dokunulmaz)", () => {
    // Ayrım araç başına yapılır; Anthropic testi önce çalışır.
    const tool = {
      type: "function",
      name: "write_file",
      input_schema: { type: "object", properties: {} },
      function: { name: "başka_isim" },
    };

    expect(bedrockToolsFromRequest([tool])).toEqual([tool]);
  });

  it("girdi dizisi mutasyona uğramaz", () => {
    const tools = [
      { name: "a", input_schema: { type: "object", properties: {} } },
      { type: "function", function: { name: "b" } },
      { type: "web_search" },
    ];
    const snapshot = JSON.stringify(tools);

    bedrockToolsFromRequest(tools);

    expect(JSON.stringify(tools)).toBe(snapshot);
    expect(tools).toHaveLength(3);
  });
});

// ── R1.4: tool_choice çevirisi ────────────────────────────────────────────────

describe("bedrockToolChoiceFromRequest — string biçimler (R1.4)", () => {
  it("'auto' → {type:'auto'}", () => {
    expect(bedrockToolChoiceFromRequest("auto")).toEqual({ type: "auto" });
  });

  it("'required' → {type:'any'}", () => {
    expect(bedrockToolChoiceFromRequest("required")).toEqual({ type: "any" });
  });

  it("'any' → {type:'any'}", () => {
    expect(bedrockToolChoiceFromRequest("any")).toEqual({ type: "any" });
  });

  it("'none' → undefined (alan GÖNDERİLMEZ)", () => {
    expect(bedrockToolChoiceFromRequest("none")).toBeUndefined();
  });

  it("bilinmeyen string → undefined", () => {
    expect(bedrockToolChoiceFromRequest("zorunlu")).toBeUndefined();
    expect(bedrockToolChoiceFromRequest("")).toBeUndefined();
  });
});

describe("bedrockToolChoiceFromRequest — nesne biçimler (R1.4)", () => {
  it("{type:'function', function:{name}} → {type:'tool', name}", () => {
    expect(bedrockToolChoiceFromRequest({ type: "function", function: { name: "read_file" } })).toEqual({
      type: "tool",
      name: "read_file",
    });
  });

  it("{type:'function'} ama isim yok/boş/bozuk → undefined", () => {
    expect(bedrockToolChoiceFromRequest({ type: "function" })).toBeUndefined();
    expect(bedrockToolChoiceFromRequest({ type: "function", function: {} })).toBeUndefined();
    expect(bedrockToolChoiceFromRequest({ type: "function", function: { name: "" } })).toBeUndefined();
    expect(bedrockToolChoiceFromRequest({ type: "function", function: { name: 3 } })).toBeUndefined();
    expect(bedrockToolChoiceFromRequest({ type: "function", function: null })).toBeUndefined();
  });

  it("{type:'none'} → undefined", () => {
    expect(bedrockToolChoiceFromRequest({ type: "none" })).toBeUndefined();
  });

  it("Anthropic-native biçim dokunulmaz (referans korunur)", () => {
    for (const native of [
      { type: "auto" },
      { type: "any" },
      { type: "tool", name: "write_file" },
      { type: "auto", disable_parallel_tool_use: true },
    ]) {
      const out = bedrockToolChoiceFromRequest(native);
      expect(out).toEqual(native);
      expect(out).toBe(native);
    }
  });

  it("undefined / null / sayı / dizi → undefined", () => {
    expect(bedrockToolChoiceFromRequest(undefined)).toBeUndefined();
    expect(bedrockToolChoiceFromRequest(null)).toBeUndefined();
    expect(bedrockToolChoiceFromRequest(7)).toBeUndefined();
    expect(bedrockToolChoiceFromRequest([{ type: "auto" }])).toBeUndefined();
  });

  it("bilinmeyen nesne tipi → undefined (Bedrock'a tanımadığı alan gitmez)", () => {
    expect(bedrockToolChoiceFromRequest({ type: "allowed_tools", tools: [] })).toBeUndefined();
    expect(bedrockToolChoiceFromRequest({ name: "write_file" })).toBeUndefined();
  });
});
