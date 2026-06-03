import { Response } from "express";
import {
  ChatRequest,
  ChatUsage,
  TextRequest,
  forwardChat,
  forwardChatStream,
  forwardImage,
  forwardTextEndpoint,
  getVideoTask,
  submitVideo,
} from "./closerouter-service.js";
import { getRuntimeApiConfig } from "./api-settings-service.js";
import type { ProviderContext } from "./provider-config-service.js";

export interface ProviderAdapter {
  readonly id: "closerouter" | "ninerouter";
  forwardChat(body: ChatRequest, ctx: ProviderContext): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardChatStream(body: ChatRequest, res: Response, ctx: ProviderContext): Promise<ChatUsage>;
  forwardResponses(body: TextRequest, ctx: ProviderContext): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardMessages(body: TextRequest, ctx: ProviderContext): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardImage(
    endpoint: "generations" | "edits",
    body: Record<string, unknown>,
    ctx: ProviderContext
  ): Promise<{ raw: unknown; imageCount: number }>;
  submitVideo(body: Record<string, unknown>, ctx: ProviderContext): Promise<{ taskId: string }>;
  getVideoTask(taskId: string, ctx: ProviderContext): Promise<Record<string, unknown>>;
}

export class CloseRouterAdapter implements ProviderAdapter {
  readonly id = "closerouter" as const;

  forwardChat(body: ChatRequest, ctx: ProviderContext): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardChat(body, ctx);
  }

  forwardChatStream(body: ChatRequest, res: Response, ctx: ProviderContext): Promise<ChatUsage> {
    return forwardChatStream(body, res, ctx);
  }

  forwardResponses(body: TextRequest, ctx: ProviderContext): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardTextEndpoint("responses", body, ctx);
  }

  forwardMessages(body: TextRequest, ctx: ProviderContext): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardTextEndpoint("messages", body, ctx);
  }

  forwardImage(
    endpoint: "generations" | "edits",
    body: Record<string, unknown>,
    ctx: ProviderContext
  ): Promise<{ raw: unknown; imageCount: number }> {
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
