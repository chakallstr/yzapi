import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";

import { forwardChat, forwardTextEndpoint, mapModelForProvider, parseSseCompletion } from "./closerouter-service.js";
import type { ProviderContext } from "./provider-config-service.js";

// Test ProviderContext — baseUrl/apiKey match the nock expectations below
// (https://api.closerouter.dev/v1 + closerouter_test_key). modelMap drives the
// per-provider wire-name rewrite that applyProfileModelMap applies. Per-model
// routing resolves this ctx in proxy.ts; here we inject it directly so the
// forwarders no longer read any global provider config.
function ctx(modelMap: Record<string, string> = {}): ProviderContext {
  return {
    profileId: null,
    baseUrl: "https://api.closerouter.dev/v1",
    apiKey: "closerouter_test_key",
    modelMap,
    source: { baseUrl: "active_profile", apiKey: "active_profile" },
  };
}

afterEach(() => {
  nock.cleanAll();
});

describe("forwardTextEndpoint", () => {
  it("forwards /responses requests and reads input/output token usage", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/responses", (body) => body.model === "gpt-5.4-mini" && body.stream === false)
      .reply(200, {
        id: "resp_123",
        usage: { input_tokens: 100, output_tokens: 25 },
      });

    const result = await forwardTextEndpoint("responses", {
      model: "openai/gpt-5.4-mini",
      input: "Merhaba",
    }, ctx());

    expect(result.raw).toMatchObject({ id: "resp_123" });
    expect(result.usage).toMatchObject({ promptTokens: 100, completionTokens: 25 });
    // Denetim izi: sağlayıcının HAM usage'ı providerRaw'da korunur (billing'i etkilemez).
    expect(result.usage.providerRaw).toEqual({ input_tokens: 100, output_tokens: 25 });
  });

  it("forwards /messages requests and reads prompt/completion token usage", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/messages", (body) => body.model === "claude-haiku-4-5-20251001" && body.stream === false)
      .reply(200, {
        id: "msg_123",
        usage: { prompt_tokens: 60, completion_tokens: 15 },
      });

    const result = await forwardTextEndpoint("messages", {
      model: "anthropic/claude-haiku-4.5",
      messages: [{ role: "user", content: "Merhaba" }],
    }, ctx());

    expect(result.raw).toMatchObject({ id: "msg_123" });
    expect(result.usage).toMatchObject({ promptTokens: 60, completionTokens: 15 });
    // Denetim izi: sağlayıcının HAM usage'ı providerRaw'da korunur (billing'i etkilemez).
    expect(result.usage.providerRaw).toEqual({ prompt_tokens: 60, completion_tokens: 15 });
  });

  it("applies the resolved profile model_map to /messages upstream wire name", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      // upstream MUST receive the mapped nokta-form id
      .post("/v1/messages", (body) => body.model === "claude-sonnet-4.6")
      .reply(200, { id: "msg_mapped", usage: { prompt_tokens: 7, completion_tokens: 2 } });

    const result = await forwardTextEndpoint("messages", {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hi" }],
    }, ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }));

    expect(result.raw).toMatchObject({ id: "msg_mapped" });
  });
  it("throws upstream status and body when the AI provider returns an error", async () => {
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
      }, ctx()),
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
    expect(mapModelForProvider("openai/gpt-5.4-mini", "https://api.claude-popusk.shop/v1")).toBe("gpt-5.4-mini");
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
      .post("/v1/chat/completions", (body) => body.model === "gpt-5.4-mini" && body.stream === false)
      .reply(200, [
        'data: {"id":"chatcmpl_2","object":"chat.completion.chunk","model":"gpt-5.4-mini","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}',
        "data: [DONE]",
      ].join("\n\n"), { "content-type": "text/event-stream" });

    const result = await forwardChat({
      model: "openai/gpt-5.4-mini",
      messages: [{ role: "user", content: "Reply ok" }],
    }, ctx());

    expect(result.raw).toMatchObject({
      id: "chatcmpl_2",
      choices: [{ message: { content: "ok" } }],
    });
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
  });
});

describe("resolved profile model_map applied to upstream wire name", () => {
  it("sends the profile-mapped upstream model id (catalog id stays canonical in our system)", async () => {
    // The provider profile maps our canonical catalog id (tire form) to the
    // upstream wire name the provider expects (nokta form). The metro provider,
    // e.g., serves "claude-sonnet-4.6" while our catalog id is "claude-sonnet-4-6".
    // Proves applyProfileModelMap rewrites the wire model from ctx.modelMap.
    const scope = nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      // upstream MUST receive the mapped nokta-form id, not the canonical tire-form
      .post("/v1/chat/completions", (body) => body.model === "claude-sonnet-4.6")
      .reply(200, {
        id: "chatcmpl_mapped",
        usage: { prompt_tokens: 10, completion_tokens: 3 },
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      });

    const result = await forwardChat({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hi" }],
    }, ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }));

    expect(scope.isDone()).toBe(true); // upstream got the mapped id
    expect(result.raw).toMatchObject({ id: "chatcmpl_mapped" });
  });

  it("leaves the model unchanged when the profile has no mapping for it", async () => {
    const scope = nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      // gpt-5.4 is not in the map → forwarded verbatim
      .post("/v1/chat/completions", (body) => body.model === "gpt-5.4")
      .reply(200, {
        id: "chatcmpl_passthrough",
        usage: { prompt_tokens: 5, completion_tokens: 2 },
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      });

    const result = await forwardChat({
      model: "gpt-5.4",
      messages: [{ role: "user", content: "hi" }],
    }, ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }));

    expect(scope.isDone()).toBe(true);
    expect(result.raw).toMatchObject({ id: "chatcmpl_passthrough" });
  });
});
