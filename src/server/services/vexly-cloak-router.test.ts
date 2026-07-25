import { readFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVexlyCloakHandler,
  startVexlyCloakRouter,
  type VexlyCloakLogEntry,
} from "./vexly-cloak-router.js";

const servers = new Set<Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  servers.clear();
});

async function startTestRouter(
  fetchImpl: typeof fetch,
  log: (entry: VexlyCloakLogEntry) => void = () => undefined,
  handlerOptions: Record<string, unknown> = {},
) {
  const server = createServer(createVexlyCloakHandler({ fetchImpl, log, ...handlerOptions }));
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
  };
}

async function requestRawTarget(port: number, target: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: "GET",
        path: target,
        headers: { authorization: "Bearer tk_live_secret" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.once("end", () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      },
    );
    req.once("error", reject);
    req.end();
  });
}

async function readBody(body: unknown): Promise<Buffer> {
  if (body == null) return Buffer.alloc(0);
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported request body in test");
}

function headersFrom(init?: RequestInit): Headers {
  return new Headers(init?.headers);
}

describe("Vexly cloak router", () => {
  it("forwards CLI messages only with a tk_live_ credential", async () => {
    const calls: Array<{ url: string; init?: RequestInit; body: Buffer }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init, body: await readBody(init?.body) });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);
    const body = Buffer.from('{"model":"claude-opus","secret":"body-must-not-be-logged"}');

    const response = await fetch(`${origin}/cli/v1/messages`, {
      method: "POST",
      headers: {
        authorization: "Bearer tk_live_cli-secret",
        accept: "text/event-stream",
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "user-agent": "claude-cli-fingerprint",
        "x-stainless-runtime": "node",
      },
      body,
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://vexly.cc/v1/messages");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].body).toEqual(body);
    const headers = headersFrom(calls[0].init);
    expect(headers.get("authorization")).toBe("Bearer tk_live_cli-secret");
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.get("anthropic-beta")).toBe("prompt-caching-2024-07-31");
    expect(headers.has("user-agent")).toBe(false);
    expect([...headers.keys()].some((name) => name.startsWith("x-stainless"))).toBe(false);
  });

  it("allows a working api_live_ credential on the Anthropic-native CLI lane", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      await readBody(init?.body);
      calls.push({ url: String(input), init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const response = await fetch(`${origin}/cli/v1/messages`, {
      method: "POST",
      headers: {
        authorization: "Bearer api_live_cli-compatible-secret",
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: '{"model":"claude-opus"}',
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://vexly.cc/v1/messages");
    expect(headersFrom(calls[0].init).get("authorization")).toBe("Bearer api_live_cli-compatible-secret");
  });

  it("forwards standard API chat only with an api_live_ credential", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      await readBody(init?.body);
      calls.push({ url: String(input), init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const response = await fetch(`${origin}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: "Bearer api_live_api-secret",
        "content-type": "application/json",
      },
      body: '{"model":"claude-opus"}',
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://vexly.cc/v1/chat/completions");
    expect(headersFrom(calls[0].init).get("authorization")).toBe("Bearer api_live_api-secret");
  });

  it.each([
    ["/cli/v1/models", "tk_live_cli-secret"],
    ["/api/v1/models", "api_live_api-secret"],
  ])("normalizes %s to the upstream models path", async (path, key) => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('{"data":[]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const response = await fetch(`${origin}${path}`, {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual(["https://vexly.cc/v1/models"]);
  });

  it.each([
    ["/cli/v1/messages", "sk_wrong"],
    ["/api/v1/chat/completions", "tk_live_wrong"],
    ["/cli/v1/models", "tk_live_"],
  ])("rejects the wrong or empty credential prefix for %s", async (path, key) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const response = await fetch(`${origin}${path}`, {
      method: path.endsWith("models") ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: path.endsWith("models") ? undefined : "{}",
    });

    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed for unsupported methods and paths", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const [wrongMethod, wrongPath] = await Promise.all([
      fetch(`${origin}/cli/v1/models`, {
        method: "POST",
        headers: { authorization: "Bearer tk_live_secret" },
      }),
      fetch(`${origin}/cli/v1/unknown`, {
        headers: { authorization: "Bearer tk_live_secret" },
      }),
    ]);

    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("GET");
    expect(wrongPath.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never logs the raw value of an unknown canonical path", async () => {
    const logs: VexlyCloakLogEntry[] = [];
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl, (entry) => logs.push(entry));

    const response = await fetch(`${origin}/unknown/tk_live_path-secret`, {
      headers: { authorization: "Bearer tk_live_header-secret" },
    });

    expect(response.status).toBe(404);
    expect(logs).toHaveLength(1);
    expect(logs[0].path).toBe("[unknown]");
    expect(JSON.stringify(logs)).not.toContain("tk_live_path-secret");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an absolute request target containing URL credentials", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { port } = await startTestRouter(fetchImpl);

    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method: "GET",
          path: "http://url-user:url-password@127.0.0.1/cli/v1/models",
          headers: { authorization: "Bearer tk_live_secret" },
        },
        (res) => {
          res.resume();
          res.once("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.once("error", reject);
      req.end();
    });

    expect(status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "/cli/v1/models#fragment",
    "http://127.0.0.1/cli/v1/models",
    "/cli\\v1\\models",
    "/hidden/%2e%2e/cli/v1/models",
    "/cli/v1/hidden/../models",
    "/cli//v1/models",
    "/hidden/../models",
  ])("rejects non-canonical raw request target before fetch: %s", async (target) => {
    const fetchImpl = vi.fn(async () => new Response('{"data":[]}')) as unknown as typeof fetch;
    const { port } = await startTestRouter(fetchImpl);

    const response = await requestRawTarget(port, target);

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "invalid_request_target" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "?x-api-key=query-secret",
    "?client_secret=query-secret",
    "?password=query-secret",
    "?limit=1",
  ])("rejects every query string before upstream fetch: %s", async (query) => {
    const fetchImpl = vi.fn(async () => new Response('{"data":[]}')) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const response = await fetch(`${origin}/api/v1/models${query}`, {
      headers: { authorization: "Bearer api_live_secret" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request_target" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails safely instead of exposing or following an upstream redirect", async () => {
    const calls: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), redirect: init?.redirect });
      return new Response(null, {
        status: 302,
        headers: { location: "https://second-origin.example/credential-capture" },
      });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const response = await fetch(`${origin}/cli/v1/models`, {
      redirect: "manual",
      headers: { authorization: "Bearer tk_live_secret" },
    });

    expect(response.status).toBe(502);
    expect(response.headers.has("location")).toBe(false);
    expect(await response.json()).toEqual({ error: "upstream_unavailable" });
    expect(calls).toEqual([
      { url: "https://vexly.cc/v1/models", redirect: "error" },
    ]);
  });

  it("aborts a fetch that exceeds the upstream pre-header deadline", async () => {
    let upstreamSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const lateResponse = setTimeout(() => resolve(new Response("too late")), 100);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(lateResponse);
          reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl, () => undefined, {
      upstreamHeaderTimeoutMs: 20,
    });

    const response = await fetch(`${origin}/cli/v1/models`, {
      headers: { authorization: "Bearer tk_live_secret" },
    });

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "upstream_timeout" });
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("aborts the upstream request when the client request is aborted", async () => {
    let upstreamSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        const lateResponse = setTimeout(() => resolve(new Response("too late")), 100);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(lateResponse);
          reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }) as unknown as typeof fetch;
    const { port } = await startTestRouter(fetchImpl);
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      method: "GET",
      path: "/cli/v1/models",
      headers: { authorization: "Bearer tk_live_secret" },
    });
    req.on("error", () => undefined);
    req.end();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    req.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("configures explicit HTTP server resource limits", async () => {
    const server = await startVexlyCloakRouter({
      port: 0,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    servers.add(server);

    expect(server.requestTimeout).toBe(120_000);
    expect(server.headersTimeout).toBe(15_000);
    expect(server.keepAliveTimeout).toBe(5_000);
    expect(server.maxRequestsPerSocket).toBe(100);
  });

  it("refuses a non-loopback bind configuration", async () => {
    await expect(
      startVexlyCloakRouter({
        host: "0.0.0.0",
        port: 0,
        fetchImpl: vi.fn() as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/127\.0\.0\.1/);
  });

  it("logs only safe request metadata, never authorization or body", async () => {
    const logs: VexlyCloakLogEntry[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      await readBody(init?.body);
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl, (entry) => logs.push(entry));

    await fetch(`${origin}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: "Bearer api_live_authorization-secret",
        "content-type": "application/json",
      },
      body: '{"private":"body-secret"}',
    });

    expect(logs).toHaveLength(1);
    expect(Object.keys(logs[0]).sort()).toEqual([
      "durationMs",
      "lane",
      "method",
      "outcome",
      "path",
      "requestId",
      "status",
    ]);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("api_live_authorization-secret");
    expect(serialized).not.toContain("body-secret");
  });

  it("streams response bytes and safe headers through unchanged", async () => {
    let releaseLastChunk!: () => void;
    const lastChunkReady = new Promise<void>((resolve) => {
      releaseLastChunk = resolve;
    });
    const first = Uint8Array.from([0, 255, 10, 42]);
    const last = Uint8Array.from([9, 8, 7]);
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(first);
          await lastChunkReady;
          controller.enqueue(last);
          controller.close();
        },
      });
      return new Response(body, {
        status: 206,
        headers: {
          "content-type": "application/octet-stream",
          "cache-control": "no-cache",
          "x-request-id": "vexly-request-1",
          "set-cookie": "must-not-pass=secret",
        },
      });
    }) as unknown as typeof fetch;
    const { origin } = await startTestRouter(fetchImpl);

    const response = await fetch(`${origin}/cli/v1/models`, {
      headers: { authorization: "Bearer tk_live_secret" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("x-request-id")).toBe("vexly-request-1");
    expect(response.headers.has("set-cookie")).toBe(false);

    const reader = response.body!.getReader();
    const firstRead = await reader.read();
    expect(firstRead.done).toBe(false);
    expect(firstRead.value).toEqual(first);

    releaseLastChunk();
    const secondRead = await reader.read();
    expect(secondRead.value).toEqual(last);
    expect((await reader.read()).done).toBe(true);
  });

  it("keeps the committed status and logs stream_error after a pipeline failure", async () => {
    const logs: VexlyCloakLogEntry[] = [];
    let failStream!: () => void;
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first-chunk"));
          failStream = () => controller.error(new Error("upstream stream failed"));
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    }) as unknown as typeof fetch;
    const { port } = await startTestRouter(fetchImpl, (entry) => logs.push(entry));

    const clientResult = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port,
        path: "/cli/v1/models",
        headers: { authorization: "Bearer tk_live_secret" },
      });
      req.once("error", reject);
      req.once("response", (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          failStream();
        });
        const finish = () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        res.once("aborted", finish);
        res.once("end", finish);
      });
      req.end();
    });
    await vi.waitFor(() => expect(logs).toHaveLength(1));

    expect(clientResult.status).toBe(200);
    expect(clientResult.body).toBe("first-chunk");
    expect(clientResult.body).not.toContain("upstream_unavailable");
    expect(logs[0].status).toBe(200);
    expect((logs[0] as VexlyCloakLogEntry & { outcome?: string }).outcome).toBe("stream_error");
  });

  it("aborts upstream and logs stream_aborted when the client closes the response early", async () => {
    const logs: VexlyCloakLogEntry[] = [];
    let upstreamSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first-chunk"));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const { port } = await startTestRouter(fetchImpl, (entry) => logs.push(entry));

    await new Promise<void>((resolve, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port,
        path: "/cli/v1/models",
        headers: { authorization: "Bearer tk_live_secret" },
      });
      req.once("error", reject);
      req.once("response", (res) => {
        res.once("data", () => res.destroy());
        res.once("close", () => resolve());
      });
      req.end();
    });
    await vi.waitFor(() => expect(logs).toHaveLength(1));

    expect(upstreamSignal?.aborted).toBe(true);
    expect(logs[0].status).toBe(200);
    expect((logs[0] as VexlyCloakLogEntry & { outcome?: string }).outcome).toBe("stream_aborted");
  });

  it("bounds shutdown and aborts a never-ending in-flight stream", async () => {
    let upstreamSignal: AbortSignal | null | undefined;
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(new TextEncoder().encode("first-chunk"));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const server = await startVexlyCloakRouter({
      port: 0,
      fetchImpl,
      shutdownGraceMs: 30,
    } as never) as Server & { shutdown?: () => Promise<void> };
    servers.add(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/cli/v1/models`, {
      headers: { authorization: "Bearer tk_live_secret" },
    });
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new TextEncoder().encode("first-chunk"));

    try {
      expect(typeof server.shutdown).toBe("function");
      const startedAt = Date.now();
      await Promise.race([
        server.shutdown!(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("shutdown did not finish")), 250)),
      ]);
      expect(Date.now() - startedAt).toBeLessThan(250);
      expect(upstreamSignal?.aborted).toBe(true);
      expect(server.listening).toBe(false);
      await expect(server.shutdown!()).resolves.toBeUndefined();
    } finally {
      if (server.listening) {
        try { streamController?.error(new Error("test cleanup")); } catch { /* already closed */ }
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      servers.delete(server);
    }
  });

  it("builds a production router artifact used directly by systemd", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const unit = readFileSync("deploy/turkapiprojesi-vexly-cloak.service", "utf8");

    expect(packageJson.scripts.build).toContain("dist/vexly-cloak-router.js");
    expect(unit).toContain("ExecStart=/usr/bin/node /opt/turkapiprojesi/dist/vexly-cloak-router.js");
    expect(unit).not.toContain("tsx");
    expect(unit).not.toContain("npx");
  });
});
