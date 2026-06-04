// Responses API ↔ Chat Completions çeviri katmanı (PÜR + TEST EDİLEBİLİR).
//
// NEDEN: Codex CLI (>=0.99, Şubat 2026'da chat/completions desteği KALDIRILDI) yalnız
// OpenAI **Responses API**'sini (`POST /v1/responses`) konuşur. Bizim upstream sağlayıcılar
// ise yalnız `/chat/completions` sunar (`/responses` → 404). Bu modül, gelen Responses
// isteğini chat/completions şemasına çevirir ve chat yanıtını (hem non-stream hem SSE)
// Codex'in beklediği Responses formatına geri çevirir.
//
// Bu dosyada AĞ / DB / yan etki YOKTUR — yalnız saf veri dönüşümü. Billing, auth, routing
// proxy.ts'te değişmeden kalır (para yolu DOKUNULMAZ).

import { canonicalizeModelId } from "../../master-models.js";

// ── Tipler ──────────────────────────────────────────────────────────────────
export interface ResponsesUsage {
  input_tokens: number;
  input_tokens_details: { cached_tokens: number };
  output_tokens: number;
  output_tokens_details: { reasoning_tokens: number };
  total_tokens: number;
}

export interface ResponsesStreamMeta {
  id: string; // request id (resp_/msg_/fc_ id türetmek için)
  model: string; // canonical master model id (yanıtta gösterilecek)
  createdAt: number; // unix saniye
}

interface ChatMessage {
  role: string;
  content: unknown;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

type Json = Record<string, unknown>;

// ── Model slug alias: Codex kendi slug'larını gönderir (gpt-5.x-codex / codex-mini) ──
// Katalogda olmayanları en yakın gerçek modele yönlendir; aksi halde 404 olurdu.
const CODEX_MODEL_ALIASES: Record<string, string> = {
  "gpt-5.5-codex": "gpt-5.5",
  "gpt-5.4-codex": "gpt-5.4",
  "gpt-5.3-codex": "gpt-5.4", // katalogda gpt-5.3 yok → en yakın
  "gpt-5.2-codex": "gpt-5.2",
  "gpt-5.1-codex": "gpt-5.1",
  "gpt-5-codex": "gpt-5",
  "codex-mini-latest": "gpt-5-mini",
  "codex-mini": "gpt-5-mini",
};

export function normalizeRequestedModel(model: unknown): string | undefined {
  if (typeof model !== "string" || model.length === 0) return undefined;
  if (CODEX_MODEL_ALIASES[model]) return CODEX_MODEL_ALIASES[model];
  // Genel kural: bilinmeyen "<base>-codex" → "<base>" (canonicalize sonra katalog karar verir).
  if (model.endsWith("-codex")) {
    const base = model.slice(0, -"-codex".length);
    return CODEX_MODEL_ALIASES[model] ?? base;
  }
  return model;
}

// ── İçerik parçaları → chat content ─────────────────────────────────────────
// Responses content parçaları: input_text / output_text / input_image / refusal.
// Hepsi metinse düz string döner (sağlayıcı uyumu en yüksek); görsel varsa chat
// content-parts dizisi döner.
function contentToChatContent(content: unknown): unknown {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);

  const parts: Json[] = [];
  let onlyText = true;
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Json;
    const t = p.type;
    if (t === "input_text" || t === "output_text" || t === "text") {
      parts.push({ type: "text", text: String(p.text ?? "") });
    } else if (t === "input_image") {
      onlyText = false;
      const url =
        typeof p.image_url === "string"
          ? p.image_url
          : ((p.image_url as Json | undefined)?.url as string | undefined);
      if (url) parts.push({ type: "image_url", image_url: { url } });
    } else if (t === "refusal") {
      parts.push({ type: "text", text: String(p.refusal ?? "") });
    }
    // bilinmeyen parça tipleri yok sayılır
  }
  if (parts.length === 0) return "";
  if (onlyText) return parts.map((p) => String(p.text ?? "")).join("");
  return parts;
}

// ── tools: Responses (flat) → chat (function sarmalı) ────────────────────────
function convertTools(tools: unknown): unknown[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: Json[] = [];
  for (const raw of tools) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Json;
    if (t.type === "function") {
      if (t.function && typeof t.function === "object") {
        out.push(t); // zaten chat-şekilli
      } else {
        const fn: Json = { name: t.name, description: t.description, parameters: t.parameters };
        if (t.strict !== undefined) fn.strict = t.strict;
        out.push({ type: "function", function: fn });
      }
    }
    // function-dışı Responses araçları (web_search vb.) chat upstream'de anlaşılmaz → atlanır
  }
  return out.length > 0 ? out : undefined;
}

