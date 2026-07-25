// Bedrock araç geçmişi + dönüş yolu — birim testleri (Görev 2.2).
// bkz. .kiro/specs/sonnet-46-unlimited-hardening/{requirements,design}.md
//
// NEDEN: `bedrockMessagesFromRequest`, `partsFromBedrockAnthropic`, `bedrockFinishReason`
// ve `firstChatToolCalls` diskte commit'siz ve test edilmemiş geldi. Golden korpus
// (Görev 1) yalnız "davranış değişmedi"yi kanıtlar; davranışın R1.3/R1.5 kabul ölçütlerine
// UYDUĞUNU kanıtlamaz. Bu dosya o ölçütleri tek tek iddiaya çevirir.
//
// KAPSAM: yalnız bu dört saf fonksiyon. Gövde bütünlüğü (tool_choice kapısı) Görev 2.3'te,
// taşıma katmanı Görev 2.5'te.
//
// `closerouter-service.ts`'te yapılan tek değişiklik `bedrockMessagesFromRequest`,
// `bedrockFinishReason` ve `firstChatToolCalls` önüne `export` eklenmesidir — gövdeler ve
// çağrı noktaları aynı, davranış değişikliği yok.

import { describe, it, expect } from "vitest";

import {
  bedrockMessagesFromRequest,
  partsFromBedrockAnthropic,
  bedrockFinishReason,
  firstChatToolCalls,
} from "../closerouter-service.js";

/** systemParts dışarıdan verilir; testlerin çoğu onunla ilgilenmez. */
function convert(messages: unknown[]): Array<{ role: string; content: unknown }> {
  return bedrockMessagesFromRequest(messages, []);
}

// ── R1.5: assistant.tool_calls → tool_use blokları ────────────────────────────

describe("bedrockMessagesFromRequest — assistant.tool_calls → tool_use (R1.5)", () => {
  it("tek araç çağrısını tool_use bloğuna çevirir, arguments JSON'u input'a parse edilir", () => {
    const out = convert([
      { role: "user", content: "dosyayı yaz" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_a", type: "function", function: { name: "write_file", arguments: '{"path":"a.txt"}' } }],
      },
    ]);

    expect(out).toEqual([
      { role: "user", content: "dosyayı yaz" },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "call_a", name: "write_file", input: { path: "a.txt" } }],
      },
    ]);
  });

  it("assistant metni doluysa tool_use'dan ÖNCE text bloğu eklenir", () => {
    const out = convert([
      {
        role: "assistant",
        content: "yazıyorum",
        tool_calls: [{ id: "c1", function: { name: "write_file", arguments: "{}" } }],
      },
    ]);

    expect(out[0].content).toEqual([
      { type: "text", text: "yazıyorum" },
      { type: "tool_use", id: "c1", name: "write_file", input: {} },
    ]);
  });

  it("assistant metni boş/boşluk ise text bloğu EKLENMEZ", () => {
    for (const content of ["", "   ", undefined, null]) {
      const out = convert([
        { role: "assistant", content, tool_calls: [{ id: "c1", function: { name: "shell", arguments: "{}" } }] },
      ]);
      expect(out[0].content).toEqual([{ type: "tool_use", id: "c1", name: "shell", input: {} }]);
    }
  });

  it("assistant içeriği blok dizisiyse bloklar olduğu gibi taşınır", () => {
    const out = convert([
      {
        role: "assistant",
        content: [{ type: "text", text: "okuyorum" }, { type: "thinking", thinking: "hmm" }],
        tool_calls: [{ id: "c1", function: { name: "read_file", arguments: '{"path":"b"}' } }],
      },
    ]);

    expect(out[0].content).toEqual([
      { type: "text", text: "okuyorum" },
      { type: "thinking", thinking: "hmm" },
      { type: "tool_use", id: "c1", name: "read_file", input: { path: "b" } },
    ]);
  });

  it("id yoksa üretilir (blok sırasına göre), isim yoksa çağrı DÜŞER", () => {
    const out = convert([
      {
        role: "assistant",
        content: [{ type: "text", text: "iki iş" }],
        tool_calls: [
          { id: "call_1", function: { name: "read_file", arguments: '{"path":"a"}' } },
          { function: { name: "read_file", arguments: '{"path":"b"}' } }, // id yok → üretilir
          { id: "call_3", function: { arguments: "{}" } }, // isim yok → düşer
        ],
      },
    ]);

    expect(out[0].content).toEqual([
      { type: "text", text: "iki iş" },
      { type: "tool_use", id: "call_1", name: "read_file", input: { path: "a" } },
      { type: "tool_use", id: "call_2", name: "read_file", input: { path: "b" } },
    ]);
  });

  it("arguments bozuk JSON ise input {input:<ham metin>} olur, eksikse {} olur", () => {
    const out = convert([
      {
        role: "assistant",
        tool_calls: [
          { id: "c1", function: { name: "shell", arguments: "bozuk-json" } },
          { id: "c2", function: { name: "shell", arguments: "" } },
          { id: "c3", function: { name: "shell" } },
          { id: "c4", function: { name: "shell", arguments: { already: "object" } } },
        ],
      },
    ]);

    expect(out[0].content).toEqual([
      { type: "tool_use", id: "c1", name: "shell", input: { input: "bozuk-json" } },
      { type: "tool_use", id: "c2", name: "shell", input: { input: "" } },
      { type: "tool_use", id: "c3", name: "shell", input: {} },
      { type: "tool_use", id: "c4", name: "shell", input: { already: "object" } },
    ]);
  });

  it("tool_calls boş dizi ise assistant mesajı normal metin mesajı olarak geçer", () => {
    expect(convert([{ role: "assistant", content: "selam", tool_calls: [] }])).toEqual([
      { role: "assistant", content: "selam" },
    ]);
  });

  it("üst düzey {name, input} biçimli çağrı da kabul edilir", () => {
    const out = convert([
      { role: "assistant", tool_calls: [{ id: "c1", name: "shell", input: { cmd: "ls" } }] },
    ]);

    expect(out[0].content).toEqual([{ type: "tool_use", id: "c1", name: "shell", input: { cmd: "ls" } }]);
  });
});

