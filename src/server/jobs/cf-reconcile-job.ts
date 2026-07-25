import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { runCfReconcile } from "../services/cf-reconcile-service.js";

// Daily reconcile of our cf_remaining mirror against the CF usage ledger (R-1).
// Read-only; alerts admin via WhatsApp when a customer's mirror is stale/drifted or
// CF balance is near exhaustion. Never throws.
const CF_RECONCILE_CRON = env.CF_RECONCILE_CRON ?? "0 10 * * *"; // daily 10:00

export function startCfReconcileJob(): void {
  if (env.NODE_ENV === "test") return;
  if (!env.CODEFAST_RESELLER_API_KEY) {
    logger.info("[cf-reconcile-job] skipped (no CodeFast reseller key configured)");
    return;
  }

  cron.schedule(CF_RECONCILE_CRON, async () => {
    try {
      await runCfReconcile();
    } catch (e) {
      logger.error({ err: e }, "[cf-reconcile-job] run failed");
    }
  });

  logger.info({ cron: CF_RECONCILE_CRON }, "[cf-reconcile-job] scheduled");
}
