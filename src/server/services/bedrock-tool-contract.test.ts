// Bedrock Anthropic araç sözleşmesi — BR1..BR9.
//
// NEDEN: Sonnet 4.6 sınırsız paketleri istekleri Bedrock inference-profile
// lane'lerine gönderiyor. Bedrock dalı OpenAI-şekilli araç şemasını çevirmeden
// gönderiyordu (ValidationException) ve dönüşte `tool_use` bloklarını sessizce
// düşürüyordu — istemci boş tur görüyor, istek "success" sayılıp faturalanıyordu.
// Müşteri ekranındaki "araç çağrısı hiçbir şey yapmıyor" belirtisi bu sınıftandır.
//
// PRESERVATION: /v1/messages Anthropic-native gövdesi Bedrock'un beklediği şekildir;
// bu dosyadaki "dokunulmaz" testleri o gövdenin bit-bit korunduğunu kanıtlar.

import { afterEach, describe, expect, it } from "vitest";
import nock from "nock";

import {
  buildBedrockAnthropicBody,
  bedrockAnthropicToChatCompletion,
  bedrockToolsFromRequest,
  bedrockToolChoiceFromRequest,
  forwardChat,
  forwardChatStream,
  forwardChatStreamAsResponses,
  forwardTextEndpoint,
} from "./closerouter-service.js";
import { chatCompletionToResponses } from "./responses-translation.js";
import type { ProviderContext } from "./provider-config-service.js";
import type { Response as ExpressResponse } from "express";

const UPSTREAM_MODEL = "global.anthropic.claude-sonnet-4-6";

function bedrockCtx(relabelResponseTo?: string): ProviderContext {
  return {
    profileId: "bedrock-sonnet-global",
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    apiKey: "bedrock_test_key",
    modelMap: { "claude-sonnet-4-6": UPSTREAM_MODEL },
    relabelResponseTo,
    source: { baseUrl: "model_profile", apiKey: "model_profile" },
  };
}

function collectingRes(chunks: string[]): ExpressResponse {
  return {
    setHeader: () => {},
    flushHeaders: () => {},
    write: (data: string) => { chunks.push(data); return true; },
    end: () => {},
    req: { on: () => {} },
  } as unknown as ExpressResponse;
}

const OPENAI_TOOL = {
  type: "function",
  function: {
    name: "write_file",
    description: "Dosyaya yaz",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, contents: { type: "string" } },
      required: ["path"],
    },
  },
};

afterEach(() => {
  nock.cleanAll();
});

// ── Araç şeması çevirisi ──────────────────────────────────────────────────────

