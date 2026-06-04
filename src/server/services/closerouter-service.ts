import { Response } from "express";
import { Readable } from "stream";
import { aiProviderBaseUrl } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { canonicalizeModelId } from "../../master-models.js";
import { getRuntimeApiConfig } from "./api-settings-service.js";
import type { ProviderContext } from "./provider-config-service.js";
import {
  ResponsesStreamTranslator,
  formatResponsesSse,
  usageFromTokens,
  type ResponsesStreamMeta,
} from "./responses-translation.js";

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  // DENETİM İZİ (opsiyonel, billing'i ETKİLEMEZ): sağlayıcının HAM usage objesi
  // (Anthropic cache_read_input_tokens / cache_creation_input_tokens dahil).
  // Faturalama yalnız promptTokens/completionTokens'ı kullanır; bu alan sadece
  // usage_records.raw_usage_json'a yazılır ki gelecekte "sağlayıcı ne raporladı"
  // sorusu kanıtla cevaplanabilsin (geçmiş kaçak teşhisinde bu alan YOKtu).
  providerRaw?: unknown;
}

export interface ImageUsage {
  imageCount: number;
}

export interface ChatRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  [key: string]: unknown;
}

export interface TextRequest {
  model: string;
  stream?: boolean;
  [key: string]: unknown;
}

const OMNIROUTE_MODEL_MAP: Record<string, string> = {
  "gpt-5.4-mini": "cx/gpt-5.4-mini",
  "openai/gpt-5.4-mini": "cx/gpt-5.4-mini",
};

// ── Token usage normalleştirme (PÜR + TEST EDİLEBİLİR) ───────────────────────
//
// Sağlayıcının (WellFlow/OpenAI/Anthropic-uyumlu) usage objesinden GERÇEK giriş
// token'ını çıkarır. KRİTİK: bazı sağlayıcılar Anthropic /messages şemasında
// gerçek girişi cache_read_input_tokens / cache_creation_input_tokens alanlarında
// verir ve input_tokens'ı düşük (ör. 2) bırakır. Cache token'ları ÜCRETLİDİR
// (Anthropic: cache-read base'in 0.1×'i; cache-write 1.25×–2×) → faturalanan
// giriş token'ına DAHİL edilmelidir, yoksa giriş maliyeti tahsil edilmez (zarar).
//
// İki şema, çift sayım OLMADAN:
//   • OpenAI:    prompt_tokens girişin TAMAMINI (cache dahil) içerir → onu kullan,
//                cached_tokens AYRICA EKLENMEZ (alt küme; eklersek çift sayarız).
//   • Anthropic: input_tokens cache'i HARİÇ tutar → input + cache_read + cache_create
//                toplanır (resmi formül: total_input = input + cache_read + cache_create).
//
// Karar kuralı: prompt_tokens (OpenAI-tarzı toplam) varsa onu taban al; yoksa
// Anthropic alanlarını topla. completionTokens için de cache-dışı çıkış toplanır.
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export function normalizeProviderUsage(usageRaw: unknown): ChatUsage {
  const u = (usageRaw ?? {}) as Record<string, unknown>;

  const promptTokens = num(u.prompt_tokens); // OpenAI: kural olarak cache DAHİL toplam
  const inputTokens = num(u.input_tokens);   // Anthropic: cache HARİÇ
  const cacheRead = num(u.cache_read_input_tokens);
  const cacheCreate = num(u.cache_creation_input_tokens);
  const cacheTotal = cacheRead + cacheCreate;

  // GERÇEK giriş token'ı — iki sağlayıcı şeması, ÇİFT SAYIM olmadan:
  //   • OpenAI: prompt_tokens girişin TAMAMINI (cache dahil) içerir. cache_*_input_tokens
  //     alanları OpenAI'de YAYILMAZ (cache detayı prompt_tokens_details.cached_tokens'tadır,
  //     onu OKUMUYORUZ). Dolayısıyla prompt_tokens'a cache EKLENMEZ → çift sayım yok.
  //   • Anthropic: input_tokens cache'i HARİÇ tutar; gerçek giriş = input + cache_read + cache_create.
  // prompt_tokens raporlanmışsa OpenAI şeması kabul edilir (cache eklenmez); aksi halde
  // Anthropic şeması (input + cache) uygulanır. Bu, hibrit proxy'de bile çift saymaz.
  const prompt = promptTokens > 0
    ? promptTokens                       // OpenAI: toplam zaten dahil
    : inputTokens + cacheTotal;          // Anthropic: input + cache_read + cache_create

  const completionTokens = num(u.completion_tokens) || num(u.output_tokens);

  return { promptTokens: prompt, completionTokens };
}

