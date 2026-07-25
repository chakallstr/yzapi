import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { ingestAllCfUsage } from "../services/cf-ledger-service.js";

// Poll CodeFast's per-customer /usage and mirror new events into cf_usage_ledger.
// CF caps /usage at the latest 250 events; a heavy codex user can exceed that within
// minutes, so we poll often to avoid losing events between windows. Read-only vs CF,
// writes only to its own table, idempotent (dedup on CF event id), never throws.
const CF_LEDGER_CRON = env.CF_LEDGER_POLL_CRON ?? "*/3 * * * *"; // every 3 minutes

export function startCfLedgerJob(): void {
  if (env.NODE_ENV === "test") return;
  if (!env.CODEFAST_RESELLER_API_KEY) {
    logger.info("[cf-ledger-job] skipped (no CodeFast reseller key configured)");
    return;
  }

  cron.schedule(CF_LEDGER_CRON, async () => {
    try {
      await ingestAllCfUsage();
    } catch (e) {
      logger.error({ err: e }, "[cf-ledger-job] run failed");
    }
  });

  logger.info({ cron: CF_LEDGER_CRON }, "[cf-ledger-job] scheduled");
}