// ── R1.5: role:"tool" → eşleşen tool_use_id ile tool_result ───────────────────

describe("bedrockMessagesFromRequest — role:'tool' → tool_result (R1.5)", () => {
  const assistantCall = (id: string) => ({
    role: "assistant",
    tool_calls: [{ id, function: { name: "read_file", arguments: "{}" } }],
  });

  it("eşleşen tool_call_id user mesajı içinde tool_result bloğuna dönüşür", () => {
    const out = convert([
      { role: "user", content: "oku" },
      assistantCall("call_a"),
      { role: "tool", tool_call_id: "call_a", content: "sonuç" },
    ]);

    expect(out[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_a", content: "sonuç" }],
    });
  });

  it("art arda gelen araç çıktıları TEK user mesajında birleşir", () => {
    const out = convert([
      {
        role: "assistant",
        tool_calls: [
          { id: "call_a", function: { name: "read_file", arguments: "{}" } },
          { id: "call_b", function: { name: "read_file", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call_a", content: "A" },
      { role: "tool", tool_call_id: "call_b", content: "B" },
    ]);

    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "call_a", content: "A" },
        { type: "tool_result", tool_use_id: "call_b", content: "B" },
      ],
    });
  });

  it("role:'function' + tool_use_id alanı da eşleşir", () => {
    const out = convert([
      assistantCall("call_a"),
      { role: "function", tool_use_id: "call_a", content: { ok: true } },
    ]);

    expect(out[1]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_a", content: '{"ok":true}' }],
    });
  });

  it("içerik biçimleri string'e indirgenir (dizi birleşir, nesne JSON olur, boş '' olur)", () => {
    const out = convert([
      {
        role: "assistant",
        tool_calls: [
          { id: "c1", function: { name: "read_file", arguments: "{}" } },
          { id: "c2", function: { name: "read_file", arguments: "{}" } },
          { id: "c3", function: { name: "read_file", arguments: "{}" } },
          { id: "c4", function: { name: "read_file", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] },
      { role: "tool", tool_call_id: "c2", content: ["x", { text: "y" }, { type: "image" }] },
      { role: "tool", tool_call_id: "c3", content: { ok: true } },
      { role: "tool", tool_call_id: "c4" },
    ]);

    expect(out[1].content).toEqual([
      { type: "tool_result", tool_use_id: "c1", content: "AB" },
      { type: "tool_result", tool_use_id: "c2", content: "xy" },
      { type: "tool_result", tool_use_id: "c3", content: '{"ok":true}' },
      { type: "tool_result", tool_use_id: "c4", content: "" },
    ]);
  });

  it("Anthropic-native tool_use bloğuyla gelen id de eşleşme kaynağıdır", () => {
    const out = convert([
      { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "shell", input: {} }] },
      { role: "tool", tool_call_id: "toolu_1", content: "ok" },
    ]);

    expect(out[1]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }],
    });
  });

  it("tool_result bloğu string içerikli user mesajına YAPIŞTIRILMAZ (yeni mesaj açılır)", () => {
    const out = convert([
      assistantCall("call_a"),
      { role: "user", content: "araya giren metin" },
      { role: "tool", tool_call_id: "call_a", content: "ok" },
    ]);

    expect(out).toEqual([
      { role: "assistant", content: [{ type: "tool_use", id: "call_a", name: "read_file", input: {} }] },
      { role: "user", content: "araya giren metin" },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_a", content: "ok" }] },
    ]);
  });
});

