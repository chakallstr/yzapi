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

/** İstemcinin bir aracı hangi Responses tipiyle deklare ettiği. */
export type ResponsesToolKind = "function" | "custom" | "local_shell";

/**
 * Stream yolu araç telemetrisi (SALT-GÖZLEM).
 *
 * NEDEN: sessiz arıza sayacı bugün yalnız non-stream dalında çalışıyor; Codex akış
 * kullanır. Bu toplayıcı, translator'ın gördüğü upstream tool_call sayısını ve istemciye
 * GERÇEKTEN yayılan araç öğesi sayısını route'a taşır (bkz. spec görev 8.3 / HANDOFF item F).
 *
 * Ayrım: `upstreamToolCalls > 0 && emittedToolItems === 0` → çeviri/emit hatası BİZDE;
 * `emittedToolItems > 0` → gateway işini yaptı, sorun istemci tarafında (sandbox/cwd/izin).
 *
 * Yalnız SAYI tutar; araç adı/argüman/içerik TAŞIMAZ. Translator'ın ürettiği event dizisi
 * bu alandan bağımsızdır (golden korpus kilidi).
 */
export interface ResponsesStreamStats {
  /** upstream chat SSE'de görülen ayrı tool_call slotu sayısı */
  upstreamToolCalls: number;
  /** istemciye `response.output_item.added` ile yayılan araç öğesi sayısı */
  emittedToolItems: number;
}

export function createResponsesStreamStats(): ResponsesStreamStats {
  return { upstreamToolCalls: 0, emittedToolItems: 0 };
}

export interface ResponsesStreamMeta {
  id: string; // request id (resp_/msg_/fc_ id türetmek için)
  model: string; // canonical master model id (yanıtta gösterilecek)
  createdAt: number; // unix saniye
  /**
   * araç adı → istemcinin DEKLARE ETTİĞİ tip. Dönüş çevirisi, upstream'den gelen
   * tool_call'ı istemcinin beklediği öğe tipiyle (function_call / custom_tool_call /
   * local_shell_call) yayabilmek için buna bakar. OPSİYONELDİR: verilmezse dönüş
   * tipi bugünkü ad-tabanlı heuristikle seçilir (geriye dönük uyumluluk).
   */
  toolKinds?: Record<string, ResponsesToolKind>;
  /**
   * OPSİYONEL salt-gözlem sayaç toplayıcısı (bkz. ResponsesStreamStats). Verilirse
   * translator sayaçları artırır; verilmezse hiçbir şey değişmez. Üretilen event
   * dizisi her iki durumda da BİT-BİT aynıdır.
   */
  stats?: ResponsesStreamStats;
}

interface ChatMessage {
  role: string;
  content: unknown;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

type Json = Record<string, unknown>;
const LOCAL_SHELL_TOOL_NAME = "local_shell";

const LOCAL_SHELL_CHAT_TOOL: Json = {
  type: "function",
  function: {
    name: LOCAL_SHELL_TOOL_NAME,
    description: "Execute a local shell command.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "object",
          properties: {
            type: { type: "string", const: "exec" },
            command: { type: "array", items: { type: "string" } },
            env: { type: "object", additionalProperties: { type: "string" } },
            timeout_ms: { type: "number" },
            user: { type: "string" },
            working_directory: { type: "string" },
          },
          required: ["type", "command", "env"],
          additionalProperties: false,
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
};

function readJsonObject(raw: unknown): Json | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Json;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : null;
  } catch {
    return null;
  }
}

function localShellArgumentsFromAction(action: unknown): string {
  return JSON.stringify({ action: readJsonObject(action) ?? action ?? { type: "exec", command: [], env: {} } });
}

function localShellActionFromArguments(args: unknown): Json {
  const parsed = readJsonObject(args);
  const action = readJsonObject(parsed?.action);
  return action ?? { type: "exec", command: [], env: {} };
}

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

// ── custom (freeform) araç ───────────────────────────────────────────────────
// Responses `{type:"custom"}` aracı serbest-biçim metin alır (Codex'in apply_patch'i).
// chat/completions'ta serbest-biçim araç yoktur → tek `input: string` parametreli bir
// function sarmalına eşlenir. Dönüşte (toolKinds sayesinde) `custom_tool_call` olarak
// geri çevrilir, böylece istemcinin sözleşmesi korunur. Eşleme kayıpsız DEĞİLDİR
// (grammar/format kısıtı JSON string'e iner) ama aracı sessizce düşürmekten iyidir;
// native bacak varken degrade YERİNE failover seçilmesinin sebebi de budur (bkz proxy.ts).
const CUSTOM_TOOL_DEFAULT_DESCRIPTION =
  "Freeform tool. Pass the entire payload as a single string in the `input` field.";

