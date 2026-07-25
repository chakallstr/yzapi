import { describe, it, expect } from "vitest";
import {
  normalizeRequestedModel,
  responsesRequestToChat,
  chatCompletionToResponses,
  ResponsesStreamTranslator,
  formatResponsesSse,
  usageFromTokens,
  countResponseToolCalls,
  createResponsesStreamStats,
  summarizeToolContract,
  isSuspiciousToolOutcome,
} from "./responses-translation.js";

describe("normalizeRequestedModel", () => {
  it("maps known codex slugs to catalog models", () => {
    expect(normalizeRequestedModel("gpt-5.5-codex")).toBe("gpt-5.5");
    expect(normalizeRequestedModel("gpt-5.3-codex")).toBe("gpt-5.4"); // gpt-5.3 katalogda yok
    expect(normalizeRequestedModel("gpt-5-codex")).toBe("gpt-5");
    expect(normalizeRequestedModel("codex-mini-latest")).toBe("gpt-5-mini");
  });
  it("strips unknown -codex suffix generically", () => {
    expect(normalizeRequestedModel("gpt-9-codex")).toBe("gpt-9");
  });
  it("passes through normal models", () => {
    expect(normalizeRequestedModel("gpt-5.5")).toBe("gpt-5.5");
    expect(normalizeRequestedModel("claude-opus-4-8")).toBe("claude-opus-4-8");
  });
  it("returns undefined for empty/non-string", () => {
    expect(normalizeRequestedModel(undefined)).toBeUndefined();
    expect(normalizeRequestedModel("")).toBeUndefined();
  });
});

describe("responsesRequestToChat", () => {
  it("converts a simple string input to a user message", () => {
    const chat = responsesRequestToChat({ model: "gpt-5.5", input: "selam", stream: true, max_output_tokens: 100 });
    expect(chat.model).toBe("gpt-5.5");
    expect(chat.messages).toEqual([{ role: "user", content: "selam" }]);
    expect(chat.stream).toBe(true);
    expect(chat.max_tokens).toBe(100);
  });

  it("prepends instructions as a system message", () => {
    const chat = responsesRequestToChat({ model: "gpt-5.5", instructions: "Sen yardımcısın", input: "merhaba" });
    expect(chat.messages).toEqual([
      { role: "system", content: "Sen yardımcısın" },
      { role: "user", content: "merhaba" },
    ]);
  });

  it("flattens message content parts (input_text) to a string", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "a" }, { type: "input_text", text: "b" }] }],
    });
    expect((chat.messages as any[])[0]).toEqual({ role: "user", content: "ab" });
  });

  it("maps developer role to system", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: [{ type: "message", role: "developer", content: "kural" }],
    });
    expect((chat.messages as any[])[0].role).toBe("system");
  });

  it("merges consecutive function_call items into one assistant tool_calls message, then tool output", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: [
        { type: "message", role: "user", content: "çalıştır" },
        { type: "function_call", call_id: "call_1", name: "shell", arguments: "{\"cmd\":\"ls\"}" },
        { type: "function_call_output", call_id: "call_1", output: "dosyalar" },
      ],
    });
    const msgs = chat.messages as any[];
    expect(msgs[0]).toEqual({ role: "user", content: "çalıştır" });
    expect(msgs[1]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "shell", arguments: "{\"cmd\":\"ls\"}" } }],
    });
    expect(msgs[2]).toEqual({ role: "tool", tool_call_id: "call_1", content: "dosyalar" });
  });

  it("converts flat Responses function tools to chat-wrapped tools", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: "x",
      tools: [{ type: "function", name: "shell", description: "run", parameters: { type: "object" } }],
    });
    expect(chat.tools).toEqual([
      { type: "function", function: { name: "shell", description: "run", parameters: { type: "object" } } },
    ]);
  });

  it("preserves OpenAI local_shell as a chat function tool for translated Codex requests", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: "x",
      tools: [{ type: "local_shell" }],
    });

    expect(chat.tools).toEqual([
      expect.objectContaining({
        type: "function",
        function: expect.objectContaining({ name: "local_shell" }),
      }),
    ]);
  });

  it("maps local_shell call history back to chat tool messages", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: [
        { type: "message", role: "user", content: "branch kontrol et" },
        {
          type: "local_shell_call",
          call_id: "call_shell_1",
          action: {
            type: "exec",
            command: ["git", "branch", "--show-current"],
            env: {},
            working_directory: "/Users/ufuk/yzapi",
          },
        },
        { type: "local_shell_call_output", call_id: "call_shell_1", output: "feat/v1-usage-endpoint" },
      ],
      tools: [{ type: "local_shell" }],
    });

    const msgs = chat.messages as any[];
    expect(msgs[1]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_shell_1",
          type: "function",
          function: {
            name: "local_shell",
            arguments: JSON.stringify({
              action: {
                type: "exec",
                command: ["git", "branch", "--show-current"],
                env: {},
                working_directory: "/Users/ufuk/yzapi",
              },
            }),
          },
        },
      ],
    });
    expect(msgs[2]).toEqual({ role: "tool", tool_call_id: "call_shell_1", content: "feat/v1-usage-endpoint" });
  });

  it("converts object tool_choice to chat shape and maps reasoning.effort", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: "x",
      tool_choice: { type: "function", name: "shell" },
      reasoning: { effort: "high" },
    });
    expect(chat.tool_choice).toEqual({ type: "function", function: { name: "shell" } });
    expect(chat.reasoning_effort).toBe("high");
  });

  it("aliases codex model slugs", () => {
    const chat = responsesRequestToChat({ model: "gpt-5.3-codex", input: "x" });
    expect(chat.model).toBe("gpt-5.4");
  });
});

