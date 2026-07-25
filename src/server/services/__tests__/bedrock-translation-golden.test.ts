// Bedrock çeviri katmanı — GOLDEN KORPUS (preservation kanıtı).
// bkz. .kiro/specs/sonnet-46-unlimited-hardening/design.md, Görev 1.
//
// NEDEN: `closerouter-service.ts` diskte commit'siz ve test edilmemiş bir Bedrock araç
// çeviri katmanı taşıyor. Spec'in geri kalanı (gerçek streaming, sızıntı kapatma,
// telemetri, lane failover) bu katmanın ÜSTÜNE yazılacak. Üstüne yazmadan önce mevcut
// davranışın deterministik bir anlık görüntüsünü dondurmak zorunludur: sonradan üretilen
// bir "golden" hiçbir şey kanıtlamaz, yalnız yeni davranışı kendisiyle karşılaştırır.
//
// Bu dosya ÇEVİRİ MANTIĞINA HİÇ DOKUNMADAN üretildi. `closerouter-service.ts`'te yapılan
// tek değişiklik `partsFromBedrockAnthropic` önüne `export` anahtar sözcüğü eklenmesidir
// (davranış değişikliği değil; fonksiyon gövdesi ve çağrı noktaları aynı).
//
// KAPSAM: R1'in tüm gövde şekilleri — araçsız, Anthropic araçlı ({name, input_schema}),
// OpenAI araçlı ({type:"function"}), hibrit, yalnız-yerleşik (hepsi düşer),
// tool_use/tool_result geçmişli; ve her `tool_choice` biçimi.
//
// Non-determinizm kontrolü: `bedrockAnthropicToChatCompletion` `Date.now()` okur
// (`created`, id yoksa `bedrock-<ms>`). Korpus sabit sistem saatiyle üretilir, böylece
// çıktı bit-bit tekrarlanabilir. Saat sahteleme yalnız korpus üretimi sırasında açıktır.
//
// Golden dosya YALNIZ `GOLDEN_WRITE=1` ile yazılır. Normal koşuda test asla yazmaz;
// yalnız okur ve derin eşitlik doğrular.

import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";

import {
  buildBedrockAnthropicBody,
  partsFromBedrockAnthropic,
  bedrockAnthropicToChatCompletion,
  type ChatRequest,
} from "../closerouter-service.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "__fixtures__", "bedrock-translation-golden.json");

const SEED = 20260726;
const NUM_RUNS = 200;
const FIXED_NOW = Date.UTC(2026, 6, 26, 12, 0, 0);
const CATALOG_MODEL = "claude-sonnet-4-6";

// ── Üreticiler ────────────────────────────────────────────────────────────────
// Küçük sabit havuzlar bilinçli: golden dosyanın okunabilir kalması ve JSON
// round-trip'inde kayıp yaşanmaması için rastgele unicode üretilmez.

const TEXTS = ["selam", "dosyayı yaz", "", "ls -la", '{"a":1}', "çok\nsatırlı"] as const;
const TOOL_NAMES = ["write_file", "read_file", "shell", "web_fetch"] as const;

const textArb = fc.constantFrom(...TEXTS);
const nameArb = fc.constantFrom(...TOOL_NAMES);

