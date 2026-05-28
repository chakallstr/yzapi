import cron from "node-cron";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { telegramAccounts, telegramDeliveries } from "../db/schema.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { deliverApiAccessToTelegramUser } from "../services/telegram-bot-service.js";

export function startTelegramDeliveryRecoveryJob(): void {
  cron.schedule("*/10 * * * *", async () => {
    if (!env.TELEGRAM_BOT_TOKEN) return;

    try {
      const rows = await db
        .select({
          deliveryId: telegramDeliveries.id,
          userId: telegramDeliveries.userId,
          paymentId: telegramDeliveries.paymentId,
          telegramAccountId: telegramDeliveries.telegramAccountId,
          telegramId: telegramAccounts.telegramId,
        })
        .from(telegramDeliveries)
        .leftJoin(telegramAccounts, eq(telegramDeliveries.telegramAccountId, telegramAccounts.id))
        .where(sql`${telegramDeliveries.status} IN ('failed', 'pending') AND ${telegramDeliveries.paymentId} IS NOT NULL AND ${telegramDeliveries.attemptCount} < 5`)
        .limit(20);

      for (const row of rows) {
        if (!row.paymentId || !row.telegramAccountId || !row.telegramId) continue;
        await deliverApiAccessToTelegramUser({
          userId: row.userId,
          telegramAccountId: row.telegramAccountId,
          chatId: row.telegramId,
          paymentId: row.paymentId,
        }).catch((err) => logger.error({ err, deliveryId: row.deliveryId }, "telegram delivery retry failed"));
      }
    } catch (err) {
      logger.error({ err }, "telegram delivery recovery scan failed");
    }
  });

  logger.info("[telegram-delivery-recovery-job] scheduled (*/10 * * * *)");
}