function extractTokenUsage(json: Record<string, unknown>): ChatUsage {
  const usage = normalizeProviderUsage(json.usage);
  // Denetim izi: sağlayıcının HAM usage objesini sakla (billing'i etkilemez).
  if (json.usage !== undefined && json.usage !== null) usage.providerRaw = json.usage;
  return usage;
}

// Test-only export: extractTokenUsage dosya-içi private; denetim izi davranışını
// (providerRaw) test edebilmek için ince sarmalayıcı. Üretim mantığı aynen kullanılır.
export function extractTokenUsageForTest(json: Record<string, unknown>): ChatUsage {
  return extractTokenUsage(json);
}

export function estimateTextTokens(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateUsageFromPayload(body: Record<string, unknown>, json: Record<string, unknown>): ChatUsage {
  const usage = extractTokenUsage(json);
  if (usage.promptTokens > 0 || usage.completionTokens > 0) return usage;

  const choices = json.choices as Array<Record<string, unknown>> | undefined;
  const output = choices
    ?.map((choice) => {
      const message = choice.message as Record<string, unknown> | undefined;
      return message?.content ?? "";
    })
    .join("") ?? "";

  return {
    promptTokens: estimateTextTokens(body.messages ?? body.input ?? body.prompt ?? ""),
    completionTokens: estimateTextTokens(output),
  };
}

function isOmniRouteBase(baseUrl: string): boolean {
  return baseUrl.includes("127.0.0.1:20128") || baseUrl.includes("api.seslab.tr");
}

export function mapModelForProvider(model: string, baseUrl = aiProviderBaseUrl()): string {
  const canonical = canonicalizeModelId(model) ?? model;
  if (!isOmniRouteBase(baseUrl)) return canonical;
  return OMNIROUTE_MODEL_MAP[canonical] ?? OMNIROUTE_MODEL_MAP[model] ?? canonical;
}

function mapRequestBodyForProvider<T extends Record<string, unknown>>(
  body: T,
  baseUrl: string = aiProviderBaseUrl(),
): T {
  if (typeof body.model !== "string") return body;
  const mapped = mapModelForProvider(body.model, baseUrl);
  if (mapped === body.model) return body;
  return { ...body, model: mapped };
}

// Applies the resolved provider profile's model_map (catalog-id → upstream-id) to
// the outgoing request body's model. An empty map (no profile, or no mapping for
// this model) leaves the model unchanged — fully backward compatible. The map is
// supplied by the per-model ProviderContext so each provider profile declares its
// own upstream model naming (e.g. metro expects "claude-sonnet-4.6" while our
// canonical catalog id is "claude-sonnet-4-6"). This runs IN ADDITION to the
// legacy OmniRoute map. Does NOT touch billing: the master model / cost is
// already resolved upstream in proxy.ts from the canonical id; only the wire name
// sent to the provider changes here.
function applyProfileModelMap<T extends Record<string, unknown>>(
  body: T,
  map: Record<string, string>,
): T {
  if (typeof body.model !== "string") return body;
  const mapped = map[body.model];
  if (!mapped || mapped === body.model) return body;
  return { ...body, model: mapped };
}

export function parseSseCompletion(text: string): Record<string, unknown> {
  const chunks: Array<Record<string, unknown>> = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(payload) as Record<string, unknown>);
    } catch {
      // Ignore malformed event fragments; upstream error handling still catches non-200 responses.
    }
  }

  const first = chunks[0] ?? {};
  const content = chunks
    .map((chunk) => {
      const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const delta = choice?.delta as Record<string, unknown> | undefined;
      const message = choice?.message as Record<string, unknown> | undefined;
      return delta?.content ?? message?.content ?? "";
    })
    .join("");
  const finalChoice = [...chunks].reverse()
    .map((chunk) => (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0])
    .find(Boolean);
  const usage = [...chunks].reverse().find((chunk) => chunk.usage)?.usage;

  return {
    id: first.id ?? "chatcmpl",
    object: "chat.completion",
    created: first.created,
    model: first.model,
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: finalChoice?.finish_reason ?? "stop",
    }],
    ...(usage ? { usage } : {}),
  };
}