function convertToolChoice(tc: unknown): unknown {
  if (tc == null) return undefined;
  if (typeof tc === "string") return tc; // auto | none | required
  if (typeof tc === "object") {
    const o = tc as Json;
    if (o.type === "function") {
      const name = (o.name as string | undefined) ?? ((o.function as Json | undefined)?.name as string | undefined);
      if (name) return { type: "function", function: { name } };
    }
  }
  return tc;
}

// ── Responses request → chat/completions request ────────────────────────────
export function responsesRequestToChat(body: Json): Json {
  const messages: ChatMessage[] = [];
  let pendingToolCalls: Json[] = [];

  const flushToolCalls = () => {
    if (pendingToolCalls.length > 0) {
      messages.push({ role: "assistant", content: null, tool_calls: pendingToolCalls });
      pendingToolCalls = [];
    }
  };

  const instructions = body.instructions;
  if (typeof instructions === "string" && instructions.length > 0) {
    messages.push({ role: "system", content: instructions });
  }

  const input = body.input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Json;
      const type = item.type;

      if (type === "function_call") {
        pendingToolCalls.push({
          id: (item.call_id as string) ?? (item.id as string) ?? "",
          type: "function",
          function: { name: item.name ?? "", arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? "") },
        });
        continue;
      }

      // function_call_output: önce bekleyen tool_call'ları (assistant) flush et, sonra tool mesajı
      if (type === "function_call_output") {
        flushToolCalls();
        const output = item.output;
        messages.push({
          role: "tool",
          tool_call_id: (item.call_id as string) ?? "",
          content: typeof output === "string" ? output : JSON.stringify(output ?? ""),
        });
        continue;
      }

      if (type === "reasoning") continue; // chat karşılığı yok → atla

      // message (veya type'sız ama role'lu) öğe
      flushToolCalls();
      let role = (item.role as string) ?? "user";
      if (role === "developer") role = "system";
      messages.push({ role, content: contentToChatContent(item.content) });
    }
  }
  flushToolCalls();

  const chat: Json = {
    model: normalizeRequestedModel(body.model),
    messages,
  };

  if (typeof body.max_output_tokens === "number") chat.max_tokens = body.max_output_tokens;
  if (typeof body.temperature === "number") chat.temperature = body.temperature;
  if (typeof body.top_p === "number") chat.top_p = body.top_p;
  if (body.stream === true) chat.stream = true;
  if (typeof body.parallel_tool_calls === "boolean") chat.parallel_tool_calls = body.parallel_tool_calls;

  const tools = convertTools(body.tools);
  if (tools) chat.tools = tools;
  const toolChoice = convertToolChoice(body.tool_choice);
  if (toolChoice !== undefined) chat.tool_choice = toolChoice;

  // reasoning.effort → reasoning_effort (sağlayıcı destekliyorsa kullanır, yoksa yok sayar)
  const reasoning = body.reasoning as Json | undefined;
  if (reasoning && typeof reasoning.effort === "string") chat.reasoning_effort = reasoning.effort;

  return chat;
}

// ── chat usage → Responses usage ─────────────────────────────────────────────
function toResponsesUsage(chatUsage: Json | undefined): ResponsesUsage | undefined {
  if (!chatUsage) return undefined;
  const input = Number(chatUsage.prompt_tokens ?? 0) || 0;
  const output = Number(chatUsage.completion_tokens ?? 0) || 0;
  const cached = Number((chatUsage.prompt_tokens_details as Json | undefined)?.cached_tokens ?? 0) || 0;
  const reasoning = Number((chatUsage.completion_tokens_details as Json | undefined)?.reasoning_tokens ?? 0) || 0;
  const total = Number(chatUsage.total_tokens ?? input + output) || input + output;
  return {
    input_tokens: input,
    input_tokens_details: { cached_tokens: cached },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: reasoning },
    total_tokens: total,
  };
}

export function usageFromTokens(promptTokens: number, completionTokens: number): ResponsesUsage {
  return {
    input_tokens: promptTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: completionTokens,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: promptTokens + completionTokens,
  };
}