function customChatTool(t: Json): Json {
  return {
    type: "function",
    function: {
      name: t.name,
      description: typeof t.description === "string" && t.description.length > 0 ? t.description : CUSTOM_TOOL_DEFAULT_DESCRIPTION,
      parameters: {
        type: "object",
        properties: { input: { type: "string" } },
        required: ["input"],
        additionalProperties: false,
      },
    },
  };
}

/** custom araç çağrısının chat `arguments` string'inden Responses `input` string'ini çıkarır. */
function customToolInputFromArguments(args: unknown): string {
  if (typeof args !== "string") return args == null ? "" : JSON.stringify(args);
  const parsed = readJsonObject(args);
  const input = parsed?.input;
  if (typeof input === "string") return input;
  return args; // JSON değil veya input yok → ham string (kayıpsız fallback)
}

function toolNameOf(t: Json): string | undefined {
  const direct = t.name;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const nested = (t.function as Json | undefined)?.name;
  return typeof nested === "string" && nested.length > 0 ? nested : undefined;
}

/**
 * Codex Desktop/CLI bazı sürümlerde araç şemalarını üst düzey `tools` yerine
 * `input[]` içinde `{ type: "additional_tools", tools: [...] }` kontrol öğesiyle
 * gönderir. Bu saf şekil düzeltici gerçek şemaları üst düzeye yükseltir ve kontrol
 * öğesini konuşma geçmişinden çıkarır; aksi hâlde öğe boş bir developer/system
 * mesajına dönüşür ve model hiçbir aracı göremez.
 *
 * Üst düzey `tools` otoriterdir: aynı adlı ek araç onu ezemez. Bug koşulu yoksa
 * aynı nesne örneği döner; böylece mevcut isteklerin davranışı bit-bit korunur.
 */
export function liftAdditionalTools(body: Json): Json {
  if (!Array.isArray(body.input)) return body;

  let found = false;
  const lifted: unknown[] = [];
  const remainingInput: unknown[] = [];

  for (const raw of body.input) {
    if (raw && typeof raw === "object" && (raw as Json).type === "additional_tools") {
      found = true;
      const tools = (raw as Json).tools;
      if (Array.isArray(tools)) lifted.push(...tools);
      continue;
    }
    remainingInput.push(raw);
  }

  if (!found) return body;

  const existing = Array.isArray(body.tools) ? body.tools : [];
  const merged = [...existing];
  const authoritativeNames = new Set<string>();
  const collectNames = (items: unknown[]) => {
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const tool = raw as Json;
      const name = toolNameOf(tool);
      if (name) authoritativeNames.add(name);
      if (tool.type === "namespace" && Array.isArray(tool.tools)) collectNames(tool.tools);
    }
  };
  collectNames(existing);

  const prepareLiftedTool = (raw: unknown): unknown | undefined => {
    if (!raw || typeof raw !== "object") return raw;
    const tool = raw as Json;
    const name = toolNameOf(tool);
    if (name && authoritativeNames.has(name)) return undefined;

    if (tool.type === "namespace" && Array.isArray(tool.tools)) {
      const children = tool.tools
        .map((child) => prepareLiftedTool(child))
        .filter((child): child is unknown => child !== undefined);
      if (children.length === 0) return undefined;
      if (name) authoritativeNames.add(name);
      return children.length === tool.tools.length ? tool : { ...tool, tools: children };
    }

    if (name) authoritativeNames.add(name);
    return raw;
  };

  for (const raw of lifted) {
    const preparedTool = prepareLiftedTool(raw);
    if (preparedTool !== undefined) merged.push(preparedTool);
  }

  const prepared: Json = { ...body, input: remainingInput };
  if (merged.length > 0 || Array.isArray(body.tools)) prepared.tools = merged;
  return prepared;
}

/**
 * İstek gövdesindeki `tools` listesinden `araç adı → deklare edilen tip` haritası.
 * Boş/geçersiz girdide `undefined` döner — böylece meta'ya alan hiç eklenmez ve
 * mevcut çağrı yolları bit-bit aynı kalır.
 */
