import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createServer as createViteServer } from "vite";
import { env } from "./lib/env.js";
import { logger, httpLogger } from "./lib/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error-handler.js";
import { adminAuth } from "./middleware/admin-auth.js";
import { userAuth } from "./middleware/user-auth.js";
import { startKurRefresh } from "./services/kur-service.js";
import { startAllJobs } from "./jobs/index.js";
import adminRouter from "./routes/admin.js";
import adminAuthRouter from "./routes/admin-auth.js";
import authRouter from "./routes/auth.js";
import userRouter from "./routes/user.js";
import modelsRouter from "./routes/models.js";
import settingsRouter from "./routes/settings.js";
import logsRouter from "./routes/logs.js";
import filesRouter from "./routes/files.js";
import legacyRouter from "./routes/legacy.js";
import proxyRouter from "./routes/proxy.js";
import paymentsRouter from "./routes/payments.js";
import { apiKeyAuth } from "./middleware/api-key-auth.js";
import { getStatusSnapshot } from "./services/status-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getGitSha(): string {
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

const app = express();
const startedAt = Date.now();

app.use(express.json({ limit: "10mb" }));
app.use(requestId);
app.use(httpLogger);

// Health — NO auth, NO rate limit
app.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};

  // DB check
  try {
    const { dbSql } = await import("./db/client.js");
    await dbSql`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "fail";
  }

  // KUR age
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

  // CloseRouter check
  if (env.CLOSEROUTER_API_KEY) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(`${env.CLOSEROUTER_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${env.CLOSEROUTER_API_KEY}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      checks.closerouter = r.ok ? "ok" : "fail";
    } catch {
      checks.closerouter = "fail";
    }
  } else {
    checks.closerouter = "unknown";
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
// Admin auth (login/logout/me) — public, no middleware
app.use("/api/admin", adminAuthRouter);
// Protected admin routes — require admin JWT
app.use("/api/admin", adminAuth, adminRouter);
// Google OAuth + token management
app.use("/api/auth", authRouter);
// User routes — require user JWT
app.use("/api/user", userAuth, userRouter);

app.use("/api", modelsRouter);
app.use("/api", settingsRouter);
app.use("/api", logsRouter);
app.use("/api", filesRouter);
app.use("/api", legacyRouter);

// Payment routes — mixed auth (user-auth + public webhooks + admin)
app.use("/api/payments", paymentsRouter);

// Proxy routes — require yzk_* API key, mounted at /v1 before Vite catch-all
app.use("/v1", (req, res, next) => {
  const knownRoutes = [
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
  const requestId = (req as any).id ?? "unknown";
  res.status(404).json({ error: "Not found", code: 404, requestId });
});
app.use("/v1", apiKeyAuth, proxyRouter);

// API misses must return JSON, not the SPA shell.
app.use(["/api", "/v1"], (req, res) => {
  const requestId = (req as any).id ?? "unknown";
  res.status(404).json({ error: "Not found", code: 404, requestId });
});

app.use(errorHandler);

async function startServer() {
  await startKurRefresh();
  startAllJobs();

  if (env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, server.js is at dist/server.js; Vite assets are at dist/
    // __dirname resolves to the directory containing server.js (dist/)
    const distPath = path.dirname(fileURLToPath(import.meta.url));
    app.use(
      "/assets",
      express.static(path.join(distPath, "assets"), {
        dotfiles: "ignore",
        index: false,
        immutable: true,
        maxAge: "1y",
      })
    );
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(env.PORT, "0.0.0.0", () => {
    logger.info({ port: env.PORT }, "Server up");
  });
}

startServer().catch((e) => {
  logger.error({ err: e }, "Failed to start server");
  process.exit(1);
});
