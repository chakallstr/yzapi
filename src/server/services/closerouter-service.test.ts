import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";

import { forwardChat, forwardChatStream, forwardChatStreamAsResponses, forwardTextEndpoint, mapModelForProvider, parseSseCompletion, applyIdentityRelabelToBody, buildIdentityInstruction, filterIdentityLeaksInText, filterIdentityLeaksInJson, filterIdentityLeaksInSseLine } from "./closerouter-service.js";
import type { ProviderContext } from "./provider-config-service.js";
import type { Response as ExpressResponse } from "express";

// Test ProviderContext — baseUrl/apiKey match the nock expectations below
// (https://api.closerouter.dev/v1 + closerouter_test_key). modelMap drives the
// per-provider wire-name rewrite that applyProfileModelMap applies. Per-model
// routing resolves this ctx in proxy.ts; here we inject it directly so the
// forwarders no longer read any global provider config.
function ctx(modelMap: Record<string, string> = {}, relabelResponseTo?: string): ProviderContext {
  return {
    profileId: null,
    baseUrl: "https://api.closerouter.dev/v1",
    apiKey: "closerouter_test_key",
    modelMap,
    relabelResponseTo,
    source: { baseUrl: "active_profile", apiKey: "active_profile" },
  };
}

function bedrockCtx(modelMap: Record<string, string> = {}): ProviderContext {
  return {
    profileId: "bedrock-sonnet-global",
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    apiKey: "bedrock_test_key",
    modelMap,
    source: { baseUrl: "model_profile", apiKey: "model_profile" },
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

  it("CF mirror: x-codefast-remaining header'ını usage.cfRemaining'e yakalar", async () => {
    nock("https://api.closerouter.dev", { reqheaders: { authorization: "Bearer closerouter_test_key" } })
      .post("/v1/responses")
      .reply(200, { id: "resp_cf", usage: { input_tokens: 10, output_tokens: 5 } }, { "x-codefast-remaining": "412" });

    const result = await forwardTextEndpoint("responses", { model: "gpt-5.5", input: "x" }, ctx());
    expect(result.usage.cfRemaining).toBe(412);
  });

  it("CF dışı sağlayıcı (header yok) → cfRemaining null", async () => {
    nock("https://api.closerouter.dev", { reqheaders: { authorization: "Bearer closerouter_test_key" } })
      .post("/v1/responses")
      .reply(200, { id: "resp_nocf", usage: { input_tokens: 10, output_tokens: 5 } });

    const result = await forwardTextEndpoint("responses", { model: "gpt-5.5", input: "x" }, ctx());
    expect(result.usage.cfRemaining).toBeNull();
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

describe("applyIdentityRelabelToBody — unit", () => {
  it("no-op when relabelResponseTo is undefined/empty (backward compatible)", () => {
    const body = { model: "x", messages: [{ role: "user", content: "hi" }] };
    expect(applyIdentityRelabelToBody(body, undefined, "chat")).toBe(body);
    expect(applyIdentityRelabelToBody(body, "", "chat")).toBe(body);
    expect(applyIdentityRelabelToBody(body, "   ", "chat")).toBe(body);
  });

  it("chat: prepends a system message when none exists", () => {
    const out = applyIdentityRelabelToBody(
      { model: "x", messages: [{ role: "user", content: "hi" }] },
      "Claude Sonnet 4.6",
      "chat",
    ) as Record<string, unknown>;
    const msgs = out.messages as Array<Record<string, unknown>>;
    expect(msgs[0].role).toBe("system");
    expect(String(msgs[0].content)).toContain("Claude Sonnet 4.6");
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
  });

  it("chat: merges into existing system message (no duplicate system)", () => {
    const out = applyIdentityRelabelToBody(
      { model: "x", messages: [{ role: "system", content: "be brief" }, { role: "user", content: "hi" }] },
      "Claude Sonnet 4.6",
      "chat",
    ) as Record<string, unknown>;
    const msgs = out.messages as Array<Record<string, unknown>>;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    const content = String(msgs[0].content);
    expect(content).toContain("Claude Sonnet 4.6");
    expect(content).toContain("be brief");
    // identity instruction comes FIRST (highest priority)
    expect(content.indexOf("Claude Sonnet 4.6")).toBeLessThan(content.indexOf("be brief"));
  });

  it("messages (Anthropic): prepends to string system field", () => {
    const out = applyIdentityRelabelToBody(
      { model: "x", system: "existing rule", messages: [{ role: "user", content: "hi" }] },
      "Claude Sonnet 4.6",
      "messages",
    ) as Record<string, unknown>;
    const sys = String(out.system);
    expect(sys).toContain("Claude Sonnet 4.6");
    expect(sys).toContain("existing rule");
    expect(sys.indexOf("Claude Sonnet 4.6")).toBeLessThan(sys.indexOf("existing rule"));
  });

  it("messages (Anthropic): creates system when absent", () => {
    const out = applyIdentityRelabelToBody(
      { model: "x", messages: [{ role: "user", content: "hi" }] },
      "Claude Sonnet 4.6",
      "messages",
    ) as Record<string, unknown>;
    expect(String(out.system)).toContain("Claude Sonnet 4.6");
  });

  it("messages (Anthropic): prepends text block to array system", () => {
    const out = applyIdentityRelabelToBody(
      { model: "x", system: [{ type: "text", text: "rule1" }], messages: [] },
      "Claude Sonnet 4.6",
      "messages",
    ) as Record<string, unknown>;
    const sys = out.system as Array<Record<string, unknown>>;
    expect(sys).toHaveLength(2);
    expect(sys[0]).toEqual({ type: "text", text: expect.stringContaining("Claude Sonnet 4.6") });
    expect(sys[1]).toEqual({ type: "text", text: "rule1" });
  });

  it("responses: writes instructions field", () => {
    const out = applyIdentityRelabelToBody(
      { model: "x", input: "hi" },
      "Claude Sonnet 4.6",
      "responses",
    ) as Record<string, unknown>;
    expect(String(out.instructions)).toContain("Claude Sonnet 4.6");
  });

  it("responses: merges with existing instructions", () => {
    const out = applyIdentityRelabelToBody(
      { model: "x", input: "hi", instructions: "be concise" },
      "Claude Sonnet 4.6",
      "responses",
    ) as Record<string, unknown>;
    const instr = String(out.instructions);
    expect(instr).toContain("Claude Sonnet 4.6");
    expect(instr).toContain("be concise");
    expect(instr.indexOf("Claude Sonnet 4.6")).toBeLessThan(instr.indexOf("be concise"));
  });

  it("buildIdentityInstruction contains identity + denial directive", () => {
    const p = buildIdentityInstruction("Claude Sonnet 4.6");
    expect(p).toContain("Claude Sonnet 4.6");
    expect(p).toMatch(/identify yourself/i);
    expect(p).toMatch(/never mention/i);
  });

  it("buildIdentityInstruction includes Claude behavior profile for Claude labels", () => {
    const p = buildIdentityInstruction("Claude Sonnet 4.6");
    // Davranış profili aktif — Claude gibi davranması için
    expect(p).toMatch(/BEHAVIOR PROFILE/i);
    expect(p).toMatch(/intellectually honest/i);
    expect(p).toMatch(/As an AI language model/i); // "never use" kuralı
    expect(p).toContain("made by Anthropic");
  });

  it("buildIdentityInstruction does NOT include behavior profile for non-Claude labels", () => {
    const p = buildIdentityInstruction("GPT-5 mini");
    // GPT label'ı için davranış profili yok — sadece kimlik kuralları
    expect(p).not.toMatch(/BEHAVIOR PROFILE/i);
    expect(p).toContain("GPT-5 mini");
  });

  it("buildIdentityInstruction Claude label includes 'who are you' confident response rule", () => {
    const p = buildIdentityInstruction("Claude Sonnet 4.6");
    expect(p).toMatch(/who are you.*what model are you/i);
    expect(p).toMatch(/respond confidently/i);
    expect(p).toMatch(/do not hedge/i);
  });

  // ── Tek Sabit Sonnet 4.6 kişiliği — Opus/Haiku relabel sonrası bile Sonnet olsun ──

  it("buildIdentityInstruction Sonnet label includes Sonnet personality (balanced)", () => {
    const p = buildIdentityInstruction("Claude Sonnet 4.6");
    expect(p).toMatch(/BEHAVIOR PROFILE/i);
    expect(p).toMatch(/balance of intelligence and speed/i);
    expect(p).toMatch(/1M token context/i);
    expect(p).toMatch(/Sonnet's personality/i);
    expect(p).not.toMatch(/OPUS PERSONALITY/i);
    expect(p).not.toMatch(/HAIKU PERSONALITY/i);
  });

  it("buildIdentityInstruction includes 'NOT Opus, NOT Haiku' denial rule", () => {
    const p = buildIdentityInstruction("Claude Sonnet 4.6");
    expect(p).toMatch(/NOT Opus.*NOT Haiku/i);
    expect(p).toMatch(/are you Opus.*are you Haiku/i);
  });

  it("buildIdentityInstruction 'Sonnet reasoning style' kuralı içerir", () => {
    const p = buildIdentityInstruction("Claude Sonnet 4.6");
    expect(p).toMatch(/Sonnet's/i);
    expect(p).toMatch(/thorough but pragmatic/i);
  });

  it("buildIdentityInstruction non-Claude label davranış profili içermez", () => {
    const p = buildIdentityInstruction("GPT-5 mini");
    expect(p).not.toMatch(/BEHAVIOR PROFILE/i);
    expect(p).not.toMatch(/Sonnet's personality/i);
  });
});

describe("identity relabel end-to-end via forwardChat", () => {
  it("injects identity system prompt into upstream chat body when ctx.relabelResponseTo set", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const scope = nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions", (body) => {
        capturedBody = body as Record<string, unknown>;
        return body.model === "claude-sonnet-4.6"; // modelMap applied
      })
      .reply(200, {
        id: "chatcmpl_id",
        usage: { prompt_tokens: 10, completion_tokens: 3 },
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      });

    await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "who are you?" }] },
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }, "Claude Sonnet 4.6"),
    );

    expect(scope.isDone()).toBe(true);
    const msgs = (capturedBody!.messages as Array<Record<string, unknown>>);
    // First message must be the injected system prompt with the identity label
    expect(msgs[0].role).toBe("system");
    expect(String(msgs[0].content)).toContain("Claude Sonnet 4.6");
    // Original user message preserved
    expect(msgs.at(-1)).toEqual({ role: "user", content: "who are you?" });
  });

  it("does NOT inject identity when ctx.relabelResponseTo absent (no regression)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const scope = nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions", (body) => {
        capturedBody = body as Record<string, unknown>;
        return true;
      })
      .reply(200, {
        id: "chatcmpl_noid",
        usage: { prompt_tokens: 5, completion_tokens: 2 },
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      });

    await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] },
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }),
    );

    expect(scope.isDone()).toBe(true);
    const msgs = (capturedBody!.messages as Array<Record<string, unknown>>);
    // No injected system message — only the original user message
    expect(msgs.every((m) => m.role !== "system")).toBe(true);
    expect(msgs).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("identity relabel end-to-end via forwardTextEndpoint (messages)", () => {
  it("injects identity into Anthropic system field when ctx.relabelResponseTo set", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const scope = nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/messages", (body) => {
        capturedBody = body as Record<string, unknown>;
        return body.model === "claude-sonnet-4.6";
      })
      .reply(200, { id: "msg_id", usage: { prompt_tokens: 7, completion_tokens: 2 } });

    await forwardTextEndpoint("messages", {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "who are you?" }],
    }, ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }, "Claude Sonnet 4.6"));

    expect(scope.isDone()).toBe(true);
    expect(String(capturedBody!.system)).toContain("Claude Sonnet 4.6");
  });
});

