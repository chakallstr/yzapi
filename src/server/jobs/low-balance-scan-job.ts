import cron from "node-cron";
import { db } from "../db/client.js";
import { users, systemConfig } from "../db/schema.js";
import { lt, or, isNull, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { lowBalanceEmail } from "../services/email-service.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startLowBalanceScanJob(): void {
  if (env.NODE_ENV === "test") return;

  // Every hour at minute 15
  cron.schedule("15 * * * *", async () => {
    try {
      const cfgRows = await db
        .select({ anomaliEsikTL: systemConfig.anomaliEsikTL })
        .from(systemConfig)
        .limit(1);
      if (!cfgRows.length) return;

      const threshold = Number(cfgRows[0].anomaliEsikTL);
      const cooldownCutoff = new Date(Date.now() - ALERT_COOLDOWN_MS);

      // Users below threshold whose last alert was > 24h ago (or never)
      const alertUsers = await db
        .select({
          id: users.id,
          email: users.email,
          adSoyad: users.adSoyad,
          bakiyeTL: users.bakiyeTL,
        })
        .from(users)
        .where(
          sql`${users.bakiyeTL}::numeric < ${threshold}::numeric AND (${users.lastLowBalanceAlert} IS NULL OR ${users.lastLowBalanceAlert} < ${cooldownCutoff})`,
        );

      for (const user of alertUsers) {
        await lowBalanceEmail(
          { email: user.email, adSoyad: user.adSoyad },
          Number(user.bakiyeTL),
          threshold,
        ).catch((e) => logger.error({ err: e, userId: user.id }, "[low-balance-job] email failed"));

        await db
          .update(users)
          .set({ lastLowBalanceAlert: new Date() })
          .where(sql`${users.id} = ${user.id}`);
      }

      if (alertUsers.length > 0) {
        logger.info({ count: alertUsers.length }, "[low-balance-job] alerts sent");
      }
    } catch (e: any) {
      logger.error({ err: e }, "[low-balance-job] scan failed");
    }
  });

  logger.info("[low-balance-scan-job] scheduled (15 * * * *)");
}
