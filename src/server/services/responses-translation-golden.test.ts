// Golden korpus — PRESERVATION kanıtı (bkz .kiro/specs/responses-tool-contract-fix/design.md).
//
// NEDEN: responses-tool-contract-fix bugfix'i çeviri katmanında yalnız BUG KOŞULU içinde
// davranış değiştirmelidir. Bug koşulu DIŞINDAKİ her girdi için çıktı bit-bit aynı kalmalı.
// Bunu kanıtlamanın tek dürüst yolu, kod değişmeden ÖNCE deterministik bir korpusun
// çıktılarını dondurmaktır — sonradan üretilen "golden" hiçbir şey kanıtlamaz.
//
// Korpus KASITEN yalnız bug koşulu DIŞINDAKİ gövdeleri içerir:
//   - araçsız istekler
//   - yalnız type:"function" araçlı istekler
//   - type:"local_shell" araç + local_shell_call/_output geçmişi
// custom / web_search / image_generation araçları ve custom_tool_call geçmişi korpusa
// GİRMEZ (onlar bug koşuludur; davranışları CE1-CE5 testlerinde değişecek).
//
// Üretici, fast-check yerine repo-içi deterministik bir PRNG kullanır: fast-check'in
// örnekleme sırası kütüphane sürümüne bağlıdır ve bir major/minor yükseltmede golden
// dosyayı sahte-kırmızıya düşürürdü. mulberry32 + sabit seed sürümden bağımsızdır.
//
// Golden dosyayı yalnız GOLDEN_WRITE=1 ile yazar; normal koşuda ASLA yazmaz, yalnız karşılaştırır.

import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  responsesRequestToChat,
  chatCompletionToResponses,
  ResponsesStreamTranslator,
  usageFromTokens,
} from "./responses-translation.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "__fixtures__", "responses-translation-golden.json");

const SEED = 20260725;
const CASES = 120;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Json = Record<string, unknown>;

const MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "codex-mini-latest", "gpt-9-codex", "claude-opus-4-8"];
const TEXTS = ["selam", "ls -la", "dosyaları listele", "", '{"a":1}', "çok\nsatırlı"];
const EFFORTS = ["low", "medium", "high"];
const TOOL_MODES = ["none", "function", "function_chat_shaped", "function_pair", "local_shell"] as const;
const INPUT_MODES = ["string", "message", "parts", "developer", "fn_history", "shell_history", "reasoning_mix", "image", "unknown_role_item"] as const;
const CHOICE_MODES = ["none", "auto", "required", "none_string", "fn_object"] as const;

function buildBody(rng: () => number, i: number): Json {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const body: Json = { model: pick(MODELS) };

  if (rng() < 0.5) body.instructions = pick(TEXTS);

  const inputMode = pick(INPUT_MODES);
  if (inputMode === "string") {
    body.input = pick(TEXTS);
  } else if (inputMode === "message") {
    body.input = [{ type: "message", role: "user", content: pick(TEXTS) }];
  } else if (inputMode === "parts") {
    body.input = [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: pick(TEXTS) },
          { type: "input_text", text: pick(TEXTS) },
        ],
      },
    ];
  } else if (inputMode === "developer") {
    body.input = [
      { type: "message", role: "developer", content: pick(TEXTS) },
      { type: "message", role: "user", content: pick(TEXTS) },
    ];
  } else if (inputMode === "fn_history") {
    body.input = [
      { type: "message", role: "user", content: pick(TEXTS) },
      { type: "function_call", call_id: `call_${i}`, name: "shell", arguments: '{"cmd":"ls"}' },
      { type: "function_call_output", call_id: `call_${i}`, output: pick(TEXTS) },
      { type: "message", role: "user", content: pick(TEXTS) },
    ];
  } else if (inputMode === "shell_history") {
    body.input = [
      { type: "message", role: "user", content: pick(TEXTS) },
      {
        type: "local_shell_call",
        call_id: `call_shell_${i}`,
        action: { type: "exec", command: ["git", "status"], env: {}, working_directory: "/tmp" },
      },
      { type: "local_shell_call_output", call_id: `call_shell_${i}`, output: pick(TEXTS) },
    ];
  } else if (inputMode === "reasoning_mix") {
    body.input = [
      { type: "reasoning", summary: [] },
      { type: "message", role: "user", content: pick(TEXTS) },
      { type: "reasoning", summary: [{ type: "summary_text", text: "x" }] },
    ];
  } else if (inputMode === "image") {
    body.input = [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: pick(TEXTS) },
          { type: "input_image", image_url: "https://example.test/a.png" },
        ],
      },
    ];
  } else {
    // rol taşıyan ama type'sız öğe + refusal parçası (mevcut generic dalı kilitler)
    body.input = [
      { role: "assistant", content: [{ type: "refusal", refusal: "olmaz" }] },
      { type: "message", role: "user", content: pick(TEXTS) },
    ];
  }

  const toolMode = pick(TOOL_MODES);
  if (toolMode === "function") {
    body.tools = [{ type: "function", name: "shell", description: "run", parameters: { type: "object" } }];
  } else if (toolMode === "function_chat_shaped") {
    body.tools = [{ type: "function", function: { name: "shell", description: "run", parameters: { type: "object" } } }];
  } else if (toolMode === "function_pair") {
    body.tools = [
      { type: "function", name: "shell", description: "run", parameters: { type: "object" }, strict: true },
      { type: "function", name: "read_file", parameters: { type: "object", properties: { p: { type: "string" } }, required: ["p"] } },
    ];
  } else if (toolMode === "local_shell") {
    body.tools = [{ type: "local_shell" }];
  }

  const choiceMode = pick(CHOICE_MODES);
  if (choiceMode === "auto") body.tool_choice = "auto";
  else if (choiceMode === "required") body.tool_choice = "required";
  else if (choiceMode === "none_string") body.tool_choice = "none";
  else if (choiceMode === "fn_object") body.tool_choice = { type: "function", name: "shell" };

  if (rng() < 0.6) body.max_output_tokens = 100 + Math.floor(rng() * 900);
  if (rng() < 0.4) body.temperature = Math.round(rng() * 100) / 100;
  if (rng() < 0.3) body.top_p = Math.round(rng() * 100) / 100;
  if (rng() < 0.5) body.stream = rng() < 0.5;
  if (rng() < 0.3) body.parallel_tool_calls = rng() < 0.5;
  if (rng() < 0.4) body.reasoning = { effort: EFFORTS[Math.floor(rng() * EFFORTS.length)] };

  return body;
}

