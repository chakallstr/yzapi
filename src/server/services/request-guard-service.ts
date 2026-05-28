import { BadRequestError } from "../lib/errors.js";

export const MAX_OPERATION_CONTEXT_TOKENS = 95_000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 4_096;

type GuardEndpoint = "chat" | "messages" | "responses";

interface GuardModel {
  maxOutputTokens?: number | null;
}

interface BuildRequestGuardOptions {
  endpoint: GuardEndpoint;
  model: GuardModel;
  body: Record<string, unknown>;
}

export interface RequestGuardResult {
  guardedBody: Record<string, unknown>;
  contextTokens: number;
  reservedCompletionTokens: number;
}

const NON_CONTEXT_KEYS = new Set([
  "model",
  "stream",
  "max_tokens",
  "max_output_tokens",
  "temperature",
  "top_p",
  "n",
  "stop",
  "stop_sequences",
  "presence_penalty",
  "frequency_penalty",
  "metadata",
  "user",
]);

export function estimateTextTokens(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateRequestContextTokens(body: Record<string, unknown>): number {
  const contextPayload = Object.fromEntries(
    Object.entries(body).filter(([key]) => !NON_CONTEXT_KEYS.has(key)),
  );
  return estimateTextTokens(contextPayload);
}

function numericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function resolveRequestedOutputTokens(endpoint: GuardEndpoint, model: GuardModel, body: Record<string, unknown>) {
  const explicit = endpoint === "responses"
    ? numericOrNull(body.max_output_tokens)
    : numericOrNull(body.max_tokens);

  const maxModelOutput = model.maxOutputTokens && model.maxOutputTokens > 0
    ? Math.floor(model.maxOutputTokens)
    : null;

  const requested = explicit ?? DEFAULT_OUTPUT_RESERVE_TOKENS;
  const capped = maxModelOutput ? Math.min(requested, maxModelOutput) : requested;

  return {
    explicit,
    reservedCompletionTokens: capped,
  };
}

export function buildRequestGuard(opts: BuildRequestGuardOptions): RequestGuardResult {
  const contextTokens = estimateRequestContextTokens(opts.body);
  if (contextTokens > MAX_OPERATION_CONTEXT_TOKENS) {
    throw new BadRequestError("Bu işlem 95K maksimum context limitini aşıyor. Lütfen girdiyi kısaltın veya parçalar halinde gönderin.");
  }

  const { reservedCompletionTokens } = resolveRequestedOutputTokens(opts.endpoint, opts.model, opts.body);
  const guardedBody = { ...opts.body };

  if (opts.endpoint === "responses") {
    guardedBody.max_output_tokens = numericOrNull(guardedBody.max_output_tokens) ?? reservedCompletionTokens;
  } else {
    guardedBody.max_tokens = numericOrNull(guardedBody.max_tokens) ?? reservedCompletionTokens;
  }

  return {
    guardedBody,
    contextTokens,
    reservedCompletionTokens,
  };
}
