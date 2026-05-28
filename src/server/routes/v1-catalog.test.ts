import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import express from "express";
import { MASTER_MODELS } from "../../master-models.js";
import {
  buildV1ModelCountResponse,
  buildV1ModelsResponse,
  buildV1ProvidersResponse,
  createV1CatalogRouter,
} from "./v1-catalog.js";

describe("public /v1 catalog contract", () => {
  const sampleEntries = [
    {
      model: MASTER_MODELS[0],
      enabled: true,
      computed: {
        unit: "1M token" as const,
        input: { usd: 1, tl: 47 },
        output: { usd: 2, tl: 94 },
      },
    },
    {
      model: MASTER_MODELS[1],
      enabled: false,
      computed: {
        unit: "1M token" as const,
        input: { usd: 3, tl: 141 },
        output: { usd: 4, tl: 188 },
      },
    },
  ];

  it("builds an OpenAI-style sanitized model list from customer-facing prices", () => {
    const response = buildV1ModelsResponse(sampleEntries);

    expect(response.object).toBe("list");
    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({
      id: MASTER_MODELS[0].id,
      object: "model",
      owned_by: MASTER_MODELS[0].providerSlug,
      provider: {
        name: MASTER_MODELS[0].provider,
        slug: MASTER_MODELS[0].providerSlug,
      },
      endpoints: MASTER_MODELS[0].endpoints,
      architecture: {
        input_modalities: MASTER_MODELS[0].inputModalities,
        output_modalities: MASTER_MODELS[0].outputModalities,
      },
      enabled: true,
      pricing: {
        unit: "1M token",
        input: { usd: "1.00000000", tl: "47.00000000" },
        output: { usd: "2.00000000", tl: "94.00000000" },
      },
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/api[_-]?key|secret|upstream|base_url|routing|weight/i);
    expect(serialized).not.toContain("providerInputUsd");
    expect(serialized).not.toContain("providerOutputUsd");
    expect(serialized).not.toContain("customerInputUsd");
    expect(serialized).not.toContain("customerOutputUsd");
    expect(serialized).not.toContain(MASTER_MODELS[1].id);
  });

  it("builds a model count response", () => {
    expect(buildV1ModelCountResponse(sampleEntries)).toEqual({
      count: 1,
    });
  });

  it("builds a unique provider list without internal upstream details", () => {
    const response = buildV1ProvidersResponse(sampleEntries);

    expect(response.object).toBe("list");
    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        model_count: expect.any(Number),
      })
    );

    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/api[_-]?key|secret|upstream|base_url|routing|weight/i);
  });

  it("mounts catalog before authenticated proxy routes and keeps proxy auth after the allowlist", () => {
    const indexSource = readFileSync("src/server/index.ts", "utf8");

    const catalogMount = indexSource.indexOf('app.use("/v1", v1CatalogRouter);');
    const allowlist = indexSource.indexOf("const knownRoutes = [");
    const authProxy = indexSource.indexOf('app.use("/v1", apiKeyAuth, proxyRouter);');

    expect(catalogMount).toBeGreaterThan(-1);
    expect(catalogMount).toBeLessThan(allowlist);
    expect(allowlist).toBeLessThan(authProxy);
  });

  it("keeps public catalog, unknown JSON 404, and proxy auth route behavior separated", async () => {
    const app = express();
    app.use(express.json());
    app.use("/v1", createV1CatalogRouter(async () => sampleEntries));
    app.use("/v1", (req, res, next) => {
      const knownRoutes = [/^\/chat\/completions$/];
      if (knownRoutes.some((route) => route.test(req.path))) {
        next();
        return;
      }
      res.status(404).json({ error: "Not found", code: 404, requestId: "test" });
    });
    app.use("/v1", (_req, res) => {
      res.status(401).json({ error: "Invalid API key", code: "invalid_api_key" });
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test server address unavailable");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const models = await fetch(`${baseUrl}/v1/models`);
      expect(models.status).toBe(200);
      expect(await models.json()).toMatchObject({ object: "list", data: expect.any(Array) });

      const missing = await fetch(`${baseUrl}/v1/__missing__`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ error: "Not found", code: 404 });

      const chat = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", messages: [] }),
      });
      expect(chat.status).toBe(401);
      expect(await chat.json()).toMatchObject({ code: "invalid_api_key" });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