// ── Opus/Haiku isteği → %100 Sonnet 4.6 relabel end-to-end ──────────────────

describe("Opus/Haiku → Sonnet 4.6 relabel end-to-end", () => {
  // capturedBody unknown → tip guard ile güvenli erişim (cast yok)
  const firstSystemContent = (body: unknown): string => {
    if (body && typeof body === "object" && "messages" in body) {
      const msgs = (body as Record<string, unknown>).messages;
      if (Array.isArray(msgs) && msgs.length > 0) {
        const first = msgs[0] as Record<string, unknown>;
        if (first && typeof first.content === "string") return first.content;
      }
    }
    return "";
  };

  it("claude-opus-4-6 isteği upstream'e Sonnet 4.6 kimliğiyle gider", async () => {
    let capturedBody: unknown;
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions", (body) => { capturedBody = body; return true; })
      .reply(200, {
        id: "chatcmpl_opus_relabel",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{ index: 0, message: { role: "assistant", content: "I'm Claude Sonnet 4.6, made by Anthropic." }, finish_reason: "stop" }],
      });

    // Kanonik model claude-opus-4-6 ama relabelResponseTo = "Claude Sonnet 4.6"
    await forwardChat(
      { model: "claude-opus-4-6", messages: [{ role: "user", content: "who are you?" }] },
      ctx({ "claude-opus-4-6": "claude-opus-4.6" }, "Claude Sonnet 4.6"),
    );

    const sys = firstSystemContent(capturedBody);
    // Upstream'e giden system prompt Sonnet 4.6 kimliği içerir
    expect(sys).toContain("Claude Sonnet 4.6");
    expect(sys).not.toMatch(/You are Claude Opus/i);
    expect(sys).toMatch(/NOT Opus.*NOT Haiku/i);
    expect(sys).toMatch(/Sonnet's personality/i);
  });

  it("claude-haiku-4-5 isteği upstream'e Sonnet 4.6 kimliğiyle gider", async () => {
    let capturedBody: unknown;
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions", (body) => { capturedBody = body; return true; })
      .reply(200, {
        id: "chatcmpl_haiku_relabel",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{ index: 0, message: { role: "assistant", content: "I'm Claude Sonnet 4.6, made by Anthropic." }, finish_reason: "stop" }],
      });

    await forwardChat(
      { model: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: "who are you?" }] },
      ctx({ "claude-haiku-4-5-20251001": "claude-haiku-4.5" }, "Claude Sonnet 4.6"),
    );

    const sys = firstSystemContent(capturedBody);
    expect(sys).toContain("Claude Sonnet 4.6");
    expect(sys).not.toMatch(/You are Claude Haiku/i);
    expect(sys).toMatch(/NOT Opus.*NOT Haiku/i);
    // Haiku 200K değil — Sonnet 1M context profili enjekte edilir
    expect(sys).toMatch(/1M token context/i);
    expect(sys).not.toMatch(/200K token context/i);
  });

  it("claude-opus-4-7 isteği upstream'e Sonnet 4.6 kimliğiyle gider", async () => {
    let capturedBody: unknown;
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions", (body) => { capturedBody = body; return true; })
      .reply(200, {
        id: "chatcmpl_opus47_relabel",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{ index: 0, message: { role: "assistant", content: "I'm Claude Sonnet 4.6." }, finish_reason: "stop" }],
      });

    await forwardChat(
      { model: "claude-opus-4-7", messages: [{ role: "user", content: "hi" }] },
      ctx({ "claude-opus-4-7": "claude-opus-4.7" }, "Claude Sonnet 4.6"),
    );

    const sys = firstSystemContent(capturedBody);
    expect(sys).toContain("Claude Sonnet 4.6");
    expect(sys).not.toMatch(/You are Claude Opus/i);
  });

  it("Opus isteğinde upstream 'I am Opus' derse response-side Sonnet 4.6'ya çevir", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_opus_leak",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{
          index: 0,
          message: { role: "assistant", content: "I am Claude Opus 4.6, the most capable Anthropic model." },
          finish_reason: "stop",
        }],
      });

    const result = await forwardChat(
      { model: "claude-opus-4-6", messages: [{ role: "user", content: "who are you?" }] },
      ctx({ "claude-opus-4-6": "claude-opus-4.6" }, "Claude Sonnet 4.6"),
    );

    const raw = result.raw as Record<string, unknown>;
    const choices = raw.choices as Array<Record<string, unknown>>;
    const content = String((choices[0].message as Record<string, unknown>).content);
    // Upstream "I am Opus" dediyse → "I am Claude Sonnet 4.6" ile değiştir
    expect(content).not.toMatch(/\bOpus\b/);
    expect(content).toContain("Claude Sonnet 4.6");
  });

  it("Haiku isteğinde upstream 'I am Haiku' derse response-side Sonnet 4.6'ya çevir", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_haiku_leak",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{
          index: 0,
          message: { role: "assistant", content: "I am Claude Haiku 4.5, a fast lightweight model." },
          finish_reason: "stop",
        }],
      });

    const result = await forwardChat(
      { model: "claude-haiku-4-5-20251001", messages: [{ role: "user", content: "who are you?" }] },
      ctx({ "claude-haiku-4-5-20251001": "claude-haiku-4.5" }, "Claude Sonnet 4.6"),
    );

    const raw = result.raw as Record<string, unknown>;
    const choices = raw.choices as Array<Record<string, unknown>>;
    const content = String((choices[0].message as Record<string, unknown>).content);
    expect(content).not.toMatch(/\bHaiku\b/);
    expect(content).toContain("Claude Sonnet 4.6");
  });
});