describe("chatCompletionToResponses (non-stream)", () => {
  const meta = { id: "req1", model: "gpt-5.5", createdAt: 1000 };

  it("maps a text completion to a Responses object with output_text", () => {
    const resp = chatCompletionToResponses(
      { choices: [{ message: { role: "assistant", content: "merhaba" } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
      meta,
    );
    expect(resp.id).toBe("resp_req1");
    expect(resp.object).toBe("response");
    expect(resp.status).toBe("completed");
    expect(resp.model).toBe("gpt-5.5");
    expect((resp.output as any[])[0]).toEqual({
      id: "msg_req1",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "merhaba", annotations: [] }],
    });
    expect(resp.usage).toEqual({
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
    });
  });

  it("maps tool_calls to function_call output items", () => {
    const resp = chatCompletionToResponses(
      { choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call_9", type: "function", function: { name: "shell", arguments: "{}" } }] } }] },
      meta,
    );
    const out = resp.output as any[];
    expect(out[0]).toEqual({
      id: "fc_req1_0",
      type: "function_call",
      status: "completed",
      call_id: "call_9",
      name: "shell",
      arguments: "{}",
    });
  });

  it("maps local_shell tool calls to Responses local_shell_call items", () => {
    const args = JSON.stringify({
      action: {
        type: "exec",
        command: ["git", "branch", "--show-current"],
        env: {},
        working_directory: "/Users/ufuk/yzapi",
      },
    });
    const resp = chatCompletionToResponses(
      { choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call_local_1", type: "function", function: { name: "local_shell", arguments: args } }] } }] },
      meta,
    );

    expect((resp.output as any[])[0]).toEqual({
      id: "fc_req1_0",
      type: "local_shell_call",
      status: "completed",
      call_id: "call_local_1",
      action: {
        type: "exec",
        command: ["git", "branch", "--show-current"],
        env: {},
        working_directory: "/Users/ufuk/yzapi",
      },
    });
  });
});

describe("ResponsesStreamTranslator", () => {
  const meta = { id: "req1", model: "gpt-5.5", createdAt: 1000 };

  it("emits created + in_progress on start with monotonic sequence numbers", () => {
    const t = new ResponsesStreamTranslator(meta);
    const ev = t.start();
    expect(ev.map((e) => e.type)).toEqual(["response.created", "response.in_progress"]);
    expect(ev[0].sequence_number).toBe(0);
    expect(ev[1].sequence_number).toBe(1);
    expect((ev[0].response as any).status).toBe("in_progress");
  });

  it("emits the full text streaming sequence in order", () => {
    const t = new ResponsesStreamTranslator(meta);
    t.start();
    const first = t.pushChatChunk({ choices: [{ delta: { content: "Hel" } }] });
    expect(first.map((e) => e.type)).toEqual([
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
    ]);
    const second = t.pushChatChunk({ choices: [{ delta: { content: "lo" } }] });
    expect(second.map((e) => e.type)).toEqual(["response.output_text.delta"]);
    expect((second[0] as any).delta).toBe("lo");

    const done = t.finish(usageFromTokens(3, 2));
    expect(done.map((e) => e.type)).toEqual([
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect((done[0] as any).text).toBe("Hello");
    const completed = done[3] as any;
    expect(completed.response.status).toBe("completed");
    expect(completed.response.output[0].content[0].text).toBe("Hello");
    expect(completed.response.usage.input_tokens).toBe(3);
    expect(completed.response.usage.output_tokens).toBe(2);
  });

  it("keeps sequence_number strictly increasing across the whole stream", () => {
    const t = new ResponsesStreamTranslator(meta);
    const all = [...t.start(), ...t.pushChatChunk({ choices: [{ delta: { content: "x" } }] }), ...t.finish(usageFromTokens(1, 1))];
    const seqs = all.map((e) => e.sequence_number as number);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBe(seqs[i - 1] + 1);
  });

  it("translates streamed tool calls (added → args.delta → done)", () => {
    const t = new ResponsesStreamTranslator(meta);
    t.start();
    const open = t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "shell", arguments: "{\"c" } }] } }] });
    expect(open.map((e) => e.type)).toEqual(["response.output_item.added", "response.function_call_arguments.delta"]);
    expect((open[0].item as any).type).toBe("function_call");
    expect((open[0].item as any).name).toBe("shell");

    const more = t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "md\":1}" } }] } }] });
    expect(more.map((e) => e.type)).toEqual(["response.function_call_arguments.delta"]);

    const done = t.finish(usageFromTokens(4, 3));
    expect(done.map((e) => e.type)).toEqual([
      "response.function_call_arguments.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect((done[0] as any).arguments).toBe("{\"cmd\":1}");
    const completedOut = (done[2] as any).response.output[0];
    expect(completedOut).toEqual({ id: "fc_req1_0", type: "function_call", status: "completed", call_id: "call_1", name: "shell", arguments: "{\"cmd\":1}" });
  });

  it("synthesizes a call_id when upstream omits the tool_call id (stream)", () => {
    const t = new ResponsesStreamTranslator(meta);
    t.start();
    const open = t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "shell", arguments: "{}" } }] } }] });
    expect((open[0].item as any).call_id).toBe("call_req1_0");
    const done = t.finish(usageFromTokens(1, 1));
    const fnDone = done.find((e) => e.type === "response.output_item.done") as any;
    expect(fnDone.item.call_id).toBe("call_req1_0");
  });

  it("translates streamed local_shell tool calls to local_shell_call items", () => {
    const t = new ResponsesStreamTranslator(meta);
    t.start();
    const args = JSON.stringify({ action: { type: "exec", command: ["git", "branch", "--show-current"], env: {}, working_directory: "/Users/ufuk/yzapi" } });
    const open = t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_local_1", type: "function", function: { name: "local_shell", arguments: args } }] } }] });

    expect((open[0].item as any).type).toBe("local_shell_call");
    const done = t.finish(usageFromTokens(1, 1));
    const completedOut = (done[2] as any).response.output[0];
    expect(completedOut.type).toBe("local_shell_call");
    expect(completedOut.action.command).toEqual(["git", "branch", "--show-current"]);
  });

  it("finish is idempotent", () => {
    const t = new ResponsesStreamTranslator(meta);
    t.start();
    expect(t.finish(usageFromTokens(1, 1)).length).toBeGreaterThan(0);
    expect(t.finish(usageFromTokens(1, 1))).toEqual([]);
  });
});

