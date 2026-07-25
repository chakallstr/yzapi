import { Response } from "express";
import {
  AttemptOptions,
  ChatRequest,
  ChatUsage,
  TextRequest,
  forwardChat,
  forwardChatStream,
  forwardChatStreamAsResponses,
  forwardImage,
  forwardTextEndpoint,
  getVideoTask,
  submitVideo,
} from "./closerouter-service.js";
import { getRuntimeApiConfig } from "./api-settings-service.js";
import type { ProviderContext } from "./provider-config-service.js";
import type { ResponsesStreamMeta } from "./responses-translation.js";

export interface ProviderAdapter {
  readonly id: "closerouter" | "ninerouter";
  forwardChat(body: ChatRequest, ctx: ProviderContext, attempt?: AttemptOptions): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardChatStream(body: ChatRequest, res: Response, ctx: ProviderContext, attempt?: AttemptOptions): Promise<ChatUsage>;
  // Responses API streaming köprüsü: upstream'i chat olarak sürer, res'e Responses event'leri yazar.
  forwardResponsesStream(body: ChatRequest, res: Response, ctx: ProviderContext, meta: ResponsesStreamMeta, attempt?: AttemptOptions): Promise<ChatUsage>;
  forwardResponsesStreamNative(body: Record<string, unknown>, res: Response, ctx: ProviderContext, meta: ResponsesStreamMeta, attempt?: AttemptOptions): Promise<ChatUsage>;
  forwardResponses(body: TextRequest, ctx: ProviderContext, attempt?: AttemptOptions): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardMessages(body: TextRequest, ctx: ProviderContext, attempt?: AttemptOptions, upstreamHeaders?: Record<string, string>): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardImage(
    endpoint: "generations" | "edits",
    body: Record<string, unknown>,
    ctx: ProviderContext,
    timeoutMs?: number,
  ): Promise<{ raw: unknown; imageCount: number; cfRemaining?: number | null }>;
  submitVideo(body: Record<string, unknown>, ctx: ProviderContext): Promise<{ taskId: string }>;
  getVideoTask(taskId: string, ctx: ProviderContext): Promise<Record<string, unknown>>;
}

export class CloseRouterAdapter implements ProviderAdapter {
  readonly id = "closerouter" as const;

  forwardChat(body: ChatRequest, ctx: ProviderContext, attempt?: AttemptOptions): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardChat(body, ctx, attempt);
  }

  forwardChatStream(body: ChatRequest, res: Response, ctx: ProviderContext, attempt?: AttemptOptions): Promise<ChatUsage> {
    return forwardChatStream(body, res, ctx, attempt);
  }

  forwardResponsesStream(body: ChatRequest, res: Response, ctx: ProviderContext, meta: ResponsesStreamMeta, attempt?: AttemptOptions): Promise<ChatUsage> {
    return forwardChatStreamAsResponses(body, res, ctx, meta, attempt);
  }

  forwardResponsesStreamNative(body: Record<string, unknown>, res: Response, ctx: ProviderContext, meta: ResponsesStreamMeta, attempt?: AttemptOptions): Promise<ChatUsage> {
    return forwardChatStreamAsResponses(body as ChatRequest, res, ctx, meta, attempt);
  }

  forwardResponses(body: TextRequest, ctx: ProviderContext, attempt?: AttemptOptions): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardTextEndpoint("responses", body, ctx, attempt);
  }

  forwardMessages(body: TextRequest, ctx: ProviderContext, attempt?: AttemptOptions, upstreamHeaders?: Record<string, string>): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardTextEndpoint("messages", body, ctx, attempt, upstreamHeaders);
  }

  forwardImage(
    endpoint: "generations" | "edits",
    body: Record<string, unknown>,
    ctx: ProviderContext,
    _timeoutMs?: number,
  ): Promise<{ raw: unknown; imageCount: number; cfRemaining?: number | null }> {
    return forwardImage(endpoint, body, ctx);
  }

  submitVideo(body: Record<string, unknown>, ctx: ProviderContext): Promise<{ taskId: string }> {
    return submitVideo(body, ctx);
  }

  getVideoTask(taskId: string, ctx: ProviderContext): Promise<Record<string, unknown>> {
    return getVideoTask(taskId, ctx);
  }
}

const adapters = {
  closerouter: new CloseRouterAdapter(),
} as const;

export async function getActiveProviderAdapter(): Promise<ProviderAdapter> {
  const config = await getRuntimeApiConfig();
  return adapters[config.activeProviderId as keyof typeof adapters] ?? adapters.closerouter;
}

export function listImplementedProviderIds(): string[] {
  return Object.keys(adapters);
}
