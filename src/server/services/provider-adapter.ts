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

export interface ProviderAdapter {
  readonly id: "closerouter" | "ninerouter";
  forwardChat(body: ChatRequest): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardChatStream(body: ChatRequest, res: Response): Promise<ChatUsage>;
  forwardResponses(body: TextRequest): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardMessages(body: TextRequest): Promise<{ raw: unknown; usage: ChatUsage }>;
  forwardImage(
    endpoint: "generations" | "edits",
    body: Record<string, unknown>
  ): Promise<{ raw: unknown; imageCount: number }>;
  submitVideo(body: Record<string, unknown>): Promise<{ taskId: string }>;
  getVideoTask(taskId: string): Promise<Record<string, unknown>>;
}

export class CloseRouterAdapter implements ProviderAdapter {
  readonly id = "closerouter" as const;

  forwardChat(body: ChatRequest): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardChat(body);
  }

  forwardChatStream(body: ChatRequest, res: Response): Promise<ChatUsage> {
    return forwardChatStream(body, res);
  }

  forwardResponses(body: TextRequest): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardTextEndpoint("responses", body);
  }

  forwardMessages(body: TextRequest): Promise<{ raw: unknown; usage: ChatUsage }> {
    return forwardTextEndpoint("messages", body);
  }

  forwardImage(
    endpoint: "generations" | "edits",
    body: Record<string, unknown>
  ): Promise<{ raw: unknown; imageCount: number }> {
    return forwardImage(endpoint, body);
  }

  submitVideo(body: Record<string, unknown>): Promise<{ taskId: string }> {
    return submitVideo(body);
  }

  getVideoTask(taskId: string): Promise<Record<string, unknown>> {
    return getVideoTask(taskId);
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