const schemaArb = fc.constantFrom<Record<string, unknown>[]>(
  { type: "object", properties: {} },
  { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  { type: "object", properties: { n: { type: "number" }, flag: { type: "boolean" } } },
  { type: "object", properties: { nested: { type: "object", properties: { a: { type: "string" } } } }, additionalProperties: false },
);

/** Anthropic-native araç ({name, input_schema}) — R1.1: dokunulmadan geçmeli. */
const anthropicToolArb = fc
  .tuple(nameArb, schemaArb, fc.boolean())
  .map(([name, input_schema, withDesc]) => ({
    name,
    ...(withDesc ? { description: `${name} aracı` } : {}),
    input_schema,
  }));

/** OpenAI araç ({type:"function", function:{...}}) — R1.2: çevrilmeli. */
const openaiToolArb = fc
  .tuple(nameArb, schemaArb, fc.boolean(), fc.boolean())
  .map(([name, parameters, withDesc, withParams]) => ({
    type: "function",
    function: {
      name,
      ...(withDesc ? { description: `${name} çalıştır` } : {}),
      ...(withParams ? { parameters } : {}),
    },
  }));

/** Bedrock invoke gövdesinin kabul etmediği yerleşik tipler — R1.6: düşmeli. */
const builtinToolArb = fc.constantFrom<Record<string, unknown>[]>(
  { type: "web_search" },
  { type: "image_generation" },
  { type: "local_shell" },
  { type: "custom", custom: { name: "grammar" } },
  { type: "function" }, // function alanı yok → düşer
);

type ToolsShape =
  | { kind: "none" }
  | { kind: "anthropic"; tools: unknown[] }
  | { kind: "openai"; tools: unknown[] }
  | { kind: "hybrid"; tools: unknown[] }
  | { kind: "builtin_only"; tools: unknown[] };

const toolsArb: fc.Arbitrary<ToolsShape> = fc.oneof(
  fc.constant({ kind: "none" } as ToolsShape),
  fc.array(anthropicToolArb, { minLength: 1, maxLength: 3 }).map((tools) => ({ kind: "anthropic", tools }) as ToolsShape),
  fc.array(openaiToolArb, { minLength: 1, maxLength: 3 }).map((tools) => ({ kind: "openai", tools }) as ToolsShape),
  fc
    .tuple(anthropicToolArb, openaiToolArb, builtinToolArb)
    .map(([a, o, b]) => ({ kind: "hybrid", tools: [a, o, b] }) as ToolsShape),
  fc.array(builtinToolArb, { minLength: 1, maxLength: 3 }).map((tools) => ({ kind: "builtin_only", tools }) as ToolsShape),
);

/** R1.4 + Anthropic-native biçimler: her tool_choice şekli korpusta bulunur. */
const toolChoiceArb = fc.constantFrom<unknown[]>(
  undefined,
  "auto",
  "required",
  "any",
  "none",
  { type: "auto" },
  { type: "any" },
  { type: "tool", name: "write_file" },
  { type: "none" },
  { type: "function", function: { name: "read_file" } },
  { type: "function", function: {} }, // isim yok → alan gönderilmez
  { type: "function" }, // bozuk → alan gönderilmez
);

type MessagesShape =
  | { kind: "plain"; messages: unknown[] }
  | { kind: "anthropic_blocks"; messages: unknown[] }
  | { kind: "tool_history"; messages: unknown[] }
  | { kind: "tool_history_orphan"; messages: unknown[] }
  | { kind: "tool_history_parallel"; messages: unknown[] }
  | { kind: "anthropic_tool_history"; messages: unknown[] };

const messagesArb: fc.Arbitrary<MessagesShape> = fc.oneof(
  // Araçsız düz metin — golden'ın "dokunulmaz" tabanı.
  fc.tuple(textArb, fc.boolean()).map(([t, withSystemMsg]) => ({
    kind: "plain",
    messages: withSystemMsg
      ? [{ role: "system", content: "kısa yaz" }, { role: "user", content: t }]
      : [{ role: "user", content: t }],
  }) as MessagesShape),

  // Anthropic-native içerik blokları (/v1/messages gövdesi).
  fc.tuple(textArb).map(([t]) => ({
    kind: "anthropic_blocks",
    messages: [
      { role: "user", content: [{ type: "text", text: t }] },
      { role: "assistant", content: [{ type: "text", text: "tamam" }] },
      { role: "user", content: [{ type: "text", text: t }, { type: "text", text: "devam" }] },
    ],
  }) as MessagesShape),

  // OpenAI araç turu: assistant.tool_calls → tool_use, role:"tool" → tool_result.
  fc.tuple(textArb, nameArb, fc.constantFrom('{"path":"a.txt"}', "{}", "bozuk-json", "")).map(([t, name, args]) => ({
    kind: "tool_history",
    messages: [
      { role: "user", content: t },
      { role: "assistant", content: "", tool_calls: [{ id: "call_a", type: "function", function: { name, arguments: args } }] },
      { role: "tool", tool_call_id: "call_a", content: "sonuç" },
      { role: "user", content: t },
    ],
  }) as MessagesShape),

  // R1.5: eşleşecek tool_use yok → öğe ATILIR.
  fc.tuple(textArb).map(([t]) => ({
    kind: "tool_history_orphan",
    messages: [
      { role: "user", content: t },
      { role: "tool", content: "yetim sonuç" },
      { role: "tool", tool_call_id: "", content: "boş id" },
      { role: "tool", tool_call_id: "call_yok", content: "eşleşmeyen id" },
    ],
  }) as MessagesShape),

  // Art arda gelen araç çıktıları TEK user mesajında birleşmeli.
  fc.tuple(nameArb).map(([name]) => ({
    kind: "tool_history_parallel",
    messages: [
      { role: "user", content: "iki dosya oku" },
      {
        role: "assistant",
        content: [{ type: "text", text: "okuyorum" }],
        tool_calls: [
          { id: "call_1", type: "function", function: { name, arguments: '{"path":"a"}' } },
          { type: "function", function: { name, arguments: '{"path":"b"}' } }, // id yok → üretilir
          { id: "call_3", type: "function", function: { arguments: "{}" } }, // isim yok → düşer
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] },
      { role: "function", tool_use_id: "call_2", content: { ok: true } },
    ],
  }) as MessagesShape),

  // Anthropic-native araç geçmişi: bloklar olduğu gibi taşınmalı.
  fc.tuple(nameArb).map(([name]) => ({
    kind: "anthropic_tool_history",
    messages: [
      { role: "user", content: "çalıştır" },
      { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name, input: { path: "a.txt" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] },
    ],
  }) as MessagesShape),
);

interface BodyCase {
  toolsKind: string;
  messagesKind: string;
  body: Record<string, unknown>;
}

const bodyArb: fc.Arbitrary<BodyCase> = fc
  .record({
    tools: toolsArb,
    messages: messagesArb,
    toolChoice: toolChoiceArb,
    system: fc.option(fc.constantFrom("Sen yardımcısın.", "   ", "Kısa cevap ver."), { nil: undefined }),
    maxTokens: fc.option(fc.constantFrom(1, 64, 4096), { nil: undefined }),
    maxCompletionTokens: fc.option(fc.constantFrom(128, 2048), { nil: undefined }),
    temperature: fc.option(fc.constantFrom(0, 0.3, 1), { nil: undefined }),
    topP: fc.option(fc.constantFrom(0.1, 0.95), { nil: undefined }),
    stop: fc.option(fc.constantFrom<unknown[]>("END", ["A", "B"]), { nil: undefined }),
    stopSequences: fc.option(fc.constant(["\n\n"]), { nil: undefined }),
    stream: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map((r) => {
    const body: Record<string, unknown> = { model: CATALOG_MODEL, messages: r.messages.messages };
    if (r.system !== undefined) body.system = r.system;
    if (r.maxTokens !== undefined) body.max_tokens = r.maxTokens;
    if (r.maxCompletionTokens !== undefined) body.max_completion_tokens = r.maxCompletionTokens;
    if (r.temperature !== undefined) body.temperature = r.temperature;
    if (r.topP !== undefined) body.top_p = r.topP;
    if (r.stop !== undefined) body.stop = r.stop;
    if (r.stopSequences !== undefined) body.stop_sequences = r.stopSequences;
    if (r.stream !== undefined) body.stream = r.stream;
    if (r.tools.kind !== "none") body.tools = (r.tools as { tools: unknown[] }).tools;
    if (r.toolChoice !== undefined) body.tool_choice = r.toolChoice;
    return { toolsKind: r.tools.kind, messagesKind: r.messages.kind, body };
  });

// ── Sabit Bedrock yanıtları (dönüş yolu) ──────────────────────────────────────

const BEDROCK_RESPONSES: Array<{ label: string; json: Record<string, unknown> }> = [
  {
    label: "text_only_end_turn",
    json: {
      id: "msg_text_1",
      type: "message",
      role: "assistant",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "merhaba" }],
      usage: { input_tokens: 11, output_tokens: 4 },
    },
  },
  {
    label: "text_multi_block",
    json: {
      id: "msg_text_2",
      stop_reason: "stop_sequence",
      content: [{ type: "text", text: "bir " }, { type: "text", text: "iki" }],
      usage: { input_tokens: 3, output_tokens: 2 },
    },
  },
  {
    label: "tool_use_only",
    json: {
      id: "msg_tool_1",
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "toolu_1", name: "write_file", input: { path: "a.txt", contents: "x" } }],
      usage: { input_tokens: 21, output_tokens: 9 },
    },
  },
  {
    label: "text_plus_tool_use",
    json: {
      id: "msg_tool_2",
      stop_reason: "tool_use",
      content: [
        { type: "text", text: "yazıyorum" },
        { type: "tool_use", id: "toolu_2", name: "write_file", input: {} },
        { type: "tool_use", name: "read_file", input: { path: "b" } },
      ],
      usage: { input_tokens: 8, output_tokens: 6 },
    },
  },
  {
    label: "tool_use_without_stop_reason",
    json: {
      id: "msg_tool_3",
      content: [{ type: "tool_use", id: "toolu_3", name: "shell", input: { cmd: "ls" } }],
    },
  },
  {
    label: "max_tokens",
    json: {
      id: "msg_len",
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "kesil" }],
      usage: { input_tokens: 100, output_tokens: 1024 },
    },
  },
  {
    label: "no_usage_no_id",
    json: { stop_reason: "end_turn", content: [{ type: "text", text: "kısa" }] },
  },
  {
    label: "empty_content",
    json: { id: "msg_empty", stop_reason: "end_turn", content: [] },
  },
  {
    label: "content_not_array",
    json: { id: "msg_bad", stop_reason: "end_turn", content: "düz metin" },
  },
  {
    label: "implicit_tool_block",
    json: {
      id: "msg_implicit",
      stop_reason: "end_turn",
      content: [{ name: "shell", input: { cmd: "pwd" } }, { type: "text", text: "son" }],
    },
  },
];