describe("BR1 — bedrockToolsFromRequest", () => {
  it("OpenAI function şemasını Anthropic input_schema'ya çevirir", () => {
    expect(bedrockToolsFromRequest([OPENAI_TOOL])).toEqual([{
      name: "write_file",
      description: "Dosyaya yaz",
      input_schema: OPENAI_TOOL.function.parameters,
    }]);
  });

  it("Anthropic şemasına DOKUNMAZ (/v1/messages gövdesi)", () => {
    const anthropicTool = {
      name: "Bash",
      description: "Komut çalıştır",
      input_schema: { type: "object", properties: { command: { type: "string" } } },
    };
    const out = bedrockToolsFromRequest([anthropicTool]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(anthropicTool); // aynı referans → hiç kopyalanmadı
  });

  it("parameters yoksa boş ama GEÇERLİ şema üretir", () => {
    const out = bedrockToolsFromRequest([{ type: "function", function: { name: "now" } }]);
    expect(out).toEqual([{ name: "now", input_schema: { type: "object", properties: {} } }]);
  });

  it("Bedrock'un kabul etmediği yerleşik tipleri düşürür", () => {
    const out = bedrockToolsFromRequest([
      { type: "web_search" },
      { type: "image_generation" },
      { type: "local_shell" },
      { type: "custom", name: "apply_patch" },
      OPENAI_TOOL,
    ]);
    expect(out.map((t) => t.name)).toEqual(["write_file"]);
  });

  it("bozuk girdilerde çökmez", () => {
    expect(bedrockToolsFromRequest([null, undefined, 42, "x", {}, { type: "function" }])).toEqual([]);
  });
});

describe("BR2 — bedrockToolChoiceFromRequest", () => {
  it("OpenAI string biçimlerini çevirir", () => {
    expect(bedrockToolChoiceFromRequest("auto")).toEqual({ type: "auto" });
    expect(bedrockToolChoiceFromRequest("required")).toEqual({ type: "any" });
    expect(bedrockToolChoiceFromRequest("any")).toEqual({ type: "any" });
  });

  it("araç zorlamayan biçimler için alan üretmez", () => {
    expect(bedrockToolChoiceFromRequest("none")).toBeUndefined();
    expect(bedrockToolChoiceFromRequest({ type: "none" })).toBeUndefined();
    expect(bedrockToolChoiceFromRequest(undefined)).toBeUndefined();
    expect(bedrockToolChoiceFromRequest("saçma")).toBeUndefined();
  });

  it("belirli aracı zorlamayı Anthropic şekline çevirir", () => {
    expect(bedrockToolChoiceFromRequest({ type: "function", function: { name: "write_file" } }))
      .toEqual({ type: "tool", name: "write_file" });
  });

  it("Anthropic-native seçimi olduğu gibi bırakır", () => {
    expect(bedrockToolChoiceFromRequest({ type: "tool", name: "Bash" })).toEqual({ type: "tool", name: "Bash" });
    expect(bedrockToolChoiceFromRequest({ type: "any" })).toEqual({ type: "any" });
  });
});

// ── Gövde kurulumu ────────────────────────────────────────────────────────────

describe("BR3 — buildBedrockAnthropicBody: araçlar", () => {
  it("OpenAI araçlarını çevirip gönderir", () => {
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "dosyayı yaz" }],
      tools: [OPENAI_TOOL],
      tool_choice: "auto",
    } as never);

    expect(body.tools).toEqual([{
      name: "write_file",
      description: "Dosyaya yaz",
      input_schema: OPENAI_TOOL.function.parameters,
    }]);
    expect(body.tool_choice).toEqual({ type: "auto" });
  });

  it("hiçbir araç çevrilemediyse tools DA tool_choice DA gönderilmez", () => {
    // "araç yok ama araç zorunlu" gövdesi Bedrock'ta 400 ValidationException'dır.
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "ara" }],
      tools: [{ type: "web_search" }],
      tool_choice: "required",
    } as never);

    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
  });

  it("araç yoksa tool_choice tek başına gönderilmez", () => {
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "selam" }],
      tool_choice: "required",
    } as never);
    expect(body).not.toHaveProperty("tool_choice");
  });
});

describe("BR4 — buildBedrockAnthropicBody: araç geçmişi", () => {
  it("assistant.tool_calls'ı tool_use bloklarına çevirir", () => {
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "listele" },
        {
          role: "assistant",
          content: "Bakıyorum.",
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "list_dir", arguments: '{"path":"."}' },
          }],
        },
      ],
    } as never);

    const assistant = (body.messages as Array<Record<string, unknown>>)[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toEqual([
      { type: "text", text: "Bakıyorum." },
      { type: "tool_use", id: "call_1", name: "list_dir", input: { path: "." } },
    ]);
  });

  it("role:'tool' mesajını user içindeki tool_result bloğuna çevirir", () => {
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "listele" },
        { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "list_dir", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "call_1", content: "a.txt\nb.txt" },
      ],
    } as never);

    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: "a.txt\nb.txt" }],
    });
  });

  it("art arda gelen araç çıktıları TEK user mesajında birleşir", () => {
    // Anthropic ayrı ayrı tool_result mesajlarını reddeder.
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "iki iş yap" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "c1", type: "function", function: { name: "a", arguments: "{}" } },
            { id: "c2", type: "function", function: { name: "b", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "c1", content: "birinci" },
        { role: "tool", tool_call_id: "c2", content: "ikinci" },
      ],
    } as never);

    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(3);
    expect(messages[2].content).toEqual([
      { type: "tool_result", tool_use_id: "c1", content: "birinci" },
      { type: "tool_result", tool_use_id: "c2", content: "ikinci" },
    ]);
  });

  it("bozuk JSON argümanı kayıpsız taşınır", () => {
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [{
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "a", arguments: "bu json degil" } }],
      }],
    } as never);

    const blocks = (body.messages as Array<Record<string, unknown>>)[0].content as Array<Record<string, unknown>>;
    expect(blocks[0].input).toEqual({ input: "bu json degil" });
  });

  it("eşleşecek id'si olmayan tool mesajı düşer (400 üretmez)", () => {
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "x" },
        { role: "tool", content: "sahipsiz çıktı" },
      ],
    } as never);
    expect(body.messages).toHaveLength(1);
  });
});