export function deriveToolKinds(tools: unknown): Record<string, ResponsesToolKind> | undefined {
  if (!Array.isArray(tools)) return undefined;
  const kinds: Record<string, ResponsesToolKind> = {};
  const visit = (items: unknown[]) => {
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Json;
      if (t.type === "namespace" && Array.isArray(t.tools)) {
        visit(t.tools);
        continue;
      }
      if (t.type === "local_shell") {
        kinds[LOCAL_SHELL_TOOL_NAME] = "local_shell";
        continue;
      }
      const name = toolNameOf(t);
      if (!name) continue;
      if (t.type === "custom") kinds[name] = "custom";
      else if (t.type === "function") kinds[name] = "function";
    }
  };
  visit(tools);
  return Object.keys(kinds).length > 0 ? kinds : undefined;
}

// ── tools: Responses (flat) → chat (function sarmalı) ────────────────────────
export interface ToolConversion {
  tools?: unknown[];
  /** İstekte deklare edilen Responses araç tipleri (sırayla, tekrarsız). */
  declaredTypes: string[];
  /** Upstream'e taşınabilen tipler. */
  mappedTypes: string[];
  /** Taşınamayan (düşürülen) tipler — teşhis logu bunu raporlar, sessiz kayıp olmaz. */
  droppedTypes: string[];
}

function convertToolsDetailed(tools: unknown): ToolConversion {
  if (!Array.isArray(tools)) return { declaredTypes: [], mappedTypes: [], droppedTypes: [] };
  const out: Json[] = [];
  const declared: string[] = [];
  const mapped: string[] = [];
  const dropped: string[] = [];
  const note = (list: string[], type: string) => {
    if (!list.includes(type)) list.push(type);
  };

  const visit = (items: unknown[]) => {
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as Json;
      const type = typeof t.type === "string" ? t.type : "unknown";
      note(declared, type);

      if (t.type === "namespace" && Array.isArray(t.tools)) {
        const before = out.length;
        visit(t.tools);
        note(out.length > before ? mapped : dropped, type);
      } else if (t.type === "local_shell") {
        out.push(LOCAL_SHELL_CHAT_TOOL);
        note(mapped, type);
      } else if (t.type === "function") {
        if (t.function && typeof t.function === "object") {
          out.push(t); // zaten chat-şekilli
        } else {
          const fn: Json = { name: t.name, description: t.description, parameters: t.parameters };
          if (t.strict !== undefined) fn.strict = t.strict;
          out.push({ type: "function", function: fn });
        }
        note(mapped, type);
      } else if (t.type === "custom" && toolNameOf(t)) {
        out.push(customChatTool(t));
        note(mapped, type);
      } else {
        // Eşlemesi olmayan Responses araçları (web_search, image_generation, adsız custom...)
        // chat upstream'de anlaşılmaz → düşürülür AMA raporlanır.
        note(dropped, type);
      }
    }
  };
  visit(tools);

  return {
    tools: out.length > 0 ? out : undefined,
    declaredTypes: declared,
    mappedTypes: mapped,
    droppedTypes: dropped,
  };
}

/**
 * Upstream'den dönen yanıtta KAÇ araç çağrısı olduğunu sayar (sır/içerik taşımaz).
 *
 * NEDEN: "status=success ama hiç araç çağrısı yok" kombinasyonu, araç deklare eden bir
 * istemci için sessiz arıza demektir — upstream düz metin döndürmüştür, istemci hiçbir
 * şey yürütmez ama istek başarılı sayılıp faturalanır. Bu sayaç o durumu ölçülebilir
 * kılar (bkz. .kiro/specs/responses-tool-contract-fix görev 8.2/8.4).
 *
 * `native=true` → gövde HAM Responses yanıtıdır (output[] öğeleri sayılır).
 * `native=false` → gövde chat/completions yanıtıdır (choices[].message.tool_calls sayılır).
 */
export function countResponseToolCalls(raw: unknown, native: boolean): number {
  if (!raw || typeof raw !== "object") return 0;
  const body = raw as Json;
  if (native) {
    const output = body.output;
    if (!Array.isArray(output)) return 0;
    let n = 0;
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const type = (item as Json).type;
      if (type === "function_call" || type === "custom_tool_call" || type === "local_shell_call") n++;
    }
    return n;
  }
  const choices = body.choices;
  if (!Array.isArray(choices)) return 0;
  let n = 0;
  for (const choice of choices) {
    const calls = ((choice as Json | undefined)?.message as Json | undefined)?.tool_calls;
    if (Array.isArray(calls)) n += calls.length;
  }
  return n;
}

