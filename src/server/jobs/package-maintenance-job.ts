import cron from "node-cron";
import { dbSql } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

/** Süresi dolan aktif paket entitlement'larını 'expired' işaretler. Günlük kota lazy reset
 *  (entitlement-service) ile yapılır; bu job yalnız expiry yapar. Para taşımaz. */
export async function runPackageMaintenance(): Promise<number> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements
    SET status = 'expired', updated_at = now()
    WHERE status = 'active' AND expires_at <= now()
    RETURNING id
  `;
  return rows.length;
}

export function startPackageMaintenanceJob(): void {
  if (env.NODE_ENV === "test") return;

  // Her gün 00:05
  cron.schedule("5 0 * * *", async () => {
    try {
      const n = await runPackageMaintenance();
      if (n > 0) logger.info(`[package-maintenance] ${n} entitlement expired`);
    } catch (e) {
      logger.error({ err: e }, "[package-maintenance] failed");
    }
  });
}