describe("BR5 — PRESERVATION: Anthropic-native gövde dokunulmaz", () => {
  it("içerik blokları ve araç şeması bit-bit korunur", () => {
    const contentBlocks = [
      { type: "text", text: "merhaba" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBOR" } },
    ];
    const anthropicTool = {
      name: "Bash",
      input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    };

    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      system: "Sen yardımcısın.",
      max_tokens: 256,
      temperature: 0.3,
      messages: [{ role: "user", content: contentBlocks }],
      tools: [anthropicTool],
      tool_choice: { type: "auto" },
    } as never);

    expect(body).toEqual({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 256,
      messages: [{ role: "user", content: contentBlocks }],
      system: "Sen yardımcısın.",
      temperature: 0.3,
      tools: [anthropicTool],
      tool_choice: { type: "auto" },
    });
  });

  it("araçsız düz metin isteğinin şekli değişmez", () => {
    const body = buildBedrockAnthropicBody({
      model: "claude-sonnet-4-6",
      messages: [{ role: "system", content: "kısa yaz" }, { role: "user", content: "selam" }],
      max_tokens: 8,
    } as never);

    expect(body).toEqual({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 8,
      messages: [{ role: "user", content: "selam" }],
      system: "kısa yaz",
    });
  });
});

// ── Yanıt çevirisi ────────────────────────────────────────────────────────────

describe("BR6 — bedrockAnthropicToChatCompletion", () => {
  it("tool_use bloklarını OpenAI tool_calls'a çevirir", () => {
    const out = bedrockAnthropicToChatCompletion({
      id: "msg_1",
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 4 },
      content: [
        { type: "text", text: "Dosyayı yazıyorum." },
        { type: "tool_use", id: "toolu_1", name: "write_file", input: { path: "a.txt", contents: "x" } },
      ],
    }, "claude-sonnet-4-6");

    const choice = (out.choices as Array<Record<string, unknown>>)[0];
    const message = choice.message as Record<string, unknown>;
    expect(choice.finish_reason).toBe("tool_calls");
    expect(message.content).toBe("Dosyayı yazıyorum.");
    expect(message.tool_calls).toEqual([{
      id: "toolu_1",
      type: "function",
      function: { name: "write_file", arguments: '{"path":"a.txt","contents":"x"}' },
    }]);
  });

  it("stop_reason gelmese de araç varsa finish_reason tool_calls olur", () => {
    const out = bedrockAnthropicToChatCompletion({
      content: [{ type: "tool_use", id: "t1", name: "a", input: {} }],
    }, "claude-sonnet-4-6");
    expect((out.choices as Array<Record<string, unknown>>)[0].finish_reason).toBe("tool_calls");
  });

  it("yalnız araç dönerse content null olur (OpenAI sözleşmesi)", () => {
    const out = bedrockAnthropicToChatCompletion({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "a", input: {} }],
    }, "claude-sonnet-4-6");
    const message = (out.choices as Array<Record<string, unknown>>)[0].message as Record<string, unknown>;
    expect(message.content).toBeNull();
  });

  it("PRESERVATION: metin-yalnız yanıt eskisiyle aynı", () => {
    const out = bedrockAnthropicToChatCompletion({
      id: "msg_2",
      stop_reason: "end_turn",
      usage: { input_tokens: 11, output_tokens: 2 },
      content: [{ type: "text", text: "OK" }],
    }, "claude-sonnet-4-6");

    const choice = (out.choices as Array<Record<string, unknown>>)[0];
    expect(choice.finish_reason).toBe("stop");
    expect(choice.message).toEqual({ role: "assistant", content: "OK" });
    expect(out.usage).toEqual({ prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 });
    expect(out.model).toBe("claude-sonnet-4-6");
  });

  it("max_tokens → length", () => {
    const out = bedrockAnthropicToChatCompletion({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "kesil" }],
    }, "claude-sonnet-4-6");
    expect((out.choices as Array<Record<string, unknown>>)[0].finish_reason).toBe("length");
  });
});

