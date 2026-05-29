import { startKurRefreshJob } from "./kur-refresh-job.js";
import { startLowBalanceScanJob } from "./low-balance-scan-job.js";
import { startDailyReportJob } from "./daily-report-job.js";
import { startTelegramDeliveryRecoveryJob } from "./telegram-delivery-recovery-job.js";
import { startOrphanReservationReaperJob } from "./orphan-reservation-reaper-job.js";

export function startAllJobs(): void {
  startKurRefreshJob();
  startLowBalanceScanJob();
  startDailyReportJob();
  startTelegramDeliveryRecoveryJob();
  startOrphanReservationReaperJob();
}