const TEXT_RESP = {
  choices: [{ message: { role: "assistant", content: "merhaba" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};
const FN_RESP = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_9", type: "function", function: { name: "shell", arguments: '{"cmd":"ls"}' } }],
      },
    },
  ],
  usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
};
const SHELL_RESP = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_local_1",
            type: "function",
            function: {
              name: "local_shell",
              arguments: JSON.stringify({ action: { type: "exec", command: ["git", "status"], env: {} } }),
            },
          },
        ],
      },
    },
  ],
};
const NO_USAGE_RESP = { choices: [{ message: { role: "assistant", content: "kısa" } }] };

function streamEvents(metaId: string, model: string, createdAt: number): unknown[] {
  const t = new ResponsesStreamTranslator({ id: metaId, model, createdAt });
  const out: unknown[] = [];
  out.push(...t.start());
  out.push(...t.pushChatChunk({ choices: [{ delta: { content: "Hel" } }] }));
  out.push(...t.pushChatChunk({ choices: [{ delta: { content: "lo" } }] }));
  out.push(
    ...t.pushChatChunk({
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "shell", arguments: '{"c' } }] } }],
    }),
  );
  out.push(...t.pushChatChunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'md":1}' } }] } }] }));
  out.push(
    ...t.pushChatChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 1,
                function: {
                  name: "local_shell",
                  arguments: JSON.stringify({ action: { type: "exec", command: ["ls"], env: {} } }),
                },
              },
            ],
          },
        },
      ],
    }),
  );
  out.push(...t.finish(usageFromTokens(11, 7)));
  return out;
}

function buildCorpus(): unknown[] {
  const rng = mulberry32(SEED);
  const rows: unknown[] = [];
  for (let i = 0; i < CASES; i++) {
    const body = buildBody(rng, i);
    const meta = { id: `req${i}`, model: "gpt-5.5", createdAt: 1000 + i };
    rows.push({
      i,
      body,
      chat: responsesRequestToChat(body),
      nonStreamText: chatCompletionToResponses(TEXT_RESP, meta),
      nonStreamFn: chatCompletionToResponses(FN_RESP, meta),
      nonStreamShell: chatCompletionToResponses(SHELL_RESP, meta),
      nonStreamNoUsage: chatCompletionToResponses(NO_USAGE_RESP, meta),
      stream: streamEvents(meta.id, meta.model, meta.createdAt),
    });
  }
  return rows;
}

describe("responses-translation golden korpus (preservation)", () => {
  it("üretici deterministiktir (aynı seed → aynı korpus)", () => {
    expect(JSON.stringify(buildCorpus())).toBe(JSON.stringify(buildCorpus()));
  });

  it("bug koşulu dışındaki tüm girdilerde çıktı golden ile birebir aynıdır", () => {
    const actual = buildCorpus();

    if (process.env.GOLDEN_WRITE === "1") {
      mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
      writeFileSync(GOLDEN_PATH, JSON.stringify({ seed: SEED, cases: CASES, rows: actual }, null, 2) + "\n", "utf8");
    }

    expect(existsSync(GOLDEN_PATH)).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { seed: number; cases: number; rows: unknown[] };
    expect(golden.seed).toBe(SEED);
    expect(golden.cases).toBe(CASES);
    // Derin eşitlik: gövde, chat çevirisi, 4 non-stream varyantı ve tam stream event dizisi.
    expect(actual).toEqual(golden.rows);
  });

  it("korpus bug koşulu içeren gövde barındırmaz (kapsam kilidi)", () => {
    const rows = buildCorpus() as Array<{ body: { tools?: Array<{ type?: string }>; input?: unknown } }>;
    const allowedToolTypes = new Set(["function", "local_shell"]);
    for (const row of rows) {
      for (const tool of row.body.tools ?? []) {
        expect(allowedToolTypes.has(String(tool.type))).toBe(true);
      }
      const input = Array.isArray(row.body.input) ? (row.body.input as Array<{ type?: string }>) : [];
      for (const item of input) {
        expect(item.type === "custom_tool_call" || item.type === "custom_tool_call_output").toBe(false);
      }
    }
  });
});
