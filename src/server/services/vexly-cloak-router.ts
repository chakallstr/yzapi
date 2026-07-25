import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const UPSTREAM_ORIGIN = "https://vexly.cc";
const DEFAULT_UPSTREAM_HEADER_TIMEOUT_MS = 30_000;

const ROUTES = {
  "/cli/v1/messages": { lane: "cli", upstreamPath: "/v1/messages", prefixes: ["tk_live_", "api_live_"], method: "POST" },
  "/cli/v1/models": { lane: "cli", upstreamPath: "/v1/models", prefixes: ["tk_live_", "api_live_"], method: "GET" },
  "/api/v1/chat/completions": { lane: "api", upstreamPath: "/v1/chat/completions", prefix: "api_live_", method: "POST" },
  "/api/v1/models": { lane: "api", upstreamPath: "/v1/models", prefix: "api_live_", method: "GET" },
} as const;

type RoutePath = keyof typeof ROUTES;
type Lane = (typeof ROUTES)[RoutePath]["lane"];
type RequestOutcome =
  | "completed"
  | "rejected"
  | "client_aborted"
  | "upstream_timeout"
  | "upstream_error"
  | "stream_aborted"
  | "stream_error";

const REQUEST_HEADER_ALLOWLIST = [
  "accept",
  "content-type",
  "anthropic-version",
  "anthropic-beta",
] as const;

const RESPONSE_HEADER_ALLOWLIST = new Set([
  "cache-control",
  "content-language",
  "content-type",
  "expires",
  "retry-after",
  "request-id",
  "anthropic-request-id",
  "x-accel-buffering",
  "x-request-id",
]);

export interface VexlyCloakLogEntry {
  requestId: string;
  lane: Lane | "unknown";
  method: string;
  path: string;
  status: number;
  outcome: RequestOutcome;
  durationMs: number;
}

interface HandlerOptions {
  fetchImpl?: typeof fetch;
  log?: (entry: VexlyCloakLogEntry) => void;
  upstreamHeaderTimeoutMs?: number;
  inFlightControllers?: Set<AbortController>;
}

interface StartOptions extends HandlerOptions {
  host?: string;
  port?: number;
  shutdownGraceMs?: number;
}

export interface VexlyCloakServer extends Server {
  shutdown(): Promise<void>;
}

function defaultLog(entry: VexlyCloakLogEntry): void {
  console.log(JSON.stringify(entry));
}

function parseRequestTarget(rawTarget: string): string | null {
  if (
    !rawTarget.startsWith("/")
    || rawTarget.startsWith("//")
    || rawTarget.includes("//")
    || rawTarget.includes("?")
    || rawTarget.includes("#")
    || rawTarget.includes("\\")
    || rawTarget.includes("%")
    || rawTarget.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return rawTarget;
}

function routePrefixes(route: (typeof ROUTES)[RoutePath]): readonly string[] {
  return "prefixes" in route ? route.prefixes : [route.prefix];
}

function bearerCredential(req: IncomingMessage, prefixes: readonly string[]): string | null {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string") return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) return null;
  const credential = match[1];
  if (!prefixes.some((prefix) => credential.startsWith(prefix) && credential.length > prefix.length)) {
    return null;
  }
  return credential;
}

function upstreamHeaders(req: IncomingMessage, credential: string): Headers {
  const headers = new Headers({
    authorization: `Bearer ${credential}`,
    "accept-encoding": "identity",
  });
  for (const name of REQUEST_HEADER_ALLOWLIST) {
    const value = req.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }
  return headers;
}

function copySafeResponseHeaders(upstream: Response, res: ServerResponse): void {
  for (const [name, value] of upstream.headers) {
    if (
      RESPONSE_HEADER_ALLOWLIST.has(name)
      || name.startsWith("ratelimit-")
      || name.startsWith("x-ratelimit-")
    ) {
      res.setHeader(name, value);
    }
  }
}

function sendError(res: ServerResponse, status: number, code: string): void {
  if (res.destroyed) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: code }));
}

