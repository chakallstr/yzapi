import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { startKurRefresh } from "./services/kur-service.js";
import { startAllJobs } from "./jobs/index.js";
import { createApp } from "./app.js";

const app = createApp();

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
    const distPath = path.dirname(fileURLToPath(import.meta.url));
    const express = (await import("express")).default;
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
