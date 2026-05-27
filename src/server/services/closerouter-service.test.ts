import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";
import { forwardChat, forwardTextEndpoint, mapModelForProvider, parseSseCompletion } from "./closerouter-service.js";

afterEach(() => {
  nock.cleanAll();
});

describe("forwardTextEndpoint", () => {
  it("forwards /responses requests and reads input/output token usage", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/responses", (body) => body.model === "openai/gpt-5.4-mini" && body.stream === false)
      .reply(200, {
        id: "resp_123",
        usage: { input_tokens: 100, output_tokens: 25 },
      });

    const result = await forwardTextEndpoint("responses", {
      model: "openai/gpt-5.4-mini",
      input: "Merhaba",
    });

    expect(result.raw).toMatchObject({ id: "resp_123" });
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 25 });
  });

  it("forwards /messages requests and reads prompt/completion token usage", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/messages", (body) => body.model === "anthropic/claude-haiku-4.5" && body.stream === false)
      .reply(200, {
        id: "msg_123",
        usage: { prompt_tokens: 60, completion_tokens: 15 },
      });

    const result = await forwardTextEndpoint("messages", {
      model: "anthropic/claude-haiku-4.5",
      messages: [{ role: "user", content: "Merhaba" }],
    });

    expect(result.raw).toMatchObject({ id: "msg_123" });
    expect(result.usage).toEqual({ promptTokens: 60, completionTokens: 15 });
  });

  it("throws upstream status and body when CloseRouter returns an error", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/responses")
      .reply(503, {
        error: "provider unavailable",
        code: "provider_unavailable",
      });

    await expect(
      forwardTextEndpoint("responses", {
        model: "openai/gpt-5.4-mini",
        input: "Merhaba",
      }),
    ).rejects.toMatchObject({
      status: 503,
      body: {
        error: "provider unavailable",
        code: "provider_unavailable",
      },
    });
  });
});

describe("OmniRoute compatibility", () => {
  it("maps public OpenAI model id to the temporary OmniRoute GPT id", () => {
    expect(mapModelForProvider("openai/gpt-5.4-mini", "http://127.0.0.1:20128/v1")).toBe("cx/gpt-5.4-mini");
    expect(mapModelForProvider("openai/gpt-5.4-mini", "https://api.seslab.tr/v1")).toBe("cx/gpt-5.4-mini");
    expect(mapModelForProvider("openai/gpt-5.4-mini", "https://api.closerouter.dev/v1")).toBe("openai/gpt-5.4-mini");
  });

  it("parses non-stream SSE chat chunks into an OpenAI-compatible JSON response", () => {
    const parsed = parseSseCompletion([
      'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"gpt-5.4-mini","choices":[{"index":0,"delta":{"content":"o"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"gpt-5.4-mini","choices":[{"index":0,"delta":{"content":"k"},"finish_reason":"stop"}]}',
      "data: [DONE]",
    ].join("\n\n"));

    expect(parsed).toMatchObject({
      id: "chatcmpl_1",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    });
  });

  it("forwards chat when upstream returns SSE despite stream=false and estimates missing usage", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions", (body) => body.model === "openai/gpt-5.4-mini" && body.stream === false)
      .reply(200, [
        'data: {"id":"chatcmpl_2","object":"chat.completion.chunk","model":"gpt-5.4-mini","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}',
        "data: [DONE]",
      ].join("\n\n"), { "content-type": "text/event-stream" });

    const result = await forwardChat({
      model: "openai/gpt-5.4-mini",
      messages: [{ role: "user", content: "Reply ok" }],
    });

    expect(result.raw).toMatchObject({
      id: "chatcmpl_2",
      choices: [{ message: { content: "ok" } }],
    });
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });
});