/** Teşhis logu için araç sözleşmesi özeti (sır/ad/argüman içermez — yalnız tip ve sayı). */
export function summarizeToolContract(body: Json): {
  toolCount: number;
  /** Upstream'e GERÇEKTEN gönderilen araç sayısı (düşenler sayılmaz) — bkz görev 8.2. */
  mappedToolCount: number;
  declaredToolTypes: string[];
  mappedToolTypes: string[];
  droppedToolTypes: string[];
  toolChoiceKind: "none" | "string" | "function" | "other";
} {
  const prepared = liftAdditionalTools(body);
  const conv = convertToolsDetailed(prepared.tools);
  const tc = prepared.tool_choice;
  const toolChoiceKind =
    tc == null
      ? "none"
      : typeof tc === "string"
        ? "string"
        : typeof tc === "object" && (tc as Json).type === "function"
          ? "function"
          : "other";
  return {
    toolCount: Array.isArray(prepared.tools) ? prepared.tools.length : 0,
    mappedToolCount: conv.tools?.length ?? 0,
    declaredToolTypes: conv.declaredTypes,
    mappedToolTypes: conv.mappedTypes,
    droppedToolTypes: conv.droppedTypes,
    toolChoiceKind,
  };
}

/**
 * "Sahte başarı" sınıflandırıcısı (bkz. spec görev 8.4).
 *
 * İstek `success` kaydedildi, upstream'e araç GİTTİ (veya araçlar çeviride DÜŞTÜ) ama hiç
 * araç çağrısı dönmedi → istemci hiçbir şey yürütmez; müşteri "hiçbir şey yapmıyor" der
 * ama `usage_records` bunu `success` gösterir. Bu yüklem o kombinasyonu görünür kılar.
 * Başarısız/ücretsiz isteklerde araç çağrısı yokluğu BEKLENİR → şüpheli değildir.
 *
 * Saf yüklem: billing, DB ve yanıt gövdesi ETKİLENMEZ.
 */
export function isSuspiciousToolOutcome(o: {
  status: string;
  mappedToolCount: number;
  toolCallCount: number;
  droppedToolTypes: string[];
}): boolean {
  if (o.status !== "success") return false;
  if (o.toolCallCount > 0) return false;
  return o.mappedToolCount > 0 || o.droppedToolTypes.length > 0;
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
  const prepared = liftAdditionalTools(body);
  const messages: ChatMessage[] = [];
  let pendingToolCalls: Json[] = [];

  const flushToolCalls = () => {
    if (pendingToolCalls.length > 0) {
      messages.push({ role: "assistant", content: null, tool_calls: pendingToolCalls });
      pendingToolCalls = [];
    }
  };

  const instructions = prepared.instructions;
  if (typeof instructions === "string" && instructions.length > 0) {
    messages.push({ role: "system", content: instructions });
  }

  const input = prepared.input;
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

      if (type === "local_shell_call") {
        pendingToolCalls.push({
          id: (item.call_id as string) ?? (item.id as string) ?? "",
          type: "function",
          function: { name: LOCAL_SHELL_TOOL_NAME, arguments: localShellArgumentsFromAction(item.action) },
        });
        continue;
      }

      // custom_tool_call (freeform araç geçmişi): chat'te function tool_call olarak taşınır;
      // serbest metin `input` alanına sarılır (gidiş eşlemesinin aynası).
      if (type === "custom_tool_call") {
        const rawInput = item.input;
        pendingToolCalls.push({
          id: (item.call_id as string) ?? (item.id as string) ?? "",
          type: "function",
          function: {
            name: item.name ?? "",
            arguments: JSON.stringify({ input: typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput ?? "") }),
          },
        });
        continue;
      }

      // function_call_output: önce bekleyen tool_call'ları (assistant) flush et, sonra tool mesajı
      if (type === "function_call_output" || type === "local_shell_call_output" || type === "custom_tool_call_output") {
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

      // Rolü OLMAYAN, `message` OLMAYAN ve içeriği OLMAYAN öğe (örn web_search_call,
      // image_generation_call, gelecekteki bilinmeyen tipler): aşağıdaki generic dal bunu
      // {role:"user", content:""} boş mesajına çevirip geçmişi bozuyordu (bazı upstream'ler
      // boş content'e 400 verir). Üç koşul birlikte arandığı için rol taşıyan / type:"message"
      // olan / içerik taşıyan hiçbir öğe bu daldan etkilenmez (preservation).
      if (item.role === undefined && typeof type === "string" && type !== "message" && item.content == null) continue;

      // message (veya type'sız ama role'lu) öğe
      flushToolCalls();
      let role = (item.role as string) ?? "user";
      if (role === "developer") role = "system";
      messages.push({ role, content: contentToChatContent(item.content) });
    }
  }
  flushToolCalls();

  const chat: Json = {
    model: normalizeRequestedModel(prepared.model),
    messages,
  };

  if (typeof prepared.max_output_tokens === "number") chat.max_tokens = prepared.max_output_tokens;
  if (typeof prepared.temperature === "number") chat.temperature = prepared.temperature;
  if (typeof prepared.top_p === "number") chat.top_p = prepared.top_p;
  if (prepared.stream === true) chat.stream = true;
  if (typeof prepared.parallel_tool_calls === "boolean") chat.parallel_tool_calls = prepared.parallel_tool_calls;

  const conversion = convertToolsDetailed(prepared.tools);
  if (conversion.tools) chat.tools = conversion.tools;
  const toolChoice = convertToolChoice(prepared.tool_choice);
  // İstemci araç GÖNDERDİ ama hiçbiri çeviriden sağ çıkmadıysa tool_choice'u İLETME:
  // `tools` yok + `tool_choice` var = upstream 400. Araç hiç gönderilmediyse (tools yok/boş)
  // bugünkü davranış korunur — tool_choice neyse iletilir.
  const allToolsDropped = Array.isArray(prepared.tools) && prepared.tools.length > 0 && !conversion.tools;
  if (toolChoice !== undefined && !allToolsDropped) chat.tool_choice = toolChoice;

  // reasoning.effort → reasoning_effort (sağlayıcı destekliyorsa kullanır, yoksa yok sayar)
  const reasoning = prepared.reasoning as Json | undefined;
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