async function readProviderJson(res: globalThis.Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (contentType.includes("text/event-stream") || text.trimStart().startsWith("data: ")) {
    return parseSseCompletion(text);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function baseHeaders(apiKey: string | undefined): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey ?? ""}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchWithRuntimeTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function forwardChat(
  body: ChatRequest,
  ctx: ProviderContext
): Promise<{ raw: unknown; usage: ChatUsage }> {
  const start = Date.now();
  const baseUrl = ctx.baseUrl;
  const url = `${baseUrl}/chat/completions`;
  const providerBody = applyProfileModelMap(
    mapRequestBodyForProvider({ ...body, stream: false }, baseUrl),
    ctx.modelMap,
  );
  const runtimeConfig = await getRuntimeApiConfig();

  const res = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: baseHeaders(ctx.apiKey),
    body: JSON.stringify(providerBody),
  }, runtimeConfig.defaultRequestTimeoutMs);

  const responseMs = Date.now() - start;
  const json = await readProviderJson(res);

  logger.debug({ model: body.model, status: res.status, responseMs }, "ai provider chat");

  if (!res.ok) {
    const err = new Error(`AI provider ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return {
    raw: json,
    usage: estimateUsageFromPayload(providerBody, json),
  };
}

export async function forwardTextEndpoint(
  endpoint: "responses" | "messages",
  body: TextRequest,
  ctx: ProviderContext
): Promise<{ raw: unknown; usage: ChatUsage }> {
  const start = Date.now();
  const baseUrl = ctx.baseUrl;
  const url = `${baseUrl}/${endpoint}`;
  const providerBody = applyProfileModelMap(
    mapRequestBodyForProvider({ ...body, stream: false }, baseUrl),
    ctx.modelMap,
  );
  const runtimeConfig = await getRuntimeApiConfig();

  const res = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: baseHeaders(ctx.apiKey),
    body: JSON.stringify(providerBody),
  }, runtimeConfig.defaultRequestTimeoutMs);

  const responseMs = Date.now() - start;
  const json = await readProviderJson(res);

  logger.debug({ model: body.model, endpoint, status: res.status, responseMs }, "ai provider text endpoint");

  if (!res.ok) {
    const err = new Error(`AI provider ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return { raw: json, usage: estimateUsageFromPayload(providerBody, json) };
}

export async function forwardChatStream(
  body: ChatRequest,
  res: Response,
  ctx: ProviderContext
): Promise<ChatUsage> {
  const baseUrl = ctx.baseUrl;
  const url = `${baseUrl}/chat/completions`;
  // stream_options.include_usage: OpenAI-uyumlu sağlayıcının SON SSE chunk'ında
  // gerçek token usage'ını döndürmesini ister. Bu olmadan bazı sağlayıcılar stream'de
  // usage vermez ve biz char/4 TAHMİNİNE düşeriz — tahmin gerçek token'ın altında
  // kalırsa EKSİK TAHSİL (bizim zararımız) olur. Bu flag gerçek token'ı garantiye
  // alır; billing mantığına dokunmaz (yalnız sağlayıcıdan kesin usage talep eder).
  const providerBody = applyProfileModelMap(
    mapRequestBodyForProvider(
      { ...body, stream: true, stream_options: { include_usage: true } },
      baseUrl,
    ),
    ctx.modelMap,
  );
  const runtimeConfig = await getRuntimeApiConfig();

  const upstream = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: { ...baseHeaders(ctx.apiKey), Accept: "text/event-stream" },
    body: JSON.stringify(providerBody),
  }, runtimeConfig.defaultStreamTimeoutMs);

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    const err = new Error(`AI provider ${upstream.status}`) as Error & { status: number; body: unknown };
    err.status = upstream.status;
    err.body = errBody;
    throw err;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Proxy (nginx) SSE buffer'ını kapat + header'ları HEMEN gönder ki istemci
  // (Roo Code vb.) "API request"te beklemeden ilk byte'ı alabilsin.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  return new Promise<ChatUsage>((resolve, reject) => {
    if (!upstream.body) {
      reject(new Error("No response body from AI provider"));
      return;
    }

    const usage: ChatUsage = { promptTokens: 0, completionTokens: 0 };
    let assistantText = "";
    let settled = false;
    const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream);

    let buffer = "";

    const finalize = () => {
      if (settled) return;
      settled = true;
      clearIdle();
      if (usage.promptTokens <= 0) {
        usage.promptTokens = estimateTextTokens(providerBody.messages ?? "");
      }
      if (usage.completionTokens <= 0) {
        usage.completionTokens = estimateTextTokens(assistantText);
      }
      resolve(usage);
    };

    // Idle watchdog: upstream bağlıyken belirli süre VERİ AKMAZSA istemci
    // sonsuza kadar "API request"te asılı kalmasın — stream'i temiz kapat.
    // (defaultStreamTimeoutMs zaten header bekleme süresi; bu, akış ortasında
    // upstream susarsa devreye girer.)
    const idleMs = runtimeConfig.defaultStreamTimeoutMs ?? 120_000;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    function clearIdle() { if (idleTimer) clearTimeout(idleTimer); }
    function resetIdle() {
      clearIdle();
      idleTimer = setTimeout(() => {
        logger.error({ url, idleMs }, "ai provider stream idle timeout — upstream veri göndermedi");
        nodeStream.destroy();
        try { res.end(); } catch { /* zaten kapalı */ }
        finalize();
      }, idleMs);
    }
    resetIdle();

    nodeStream.on("data", (chunk: Buffer) => {
      resetIdle();
      const text = chunk.toString();
      buffer += text;

      // Parse SSE lines to capture usage from the last data chunk before [DONE]
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          // Stream'de de cache token'larını dahil eden ortak normalleştirmeyi
          // kullan (non-stream ile aynı matematik). Son usage chunk'ı kazanır.
          if (parsed.usage) {
            const n = normalizeProviderUsage(parsed.usage);
            if (n.promptTokens > 0) usage.promptTokens = n.promptTokens;
            if (n.completionTokens > 0) usage.completionTokens = n.completionTokens;
            // Denetim izi: son usage chunk'ının HAM halini sakla (billing'i etkilemez).
            usage.providerRaw = parsed.usage;
          }
          const choice = (parsed.choices as Array<Record<string, unknown>> | undefined)?.[0];
          const delta = choice?.delta as Record<string, unknown> | undefined;
          const message = choice?.message as Record<string, unknown> | undefined;
          assistantText += String(delta?.content ?? message?.content ?? "");
        } catch {
          // non-JSON chunk — ignore
        }
      }

      res.write(text);
    });

    nodeStream.on("end", () => {
      res.end();
      finalize();
    });

    nodeStream.on("error", (err: Error) => {
      logger.error({ err }, "ai provider stream error");
      res.end();
      finalize();
    });

    // Abort upstream if client disconnects
    res.req?.on("close", () => {
      nodeStream.destroy();
      finalize();
    });
  });
}