// ── Uçtan uca: gerçek upstream gövdesi + istemciye giden yanıt ────────────────

describe("BR7 — uçtan uca /v1/chat/completions (Bedrock lane)", () => {
  it("araçlar çevrilmiş gider, tool_calls geri döner", async () => {
    let sentBody: Record<string, unknown> | undefined;

    nock("https://bedrock-runtime.us-east-1.amazonaws.com", {
      reqheaders: { authorization: "Bearer bedrock_test_key" },
    })
      .post(`/model/${UPSTREAM_MODEL}/invoke`, (body) => { sentBody = body; return true; })
      .reply(200, {
        id: "msg_e2e",
        stop_reason: "tool_use",
        usage: { input_tokens: 20, output_tokens: 6 },
        content: [{ type: "tool_use", id: "toolu_9", name: "write_file", input: { path: "a.txt" } }],
      });

    const { raw, usage } = await forwardChat(
      {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "a.txt yaz" }],
        tools: [OPENAI_TOOL],
        tool_choice: "required",
      } as never,
      bedrockCtx(),
    );

    // Upstream'e Anthropic şeması gitti mi?
    expect((sentBody!.tools as Array<Record<string, unknown>>)[0]).toMatchObject({
      name: "write_file",
      input_schema: { type: "object" },
    });
    expect(sentBody!.tool_choice).toEqual({ type: "any" });
    expect(sentBody!).not.toHaveProperty("messages.0.tool_calls");

    // İstemciye araç çağrısı ulaştı mı?
    const choice = ((raw as Record<string, unknown>).choices as Array<Record<string, unknown>>)[0];
    expect(choice.finish_reason).toBe("tool_calls");
    expect((choice.message as Record<string, unknown>).tool_calls).toHaveLength(1);
    expect(usage).toMatchObject({ promptTokens: 20, completionTokens: 6 });
  });

  it("upstream inference-profile adı yanıta sızmaz", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_mask",
        model: UPSTREAM_MODEL, // upstream kendi adını döndürür
        stop_reason: "end_turn",
        usage: { input_tokens: 3, output_tokens: 1 },
        content: [{ type: "text", text: "OK" }],
      });

    const { raw } = await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "selam" }] } as never,
      bedrockCtx(),
    );

    expect(JSON.stringify(raw)).not.toContain("global.anthropic");
    expect((raw as Record<string, unknown>).model).toBe("claude-sonnet-4-6");
  });
});

