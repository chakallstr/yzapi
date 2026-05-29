import { BadRequestError } from "../lib/errors.js";

export const MAX_OPERATION_CONTEXT_TOKENS = 95_000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 4_096;

type GuardEndpoint = "chat" | "messages" | "responses";

interface GuardModel {
  maxOutputTokens?: number | null;
  supportsStreaming?: boolean | null;
}

interface BuildRequestGuardOptions {
  endpoint: GuardEndpoint;
  model: GuardModel;
  body: Record<string, unknown>;
  contextLimitTokens?: number;
  outputReserveTokens?: number;
  maxTokensPerRequest?: number;
  allowStreaming?: boolean;
  temperatureMin?: number;
  temperatureMax?: number;
  topPMin?: number;
  topPMax?: number;
  endpointEnabled?: boolean;
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

function resolveRequestedOutputTokens(
  endpoint: GuardEndpoint,
  model: GuardModel,
  body: Record<string, unknown>,
  outputReserveTokens: number,
  maxTokensPerRequest: number | undefined,
) {
  const explicit = endpoint === "responses"
    ? numericOrNull(body.max_output_tokens)
    : numericOrNull(body.max_tokens);

  const maxModelOutput = model.maxOutputTokens && model.maxOutputTokens > 0
    ? Math.floor(model.maxOutputTokens)
    : null;

  const requested = explicit ?? outputReserveTokens;
  const cappedByModel = maxModelOutput ? Math.min(requested, maxModelOutput) : requested;
  const capped = maxTokensPerRequest && maxTokensPerRequest > 0
    ? Math.min(cappedByModel, Math.floor(maxTokensPerRequest))
    : cappedByModel;

  return {
    explicit,
    reservedCompletionTokens: capped,
  };
}

function numericInRange(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function buildRequestGuard(opts: BuildRequestGuardOptions): RequestGuardResult {
  if (opts.endpointEnabled === false) {
    throw new BadRequestError("Bu API endpointi şu an yönetim panelinden kapatıldı.");
  }

  if (opts.body.stream === true) {
    const streamAllowed = opts.allowStreaming !== false && opts.model.supportsStreaming !== false;
    if (!streamAllowed) {
      throw new BadRequestError("Streaming bu endpoint veya model için kapalı.");
    }
  }

  const temperature = numericInRange(opts.body.temperature);
  if (
    temperature !== null &&
    opts.temperatureMin !== undefined &&
    opts.temperatureMax !== undefined &&
    (temperature < opts.temperatureMin || temperature > opts.temperatureMax)
  ) {
    throw new BadRequestError(`temperature ${opts.temperatureMin} ile ${opts.temperatureMax} arasında olmalı.`);
  }

  const topP = numericInRange(opts.body.top_p);
  if (
    topP !== null &&
    opts.topPMin !== undefined &&
    opts.topPMax !== undefined &&
    (topP < opts.topPMin || topP > opts.topPMax)
  ) {
    throw new BadRequestError(`top_p ${opts.topPMin} ile ${opts.topPMax} arasında olmalı.`);
  }

  const contextTokens = estimateRequestContextTokens(opts.body);
  const contextLimitTokens = opts.contextLimitTokens && opts.contextLimitTokens > 0
    ? Math.floor(opts.contextLimitTokens)
    : MAX_OPERATION_CONTEXT_TOKENS;
  if (contextTokens > contextLimitTokens) {
    if (contextLimitTokens === MAX_OPERATION_CONTEXT_TOKENS) {
      throw new BadRequestError("Bu işlem 95K maksimum context limitini aşıyor. Lütfen girdiyi kısaltın veya parçalar halinde gönderin.");
    }
    throw new BadRequestError(`Bu işlem ${contextLimitTokens} maksimum context limitini aşıyor. Lütfen girdiyi kısaltın veya parçalar halinde gönderin.`);
  }

  const outputReserveTokens = opts.outputReserveTokens && opts.outputReserveTokens > 0
    ? Math.floor(opts.outputReserveTokens)
    : DEFAULT_OUTPUT_RESERVE_TOKENS;
  const { reservedCompletionTokens } = resolveRequestedOutputTokens(
    opts.endpoint,
    opts.model,
    opts.body,
    outputReserveTokens,
    opts.maxTokensPerRequest,
  );
  const guardedBody = { ...opts.body };

  if (opts.endpoint === "responses") {
    guardedBody.max_output_tokens = reservedCompletionTokens;
  } else {
    guardedBody.max_tokens = reservedCompletionTokens;
  }

  return {
    guardedBody,
    contextTokens,
    reservedCompletionTokens,
  };
}
