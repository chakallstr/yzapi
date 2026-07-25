import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { refreshCfServed } from "../services/cf-overserve-cap.js";

// R-3: rebuild the cf_served snapshot (from usage_records, since activated_at) for active CF
// entitlements every 15 min. Feeds the over-serve cap (cf_served > daily_limit*multiplier). The
// snapshot biases stale-LOW between runs (lenient → never a false-lockout). Read-derived UPDATE that
// touches only cf_served; never throws. Not key-gated — the WHERE is a no-op when no CF entitlements.
const CF_SERVED_REFRESH_CRON = env.CF_SERVED_REFRESH_CRON ?? "*/15 * * * *";

export function startCfServedRefreshJob(): void {
  if (env.NODE_ENV === "test") return;

  cron.schedule(CF_SERVED_REFRESH_CRON, async () => {
    try {
      await refreshCfServed();
    } catch (e) {
      logger.error({ err: e }, "[cf-served-refresh-job] run failed");
    }
  });

  logger.info({ cron: CF_SERVED_REFRESH_CRON }, "[cf-served-refresh-job] scheduled");
}
