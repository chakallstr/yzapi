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
});