// ── R1.5: eşleşmeyen tool_call_id → öğe ATILIR ───────────────────────────────

describe("bedrockMessagesFromRequest — eşleşmeyen tool sonucu atılır (R1.5)", () => {
  it("id hiç yoksa öğe atılır ve {role:'user',content:''} ÜRETİLMEZ", () => {
    const out = convert([
      { role: "user", content: "selam" },
      { role: "tool", content: "yetim sonuç" },
    ]);

    expect(out).toEqual([{ role: "user", content: "selam" }]);
    expect(out).not.toContainEqual({ role: "user", content: "" });
  });

  it("id boş string ise öğe atılır", () => {
    const out = convert([
      { role: "user", content: "selam" },
      { role: "tool", tool_call_id: "", content: "boş id" },
    ]);

    expect(out).toEqual([{ role: "user", content: "selam" }]);
  });

  // ── BİLİNEN KUSUR: R1.5'in "eşleşme" yarısı uygulanmamış ────────────────────
  //
  // Bugünkü kod yalnız id'nin BOŞ OLMADIĞINI kontrol ediyor; id'nin aynı konuşmadaki bir
  // tool_use bloğuyla EŞLEŞTİĞİNİ kontrol etmiyor. Bedrock eşleşmeyen tool_result'ı
  // reddediyor → istemci 400 alıyor (R1.5 ihlali).
  //
  // Düzeltme yazıldı ve bu iki testi yeşile çevirdi; ancak Görev 1'in golden korpusu
  // (`tool_history_orphan` şekli, `tool_call_id: "call_yok"`) bugünkü davranışı DONDURDU,
  // yani düzeltme `bedrock-translation-golden.test.ts`'i kırmızıya düşürüyor. Spec'in
  // preservation kuralı golden'ın yeniden üretilmesini YASAKLIYOR → karar kullanıcıya ait.
  //
  // `it.fails` bilinçli: kusur kayda geçer, paket yeşil kalır, düzeltme uygulandığında bu
  // iki satır `it`'e çevrilir (o an golden da güncellenmiş olmalıdır).
  it.fails("[BİLİNEN KUSUR] hiç tool_use olmayan konuşmada tool mesajı geçmemeli", () => {
    const out = convert([{ role: "tool", tool_call_id: "call_yok", content: "eşleşmeyen id" }]);

    expect(out).toEqual([]);
  });

  it.fails("[BİLİNEN KUSUR] eşleşen ve eşleşmeyen sonuçlar birlikteyken yalnız eşleşen kalmalı", () => {
    const out = convert([
      { role: "assistant", tool_calls: [{ id: "call_a", function: { name: "shell", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_yok", content: "eşleşmeyen" },
      { role: "tool", tool_call_id: "call_a", content: "eşleşen" },
    ]);

    expect(out).toEqual([
      { role: "assistant", content: [{ type: "tool_use", id: "call_a", name: "shell", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_a", content: "eşleşen" }] },
    ]);
  });

  it("aynı id iki kez sonuçlanırsa ikisi de geçer (Bedrock tekrarı reddetmez)", () => {
    const out = convert([
      { role: "assistant", tool_calls: [{ id: "call_a", function: { name: "shell", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_a", content: "1" },
      { role: "tool", tool_call_id: "call_a", content: "2" },
    ]);

    expect(out[1].content).toEqual([
      { type: "tool_result", tool_use_id: "call_a", content: "1" },
      { type: "tool_result", tool_use_id: "call_a", content: "2" },
    ]);
  });
});

// ── Araç dışı mesajlar: içerik DEĞİŞTİRİLMEDEN geçer ─────────────────────────

describe("bedrockMessagesFromRequest — araç dışı mesajlar", () => {
  it("system/developer mesajları systemParts'a taşınır, messages'ta yer almaz", () => {
    const systemParts: unknown[] = [];
    const out = bedrockMessagesFromRequest(
      [
        { role: "system", content: "kısa yaz" },
        { role: "developer", content: "türkçe yaz" },
        { role: "system" }, // content yok → systemParts'a girmez
        { role: "user", content: "selam" },
      ],
      systemParts,
    );

    expect(systemParts).toEqual(["kısa yaz", "türkçe yaz"]);
    expect(out).toEqual([{ role: "user", content: "selam" }]);
  });

  it("Anthropic içerik blokları bit-bit korunur", () => {
    const content = [{ type: "text", text: "bak" }, { type: "image", source: { type: "base64", data: "AA" } }];

    const out = convert([{ role: "user", content }]);

    expect(out[0].content).toBe(content);
  });

  it("bilinmeyen roller user'a düşer, mesaj olmayan girdiler atılır", () => {
    expect(convert([null, "metin", 5, { role: "grader", content: "x" }])).toEqual([
      { role: "user", content: "x" },
    ]);
  });

  it("boş dizi boş dizi döner", () => {
    expect(convert([])).toEqual([]);
  });
});

// ── R1.3: partsFromBedrockAnthropic ──────────────────────────────────────────

describe("partsFromBedrockAnthropic — tool_use → tool_calls (R1.3)", () => {
  it("tool_use bloğu OpenAI tool_call'a çevrilir, input JSON string'e serileşir", () => {
    const { text, toolCalls } = partsFromBedrockAnthropic({
      content: [{ type: "tool_use", id: "toolu_1", name: "write_file", input: { path: "a.txt", contents: "x" } }],
    });

    expect(text).toBe("");
    expect(toolCalls).toEqual([
      {
        id: "toolu_1",
        type: "function",
        function: { name: "write_file", arguments: '{"path":"a.txt","contents":"x"}' },
      },
    ]);
  });

  it("id yoksa/boşsa üretilir (sıra numarasıyla)", () => {
    const { toolCalls } = partsFromBedrockAnthropic({
      content: [
        { type: "tool_use", name: "a", input: {} },
        { type: "tool_use", id: "", name: "b", input: {} },
        { type: "tool_use", id: "toolu_x", name: "c", input: {} },
      ],
    });

    expect(toolCalls.map((c) => c.id)).toEqual(["call_0", "call_1", "toolu_x"]);
  });

  it("input yoksa arguments '{}' olur", () => {
    const { toolCalls } = partsFromBedrockAnthropic({
      content: [{ type: "tool_use", id: "t1", name: "shell" }],
    });

    expect((toolCalls[0].function as Record<string, unknown>).arguments).toBe("{}");
  });

  it("isim yoksa tool_use bloğu düşer", () => {
    const { toolCalls } = partsFromBedrockAnthropic({
      content: [{ type: "tool_use", id: "t1", input: {} }],
    });

    expect(toolCalls).toEqual([]);
  });

  it("type alanı olmayan {name, input} bloğu da araç çağrısı sayılır", () => {
    const { text, toolCalls } = partsFromBedrockAnthropic({
      content: [{ name: "shell", input: { cmd: "pwd" } }, { type: "text", text: "son" }],
    });

    expect(text).toBe("son");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe("call_0");
  });
});

describe("partsFromBedrockAnthropic — metin blokları (R1.3)", () => {
  it("birden çok metin bloğu sırayla birleşir", () => {
    const { text, toolCalls } = partsFromBedrockAnthropic({
      content: [{ type: "text", text: "bir " }, { type: "text", text: "iki" }],
    });

    expect(text).toBe("bir iki");
    expect(toolCalls).toEqual([]);
  });

  it("metin ve araç blokları karışıkken ikisi de ayrı ayrı çıkar", () => {
    const { text, toolCalls } = partsFromBedrockAnthropic({
      content: [
        { type: "text", text: "yazıyorum" },
        { type: "tool_use", id: "t1", name: "write_file", input: {} },
        { type: "text", text: " bitti" },
      ],
    });

    expect(text).toBe("yazıyorum bitti");
    expect(toolCalls).toHaveLength(1);
  });

  it("content dizi değilse veya boşsa boş sonuç döner", () => {
    for (const content of ["düz metin", undefined, null, 5, {}]) {
      expect(partsFromBedrockAnthropic({ content })).toEqual({ text: "", toolCalls: [] });
    }
    expect(partsFromBedrockAnthropic({ content: [] })).toEqual({ text: "", toolCalls: [] });
  });

  it("tanınmayan bloklar (thinking, null) metni kirletmez", () => {
    const { text } = partsFromBedrockAnthropic({
      content: [null, "ham string", { type: "thinking", thinking: "gizli" }, { type: "text", text: "görünen" }],
    });

    expect(text).toBe("görünen");
  });
});

// ── R1.3: bedrockFinishReason ────────────────────────────────────────────────

describe("bedrockFinishReason — stop_reason → finish_reason (R1.3)", () => {
  it("tool_use → tool_calls", () => {
    expect(bedrockFinishReason({ stop_reason: "tool_use" }, true)).toBe("tool_calls");
    expect(bedrockFinishReason({ stop_reason: "tool_use" }, false)).toBe("tool_calls");
  });

  it("end_turn ve stop_sequence → stop", () => {
    expect(bedrockFinishReason({ stop_reason: "end_turn" }, false)).toBe("stop");
    expect(bedrockFinishReason({ stop_reason: "stop_sequence" }, false)).toBe("stop");
  });

  it("max_tokens → length", () => {
    expect(bedrockFinishReason({ stop_reason: "max_tokens" }, false)).toBe("length");
  });

  it("stop_reason yok + araç çağrısı var → tool_calls (sözleşme gereği)", () => {
    expect(bedrockFinishReason({}, true)).toBe("tool_calls");
  });

  it("stop_reason yok + araç yok → stop", () => {
    expect(bedrockFinishReason({}, false)).toBe("stop");
  });

  it("end_turn + araç çağrısı var → tool_calls DEĞİL stop (Anthropic'in açık kararı korunur)", () => {
    // Bedrock tool_use'da stop_reason'ı doğru gönderir; end_turn geldiyse araç turu bitmiştir.
    expect(bedrockFinishReason({ stop_reason: "end_turn" }, true)).toBe("stop");
  });

  it("tanınmayan stop_reason olduğu gibi geçer", () => {
    expect(bedrockFinishReason({ stop_reason: "refusal" }, false)).toBe("refusal");
    expect(bedrockFinishReason({ stop_reason: "pause_turn" }, true)).toBe("pause_turn");
  });
});

// ── firstChatToolCalls ───────────────────────────────────────────────────────

describe("firstChatToolCalls — chat gövdesinden araç çağrıları (R1.3)", () => {
  const calls = [
    { id: "c1", type: "function", function: { name: "write_file", arguments: "{}" } },
    { id: "c2", type: "function", function: { name: "read_file", arguments: '{"path":"a"}' } },
  ];

  it("choices[0].message.tool_calls'u olduğu gibi çıkarır", () => {
    expect(firstChatToolCalls({ choices: [{ message: { role: "assistant", content: null, tool_calls: calls } }] })).toEqual(calls);
  });

  it("yalnız İLK choice'a bakar", () => {
    const out = firstChatToolCalls({
      choices: [{ message: { tool_calls: [calls[0]] } }, { message: { tool_calls: [calls[1]] } }],
    });

    expect(out).toEqual([calls[0]]);
  });

  it("araç çağrısı yoksa boş dizi döner", () => {
    expect(firstChatToolCalls({ choices: [{ message: { role: "assistant", content: "selam" } }] })).toEqual([]);
  });

  it("tool_calls dizi değilse boş dizi döner", () => {
    expect(firstChatToolCalls({ choices: [{ message: { tool_calls: "c1" } }] })).toEqual([]);
    expect(firstChatToolCalls({ choices: [{ message: { tool_calls: {} } }] })).toEqual([]);
  });

  it("dizideki nesne olmayan öğeler süzülür", () => {
    expect(firstChatToolCalls({ choices: [{ message: { tool_calls: [null, "x", 5, calls[0]] } }] })).toEqual([calls[0]]);
  });

  it("choices / message eksik ya da bozuk gövdelerde boş dizi döner", () => {
    for (const raw of [
      undefined,
      null,
      {},
      { choices: [] },
      { choices: "yok" },
      { choices: [null] },
      { choices: [{}] },
      { choices: [{ message: null }] },
      { choices: [{ message: "metin" }] },
    ]) {
      expect(firstChatToolCalls(raw)).toEqual([]);
    }
  });
});