describe("BR8 — uçtan uca stream: araç çağrısı SSE'de akar", () => {
  it("delta.tool_calls chunk'ı yazılır", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_stream_tool",
        stop_reason: "tool_use",
        usage: { input_tokens: 15, output_tokens: 5 },
        content: [
          { type: "text", text: "Yazıyorum." },
          { type: "tool_use", id: "toolu_s", name: "write_file", input: { path: "b.txt" } },
        ],
      });

    const chunks: string[] = [];
    const usage = await forwardChatStream(
      {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "b.txt yaz" }],
        tools: [OPENAI_TOOL],
        stream: true,
      } as never,
      collectingRes(chunks),
      bedrockCtx(),
    );

    const written = chunks.join("");
    expect(written).toContain('"content":"Yazıyorum."');
    expect(written).toContain('"tool_calls"');
    expect(written).toContain('"name":"write_file"');
    expect(written).toContain('"finish_reason":"tool_calls"');
    expect(written).toContain("data: [DONE]");
    expect(usage.finishReason).toBe("tool_calls");

    // Araç chunk'ı, kapanış chunk'ından ÖNCE gelmeli (istemci sırayla ayrıştırır).
    expect(written.indexOf('"tool_calls"')).toBeLessThan(written.indexOf('"finish_reason":"tool_calls"'));
  });

  it("PRESERVATION: araçsız stream eskisi gibi tek metin chunk'ı yazar", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_plain",
        stop_reason: "end_turn",
        usage: { input_tokens: 11, output_tokens: 2 },
        content: [{ type: "text", text: "OK" }],
      });

    const chunks: string[] = [];
    const usage = await forwardChatStream(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Reply OK" }], max_tokens: 8 } as never,
      collectingRes(chunks),
      bedrockCtx(),
    );

    const written = chunks.join("");
    expect(written).toContain('"content":"OK"');
    expect(written).not.toContain('"tool_calls"');
    expect(usage).toMatchObject({ promptTokens: 11, completionTokens: 2, cfRemaining: null, finishReason: "stop" });
  });
});

describe("BR9 — uçtan uca /v1/messages (Bedrock lane)", () => {
  it("Anthropic tool_use blokları korunur, model adı maskelenir", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_anthropic",
        model: UPSTREAM_MODEL,
        stop_reason: "tool_use",
        usage: { input_tokens: 30, output_tokens: 8 },
        content: [{ type: "tool_use", id: "toolu_m", name: "Bash", input: { command: "ls" } }],
      });

    const { raw } = await forwardTextEndpoint(
      "messages",
      {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "klasörü listele" }],
        tools: [{ name: "Bash", input_schema: { type: "object", properties: { command: { type: "string" } } } }],
      } as never,
      bedrockCtx(),
    );

    const body = raw as Record<string, unknown>;
    // Anthropic şekli bozulmadı — Claude Code bunu araç olarak ayrıştırır.
    expect(body.stop_reason).toBe("tool_use");
    expect(body.content).toEqual([{ type: "tool_use", id: "toolu_m", name: "Bash", input: { command: "ls" } }]);
    // Provider adı sızmadı.
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(JSON.stringify(body)).not.toContain("global.anthropic");
  });
});

