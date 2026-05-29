import express, { Request } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { aiProviderApiKey, aiProviderBaseUrl } from "./lib/env.js";
import { httpLogger } from "./lib/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { adminAuth } from "./middleware/admin-auth.js";
import { userAuth } from "./middleware/user-auth.js";
import { requireWhatsappVerified } from "./middleware/whatsapp-verified.js";
import adminRouter from "./routes/admin.js";
import adminAuthRouter from "./routes/admin-auth.js";
import authRouter from "./routes/auth.js";
import userRouter from "./routes/user.js";
import modelsRouter from "./routes/models.js";
import settingsRouter from "./routes/settings.js";
import proxyRouter from "./routes/proxy.js";
import paymentsRouter from "./routes/payments.js";
import telegramRouter from "./routes/telegram.js";
import v1CatalogRouter from "./routes/v1-catalog.js";
import { apiKeyAuth } from "./middleware/api-key-auth.js";
import { getStatusSnapshot } from "./services/status-service.js";

export function getGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["pipe", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Build the Express app with all routes/middleware wired, WITHOUT starting cron
 * jobs, Vite, or the HTTP listener. This lets tests (supertest) drive the exact
 * same route tree the production server uses.
 */
export function createApp(): express.Express {
  const app = express();
  const startedAt = Date.now();

  // Behind nginx reverse proxy: trust exactly one proxy hop so req.ip resolves to
  // the real client IP (X-Forwarded-For) for per-IP rate limiting and OTP IP limits.
  // Use 1 (not true) to avoid X-Forwarded-For spoofing past the known proxy.
  app.set("trust proxy", 1);

  app.use(express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  }));
  app.use(requestId);
  app.use(httpLogger);

  // Health — NO auth, NO rate limit
  app.get("/health", async (_req, res) => {
    const checks: Record<string, string> = {};

    try {
      const { dbSql } = await import("./db/client.js");
      await dbSql`SELECT 1`;
      checks.db = "ok";
    } catch {
      checks.db = "fail";
    }

    try {
      const { db } = await import("./db/client.js");
      const { systemConfig } = await import("./db/schema.js");
      const { eq } = await import("drizzle-orm");
      const rows = await db.select({ lastKurRefresh: systemConfig.lastKurRefresh })
        .from(systemConfig)
        .where(eq(systemConfig.id, 1))
        .limit(1);
      const last = rows[0]?.lastKurRefresh;
      checks.kurAge = last ? `${Math.round((Date.now() - last.getTime()) / 1000)}s` : "never";
    } catch {
      checks.kurAge = "unknown";
    }

    if (aiProviderApiKey()) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2000);
        const r = await fetch(`${aiProviderBaseUrl()}/models`, {
          headers: { Authorization: `Bearer ${aiProviderApiKey()}` },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        checks.aiProvider = r.ok ? "ok" : "fail";
      } catch {
        checks.aiProvider = "fail";
      }
    } else {
      checks.aiProvider = "unknown";
    }

    checks.uptime = formatUptime((Date.now() - startedAt) / 1000);

    const allOk = checks.db === "ok";
    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ok" : "degraded",
      checks,
      version: getGitSha(),
    });
  });

  // Public status — no secrets, no pricing formula, useful for live trust checks
  app.get("/status", async (_req, res, next) => {
    try {
      const snapshot = await getStatusSnapshot({ startedAt, version: getGitSha() });
      res.status(snapshot.status === "ok" ? 200 : 503).json(snapshot);
    } catch (e) {
      next(e);
    }
  });

  // API routes
  app.use("/api/admin", adminAuthRouter);
  app.use("/api/admin", adminAuth, requireWhatsappVerified, adminRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/user", userAuth, requireWhatsappVerified, userRouter);

  app.use("/api", modelsRouter);
  app.use("/api", settingsRouter);

  app.use("/api/payments", paymentsRouter);
  app.use("/api/telegram", telegramRouter);

  // Proxy routes — require yzk_* API key, mounted at /v1 before Vite catch-all
  app.use("/v1", v1CatalogRouter);
  app.use("/v1", (req, res, next) => {
    const knownRoutes = [
      /^\/balance$/,
      /^\/chat\/completions$/,
      /^\/responses$/,
      /^\/messages$/,
      /^\/images\/generations$/,
      /^\/images\/edits$/,
      /^\/videos\/submit$/,
      /^\/videos\/tasks\/[^/]+$/,
    ];
    if (knownRoutes.some((route) => route.test(req.path))) {
      next();
      return;
    }
    const rid = (req as any).id ?? "unknown";
    res.status(404).json({ error: "Not found", code: 404, requestId: rid });
  });
  app.use("/v1", apiKeyAuth, requireWhatsappVerified, proxyRouter);

  // API misses must return JSON, not the SPA shell.
  app.use(["/api", "/v1"], (req, res) => {
    const rid = (req as any).id ?? "unknown";
    res.status(404).json({ error: "Not found", code: 404, requestId: rid });
  });

  app.use(errorHandler);

  return app;
}