// ── Responses API streaming köprüsü ──────────────────────────────────────────
// Codex (>=0.99) yalnız Responses API konuşur ama upstream yalnız /chat/completions
// sunar. Bu fonksiyon upstream'i CHAT olarak (stream) sürer, gelen chat SSE delta'larını
// Responses event'lerine (response.output_text.delta vb.) çevirip res'e yazar.
// forwardChatStream'in İKİZİDİR (aynı upstream okuma/usage mantığı) ama res'e Responses
// formatı yazar — chat hot-path'i (forwardChatStream) byte-byte DOKUNULMADAN bırakılır.
// Dönüş ChatUsage: billing settle forwardChatStream ile AYNI çalışır (para yolu değişmez).
export async function forwardChatStreamAsResponses(
  body: ChatRequest,
  res: Response,
  ctx: ProviderContext,
  meta: ResponsesStreamMeta,
): Promise<ChatUsage> {
  const baseUrl = ctx.baseUrl;
  const url = `${baseUrl}/chat/completions`;
  const providerBody = applyProfileModelMap(
    mapRequestBodyForProvider(
      { ...body, stream: true, stream_options: { include_usage: true } },
      baseUrl,
    ),
    ctx.modelMap,
  );
  const runtimeConfig = await getRuntimeApiConfig();

  const upstream = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: { ...baseHeaders(ctx.apiKey), Accept: "text/event-stream" },
    body: JSON.stringify(providerBody),
  }, runtimeConfig.defaultStreamTimeoutMs);

  if (!upstream.ok) {
    // Header'lar HENÜZ gönderilmedi → proxy normal JSON hata gövdesi döndürebilir.
    const errBody = await upstream.json().catch(() => ({}));
    const err = new Error(`AI provider ${upstream.status}`) as Error & { status: number; body: unknown };
    err.status = upstream.status;
    err.body = errBody;
    throw err;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const translator = new ResponsesStreamTranslator(meta);
  const writeEvents = (events: Record<string, unknown>[]) => {
    for (const e of events) res.write(formatResponsesSse(e));
  };
  writeEvents(translator.start());

  return new Promise<ChatUsage>((resolve, reject) => {
    if (!upstream.body) {
      reject(new Error("No response body from AI provider"));
      return;
    }

    const usage: ChatUsage = { promptTokens: 0, completionTokens: 0 };
    let assistantText = "";
    let settled = false;
    const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream);
    let buffer = "";

    const finalize = () => {
      if (settled) return;
      settled = true;
      clearIdle();
      if (usage.promptTokens <= 0) usage.promptTokens = estimateTextTokens(providerBody.messages ?? "");
      if (usage.completionTokens <= 0) usage.completionTokens = estimateTextTokens(assistantText);
      try {
        writeEvents(translator.finish(usageFromTokens(usage.promptTokens, usage.completionTokens)));
      } catch { /* res kapalı olabilir */ }
      try { res.end(); } catch { /* zaten kapalı */ }
      resolve(usage);
    };

    const idleMs = runtimeConfig.defaultStreamTimeoutMs ?? 120_000;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    function clearIdle() { if (idleTimer) clearTimeout(idleTimer); }
    function resetIdle() {
      clearIdle();
      idleTimer = setTimeout(() => {
        logger.error({ url, idleMs }, "responses stream idle timeout — upstream veri göndermedi");
        nodeStream.destroy();
        finalize();
      }, idleMs);
    }
    resetIdle();

    nodeStream.on("data", (chunk: Buffer) => {
      resetIdle();
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          if (parsed.usage) {
            const n = normalizeProviderUsage(parsed.usage);
            if (n.promptTokens > 0) usage.promptTokens = n.promptTokens;
            if (n.completionTokens > 0) usage.completionTokens = n.completionTokens;
            usage.providerRaw = parsed.usage;
          }
          const choice = (parsed.choices as Array<Record<string, unknown>> | undefined)?.[0];
          const delta = choice?.delta as Record<string, unknown> | undefined;
          assistantText += String(delta?.content ?? "");
          writeEvents(translator.pushChatChunk(parsed));
        } catch {
          // non-JSON chunk — ignore
        }
      }
    });

    nodeStream.on("end", () => {
      finalize();
    });

    nodeStream.on("error", (err: Error) => {
      logger.error({ err }, "responses stream error");
      try { writeEvents(translator.fail(String(err?.message ?? "stream error"))); } catch { /* */ }
      finalize();
    });

    res.req?.on("close", () => {
      nodeStream.destroy();
      finalize();
    });
  });
}

