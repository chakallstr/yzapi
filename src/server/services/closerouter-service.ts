import { Response } from "express";
import { pipeline } from "stream";
import { aiProviderBaseUrl } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { canonicalizeModelId } from "../../master-models.js";
import { getRuntimeApiConfig } from "./api-settings-service.js";
import { resolveProviderBaseUrl, resolveProviderApiKey, resolveActiveModelMap } from "./provider-config-service.js";

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
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

function extractTokenUsage(json: Record<string, unknown>): ChatUsage {
  const u = (json.usage ?? {}) as Record<string, number>;
  return {
    promptTokens: u.prompt_tokens ?? u.input_tokens ?? 0,
    completionTokens: u.completion_tokens ?? u.output_tokens ?? 0,
  };
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

// Applies the active provider profile's model_map (catalog-id → upstream-id) to
// the outgoing request body's model. An empty map (no active profile, or no
// mapping for this model) leaves the model unchanged — fully backward compatible.
// This runs IN ADDITION to the legacy OmniRoute map so each provider profile can
// declare its own upstream model naming (e.g. metro expects "claude-sonnet-4.6"
// while our canonical catalog id is "claude-sonnet-4-6"). Does NOT touch billing:
// the master model / cost is already resolved upstream in proxy.ts from the
// canonical id; only the wire name sent to the provider changes here.
async function applyProfileModelMap<T extends Record<string, unknown>>(body: T): Promise<T> {
  if (typeof body.model !== "string") return body;
  const map = await resolveActiveModelMap();
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
    id: first.id ?? "chatcmpl_omniroute",
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

async function baseHeaders(): Promise<Record<string, string>> {
  const apiKey = await resolveProviderApiKey();
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
  body: ChatRequest
): Promise<{ raw: unknown; usage: ChatUsage }> {
  const start = Date.now();
  const baseUrl = await resolveProviderBaseUrl();
  const url = `${baseUrl}/chat/completions`;
  const providerBody = await applyProfileModelMap(
    mapRequestBodyForProvider({ ...body, stream: false }, baseUrl),
  );
  const runtimeConfig = await getRuntimeApiConfig();

  const res = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: await baseHeaders(),
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
  body: TextRequest
): Promise<{ raw: unknown; usage: ChatUsage }> {
  const start = Date.now();
  const baseUrl = await resolveProviderBaseUrl();
  const url = `${baseUrl}/${endpoint}`;
  const providerBody = await applyProfileModelMap(
    mapRequestBodyForProvider({ ...body, stream: false }, baseUrl),
  );
  const runtimeConfig = await getRuntimeApiConfig();

  const res = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: await baseHeaders(),
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
  res: Response
): Promise<ChatUsage> {
  const baseUrl = await resolveProviderBaseUrl();
  const url = `${baseUrl}/chat/completions`;
  const providerBody = await applyProfileModelMap(
    mapRequestBodyForProvider({ ...body, stream: true }, baseUrl),
  );
  const runtimeConfig = await getRuntimeApiConfig();

  const upstream = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: { ...(await baseHeaders()), Accept: "text/event-stream" },
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

  return new Promise<ChatUsage>((resolve, reject) => {
    if (!upstream.body) {
      reject(new Error("No response body from AI provider"));
      return;
    }

    const usage: ChatUsage = { promptTokens: 0, completionTokens: 0 };
    let assistantText = "";
    let settled = false;
    const { Readable } = require("stream") as typeof import("stream");
    const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream);

    let buffer = "";

    const finalize = () => {
      if (settled) return;
      settled = true;
      if (usage.promptTokens <= 0) {
        usage.promptTokens = estimateTextTokens(providerBody.messages ?? "");
      }
      if (usage.completionTokens <= 0) {
        usage.completionTokens = estimateTextTokens(assistantText);
      }
      resolve(usage);
    };

    nodeStream.on("data", (chunk: Buffer) => {
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
          const u = parsed.usage as Record<string, number> | undefined;
          if (u) {
            usage.promptTokens = u.prompt_tokens ?? usage.promptTokens;
            usage.completionTokens = u.completion_tokens ?? usage.completionTokens;
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

export async function forwardImage(
  endpoint: "generations" | "edits",
  body: Record<string, unknown>
): Promise<{ raw: unknown; imageCount: number }> {
  const start = Date.now();
  const baseUrl = await resolveProviderBaseUrl();
  const url = `${baseUrl}/images/${endpoint}`;
  const runtimeConfig = await getRuntimeApiConfig();

  const res = await fetchWithRuntimeTimeout(url, {
    method: "POST",
    headers: await baseHeaders(),
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
  body: Record<string, unknown>
): Promise<{ taskId: string }> {
  const baseUrl = await resolveProviderBaseUrl();
  const url = `${baseUrl}/videos/submit`;

  const res = await fetch(url, {
    method: "POST",
    headers: await baseHeaders(),
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

export async function getVideoTask(taskId: string): Promise<Record<string, unknown>> {
  const baseUrl = await resolveProviderBaseUrl();
  const url = `${baseUrl}/videos/tasks/${taskId}`;
  const apiKey = await resolveProviderApiKey();

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
