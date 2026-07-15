/**
 * Option C — finish_reason DENETİM İZİ (kör nokta kapatma).
 *
 * Upstream cevabı NEDEN bitirdi (finish_reason / stop_reason / incomplete_details.reason)
 * ChatUsage.finishReason'a yakalanır → proxy onu usage_records.raw_usage_json'a yazar →
 * CF-Brain "length"/"max_tokens"/"max_output_tokens" görünce "kesilme" bulgusu üretir.
 * Faturalamaya GİRMEZ (yalnız denetim izi). Bu test 4 yolu da kanıtlar:
 * non-stream chat / messages / responses + stream chat (son non-null finish_reason kazanır).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { forwardChat, forwardTextEndpoint, forwardChatStream } from "./closerouter-service.js";
import type { ProviderContext } from "./provider-config-service.js";

function ctx(): ProviderContext {
  return {
    profileId: null,
    baseUrl: "https://api.closerouter.dev/v1",
    apiKey: "closerouter_test_key",
    modelMap: {},
    source: { baseUrl: "active_profile", apiKey: "active_profile" },
  };
}

function mockRes() {
  const writes: string[] = [];
  const state = { ended: false };
  const res = {
    headersSent: false,
    setHeader() {},
    flushHeaders() { res.headersSent = true; },
    write(chunk: string) { writes.push(String(chunk)); return true; },
    end() { state.ended = true; },
    req: { on() {} },
  };
  return { res, writes, state };
}

function sseBody(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l));
      controller.close();
    },
  });
}

afterEach(() => {
  nock.cleanAll();
  vi.unstubAllGlobals();
});

describe("finish_reason denetim izi (Option C)", () => {
  it("non-stream chat: choices[].finish_reason='length' → usage.finishReason='length'", async () => {
    nock("https://api.closerouter.dev", { reqheaders: { authorization: "Bearer closerouter_test_key" } })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_len",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{ index: 0, message: { role: "assistant", content: "kesik" }, finish_reason: "length" }],
      });

    const result = await forwardChat(
      { model: "gpt-5.5", messages: [{ role: "user", content: "uzun düşün" }] },
      ctx(),
    );
    expect(result.usage.finishReason).toBe("length");
    // Billing alanları dokunulmadı — finishReason yalnız denetim izi.
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
  });

  it("non-stream chat: normal bitiş finish_reason='stop' korunur", async () => {
    nock("https://api.closerouter.dev", { reqheaders: { authorization: "Bearer closerouter_test_key" } })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_stop",
        usage: { prompt_tokens: 4, completion_tokens: 2 },
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      });

    const result = await forwardChat({ model: "gpt-5.5", messages: [{ role: "user", content: "selam" }] }, ctx());
    expect(result.usage.finishReason).toBe("stop");
  });

  it("non-stream messages (Anthropic): stop_reason='max_tokens' → usage.finishReason='max_tokens'", async () => {
    nock("https://api.closerouter.dev", { reqheaders: { authorization: "Bearer closerouter_test_key" } })
      .post("/v1/messages")
      .reply(200, {
        id: "msg_trunc",
        stop_reason: "max_tokens",
        usage: { prompt_tokens: 30, completion_tokens: 12 },
      });

    const result = await forwardTextEndpoint(
      "messages",
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "uzun yaz" }] },
      ctx(),
    );
    expect(result.usage.finishReason).toBe("max_tokens");
  });

  it("non-stream responses: incomplete_details.reason='max_output_tokens' → usage.finishReason yakalanır", async () => {
    nock("https://api.closerouter.dev", { reqheaders: { authorization: "Bearer closerouter_test_key" } })
      .post("/v1/responses")
      .reply(200, {
        id: "resp_trunc",
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        usage: { input_tokens: 50, output_tokens: 40 },
      });

    const result = await forwardTextEndpoint("responses", { model: "gpt-5.5", input: "x" }, ctx());
    expect(result.usage.finishReason).toBe("max_output_tokens");
  });

  it("non-stream: finish_reason yoksa undefined (gürültü yazılmaz)", async () => {
    nock("https://api.closerouter.dev", { reqheaders: { authorization: "Bearer closerouter_test_key" } })
      .post("/v1/responses")
      .reply(200, { id: "resp_plain", usage: { input_tokens: 3, output_tokens: 1 } });

    const result = await forwardTextEndpoint("responses", { model: "gpt-5.5", input: "x" }, ctx());
    expect(result.usage.finishReason).toBeUndefined();
  });

  it("stream chat: son chunk finish_reason='length' → usage.finishReason='length'", async () => {
    const body = sseBody([
      'data: {"choices":[{"index":0,"delta":{"content":"düşün"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":12,"completion_tokens":7}}\n\n',
      "data: [DONE]\n\n",
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })),
    );

    const { res } = mockRes();
    const usage = await forwardChatStream(
      { model: "gpt-5.5", messages: [{ role: "user", content: "uzun düşün" }], stream: true },
      res as never,
      ctx(),
    );
    expect(usage.finishReason).toBe("length");
    // Billing dokunulmadı: gerçek token'lar usage chunk'ından okundu.
    expect(usage.promptTokens).toBe(12);
    expect(usage.completionTokens).toBe(7);
  });

  it("stream chat: normal bitiş finish_reason='stop' korunur", async () => {
    const body = sseBody([
      'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n',
      "data: [DONE]\n\n",
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })),
    );

    const { res } = mockRes();
    const usage = await forwardChatStream(
      { model: "gpt-5.5", messages: [{ role: "user", content: "selam" }], stream: true },
      res as never,
      ctx(),
    );
    expect(usage.finishReason).toBe("stop");
  });
});