// ── non-stream: chat completion → Responses response objesi ─────────────────
export function chatCompletionToResponses(chatJson: unknown, meta: ResponsesStreamMeta): Json {
  const chat = (chatJson ?? {}) as Json;
  const choices = chat.choices as Json[] | undefined;
  const message = (choices?.[0]?.message ?? {}) as Json;
  const output: Json[] = [];

  const contentText = typeof message.content === "string" ? message.content : "";
  if (contentText.length > 0) {
    output.push({
      id: `msg_${meta.id}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: contentText, annotations: [] }],
    });
  }

  const toolCalls = message.tool_calls as Json[] | undefined;
  if (Array.isArray(toolCalls)) {
    toolCalls.forEach((tc, i) => {
      const fn = (tc.function ?? {}) as Json;
      output.push({
        id: `fc_${meta.id}_${i}`,
        type: "function_call",
        status: "completed",
        call_id: (tc.id as string) ?? `call_${meta.id}_${i}`,
        name: fn.name ?? "",
        arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? ""),
      });
    });
  }

  return {
    id: `resp_${meta.id}`,
    object: "response",
    created_at: meta.createdAt,
    status: "completed",
    error: null,
    incomplete_details: null,
    model: meta.model,
    output,
    output_text: contentText, // SDK kolaylığı (resmi yanıtta da bulunur)
    parallel_tool_calls: true,
    metadata: {},
    usage: toResponsesUsage(chat.usage as Json | undefined) ?? null,
  };
}

// ── SSE event biçimleyici ────────────────────────────────────────────────────
export function formatResponsesSse(event: Json): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}

// ── Streaming çevirici: chat SSE delta'larını Responses event dizisine çevirir ─
// Durum makinesi: created/in_progress → (text varsa) output_item.added +
// content_part.added + output_text.delta* + ...done → (tool_call varsa)
// output_item.added(function_call) + function_call_arguments.delta* + ...done →
// response.completed. sequence_number tek artan; output_index öğe açılış sırasına göre.
interface ToolState {
  itemId: string;
  outputIndex: number;
  callId: string;
  name: string;
  args: string;
  opened: boolean;
}

export class ResponsesStreamTranslator {
  private seq = 0;
  private nextOutputIndex = 0;
  private readonly responseId: string;
  private readonly msgItemId: string;
  private readonly model: string;
  private readonly createdAt: number;
  private textOpened = false;
  private textIndex = -1;
  private text = "";
  private readonly tools = new Map<number, ToolState>();
  private finished = false;

  constructor(meta: ResponsesStreamMeta) {
    this.responseId = `resp_${meta.id}`;
    this.msgItemId = `msg_${meta.id}`;
    this.model = meta.model;
    this.createdAt = meta.createdAt;
  }

  private ev(obj: Json): Json {
    return { ...obj, sequence_number: this.seq++ };
  }

  private responseSkeleton(status: string, usage?: ResponsesUsage | null): Json {
    return {
      id: this.responseId,
      object: "response",
      created_at: this.createdAt,
      status,
      error: null,
      incomplete_details: null,
      model: this.model,
      output: status === "completed" ? this.buildOutput() : [],
      parallel_tool_calls: true,
      metadata: {},
      usage: usage ?? null,
    };
  }

  private buildOutput(): Json[] {
    const items: (Json | undefined)[] = [];
    if (this.textOpened) {
      items[this.textIndex] = {
        id: this.msgItemId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: this.text, annotations: [] }],
      };
    }
    for (const t of this.tools.values()) {
      if (!t.opened) continue;
      items[t.outputIndex] = {
        id: t.itemId,
        type: "function_call",
        status: "completed",
        call_id: t.callId,
        name: t.name,
        arguments: t.args,
      };
    }
    return items.filter((x): x is Json => x != null);
  }

  // İlk event'ler: response.created + response.in_progress
  start(): Json[] {
    return [
      this.ev({ type: "response.created", response: this.responseSkeleton("in_progress") }),
      this.ev({ type: "response.in_progress", response: this.responseSkeleton("in_progress") }),
    ];
  }

  // Bir chat SSE data chunk'ını (parse edilmiş) besle → Responses event'leri
  pushChatChunk(parsed: Json): Json[] {
    const events: Json[] = [];
    const choice = (parsed.choices as Json[] | undefined)?.[0];
    if (!choice) return events;
    const delta = (choice.delta ?? {}) as Json;

    // metin delta
    const content = delta.content;
    if (typeof content === "string" && content.length > 0) {
      if (!this.textOpened) {
        this.textIndex = this.nextOutputIndex++;
        this.textOpened = true;
        events.push(
          this.ev({
            type: "response.output_item.added",
            output_index: this.textIndex,
            item: { id: this.msgItemId, type: "message", status: "in_progress", role: "assistant", content: [] },
          }),
        );
        events.push(
          this.ev({
            type: "response.content_part.added",
            item_id: this.msgItemId,
            output_index: this.textIndex,
            content_index: 0,
            part: { type: "output_text", text: "", annotations: [] },
          }),
        );
      }
      events.push(
        this.ev({
          type: "response.output_text.delta",
          item_id: this.msgItemId,
          output_index: this.textIndex,
          content_index: 0,
          delta: content,
        }),
      );
      this.text += content;
    }

    // tool_call delta'ları
    const toolCalls = delta.tool_calls as Json[] | undefined;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        const idx = typeof tc.index === "number" ? tc.index : 0;
        let t = this.tools.get(idx);
        if (!t) {
          t = { itemId: `fc_${this.responseIdSuffix()}_${idx}`, outputIndex: -1, callId: "", name: "", args: "", opened: false };
          this.tools.set(idx, t);
        }
        if (typeof tc.id === "string" && tc.id) t.callId = tc.id;
        const fn = tc.function as Json | undefined;
        if (fn && typeof fn.name === "string" && fn.name) t.name = fn.name;

        if (!t.opened) {
          // Upstream tool_call.id göndermezse (OpenAI-uyumsuz sağlayıcı) call_id boş
          // kalmasın — non-stream yoluyla parite için sentetik id ata. Gerçek id sonra
          // gelirse üstteki satır onu yazar (Codex output_item.done'dan okur).
          if (!t.callId) t.callId = `call_${this.responseIdSuffix()}_${idx}`;
          t.outputIndex = this.nextOutputIndex++;
          t.opened = true;
          events.push(
            this.ev({
              type: "response.output_item.added",
              output_index: t.outputIndex,
              item: { id: t.itemId, type: "function_call", status: "in_progress", call_id: t.callId, name: t.name, arguments: "" },
            }),
          );
        }
        if (fn && typeof fn.arguments === "string" && fn.arguments.length > 0) {
          events.push(
            this.ev({
              type: "response.function_call_arguments.delta",
              item_id: t.itemId,
              output_index: t.outputIndex,
              delta: fn.arguments,
            }),
          );
          t.args += fn.arguments;
        }
      }
    }

    return events;
  }

  private responseIdSuffix(): string {
    return this.responseId.replace(/^resp_/, "");
  }

  // Kapanış: açık öğeleri done'la + response.completed
  finish(usage: ResponsesUsage): Json[] {
    if (this.finished) return [];
    this.finished = true;
    const events: Json[] = [];

    if (this.textOpened) {
      events.push(
        this.ev({
          type: "response.output_text.done",
          item_id: this.msgItemId,
          output_index: this.textIndex,
          content_index: 0,
          text: this.text,
        }),
      );
      events.push(
        this.ev({
          type: "response.content_part.done",
          item_id: this.msgItemId,
          output_index: this.textIndex,
          content_index: 0,
          part: { type: "output_text", text: this.text, annotations: [] },
        }),
      );
      events.push(
        this.ev({
          type: "response.output_item.done",
          output_index: this.textIndex,
          item: {
            id: this.msgItemId,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: this.text, annotations: [] }],
          },
        }),
      );
    }

    for (const t of this.tools.values()) {
      if (!t.opened) continue;
      events.push(
        this.ev({
          type: "response.function_call_arguments.done",
          item_id: t.itemId,
          output_index: t.outputIndex,
          name: t.name,
          arguments: t.args,
        }),
      );
      events.push(
        this.ev({
          type: "response.output_item.done",
          output_index: t.outputIndex,
          item: { id: t.itemId, type: "function_call", status: "completed", call_id: t.callId, name: t.name, arguments: t.args },
        }),
      );
    }

    events.push(this.ev({ type: "response.completed", response: this.responseSkeleton("completed", usage) }));
    return events;
  }

  // Akış ortasında upstream hatası: best-effort response.failed
  fail(message: string): Json[] {
    if (this.finished) return [];
    this.finished = true;
    const response = this.responseSkeleton("failed");
    response.error = { code: "upstream_error", message };
    return [this.ev({ type: "response.failed", response })];
  }
}
