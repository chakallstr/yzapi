import { Response } from "express";
import { pipeline } from "stream";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

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

function extractTokenUsage(json: Record<string, unknown>): ChatUsage {
  const u = (json.usage ?? {}) as Record<string, number>;
  return {
    promptTokens: u.prompt_tokens ?? u.input_tokens ?? 0,
    completionTokens: u.completion_tokens ?? u.output_tokens ?? 0,
  };
}

function baseHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CLOSEROUTER_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function forwardChat(
  body: ChatRequest
): Promise<{ raw: unknown; usage: ChatUsage }> {
  const start = Date.now();
  const url = `${env.CLOSEROUTER_BASE_URL}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ ...body, stream: false }),
  });

  const responseMs = Date.now() - start;
  const json = await res.json() as Record<string, unknown>;

  logger.debug({ model: body.model, status: res.status, responseMs }, "closerouter chat");

  if (!res.ok) {
    const err = new Error(`CloseRouter ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return {
    raw: json,
    usage: extractTokenUsage(json),
  };
}

export async function forwardTextEndpoint(
  endpoint: "responses" | "messages",
  body: TextRequest
): Promise<{ raw: unknown; usage: ChatUsage }> {
  const start = Date.now();
  const url = `${env.CLOSEROUTER_BASE_URL}/${endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ ...body, stream: false }),
  });

  const responseMs = Date.now() - start;
  const json = await res.json() as Record<string, unknown>;

  logger.debug({ model: body.model, endpoint, status: res.status, responseMs }, "closerouter text endpoint");

  if (!res.ok) {
    const err = new Error(`CloseRouter ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return { raw: json, usage: extractTokenUsage(json) };
}

export async function forwardChatStream(
  body: ChatRequest,
  res: Response
): Promise<ChatUsage> {
  const url = `${env.CLOSEROUTER_BASE_URL}/chat/completions`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { ...baseHeaders(), Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!upstream.ok) {
    const errBody = await upstream.json().catch(() => ({}));
    const err = new Error(`CloseRouter ${upstream.status}`) as Error & { status: number; body: unknown };
    err.status = upstream.status;
    err.body = errBody;
    throw err;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  return new Promise<ChatUsage>((resolve, reject) => {
    if (!upstream.body) {
      reject(new Error("No response body from CloseRouter"));
      return;
    }

    const usage: ChatUsage = { promptTokens: 0, completionTokens: 0 };
    const { Readable } = require("stream") as typeof import("stream");
    const nodeStream = Readable.fromWeb(upstream.body as import("stream/web").ReadableStream);

    let buffer = "";

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
        } catch {
          // non-JSON chunk — ignore
        }
      }

      res.write(text);
    });

    nodeStream.on("end", () => {
      res.end();
      resolve(usage);
    });

    nodeStream.on("error", (err: Error) => {
      logger.error({ err }, "closerouter stream error");
      res.end();
      reject(err);
    });

    // Abort upstream if client disconnects
    res.req?.on("close", () => {
      nodeStream.destroy();
    });
  });
}

export async function forwardImage(
  endpoint: "generations" | "edits",
  body: Record<string, unknown>
): Promise<{ raw: unknown; imageCount: number }> {
  const start = Date.now();
  const url = `${env.CLOSEROUTER_BASE_URL}/images/${endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify(body),
  });

  const responseMs = Date.now() - start;
  const json = await res.json() as Record<string, unknown>;
  logger.debug({ endpoint, status: res.status, responseMs }, "closerouter image");

  if (!res.ok) {
    const err = new Error(`CloseRouter ${res.status}`) as Error & { status: number; body: unknown };
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
  const url = `${env.CLOSEROUTER_BASE_URL}/videos/submit`;

  const res = await fetch(url, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify(body),
  });

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const err = new Error(`CloseRouter ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return { taskId: String(json.task_id) };
}

export async function getVideoTask(taskId: string): Promise<Record<string, unknown>> {
  const url = `${env.CLOSEROUTER_BASE_URL}/videos/tasks/${taskId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.CLOSEROUTER_API_KEY}`,
      Accept: "application/json",
    },
  });

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const err = new Error(`CloseRouter ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}
