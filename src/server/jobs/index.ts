import { startKurRefreshJob } from "./kur-refresh-job.js";
import { startLowBalanceScanJob } from "./low-balance-scan-job.js";
import { startDailyReportJob } from "./daily-report-job.js";
import { startTelegramDeliveryRecoveryJob } from "./telegram-delivery-recovery-job.js";
import { startOrphanReservationReaperJob } from "./orphan-reservation-reaper-job.js";
import { startMaliIzlemeJob } from "./mali-izleme-job.js";
import { startGozcuJob } from "./gozcu-job.js";
import { startGozcuDigestJob } from "./gozcu-digest-job.js";
import { startPackageMaintenanceJob } from "./package-maintenance-job.js";
import { startCfLedgerJob } from "./cf-ledger-job.js";
import { startCfReconcileJob } from "./cf-reconcile-job.js";
import { startCfServedRefreshJob } from "./cf-served-refresh-job.js";
import { startCfMirrorSyncJob } from "./cf-mirror-sync-job.js";
import { startPackageSlotReconcileJob } from "./package-slot-reconcile-job.js";
import { markJobsStarted } from "../services/gozcu/heartbeat.js";

export function startAllJobs(): void {
  startKurRefreshJob();
  startLowBalanceScanJob();
  startDailyReportJob();
  startTelegramDeliveryRecoveryJob();
  startOrphanReservationReaperJob();
  startMaliIzlemeJob();
  startGozcuJob();
  startGozcuDigestJob();
  startPackageMaintenanceJob();
  startCfLedgerJob();
  startCfReconcileJob();
  startCfServedRefreshJob();
  startCfMirrorSyncJob();
  startPackageSlotReconcileJob();
  markJobsStarted();
}