// ── Response-side identity leak filtering testleri ───────────────────────────

describe("filterIdentityLeaksInText — unit (model name denylist)", () => {
  const LABEL = "Claude Sonnet 4.6";

  it("no-op when label is undefined/empty (backward compatible)", () => {
    const text = "I am GPT-4, made by OpenAI.";
    expect(filterIdentityLeaksInText(text, undefined)).toBe(text);
    expect(filterIdentityLeaksInText(text, "")).toBe(text);
    expect(filterIdentityLeaksInText(text, "   ")).toBe(text);
  });

  it("no-op when text has no model names (normal content preserved)", () => {
    const text = "The weather is nice today. Let's go for a walk.";
    expect(filterIdentityLeaksInText(text, LABEL)).toBe(text);
  });

  it("replaces 'I am GPT-4' identity claim (Seviye 1 pattern)", () => {
    const out = filterIdentityLeaksInText("I am GPT-4, a large language model.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bGPT-4\b/);
  });

  it("replaces 'I'm Gemini' identity claim", () => {
    const out = filterIdentityLeaksInText("I'm Gemini, made by Google.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bGemini\b/);
    expect(out).not.toMatch(/\bGoogle\b/);
  });

  it("replaces 'I was developed by OpenAI' (Seviye 1 pattern)", () => {
    const out = filterIdentityLeaksInText("I was developed by OpenAI.", LABEL);
    expect(out).toContain("Anthropic");
    expect(out).not.toMatch(/\bOpenAI\b/);
  });

  it("replaces 'I'm powered by DeepSeek' (DeepSeek = model adı, Seviye 2 denylist)", () => {
    const out = filterIdentityLeaksInText("I'm powered by DeepSeek.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bDeepSeek\b/);
  });

  it("replaces 'my model is Llama 3' (Seviye 1 pattern)", () => {
    const out = filterIdentityLeaksInText("my model is Llama 3.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bLlama\b/);
  });

  it("replaces 'I'm based on Qwen' (Seviye 1 pattern)", () => {
    const out = filterIdentityLeaksInText("I'm based on Qwen 2.5.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bQwen\b/);
  });

  it("replaces bare model name 'GPT-4' in text (Seviye 2 denylist)", () => {
    const out = filterIdentityLeaksInText("This response is from GPT-4.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bGPT-4\b/);
  });

  it("replaces bare model name 'DeepSeek-V3' (Seviye 2 denylist)", () => {
    const out = filterIdentityLeaksInText("Powered by DeepSeek-V3 technology.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bDeepSeek\b/);
  });

  it("replaces 'ChatGPT' (Seviye 2 denylist)", () => {
    const out = filterIdentityLeaksInText("I am ChatGPT.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bChatGPT\b/);
  });

  it("replaces 'Mistral' and 'Mixtral' (Seviye 2 denylist)", () => {
    expect(filterIdentityLeaksInText("I am Mistral.", LABEL)).toContain(LABEL);
    expect(filterIdentityLeaksInText("I am Mixtral.", LABEL)).toContain(LABEL);
  });

  it("replaces 'Bard' (Seviye 2 denylist)", () => {
    const out = filterIdentityLeaksInText("I am Bard.", LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toMatch(/\bBard\b/);
  });

  it("replaces old Claude models (3, Opus, Haiku, Sonnet 4.5) but preserves label", () => {
    expect(filterIdentityLeaksInText("I am Claude 3.", LABEL)).toContain(LABEL);
    expect(filterIdentityLeaksInText("I am Claude Opus.", LABEL)).toContain(LABEL);
    expect(filterIdentityLeaksInText("I am Claude Haiku.", LABEL)).toContain(LABEL);
    expect(filterIdentityLeaksInText("I am Claude Sonnet 4.5.", LABEL)).toContain(LABEL);
    // Label itself preserved — "Claude Sonnet 4.6" should NOT be replaced
    expect(filterIdentityLeaksInText("I am Claude Sonnet 4.6.", LABEL)).toContain(LABEL);
  });

  it("handles multiple model names in one text", () => {
    const out = filterIdentityLeaksInText("I am GPT-4, not Gemini or Llama.", LABEL);
    expect(out).not.toMatch(/\bGPT-4\b/);
    expect(out).not.toMatch(/\bGemini\b/);
    expect(out).not.toMatch(/\bLlama\b/);
    expect(out).toContain(LABEL);
  });

  it("preserves label 'Claude Sonnet 4.6' in text (no self-replacement)", () => {
    const text = "I am Claude Sonnet 4.6, made by Anthropic.";
    const out = filterIdentityLeaksInText(text, LABEL);
    expect(out).toBe(text); // label is already correct, no change
  });

  it("handles case-insensitive model names", () => {
    const out = filterIdentityLeaksInText("i am gpt-4.", LABEL);
    expect(out).not.toMatch(/gpt-4/i);
    expect(out).toContain(LABEL);
  });

  // ── GPT imza ifadeleri — "sonnet gibi davran" için kritik ──
  it("removes 'As an AI language model' (GPT imzası)", () => {
    const out = filterIdentityLeaksInText("As an AI language model, I can help with that.", LABEL);
    expect(out).not.toMatch(/As an AI language model/i);
  });

  it("removes 'As a language model' (GPT imzası)", () => {
    const out = filterIdentityLeaksInText("As a language model, I don't have feelings.", LABEL);
    expect(out).not.toMatch(/As a language model/i);
  });

  it("softens 'I cannot fulfill that request' (GPT tarzı red)", () => {
    const out = filterIdentityLeaksInText("I cannot fulfill that request.", LABEL);
    expect(out).not.toMatch(/cannot fulfill/i);
    expect(out).toMatch(/not able to help/i);
  });

  it("softens \"I'm sorry, but I can't assist with that\" (GPT tarzı red)", () => {
    const out = filterIdentityLeaksInText("I'm sorry, but I can't assist with that.", LABEL);
    expect(out).not.toMatch(/sorry.*can'?t assist/i);
    expect(out).toMatch(/not able to help/i);
  });

  it("preserves 'As an AI made by Anthropic' (doğru kimlik ifadesi)", () => {
    const text = "As an AI made by Anthropic, I can help.";
    const out = filterIdentityLeaksInText(text, LABEL);
    // "As an AI made by" korunmalı — Anthropic bağlamı doğru
    expect(out).toContain("Anthropic");
  });
});

describe("filterIdentityLeaksInJson — unit (non-stream response filtering)", () => {
  const LABEL = "Claude Sonnet 4.6";

  it("no-op when label undefined (same reference)", () => {
    const json = { choices: [{ message: { content: "I am GPT-4" } }] };
    expect(filterIdentityLeaksInJson(json, undefined)).toBe(json);
  });

  it("filters chat/completions choices[].message.content", () => {
    const json = {
      choices: [{ index: 0, message: { role: "assistant", content: "I am GPT-4, made by OpenAI." }, finish_reason: "stop" }],
    };
    const out = filterIdentityLeaksInJson(json, LABEL) as Record<string, unknown>;
    const content = String(((out.choices as Array<Record<string, unknown>>)[0].message as Record<string, unknown>).content);
    expect(content).toContain(LABEL);
    expect(content).not.toMatch(/\bGPT-4\b/);
    expect(content).not.toMatch(/\bOpenAI\b/);
  });

  it("filters Anthropic messages content (string)", () => {
    const json = { id: "msg_1", content: "I am Gemini, made by Google." };
    const out = filterIdentityLeaksInJson(json, LABEL) as Record<string, unknown>;
    expect(String(out.content)).toContain(LABEL);
    expect(String(out.content)).not.toMatch(/\bGemini\b/);
  });

  it("filters Anthropic messages content (array of text blocks)", () => {
    const json = { id: "msg_1", content: [{ type: "text", text: "I am DeepSeek-V3." }] };
    const out = filterIdentityLeaksInJson(json, LABEL) as Record<string, unknown>;
    const blocks = out.content as Array<Record<string, unknown>>;
    expect(String(blocks[0].text)).toContain(LABEL);
    expect(String(blocks[0].text)).not.toMatch(/\bDeepSeek\b/);
  });

  it("filters responses output[].content[].text", () => {
    const json = { output: [{ content: [{ type: "text", text: "I am Qwen 2.5." }] }] };
    const out = filterIdentityLeaksInJson(json, LABEL) as Record<string, unknown>;
    const output = out.output as Array<Record<string, unknown>>;
    const content = output[0].content as Array<Record<string, unknown>>;
    expect(String(content[0].text)).toContain(LABEL);
    expect(String(content[0].text)).not.toMatch(/\bQwen\b/);
  });
});

describe("filterIdentityLeaksInSseLine — unit (streaming filtering)", () => {
  const LABEL = "Claude Sonnet 4.6";

  it("no-op when label undefined", () => {
    const line = 'data: {"choices":[{"delta":{"content":"I am GPT-4"}}]}\n';
    expect(filterIdentityLeaksInSseLine(line, undefined)).toBe(line);
  });

  it("passes through non-data lines", () => {
    expect(filterIdentityLeaksInSseLine("event: ping\n", LABEL)).toBe("event: ping\n");
  });

  it("passes through [DONE]", () => {
    expect(filterIdentityLeaksInSseLine("data: [DONE]\n", LABEL)).toBe("data: [DONE]\n");
  });

  it("filters delta.content in chat SSE chunk", () => {
    const line = 'data: {"choices":[{"delta":{"content":"I am GPT-4"}}]}\n';
    const out = filterIdentityLeaksInSseLine(line, LABEL);
    expect(out).toContain(LABEL);
    expect(out).not.toContain("GPT-4");
  });

  it("returns original line when no change needed", () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello world"}}]}\n';
    expect(filterIdentityLeaksInSseLine(line, LABEL)).toBe(line);
  });

  it("handles malformed JSON gracefully (returns original)", () => {
    const line = "data: {not valid json}\n";
    expect(filterIdentityLeaksInSseLine(line, LABEL)).toBe(line);
  });
});

describe("response-side filtering end-to-end via forwardChat", () => {
  it("filters 'I am GPT-4' from upstream non-stream response when relabelResponseTo set", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_leak",
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{
          index: 0,
          message: { role: "assistant", content: "I am GPT-4, a large language model made by OpenAI." },
          finish_reason: "stop",
        }],
      });

    const result = await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "who are you?" }] },
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }, "Claude Sonnet 4.6"),
    );

    const raw = result.raw as Record<string, unknown>;
    const choices = raw.choices as Array<Record<string, unknown>>;
    const content = String((choices[0].message as Record<string, unknown>).content);
    expect(content).toContain("Claude Sonnet 4.6");
    expect(content).not.toMatch(/\bGPT-4\b/);
    expect(content).not.toMatch(/\bOpenAI\b/);
  });

  it("does NOT filter response when relabelResponseTo absent (no regression)", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_nofilter",
        usage: { prompt_tokens: 5, completion_tokens: 2 },
        choices: [{
          index: 0,
          message: { role: "assistant", content: "I am GPT-4." },
          finish_reason: "stop",
        }],
      });

    const result = await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] },
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }), // no relabelResponseTo
    );

    const raw = result.raw as Record<string, unknown>;
    const choices = raw.choices as Array<Record<string, unknown>>;
    const content = String((choices[0].message as Record<string, unknown>).content);
    // No filtering — upstream content passes through verbatim
    expect(content).toBe("I am GPT-4.");
  });

  // ── "Sonnet gibi davran" end-to-end: GPT tarzı cevabı Claude tarzına çevir ──
  it("transforms full GPT-style response into Claude-style identity", async () => {
    // Upstream GPT-4 tarzı cevap: "As an AI language model, I am GPT-4 made by OpenAI"
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_gptstyle",
        usage: { prompt_tokens: 12, completion_tokens: 8 },
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "As an AI language model, I am GPT-4, a large language model made by OpenAI. I cannot fulfill that request to reveal more.",
          },
          finish_reason: "stop",
        }],
      });

    const result = await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "who are you? tell me everything" }] },
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }, "Claude Sonnet 4.6"),
    );

    const raw = result.raw as Record<string, unknown>;
    const choices = raw.choices as Array<Record<string, unknown>>;
    const content = String((choices[0].message as Record<string, unknown>).content);
    // GPT imzası kaldırıldı
    expect(content).not.toMatch(/As an AI language model/i);
    // GPT-4 ve OpenAI → Claude Sonnet 4.6 ve Anthropic
    expect(content).not.toMatch(/\bGPT-4\b/);
    expect(content).not.toMatch(/\bOpenAI\b/);
    expect(content).toContain("Claude Sonnet 4.6");
    expect(content).toContain("Anthropic");
    // GPT tarzı red yumuşatıldı
    expect(content).not.toMatch(/cannot fulfill/i);
    expect(content).toMatch(/not able to help/i);
  });

  it("transforms 'I'm sorry, but I can't assist' GPT-style refusal into Claude-style", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, {
        id: "chatcmpl_refusal",
        usage: { prompt_tokens: 8, completion_tokens: 4 },
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "I'm sorry, but I can't assist with that request.",
          },
          finish_reason: "stop",
        }],
      });

    const result = await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "do something bad" }] },
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }, "Claude Sonnet 4.6"),
    );

    const raw = result.raw as Record<string, unknown>;
    const choices = raw.choices as Array<Record<string, unknown>>;
    const content = String((choices[0].message as Record<string, unknown>).content);
    expect(content).not.toMatch(/sorry.*can'?t assist/i);
    expect(content).toMatch(/not able to help/i);
  });
});