describe("formatResponsesSse", () => {
  it("emits event: and data: lines with trailing blank line", () => {
    const s = formatResponsesSse({ type: "response.completed", sequence_number: 7 });
    expect(s).toBe('event: response.completed\ndata: {"type":"response.completed","sequence_number":7}\n\n');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Araç sözleşmesi regresyon testleri — bug koşulu C(X)
// Spec: .kiro/specs/responses-tool-contract-fix/ (bugfix.md CE1-CE4)
// Bu blok fix'ten ÖNCE kırmızıdır; bug koşulunu yakalar.
// ─────────────────────────────────────────────────────────────────────────────
describe("araç sözleşmesi (bug koşulu C(X))", () => {
  const meta = { id: "req1", model: "gpt-5.5", createdAt: 1000 };

  // CE1: custom araç sessizce düşmemeli
  it("CE1: type:'custom' aracı chat aracı olarak taşır (sessizce düşürmez)", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: "x",
      tools: [{ type: "custom", name: "apply_patch", description: "Freeform patch" }],
    });

    const tools = chat.tools as any[] | undefined;
    expect(tools).toBeDefined();
    expect(tools).toHaveLength(1);
    expect(tools![0].type).toBe("function");
    expect(tools![0].function.name).toBe("apply_patch");
    expect(tools![0].function.description).toBe("Freeform patch");
    // Freeform içerik tek string argümanla taşınır
    expect(tools![0].function.parameters.properties.input.type).toBe("string");
    expect(tools![0].function.parameters.required).toEqual(["input"]);
  });

  it("CE1b: custom + function araçları birlikte taşınır", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: "x",
      tools: [
        { type: "function", name: "shell", description: "run", parameters: { type: "object" } },
        { type: "custom", name: "apply_patch" },
      ],
    });
    const names = (chat.tools as any[]).map((t) => t.function.name);
    expect(names).toEqual(["shell", "apply_patch"]);
  });

  // CE2: dönüş yolu deklare edilen tipi korumalı (non-stream)
  it("CE2: custom deklare edilen araç için non-stream çıktı custom_tool_call üretir", () => {
    const resp = chatCompletionToResponses(
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: "call_c1", type: "function", function: { name: "apply_patch", arguments: '{"input":"*** Begin Patch"}' } },
              ],
            },
          },
        ],
      },
      { ...meta, toolKinds: { apply_patch: "custom" } } as any,
    );

    expect((resp.output as any[])[0]).toEqual({
      id: "fc_req1_0",
      type: "custom_tool_call",
      status: "completed",
      call_id: "call_c1",
      name: "apply_patch",
      input: "*** Begin Patch",
    });
  });

  it("CE2b: custom çağrısının argümanı JSON değilse ham string input olarak taşınır", () => {
    const resp = chatCompletionToResponses(
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{ id: "call_c2", type: "function", function: { name: "apply_patch", arguments: "düz metin yama" } }],
            },
          },
        ],
      },
      { ...meta, toolKinds: { apply_patch: "custom" } } as any,
    );

    const item = (resp.output as any[])[0];
    expect(item.type).toBe("custom_tool_call");
    expect(item.input).toBe("düz metin yama");
  });

  // CE2c: dönüş yolu deklare edilen tipi korumalı (stream)
  it("CE2c: custom deklare edilen araç için stream çıktısı custom_tool_call üretir", () => {
    const t = new ResponsesStreamTranslator({ ...meta, toolKinds: { apply_patch: "custom" } } as any);
    t.start();
    const open = t.pushChatChunk({
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_c3", type: "function", function: { name: "apply_patch", arguments: '{"input":"p' } }] } }],
    });
    expect((open[0].item as any).type).toBe("custom_tool_call");

    t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'atch"}' } }] } }] });
    const done = t.finish(usageFromTokens(2, 1));
    const itemDone = (done.find((e) => e.type === "response.output_item.done") as any).item;
    expect(itemDone.type).toBe("custom_tool_call");
    expect(itemDone.input).toBe("patch");
    const completedOut = (done[done.length - 1] as any).response.output[0];
    expect(completedOut.type).toBe("custom_tool_call");
  });

  it("CE2d: toolKinds verilmediğinde dönüş tipi bugünkü davranışta kalır", () => {
    const resp = chatCompletionToResponses(
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{ id: "call_x", type: "function", function: { name: "apply_patch", arguments: "{}" } }],
            },
          },
        ],
      },
      meta,
    );
    expect((resp.output as any[])[0].type).toBe("function_call");
  });

  // CE3: custom araç geçmişi boş user mesajına dönüşmemeli
  it("CE3: custom_tool_call / custom_tool_call_output geçmişini tool mesajlarına eşler", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: [
        { type: "message", role: "user", content: "yamayı uygula" },
        { type: "custom_tool_call", call_id: "call_c9", name: "apply_patch", input: "*** Begin Patch" },
        { type: "custom_tool_call_output", call_id: "call_c9", output: "uygulandı" },
      ],
      tools: [{ type: "custom", name: "apply_patch" }],
    });

    const msgs = chat.messages as any[];
    expect(msgs[0]).toEqual({ role: "user", content: "yamayı uygula" });
    expect(msgs[1]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_c9",
          type: "function",
          function: { name: "apply_patch", arguments: JSON.stringify({ input: "*** Begin Patch" }) },
        },
      ],
    });
    expect(msgs[2]).toEqual({ role: "tool", tool_call_id: "call_c9", content: "uygulandı" });
    // Hiçbir öğe boş içerikli user mesajına dönüşmemeli
    expect(msgs.filter((m) => m.role === "user" && m.content === "")).toHaveLength(0);
  });

  it("CE3b: bilinmeyen tipli, rolsüz ve içeriksiz öğe boş user mesajı üretmez", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: [
        { type: "web_search_call", id: "ws_1", status: "completed" },
        { type: "message", role: "user", content: "devam" },
      ],
    });
    const msgs = chat.messages as any[];
    expect(msgs).toEqual([{ role: "user", content: "devam" }]);
  });

  // CE4: araçlar tamamen düştüyse tool_choice gönderilmemeli
  it("CE4: tüm araçlar düştüğünde tool_choice gövdeye eklenmez", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: "x",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
    });
    expect(chat.tools).toBeUndefined();
    expect(chat.tool_choice).toBeUndefined();
  });

  it("CE4b: araç hiç gönderilmediyse tool_choice bugünkü gibi iletilir (preservation)", () => {
    const chat = responsesRequestToChat({ model: "gpt-5.5", input: "x", tool_choice: "required" });
    expect(chat.tools).toBeUndefined();
    expect(chat.tool_choice).toBe("required");
  });

  it("CE4c: en az bir araç sağ kaldığında tool_choice iletilir (preservation)", () => {
    const chat = responsesRequestToChat({
      model: "gpt-5.5",
      input: "x",
      tools: [{ type: "web_search" }, { type: "function", name: "shell", parameters: { type: "object" } }],
      tool_choice: { type: "function", name: "shell" },
    });
    expect((chat.tools as any[]).map((t) => t.function.name)).toEqual(["shell"]);
    expect(chat.tool_choice).toEqual({ type: "function", function: { name: "shell" } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// countResponseToolCalls — sessiz arıza dedektörünün sayacı
// Spec: .kiro/specs/responses-tool-contract-fix (görev 8.2 / 8.4)
// "status=success ama hiç araç çağrısı yok" kombinasyonunu ölçülebilir kılar.
// ─────────────────────────────────────────────────────────────────────────────
describe("countResponseToolCalls", () => {
  it("native Responses yanıtındaki üç araç öğesi tipini de sayar", () => {
    const raw = {
      output: [
        { type: "message", content: [] },
        { type: "function_call", name: "shell" },
        { type: "custom_tool_call", name: "apply_patch" },
        { type: "local_shell_call", action: {} },
        { type: "reasoning" },
      ],
    };
    expect(countResponseToolCalls(raw, true)).toBe(3);
  });

  it("chat/completions yanıtındaki tool_calls'ları sayar", () => {
    const raw = {
      choices: [
        { message: { role: "assistant", content: "", tool_calls: [{ id: "a" }, { id: "b" }] } },
      ],
    };
    expect(countResponseToolCalls(raw, false)).toBe(2);
  });

  it("araç çağrısı olmayan yanıtlarda 0 döner (sessiz arıza sinyali)", () => {
    expect(countResponseToolCalls({ output: [{ type: "message", content: [] }] }, true)).toBe(0);
    expect(countResponseToolCalls({ choices: [{ message: { content: "merhaba" } }] }, false)).toBe(0);
  });

  it("bozuk/eksik gövdelerde asla patlamaz", () => {
    expect(countResponseToolCalls(null, true)).toBe(0);
    expect(countResponseToolCalls(undefined, false)).toBe(0);
    expect(countResponseToolCalls("metin", true)).toBe(0);
    expect(countResponseToolCalls({ output: "dizi-degil" }, true)).toBe(0);
    expect(countResponseToolCalls({ choices: [{}] }, false)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stream telemetrisi (salt-gözlem) — spec görev 8.3 (HANDOFF item F)
// Sayaç YALNIZ gözlem içindir: üretilen event dizisi bit-bit aynı kalır (golden kilidi).
// Ayrım: upstreamToolCalls > 0 && emittedToolItems === 0 → bizde emit hatası.
// ─────────────────────────────────────────────────────────────────────────────
describe("ResponsesStreamStats (stream araç telemetrisi)", () => {
  const baseMeta = { id: "req9", model: "gpt-5.5", createdAt: 1000 };

  it("upstream tool_call'larını ve yayılan araç öğelerini sayar", () => {
    const stats = createResponsesStreamStats();
    const t = new ResponsesStreamTranslator({ ...baseMeta, stats });
    t.start();
    t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "shell", arguments: "{}" } }] } }] });
    t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "" } }] } }] });
    t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 1, id: "c2", function: { name: "apply_patch", arguments: "{}" } }] } }] });
    t.finish(usageFromTokens(1, 1));

    expect(stats.upstreamToolCalls).toBe(2);
    expect(stats.emittedToolItems).toBe(2);
  });

  it("araç çağrısı olmayan akışta sayaçlar 0 kalır (sessiz arıza sinyali)", () => {
    const stats = createResponsesStreamStats();
    const t = new ResponsesStreamTranslator({ ...baseMeta, stats });
    t.start();
    t.pushChatChunk({ choices: [{ delta: { content: "merhaba" } }] });
    t.finish(usageFromTokens(1, 1));

    expect(stats.upstreamToolCalls).toBe(0);
    expect(stats.emittedToolItems).toBe(0);
  });

  it("stats verilmediğinde event dizisi ve davranış değişmez (geriye dönük uyum)", () => {
    const withStats = new ResponsesStreamTranslator({ ...baseMeta, stats: createResponsesStreamStats() });
    const without = new ResponsesStreamTranslator({ ...baseMeta });
    const run = (t: ResponsesStreamTranslator) => [
      ...t.start(),
      ...t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "shell", arguments: "{}" } }] } }] }),
      ...t.finish(usageFromTokens(1, 1)),
    ];
    expect(run(withStats)).toEqual(run(without));
  });

  it("stats yalnız sayı taşır — araç adı/argüman sızdırmaz", () => {
    const stats = createResponsesStreamStats();
    const t = new ResponsesStreamTranslator({ ...baseMeta, stats });
    t.start();
    t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "gizli_call_id", function: { name: "gizli_arac", arguments: "{\"input\":\"gizli argüman\"}" } }] } }] });
    t.finish(usageFromTokens(1, 1));

    const serialized = JSON.stringify(stats);
    expect(serialized).not.toContain("gizli_arac");
    expect(serialized).not.toContain("gizli argüman");
    expect(serialized).not.toContain("gizli_call_id");
    expect(Object.values(stats).every((v) => typeof v === "number")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeToolContract.mappedToolCount — spec görev 8.2
// "araç verildi, model kullanmadı" sınıfını izole etmek için upstream'e KAÇ araç
// gönderildiği gerekir (tip listesi değil, sayı).
// ─────────────────────────────────────────────────────────────────────────────
describe("summarizeToolContract mappedToolCount", () => {
  it("upstream'e taşınan araç sayısını verir (düşenleri saymaz)", () => {
    const s = summarizeToolContract({
      tools: [
        { type: "function", name: "a", parameters: { type: "object" } },
        { type: "custom", name: "apply_patch" },
        { type: "web_search" },
      ],
    });
    expect(s.toolCount).toBe(3);
    expect(s.mappedToolCount).toBe(2);
    expect(s.droppedToolTypes).toEqual(["web_search"]);
  });

  it("tüm araçlar düşerse 0 döner", () => {
    expect(summarizeToolContract({ tools: [{ type: "web_search" }] }).mappedToolCount).toBe(0);
  });

  it("araçsız istekte 0 döner", () => {
    expect(summarizeToolContract({ input: "x" }).mappedToolCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isSuspiciousToolOutcome — spec görev 8.4 (sahte başarı alarmı)
// status=success + araç upstream'e gitti/düştü + hiç araç çağrısı yok → uyarı.
// ─────────────────────────────────────────────────────────────────────────────
describe("isSuspiciousToolOutcome", () => {
  it("araç gönderildi ama hiç çağrı dönmediyse şüphelidir", () => {
    expect(isSuspiciousToolOutcome({ status: "success", mappedToolCount: 2, toolCallCount: 0, droppedToolTypes: [] })).toBe(true);
  });

  it("araçların hepsi düştüyse ve çağrı yoksa şüphelidir (tool-routing sınıfı)", () => {
    expect(isSuspiciousToolOutcome({ status: "success", mappedToolCount: 0, toolCallCount: 0, droppedToolTypes: ["web_search"] })).toBe(true);
  });

  it("araç çağrısı döndüyse şüpheli değildir", () => {
    expect(isSuspiciousToolOutcome({ status: "success", mappedToolCount: 2, toolCallCount: 1, droppedToolTypes: ["web_search"] })).toBe(false);
  });

  it("araçsız istek şüpheli değildir", () => {
    expect(isSuspiciousToolOutcome({ status: "success", mappedToolCount: 0, toolCallCount: 0, droppedToolTypes: [] })).toBe(false);
  });

  it("başarısız/ücretsiz istek şüpheli değildir (çağrı yokluğu beklenir)", () => {
    expect(isSuspiciousToolOutcome({ status: "error", mappedToolCount: 2, toolCallCount: 0, droppedToolTypes: [] })).toBe(false);
    expect(isSuspiciousToolOutcome({ status: "stream_missing_usage", mappedToolCount: 2, toolCallCount: 0, droppedToolTypes: [] })).toBe(false);
  });
});
