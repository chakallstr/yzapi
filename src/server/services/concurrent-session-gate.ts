import { dbSql } from "../db/client.js";

interface GateState {
  requests: number;
  sessions: Map<string, number>;
}

export interface ProxyConcurrencyLimits {
  concurrentSessionsPerKey: number;
  concurrentRequestsPerKey: number;
}

export interface ProxyConcurrencyAcquireInput {
  apiKeyId: string;
  sessionId?: string | null;
}

export interface ProxyConcurrencyAcquireResult {
  allowed: boolean;
  reason?: "max_concurrent_sessions" | "max_concurrent_requests";
  retryAfterSec?: number;
  activeRequests?: number;
  activeSessions?: number;
  release?: () => void;
}

const DEFAULT_LIMITS: ProxyConcurrencyLimits = {
  concurrentSessionsPerKey: 2,
  concurrentRequestsPerKey: 10,
};

const states = new Map<string, GateState>();
let limitsCache: { limits: ProxyConcurrencyLimits; at: number } | null = null;
let testLimits: ProxyConcurrencyLimits | null = null;

const CACHE_TTL_MS = 5_000;

function normalizeLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

async function readLimits(): Promise<ProxyConcurrencyLimits> {
  if (testLimits) return testLimits;
  const now = Date.now();
  if (limitsCache && now - limitsCache.at < CACHE_TTL_MS) return limitsCache.limits;

  try {
    const rows = await dbSql<{
      default_concurrent_sessions_per_key: number | null;
      default_concurrent_requests_per_key: number | null;
    }[]>`
      select default_concurrent_sessions_per_key, default_concurrent_requests_per_key
      from system_api_config
      where id = 1
      limit 1
    `;
    const row = rows[0];
    const limits = {
      concurrentSessionsPerKey: normalizeLimit(row?.default_concurrent_sessions_per_key, DEFAULT_LIMITS.concurrentSessionsPerKey),
      concurrentRequestsPerKey: normalizeLimit(row?.default_concurrent_requests_per_key, DEFAULT_LIMITS.concurrentRequestsPerKey),
    };
    limitsCache = { limits, at: now };
    return limits;
  } catch {
    return DEFAULT_LIMITS;
  }
}

function getState(apiKeyId: string): GateState {
  const existing = states.get(apiKeyId);
  if (existing) return existing;
  const created = { requests: 0, sessions: new Map<string, number>() };
  states.set(apiKeyId, created);
  return created;
}

function cleanupState(apiKeyId: string, state: GateState): void {
  if (state.requests <= 0 && state.sessions.size === 0) states.delete(apiKeyId);
}

export function extractProxySessionId(body: unknown, headers: Record<string, unknown>): string {
  const headerValue =
    headers["x-yz-session-id"] ??
    headers["x-session-id"] ??
    headers["anthropic-session-id"] ??
    headers["openai-session-id"];
  if (typeof headerValue === "string" && headerValue.trim()) return headerValue.trim().slice(0, 128);
  if (Array.isArray(headerValue) && typeof headerValue[0] === "string" && headerValue[0].trim()) {
    return headerValue[0].trim().slice(0, 128);
  }

  const b = body && typeof body === "object" ? body as Record<string, unknown> : {};
  for (const key of ["session_id", "sessionId", "conversation_id", "conversationId", "thread_id", "threadId", "user"]) {
    const value = b[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 128);
  }
  const metadata = b.metadata && typeof b.metadata === "object" ? b.metadata as Record<string, unknown> : {};
  const metadataSession = metadata.session_id ?? metadata.sessionId;
  if (typeof metadataSession === "string" && metadataSession.trim()) return metadataSession.trim().slice(0, 128);

  return "default";
}

export async function acquireProxyConcurrencyGate(
  input: ProxyConcurrencyAcquireInput,
): Promise<ProxyConcurrencyAcquireResult> {
  const limits = await readLimits();
  const sessionId = (input.sessionId?.trim() || "default").slice(0, 128);
  const state = getState(input.apiKeyId);

  if (limits.concurrentRequestsPerKey > 0 && state.requests >= limits.concurrentRequestsPerKey) {
    return {
      allowed: false,
      reason: "max_concurrent_requests",
      retryAfterSec: 1,
      activeRequests: state.requests,
      activeSessions: state.sessions.size,
    };
  }

  const isNewSession = !state.sessions.has(sessionId);
  if (isNewSession && limits.concurrentSessionsPerKey > 0 && state.sessions.size >= limits.concurrentSessionsPerKey) {
    return {
      allowed: false,
      reason: "max_concurrent_sessions",
      retryAfterSec: 1,
      activeRequests: state.requests,
      activeSessions: state.sessions.size,
    };
  }

  state.requests += 1;
  state.sessions.set(sessionId, (state.sessions.get(sessionId) ?? 0) + 1);

  let released = false;
  return {
    allowed: true,
    activeRequests: state.requests,
    activeSessions: state.sessions.size,
    release: () => {
      if (released) return;
      released = true;
      state.requests = Math.max(0, state.requests - 1);
      const current = state.sessions.get(sessionId) ?? 0;
      if (current <= 1) state.sessions.delete(sessionId);
      else state.sessions.set(sessionId, current - 1);
      cleanupState(input.apiKeyId, state);
    },
  };
}

export function resetProxyConcurrencyGateForTest(limits: ProxyConcurrencyLimits = DEFAULT_LIMITS): void {
  states.clear();
  limitsCache = null;
  testLimits = limits;
}

export function clearProxyConcurrencyGateTestLimits(): void {
  states.clear();
  limitsCache = null;
  testLimits = null;
}