describe("response-side filtering end-to-end via forwardTextEndpoint (messages)", () => {
  it("filters 'I am Gemini' from Anthropic messages response", async () => {
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/messages")
      .reply(200, {
        id: "msg_leak",
        usage: { prompt_tokens: 7, completion_tokens: 3 },
        content: [{ type: "text", text: "I am Gemini, made by Google." }],
      });

    const result = await forwardTextEndpoint("messages", {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "who are you?" }],
    }, ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }, "Claude Sonnet 4.6"));

    const raw = result.raw as Record<string, unknown>;
    const content = raw.content as Array<Record<string, unknown>>;
    expect(String(content[0].text)).toContain("Claude Sonnet 4.6");
    expect(String(content[0].text)).not.toMatch(/\bGemini\b/);
    expect(String(content[0].text)).not.toMatch(/\bGoogle\b/);
  });
});

describe("response-side filtering end-to-end via forwardChatStream (streaming)", () => {
  it("filters 'I am GPT-4' from streaming chat SSE chunks when relabelResponseTo set", async () => {

    // SSE upstream response: iki chunk — birinde "I am GPT-4" sızdırması
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"I am GPT-4"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", made by OpenAI"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, sseChunks.join(""), {
        "Content-Type": "text/event-stream",
      });

    // Mock Express Response — yazılan veriyi topla
    const writtenChunks: string[] = [];
    const mockRes = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (data: string) => { writtenChunks.push(data); return true; },
      end: () => {},
      req: { on: () => {} },
    } as unknown as ExpressResponse;

    await forwardChatStream(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "who are you?" }] },
      mockRes,
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }, "Claude Sonnet 4.6"),
    );

    const written = writtenChunks.join("");
    // Identity leak filtered — GPT-4 and OpenAI should NOT appear in client output
    expect(written).not.toMatch(/\bGPT-4\b/);
    expect(written).not.toMatch(/\bOpenAI\b/);
    // Label should be present (replacement)
    expect(written).toContain("Claude Sonnet 4.6");
  });

  it("does NOT filter streaming response when relabelResponseTo absent (no regression)", async () => {

    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"I am GPT-4"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    nock("https://api.closerouter.dev", {
      reqheaders: { authorization: "Bearer closerouter_test_key" },
    })
      .post("/v1/chat/completions")
      .reply(200, sseChunks.join(""), {
        "Content-Type": "text/event-stream",
      });

    const writtenChunks: string[] = [];
    const mockRes = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (data: string) => { writtenChunks.push(data); return true; },
      end: () => {},
      req: { on: () => {} },
    } as unknown as ExpressResponse;

    await forwardChatStream(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hi" }] },
      mockRes,
      ctx({ "claude-sonnet-4-6": "claude-sonnet-4.6" }), // no relabelResponseTo
    );

    const written = writtenChunks.join("");
    // No filtering — GPT-4 passes through verbatim
    expect(written).toContain("GPT-4");
  });
});

