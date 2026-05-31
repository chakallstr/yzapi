import { dbSql } from "../db/client.js";

// ── Monthly usage/payment report ──────────────────────────────────────────────
// Bu servis kullanıcının panelindeki "İSTEK" / "BU AY KULLANIM" kartlarını ve
// aylık CSV/PDF raporunu besler. İstek sayısı TÜM ay üzerinden COUNT(*) ile
// hesaplanır (usage_records'ta request_id unique → her istek tek satır), bu
// yüzden son-100 LIMIT'ine bağlı değildir.

export interface MonthlyReportSummary {
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costTL: number;
  paymentTL: number;
}

export interface MonthlyReportModelRow {
  modelId: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costTL: number;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  rangeStart: string; // ISO
  rangeEnd: string; // ISO (exclusive)
  summary: MonthlyReportSummary;
  byModel: MonthlyReportModelRow[];
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;

/**
 * "YYYY-MM" → [başlangıç, bitiş) UTC aralığı. Geçersiz girişte hata fırlatır.
 */
export function monthRange(month: string): { start: Date; end: Date } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error("invalid_month");
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new Error("invalid_month");
  const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0, 0));
  return { start, end };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getMonthlyReport(userId: string, month: string): Promise<MonthlyReport> {
  const { start, end } = monthRange(month);

  const summaryRows = await dbSql<
    {
      request_count: string;
      successful_requests: string;
      failed_requests: string;
      input_tokens: string;
      output_tokens: string;
      cost_usd: string;
      cost_tl: string;
    }[]
  >`
    SELECT
      COUNT(*)                                                   AS request_count,
      COUNT(*) FILTER (WHERE status = 'success')                 AS successful_requests,
      COUNT(*) FILTER (WHERE status <> 'success')                AS failed_requests,
      COALESCE(SUM(input_usage), 0)                              AS input_tokens,
      COALESCE(SUM(output_usage), 0)                             AS output_tokens,
      COALESCE(SUM(cost_usd), 0)                                 AS cost_usd,
      COALESCE(SUM(cost_tl), 0)                                  AS cost_tl
    FROM usage_records
    WHERE user_id = ${userId}::uuid
      AND timestamp >= ${start.toISOString()}
      AND timestamp <  ${end.toISOString()}
  `;

  const paymentRows = await dbSql<{ payment_tl: string }[]>`
    SELECT COALESCE(SUM(miktar_tl), 0) AS payment_tl
    FROM transactions
    WHERE user_id = ${userId}::uuid
      AND tip = 'yukleme'
      AND timestamp >= ${start.toISOString()}
      AND timestamp <  ${end.toISOString()}
  `;

  const modelRows = await dbSql<
    {
      model_id: string;
      request_count: string;
      input_tokens: string;
      output_tokens: string;
      cost_usd: string;
      cost_tl: string;
    }[]
  >`
    SELECT
      model_id,
      COUNT(*)                       AS request_count,
      COALESCE(SUM(input_usage), 0)  AS input_tokens,
      COALESCE(SUM(output_usage), 0) AS output_tokens,
      COALESCE(SUM(cost_usd), 0)     AS cost_usd,
      COALESCE(SUM(cost_tl), 0)      AS cost_tl
    FROM usage_records
    WHERE user_id = ${userId}::uuid
      AND timestamp >= ${start.toISOString()}
      AND timestamp <  ${end.toISOString()}
    GROUP BY model_id
    ORDER BY cost_tl DESC, request_count DESC
  `;

  const s = summaryRows[0];
  const inputTokens = num(s?.input_tokens);
  const outputTokens = num(s?.output_tokens);

  const summary: MonthlyReportSummary = {
    requestCount: num(s?.request_count),
    successfulRequests: num(s?.successful_requests),
    failedRequests: num(s?.failed_requests),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: num(s?.cost_usd),
    costTL: num(s?.cost_tl),
    paymentTL: num(paymentRows[0]?.payment_tl),
  };

  const byModel: MonthlyReportModelRow[] = modelRows.map((row) => ({
    modelId: row.model_id,
    requestCount: num(row.request_count),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    costUsd: num(row.cost_usd),
    costTL: num(row.cost_tl),
  }));

  return {
    month,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    summary,
    byModel,
  };
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function buildMonthlyReportCsv(report: MonthlyReport): string {
  const lines: string[] = [];
  lines.push(csvCell(`YapayZekaLab — Aylik Rapor ${report.month}`));
  lines.push("");
  lines.push(["Ozet", "Deger"].map(csvCell).join(","));
  lines.push(["Istek sayisi", report.summary.requestCount].map(csvCell).join(","));
  lines.push(["Basarili istek", report.summary.successfulRequests].map(csvCell).join(","));
  lines.push(["Hatali istek", report.summary.failedRequests].map(csvCell).join(","));
  lines.push(["Toplam token", report.summary.totalTokens].map(csvCell).join(","));
  lines.push(["Maliyet (USD)", report.summary.costUsd.toFixed(4)].map(csvCell).join(","));
  lines.push(["Maliyet (TL)", report.summary.costTL.toFixed(2)].map(csvCell).join(","));
  lines.push(["Yukleme (TL)", report.summary.paymentTL.toFixed(2)].map(csvCell).join(","));
  lines.push("");
  lines.push(
    ["Model", "Istek", "Girdi token", "Cikti token", "Maliyet (USD)", "Maliyet (TL)"]
      .map(csvCell)
      .join(",")
  );
  for (const row of report.byModel) {
    lines.push(
      [
        row.modelId,
        row.requestCount,
        row.inputTokens,
        row.outputTokens,
        row.costUsd.toFixed(4),
        row.costTL.toFixed(2),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Bağımlılık eklemeden minimal, geçerli tek sayfalık PDF üretir (muhasebe için
 * insan-okunur özet). Ağır PDF kütüphanesi gerektirmez.
 */
export function buildMonthlyReportPdf(report: MonthlyReport): Buffer {
  const s = report.summary;
  const textLines = [
    `YapayZekaLab - Aylik Rapor ${report.month}`,
    "",
    `Istek sayisi: ${s.requestCount}`,
    `Basarili / Hatali: ${s.successfulRequests} / ${s.failedRequests}`,
    `Toplam token: ${s.totalTokens}`,
    `Maliyet (USD): ${s.costUsd.toFixed(4)}`,
    `Maliyet (TL): ${s.costTL.toFixed(2)}`,
    `Yukleme (TL): ${s.paymentTL.toFixed(2)}`,
    "",
    "Model dagilimi:",
    ...report.byModel
      .slice(0, 20)
      .map((row) => `  ${row.modelId}: ${row.requestCount} istek, $${row.costUsd.toFixed(4)}`),
  ];

  const leading = 16;
  const startY = 780;
  const content =
    `BT\n/F1 11 Tf\n${leading} TL\n1 0 0 1 56 ${startY} Tm\n` +
    textLines.map((line) => `(${pdfEscape(line)}) Tj T*`).join("\n") +
    `\nET`;

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
  );
  objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}