export function createVexlyCloakHandler(options: HandlerOptions = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const log = options.log ?? defaultLog;
  const upstreamHeaderTimeoutMs = options.upstreamHeaderTimeoutMs ?? DEFAULT_UPSTREAM_HEADER_TIMEOUT_MS;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const method = req.method ?? "UNKNOWN";
    let path = "[invalid]";
    let lane: Lane | "unknown" = "unknown";
    let status = 500;
    let outcome: RequestOutcome = "rejected";
    let upstreamHeaderTimedOut = false;
    let upstreamStreamErrored = false;
    let clientAborted = false;
    let upstreamHeaderTimer: ReturnType<typeof setTimeout> | undefined;
    const upstreamController = new AbortController();
    const abortForClient = () => {
      clientAborted = true;
      if (!upstreamController.signal.aborted) {
        upstreamController.abort(new Error("client connection closed"));
      }
    };
    const abortForPrematureResponseClose = () => {
      if (!res.writableEnded) abortForClient();
    };
    req.once("aborted", abortForClient);
    res.once("close", abortForPrematureResponseClose);
    options.inFlightControllers?.add(upstreamController);

    try {
      const target = parseRequestTarget(req.url ?? "");
      if (!target) {
        status = 400;
        sendError(res, status, "invalid_request_target");
        return;
      }

      const route = ROUTES[target as RoutePath];
      if (!route) {
        path = "[unknown]";
        status = 404;
        sendError(res, status, "route_not_found");
        return;
      }
      path = target;
      lane = route.lane;

      if (method !== route.method) {
        status = 405;
        res.setHeader("allow", route.method);
        sendError(res, status, "method_not_allowed");
        return;
      }

      const credential = bearerCredential(req, routePrefixes(route));
      if (!credential) {
        status = 401;
        sendError(res, status, "invalid_credential");
        return;
      }

      const upstreamUrl = new URL(route.upstreamPath, UPSTREAM_ORIGIN);
      if (upstreamUrl.username || upstreamUrl.password || upstreamUrl.origin !== UPSTREAM_ORIGIN) {
        status = 500;
        sendError(res, status, "invalid_upstream");
        return;
      }

      const init: RequestInit & { duplex?: "half" } = {
        method,
        headers: upstreamHeaders(req, credential),
        redirect: "error",
        signal: upstreamController.signal,
      };
      if (method === "POST") {
        init.body = req as unknown as BodyInit;
        init.duplex = "half";
      }

      upstreamHeaderTimer = setTimeout(() => {
        upstreamHeaderTimedOut = true;
        upstreamController.abort(new Error("upstream header timeout"));
      }, upstreamHeaderTimeoutMs);
      upstreamHeaderTimer.unref?.();

      const upstream = await fetchImpl(upstreamUrl, init);
      clearTimeout(upstreamHeaderTimer);
      upstreamHeaderTimer = undefined;
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel().catch(() => undefined);
        throw new Error("Upstream redirect rejected");
      }
      status = upstream.status;
      res.statusCode = upstream.status;
      copySafeResponseHeaders(upstream, res);

      if (!upstream.body) {
        outcome = "completed";
        res.end();
        return;
      }

      const upstreamStream = Readable.fromWeb(
        upstream.body as import("node:stream/web").ReadableStream,
      );
      upstreamStream.once("error", () => {
        if (!upstreamController.signal.aborted) upstreamStreamErrored = true;
      });
      await pipeline(upstreamStream, res);
      outcome = "completed";
    } catch {
      if (res.headersSent) {
        status = res.statusCode;
        outcome = upstreamStreamErrored ? "stream_error" : "stream_aborted";
        if (!res.destroyed) res.destroy();
      } else if (clientAborted) {
        status = 499;
        outcome = "client_aborted";
        if (!res.destroyed) res.destroy();
      } else if (upstreamHeaderTimedOut) {
        status = 504;
        outcome = "upstream_timeout";
        sendError(res, status, "upstream_timeout");
      } else {
        status = 502;
        outcome = "upstream_error";
        sendError(res, status, "upstream_unavailable");
      }
    } finally {
      if (upstreamHeaderTimer) clearTimeout(upstreamHeaderTimer);
      req.off("aborted", abortForClient);
      res.off("close", abortForPrematureResponseClose);
      options.inFlightControllers?.delete(upstreamController);
      log({
        requestId,
        lane,
        method,
        path,
        status,
        outcome,
        durationMs: Date.now() - startedAt,
      });
    }
  };
}

export async function startVexlyCloakRouter(options: StartOptions = {}): Promise<VexlyCloakServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8328;
  if (host !== "127.0.0.1") {
    throw new Error("Vexly cloak router must bind to 127.0.0.1");
  }

  const inFlightControllers = new Set<AbortController>();
  const server = createServer(
    createVexlyCloakHandler({ ...options, inFlightControllers }),
  ) as VexlyCloakServer;
  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  const shutdownGraceMs = options.shutdownGraceMs ?? 10_000;
  let shutdownPromise: Promise<void> | undefined;
  server.shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceTimer);
        resolve();
      };
      const forceTimer = setTimeout(() => {
        for (const controller of inFlightControllers) {
          controller.abort(new Error("router shutdown"));
        }
        server.closeAllConnections();
        finish();
      }, shutdownGraceMs);
      forceTimer.unref?.();

      server.close(() => finish());
      server.closeIdleConnections();
    });
    return shutdownPromise;
  };
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  return server;
}
