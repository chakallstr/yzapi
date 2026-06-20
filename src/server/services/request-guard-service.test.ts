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
  it("defaults the context cap to MAX_OPERATION_CONTEXT_TOKENS (1M) when no contextLimitTokens is passed", () => {
    expect(MAX_OPERATION_CONTEXT_TOKENS).toBe(1_000_000);

    // A payload comfortably above the old 95K cap but below 1M must now pass.
    const guard = buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: makeTextForEstimatedTokens(200_000) }],
      },
    });

    expect(guard.contextTokens).toBe(200_000);
    expect(guard.reservedCompletionTokens).toBe(DEFAULT_OUTPUT_RESERVE_TOKENS);
    expect(guard.guardedBody.max_tokens).toBe(DEFAULT_OUTPUT_RESERVE_TOKENS);
  });

  it("caps at the passed contextLimitTokens and blocks anything above it", () => {
    // Exactly at the passed limit is allowed.
    const limit = 200_000;
    const guard = buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: makeTextForEstimatedTokens(limit) }],
      },
      contextLimitTokens: limit,
    });
    expect(guard.contextTokens).toBe(limit);

    // One token above the passed limit is blocked with the dynamic message.
    expect(() => buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: makeTextForEstimatedTokens(limit + 1) }],
      },
      contextLimitTokens: limit,
    })).toThrowError(BadRequestError);

    expect(() => buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: makeTextForEstimatedTokens(limit + 1) }],
      },
      contextLimitTokens: limit,
    })).toThrow(`Bu işlem ${limit} maksimum context limitini aşıyor. Lütfen girdiyi kısaltın veya parçalar halinde gönderin.`);
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

  it("strips customerId from guardedBody before upstream forwarding", () => {
    const guard = buildRequestGuard({
      endpoint: "chat",
      model,
      body: {
        model: "gpt-5.5",
        messages: [{ role: "user", content: "test" }],
        customerId: "b653ee71-45a6-40cc-8d8d-374c1eae0d76",
      },
    });
    expect(guard.guardedBody.customerId).toBeUndefined();
    expect(guard.guardedBody.messages).toBeDefined();
    expect(guard.guardedBody.model).toBe("gpt-5.5");
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

  it("strips sampling params (temperature/top_p/top_k) when the model rejects them", () => {
    // Opus 4.7/4.8/Fable reject these params upstream (400 invalid_request_error
    // "temperature is deprecated for this model"). Clients like Cline/Roo send them
    // by default — the gateway must drop them before forwarding.
    const guard = buildRequestGuard({
      endpoint: "chat",
      model,
      body: { model: "claude-opus-4.8", messages: [], temperature: 0.7, top_p: 0.9, top_k: 40 },
      rejectsSamplingParams: true,
    });

    expect(guard.guardedBody).not.toHaveProperty("temperature");
    expect(guard.guardedBody).not.toHaveProperty("top_p");
    expect(guard.guardedBody).not.toHaveProperty("top_k");
  });

  it("does NOT range-validate sampling params for models that reject them (they are stripped instead)", () => {
    // Even an out-of-range temperature must not 400 — it is simply dropped.
    expect(() => buildRequestGuard({
      endpoint: "chat",
      model,
      body: { model: "claude-opus-4.8", messages: [], temperature: 2.5 },
      temperatureMin: 0,
      temperatureMax: 2,
      rejectsSamplingParams: true,
    })).not.toThrow();
  });

  it("keeps sampling params for models that accept them (default behavior)", () => {
    const guard = buildRequestGuard({
      endpoint: "chat",
      model,
      body: { model: "claude-sonnet-4-6", messages: [], temperature: 0.7, top_p: 0.9 },
    });

    expect(guard.guardedBody.temperature).toBe(0.7);
    expect(guard.guardedBody.top_p).toBe(0.9);
  });
});
