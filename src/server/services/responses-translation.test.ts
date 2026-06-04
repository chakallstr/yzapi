import { describe, it, expect } from "vitest";
import {
  normalizeRequestedModel,
  responsesRequestToChat,
  chatCompletionToResponses,
  ResponsesStreamTranslator,
  formatResponsesSse,
  usageFromTokens,
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
