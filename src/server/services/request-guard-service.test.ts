import { describe, expect, it } from "vitest";
import { BadRequestError } from "../lib/errors.js";
import {
  buildRequestGuard,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  estimateRequestContextTokens,
  MAX_OPERATION_CONTEXT_TOKENS,
} from "./request-guard-service.js";

const model = { maxOutputTokens: 128000 };

function makeTextForEstimatedTokens(tokens: number): string {
  let low = 0;
  let high = tokens * 4 + 400;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const body = { messages: [{ role: "user", content: "a".repeat(mid) }] };
    const estimated = estimateRequestContextTokens(body);
    if (estimated === tokens) return "a".repeat(mid);
    if (estimated < tokens) low = mid + 1;
    else high = mid - 1;
  }
  throw new Error(`cannot create payload for token estimate ${tokens}`);
}

describe("request guard service", () => {
  it("allows exactly 95K estimated context", () => {
    const guard = buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: makeTextForEstimatedTokens(MAX_OPERATION_CONTEXT_TOKENS) }],
      },
    });

    expect(guard.contextTokens).toBe(MAX_OPERATION_CONTEXT_TOKENS);
    expect(guard.reservedCompletionTokens).toBe(DEFAULT_OUTPUT_RESERVE_TOKENS);
    expect(guard.guardedBody.max_tokens).toBe(DEFAULT_OUTPUT_RESERVE_TOKENS);
  });

  it("blocks requests above 95K estimated context before upstream", () => {
    expect(() => buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: makeTextForEstimatedTokens(MAX_OPERATION_CONTEXT_TOKENS + 1) }],
      },
    })).toThrowError(BadRequestError);

    expect(() => buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: makeTextForEstimatedTokens(MAX_OPERATION_CONTEXT_TOKENS + 1) }],
      },
    })).toThrow("Bu işlem 95K maksimum context limitini aşıyor. Lütfen girdiyi kısaltın veya parçalar halinde gönderin.");
  });

  it("preserves explicit response max_output_tokens when provided", () => {
    const guard = buildRequestGuard({
      endpoint: "responses",
      model,
      body: {
        model: "gpt-5.4-mini",
        input: "Merhaba",
        max_output_tokens: 777,
      },
    });

    expect(guard.reservedCompletionTokens).toBe(777);
    expect(guard.guardedBody.max_output_tokens).toBe(777);
  });

  it("respects custom context and output policy overrides", () => {
    const guard = buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: "Merhaba" }],
        max_tokens: 9999,
      },
      contextLimitTokens: 2000,
      outputReserveTokens: 3000,
      maxTokensPerRequest: 1200,
    });

    expect(guard.contextTokens).toBeLessThan(2000);
    expect(guard.reservedCompletionTokens).toBe(1200);
    expect(guard.guardedBody.max_tokens).toBe(1200);
  });

  it("blocks disabled endpoints and disallowed streaming", () => {
    expect(() => buildRequestGuard({
      endpoint: "messages",
      model: { maxOutputTokens: 1000, supportsStreaming: true },
      body: { model: "gpt-5.4-mini", messages: [], stream: true },
      endpointEnabled: false,
    })).toThrow("Bu API endpointi şu an yönetim panelinden kapatıldı.");

    expect(() => buildRequestGuard({
      endpoint: "chat",
      model: { maxOutputTokens: 1000, supportsStreaming: false },
      body: { model: "gpt-5.4-mini", messages: [], stream: true },
      allowStreaming: true,
    })).toThrow("Streaming bu endpoint veya model için kapalı.");
  });

  it("blocks temperature and top_p values outside configured ranges", () => {
    expect(() => buildRequestGuard({
      endpoint: "chat",
      model,
      body: { model: "gpt-5.4-mini", messages: [], temperature: 2.5 },
      temperatureMin: 0,
      temperatureMax: 2,
    })).toThrow("temperature 0 ile 2 arasında olmalı.");

    expect(() => buildRequestGuard({
      endpoint: "chat",
      model,
      body: { model: "gpt-5.4-mini", messages: [], top_p: 1.2 },
      topPMin: 0,
      topPMax: 1,
    })).toThrow("top_p 0 ile 1 arasında olmalı.");
  });
});