// ── dönüş: tool_call → Responses öğe tipi ────────────────────────────────────
// Önce istemcinin DEKLARE ETTİĞİ tip (meta.toolKinds), yoksa bugünkü ad-tabanlı
// heuristik. toolKinds verilmediğinde sonuç bugünküyle BİREBİR aynıdır.
function responsesToolItemKind(name: string, toolKinds?: Record<string, ResponsesToolKind>): ResponsesToolKind {
  const declared = toolKinds?.[name];
  if (declared) return declared;
  return name === LOCAL_SHELL_TOOL_NAME ? "local_shell" : "function";
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
      const callId = (tc.id as string) ?? `call_${meta.id}_${i}`;
      const name = String(fn.name ?? "");
      const args = typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? "");
      const kind = responsesToolItemKind(name, meta.toolKinds);
      if (kind === "local_shell") {
        output.push({
          id: `fc_${meta.id}_${i}`,
          type: "local_shell_call",
          status: "completed",
          call_id: callId,
          action: localShellActionFromArguments(args),
        });
        return;
      }
      if (kind === "custom") {
        output.push({
          id: `fc_${meta.id}_${i}`,
          type: "custom_tool_call",
          status: "completed",
          call_id: callId,
          name,
          input: customToolInputFromArguments(args),
        });
        return;
      }
      output.push({
        id: `fc_${meta.id}_${i}`,
        type: "function_call",
        status: "completed",
        call_id: callId,
        name,
        arguments: args,
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
  private readonly toolKinds?: Record<string, ResponsesToolKind>;
  private readonly stats?: ResponsesStreamStats;
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
    this.toolKinds = meta.toolKinds;
    this.stats = meta.stats;
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
      items[t.outputIndex] = this.toolOutputItem(t, "completed");
    }
    return items.filter((x): x is Json => x != null);
  }

  private toolOutputItem(t: ToolState, status: "in_progress" | "completed"): Json {
    const kind = responsesToolItemKind(t.name, this.toolKinds);
    if (kind === "local_shell") {
      return {
        id: t.itemId,
        type: "local_shell_call",
        status,
        call_id: t.callId,
        action: localShellActionFromArguments(t.args),
      };
    }
    if (kind === "custom") {
      return {
        id: t.itemId,
        type: "custom_tool_call",
        status,
        call_id: t.callId,
        name: t.name,
        input: status === "completed" ? customToolInputFromArguments(t.args) : "",
      };
    }
    return {
      id: t.itemId,
      type: "function_call",
      status,
      call_id: t.callId,
      name: t.name,
      arguments: status === "completed" ? t.args : "",
    };
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
          // Salt-gözlem: upstream'in AÇTIĞI araç çağrısı slotu (yayım henüz yapılmadı).
          if (this.stats) this.stats.upstreamToolCalls++;
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
          // Salt-gözlem: araç öğesi GERÇEKTEN istemciye yayıldı (output_item.added).
          if (this.stats) this.stats.emittedToolItems++;
          events.push(
            this.ev({
              type: "response.output_item.added",
              output_index: t.outputIndex,
              item: this.toolOutputItem(t, "in_progress"),
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
          item: this.toolOutputItem(t, "completed"),
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