describe("BR10 — identity relabel Bedrock gövdesine iner", () => {
  it("chat dalında kimlik talimatı system alanına enjekte edilir", async () => {
    let sentBody: Record<string, unknown> | undefined;
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`, (body) => { sentBody = body; return true; })
      .reply(200, { id: "m", stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "ok" }] });

    await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "kimsin?" }] } as never,
      bedrockCtx("Claude Sonnet 4.6"),
    );

    expect(String(sentBody!.system)).toContain("Claude Sonnet 4.6");
  });

  it("messages dalında kimlik talimatı system alanına enjekte edilir", async () => {
    let sentBody: Record<string, unknown> | undefined;
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`, (body) => { sentBody = body; return true; })
      .reply(200, { id: "m", stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "ok" }] });

    await forwardTextEndpoint(
      "messages",
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "kimsin?" }] } as never,
      bedrockCtx("Claude Sonnet 4.6"),
    );

    expect(String(sentBody!.system)).toContain("Claude Sonnet 4.6");
  });

  it("relabel yoksa system alanı uydurulmaz", async () => {
    let sentBody: Record<string, unknown> | undefined;
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`, (body) => { sentBody = body; return true; })
      .reply(200, { id: "m", stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: "ok" }] });

    await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "selam" }] } as never,
      bedrockCtx(),
    );

    expect(sentBody!).not.toHaveProperty("system");
  });
});

describe("BR11 — uçtan uca /v1/responses (Bedrock lane)", () => {
  const meta = { id: "resp_bedrock", model: "claude-sonnet-4-6", createdAt: 1_700_000_000 };

  it("araç çağrısı Responses function_call öğesi olarak yayılır", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_resp_tool",
        stop_reason: "tool_use",
        usage: { input_tokens: 25, output_tokens: 7 },
        content: [
          { type: "text", text: "Yazıyorum." },
          { type: "tool_use", id: "toolu_r", name: "write_file", input: { path: "c.txt" } },
        ],
      });

    const chunks: string[] = [];
    const usage = await forwardChatStreamAsResponses(
      {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "c.txt yaz" }],
        tools: [OPENAI_TOOL],
        stream: true,
      } as never,
      collectingRes(chunks),
      bedrockCtx(),
      meta as never,
    );

    const written = chunks.join("");
    expect(written).toContain("response.output_text.delta");
    // Araç öğesi gerçekten yayıldı mı?
    expect(written).toContain("response.output_item.added");
    expect(written).toContain('"type":"function_call"');
    expect(written).toContain('"name":"write_file"');
    expect(written).toContain("response.function_call_arguments.delta");
    expect(written).toContain('"call_id":"toolu_r"');
    expect(written).toContain("response.completed");
    expect(usage.finishReason).toBe("tool_calls");
  });

  it("PRESERVATION: araçsız Responses akışında araç öğesi yayılmaz", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_resp_plain",
        stop_reason: "end_turn",
        usage: { input_tokens: 13, output_tokens: 3 },
        content: [{ type: "text", text: "OK" }],
      });

    const chunks: string[] = [];
    const usage = await forwardChatStreamAsResponses(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Reply OK" }] } as never,
      collectingRes(chunks),
      bedrockCtx(),
      meta as never,
    );

    const written = chunks.join("");
    expect(written).toContain("response.output_text.delta");
    expect(written).not.toContain("function_call");
    expect(written).toContain("response.completed");
    expect(usage).toMatchObject({ promptTokens: 13, completionTokens: 3, finishReason: "stop" });
  });
});

describe("BR12 — /v1/responses non-stream birleşimi (Bedrock → Responses objesi)", () => {
  const meta = { id: "resp_ns", model: "claude-sonnet-4-6", createdAt: 1_700_000_000 };

  it("Bedrock tool_use → Responses function_call öğesi", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_ns_tool",
        stop_reason: "tool_use",
        usage: { input_tokens: 18, output_tokens: 5 },
        content: [{ type: "tool_use", id: "toolu_ns", name: "write_file", input: { path: "d.txt" } }],
      });

    const { raw } = await forwardChat(
      {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "d.txt yaz" }],
        tools: [OPENAI_TOOL],
      } as never,
      bedrockCtx(),
    );

    const response = chatCompletionToResponses(raw, meta as never) as Record<string, unknown>;
    const output = response.output as Array<Record<string, unknown>>;
    const call = output.find((item) => item.type === "function_call");

    expect(call).toBeDefined();
    expect(call!.name).toBe("write_file");
    expect(call!.call_id).toBe("toolu_ns");
    expect(String(call!.arguments)).toContain("d.txt");
    expect(JSON.stringify(response)).not.toContain("global.anthropic");
  });

  it("PRESERVATION: metin-yalnız yanıt output_text olarak döner", async () => {
    nock("https://bedrock-runtime.us-east-1.amazonaws.com")
      .post(`/model/${UPSTREAM_MODEL}/invoke`)
      .reply(200, {
        id: "msg_ns_plain",
        stop_reason: "end_turn",
        usage: { input_tokens: 4, output_tokens: 1 },
        content: [{ type: "text", text: "OK" }],
      });

    const { raw } = await forwardChat(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "selam" }] } as never,
      bedrockCtx(),
    );

    const response = chatCompletionToResponses(raw, meta as never) as Record<string, unknown>;
    expect(JSON.stringify(response.output)).toContain("OK");
    expect(JSON.stringify(response.output)).not.toContain("function_call");
  });
});
