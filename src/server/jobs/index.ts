import { startKurRefreshJob } from "./kur-refresh-job.js";
import { startLowBalanceScanJob } from "./low-balance-scan-job.js";
import { startDailyReportJob } from "./daily-report-job.js";

export function startAllJobs(): void {
  startKurRefreshJob();
  startLowBalanceScanJob();
  startDailyReportJob();
}
