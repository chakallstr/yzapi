import cron from "node-cron";
import { db } from "../db/client.js";
import { transactions, usageRecords, systemConfig } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { sendDailyReport } from "../services/email-service.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

interface ModelStat {
  modelId: string;
  count: number;
  totalTL: number;
}

interface DailyStats {
  totalTransactions: number;
  totalRevenueTL: number;
  totalRequests: number;
  errorCount: number;
  topModels: ModelStat[];
}

function buildReportHtml(stats: DailyStats): string {
  const topModelsHtml = stats.topModels
    .map(
      (m, i) =>
        `<tr><td style="padding:4px 8px">${i + 1}. ${m.modelId}</td><td style="padding:4px 8px;text-align:right">${m.count}</td><td style="padding:4px 8px;text-align:right">₺${m.totalTL.toFixed(2)}</td></tr>`,
    )
    .join("");

  return `
<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:8px">
  <h2 style="color:#1d4ed8">Günlük Rapor — ${new Date().toLocaleDateString("tr-TR")}</h2>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#fff;border-radius:6px">
    <tr style="background:#1d4ed8;color:#fff"><th style="padding:8px">Metrik</th><th style="padding:8px">Değer</th></tr>
    <tr><td style="padding:8px">Toplam Yükleme</td><td style="padding:8px;text-align:right">${stats.totalTransactions}</td></tr>
    <tr><td style="padding:8px">Toplam Gelir</td><td style="padding:8px;text-align:right">₺${stats.totalRevenueTL.toFixed(2)}</td></tr>
    <tr><td style="padding:8px">API İstek</td><td style="padding:8px;text-align:right">${stats.totalRequests}</td></tr>
    <tr><td style="padding:8px">Hata</td><td style="padding:8px;text-align:right">${stats.errorCount}</td></tr>
  </table>
  <h3 style="color:#374151">Top 5 Model</h3>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px">
    <tr style="background:#374151;color:#fff"><th style="padding:8px">Model</th><th style="padding:8px">İstek</th><th style="padding:8px">Maliyet</th></tr>
    ${topModelsHtml}
  </table>
</div>`;
}

async function gatherDailyStats(): Promise<DailyStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [txRows, usageRows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`,
        totalTL: sql<number>`coalesce(sum(${transactions.miktarTL}::numeric), 0)`,
      })
      .from(transactions)
      .where(sql`${transactions.timestamp} >= ${since} AND ${transactions.tip} = 'yukleme'`),
    db
      .select({
        modelId: usageRecords.modelId,
        count: sql<number>`count(*)::int`,
        totalTL: sql<number>`coalesce(sum(${usageRecords.costTL}::numeric), 0)`,
        errorCount: sql<number>`count(*) filter (where ${usageRecords.status} = 'error')::int`,
      })
      .from(usageRecords)
      .where(sql`${usageRecords.timestamp} >= ${since}`)
      .groupBy(usageRecords.modelId)
      .orderBy(sql`count(*) DESC`)
      .limit(5),
  ]);

  return {
    totalTransactions: Number(txRows[0]?.count ?? 0),
    totalRevenueTL: Number(txRows[0]?.totalTL ?? 0),
    totalRequests: usageRows.reduce((a, r) => a + Number(r.count), 0),
    errorCount: usageRows.reduce((a, r) => a + Number(r.errorCount), 0),
    topModels: usageRows.map((r) => ({
      modelId: r.modelId,
      count: Number(r.count),
      totalTL: Number(r.totalTL),
    })),
  };
}

export function startDailyReportJob(): void {
  if (env.NODE_ENV === "test") return;

  cron.schedule("0 9 * * *", async () => {
    try {
      const cfgRows = await db
        .select({ destekEmail: systemConfig.destekEmail })
        .from(systemConfig)
        .limit(1);
      const adminEmail = cfgRows[0]?.destekEmail ?? "destek@yapayzekalab.com";
      const stats = await gatherDailyStats();
      const html = buildReportHtml(stats);
      await sendDailyReport(adminEmail, html);
    } catch (e: any) {
      logger.error({ err: e }, "[daily-report-job] failed");
    }
  });

  logger.info("[daily-report-job] scheduled (0 9 * * *)");
}