export async function forwardImage(
  endpoint: "generations" | "edits",
  body: Record<string, unknown>,
  ctx: ProviderContext
): Promise<{ raw: unknown; imageCount: number }> {
  const start = Date.now();
  const baseUrl = ctx.baseUrl;
  const url = `${baseUrl}/images/${endpoint}`;
  const runtimeConfig = await getRuntimeApiConfig();

  const res = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: baseHeaders(ctx.apiKey),
    body: JSON.stringify(body),
  }, runtimeConfig.defaultRequestTimeoutMs);

  const responseMs = Date.now() - start;
  const json = await res.json() as Record<string, unknown>;
  logger.debug({ endpoint, status: res.status, responseMs }, "ai provider image");

  if (!res.ok) {
    const err = new Error(`AI provider ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  const data = json.data as unknown[] | undefined;
  const imageCount = data?.length ?? (body.n as number | undefined) ?? 1;
  return { raw: json, imageCount };
}

export async function submitVideo(
  body: Record<string, unknown>,
  ctx: ProviderContext
): Promise<{ taskId: string }> {
  const baseUrl = ctx.baseUrl;
  const url = `${baseUrl}/videos/submit`;

  const res = await fetch(url, {
    method: "POST",
    headers: baseHeaders(ctx.apiKey),
    body: JSON.stringify(body),
  });

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const err = new Error(`AI provider ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return { taskId: String(json.task_id) };
}

export async function getVideoTask(taskId: string, ctx: ProviderContext): Promise<Record<string, unknown>> {
  const baseUrl = ctx.baseUrl;
  const url = `${baseUrl}/videos/tasks/${taskId}`;
  const apiKey = ctx.apiKey;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey ?? ""}`,
      Accept: "application/json",
    },
  });

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const err = new Error(`AI provider ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}