// ── Korpus ────────────────────────────────────────────────────────────────────

/**
 * Saat sahteleme: yanıt çevirisi `Date.now()` okuyor (`created`, id'siz yanıt için
 * `bedrock-<ms>`). Sabit saat olmadan golden her koşuda değişirdi.
 */
function withFixedClock<T>(fn: () => T): T {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
}

function buildCorpus(): { requests: unknown[]; responses: unknown[] } {
  const cases = fc.sample(bodyArb, { numRuns: NUM_RUNS, seed: SEED });
  return withFixedClock(() => ({
    requests: cases.map((c, i) => ({
      i,
      toolsKind: c.toolsKind,
      messagesKind: c.messagesKind,
      body: c.body,
      bedrockBody: buildBedrockAnthropicBody(c.body as unknown as ChatRequest),
    })),
    responses: BEDROCK_RESPONSES.map(({ label, json }) => ({
      label,
      upstream: json,
      parts: partsFromBedrockAnthropic(json),
      chatCompletion: bedrockAnthropicToChatCompletion(json, CATALOG_MODEL),
    })),
  }));
}

describe("bedrock çeviri golden korpusu (preservation)", () => {
  it("üretici deterministiktir (aynı seed → aynı korpus)", () => {
    expect(JSON.stringify(buildCorpus())).toBe(JSON.stringify(buildCorpus()));
  });

  it("korpus R1'in tüm gövde şekillerini ve her tool_choice biçimini kapsar", () => {
    const { requests } = buildCorpus() as {
      requests: Array<{ toolsKind: string; messagesKind: string; body: Record<string, unknown> }>;
    };
    expect(requests).toHaveLength(NUM_RUNS);

    const toolsKinds = new Set(requests.map((r) => r.toolsKind));
    for (const k of ["none", "anthropic", "openai", "hybrid", "builtin_only"]) {
      expect(toolsKinds.has(k)).toBe(true);
    }

    const messagesKinds = new Set(requests.map((r) => r.messagesKind));
    for (const k of [
      "plain",
      "anthropic_blocks",
      "tool_history",
      "tool_history_orphan",
      "tool_history_parallel",
      "anthropic_tool_history",
    ]) {
      expect(messagesKinds.has(k)).toBe(true);
    }

    const choiceForms = new Set(requests.map((r) => JSON.stringify(r.body.tool_choice ?? null)));
    // 12 biçim üretiliyor; undefined → null olarak tek kovaya düşer.
    expect(choiceForms.size).toBeGreaterThanOrEqual(10);
  });

  it("çeviri çıktısı golden ile birebir aynıdır", () => {
    const actual = buildCorpus();

    if (process.env.GOLDEN_WRITE === "1") {
      mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
      writeFileSync(
        GOLDEN_PATH,
        JSON.stringify({ seed: SEED, numRuns: NUM_RUNS, fixedNow: FIXED_NOW, ...actual }, null, 2) + "\n",
        "utf8",
      );
    }

    expect(existsSync(GOLDEN_PATH)).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as {
      seed: number;
      numRuns: number;
      fixedNow: number;
      requests: unknown[];
      responses: unknown[];
    };
    expect(golden.seed).toBe(SEED);
    expect(golden.numRuns).toBe(NUM_RUNS);
    expect(golden.fixedNow).toBe(FIXED_NOW);
    expect(actual.requests).toEqual(golden.requests);
    expect(actual.responses).toEqual(golden.responses);
  });
});
