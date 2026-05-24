import cron from "node-cron";
import { refreshKur } from "../services/kur-service.js";
import { kurChangeEmail } from "../services/email-service.js";
import { db } from "../db/client.js";
import { systemConfig } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

const KUR_ANOMALY_THRESHOLD = 0.05; // 5%

let lastSellKur: number | null = null;

export function startKurRefreshJob(): void {
  if (env.NODE_ENV === "test") return;

  // Hourly at minute 0
  cron.schedule("0 * * * *", async () => {
    const rows = await db
      .select({ autoKurRefresh: systemConfig.autoKurRefresh, destekEmail: systemConfig.destekEmail, kur: systemConfig.kur })
      .from(systemConfig)
      .where(eq(systemConfig.id, 1))
      .limit(1)
      .catch(() => []);

    if (!rows[0]?.autoKurRefresh) return;

    const prevKur = lastSellKur ?? Number(rows[0].kur);
    const entry = await refreshKur("auto").catch(() => null);
    if (!entry) return;

    const delta = (entry.sellKur - prevKur) / prevKur;
    if (Math.abs(delta) > KUR_ANOMALY_THRESHOLD) {
      const adminEmail = rows[0].destekEmail ?? "destek@yapayzekalab.com";
      await kurChangeEmail(adminEmail, prevKur, entry.sellKur, delta).catch((e) =>
        logger.error({ err: e }, "[kur-job] anomaly email failed"),
      );
    }
    lastSellKur = entry.sellKur;
  });

  logger.info("[kur-refresh-job] scheduled (0 * * * *)");
}