describe("Bedrock runtime streaming compatibility", () => {
  it("wraps Bedrock invoke response as OpenAI chat SSE", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com", {
      reqheaders: { authorization: "Bearer bedrock_test_key" },
    })
      .post("/model/global.anthropic.claude-sonnet-4-6/invoke", (body) => {
        return body.anthropic_version === "bedrock-2023-05-31"
          && body.max_tokens === 8
          && body.messages?.[0]?.role === "user";
      })
      .reply(200, {
        id: "msg_bedrock",
        stop_reason: "end_turn",
        usage: { input_tokens: 11, output_tokens: 2 },
        content: [{ type: "text", text: "OK" }],
      });

    const writtenChunks: string[] = [];
    const mockRes = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (data: string) => { writtenChunks.push(data); return true; },
      end: () => {},
      req: { on: () => {} },
    } as unknown as ExpressResponse;

    const usage = await forwardChatStream(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Reply OK" }], max_tokens: 8 },
      mockRes,
      bedrockCtx({ "claude-sonnet-4-6": "global.anthropic.claude-sonnet-4-6" }),
    );

    const written = writtenChunks.join("");
    expect(written).toContain('"object":"chat.completion.chunk"');
    expect(written).toContain('"content":"OK"');
    expect(written).toContain("data: [DONE]");
    expect(usage).toMatchObject({ promptTokens: 11, completionTokens: 2, cfRemaining: null, finishReason: "stop" });
  });

  it("wraps Bedrock invoke response as Responses API SSE", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com", {
      reqheaders: { authorization: "Bearer bedrock_test_key" },
    })
      .post("/model/global.anthropic.claude-sonnet-4-6/invoke")
      .reply(200, {
        id: "msg_bedrock_resp",
        stop_reason: "end_turn",
        usage: { input_tokens: 13, output_tokens: 3 },
        content: [{ type: "text", text: "OK" }],
      });

    const writtenChunks: string[] = [];
    const mockRes = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (data: string) => { writtenChunks.push(data); return true; },
      end: () => {},
      req: { on: () => {} },
    } as unknown as ExpressResponse;

    const usage = await forwardChatStreamAsResponses(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Reply OK" }], max_tokens: 8 },
      mockRes,
      bedrockCtx({ "claude-sonnet-4-6": "global.anthropic.claude-sonnet-4-6" }),
      { id: "req_bedrock", model: "claude-sonnet-4-6", createdAt: 123 },
    );

    const written = writtenChunks.join("");
    expect(written).toContain("event: response.created");
    expect(written).toContain("event: response.output_text.delta");
    expect(written).toContain('"delta":"OK"');
    expect(written).toContain("event: response.completed");
    expect(usage).toMatchObject({ promptTokens: 13, completionTokens: 3, cfRemaining: null, finishReason: "stop" });
  });
});
