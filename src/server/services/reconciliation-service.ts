import { dbSql } from "../db/client.js";

export interface ReconciliationUserDrift {
  userId: string;
  email: string;
  currentBalanceTL: number;
  ledgerBalanceTL: number;
  driftTL: number;
}

export interface ReconciliationReport {
  generatedAt: string;
  totals: {
    users: number;
    currentBalanceTL: number;
    ledgerBalanceTL: number;
    driftTL: number;
    creditsTL: number;
    debitsTL: number;
    usageRecordsTL: number;
    usageRecordCount: number;
    errorUsageCount: number;
    streamMissingUsageCount: number;
    upstreamErrorCount: number;
  };
  userDrifts: ReconciliationUserDrift[];
  status: "ok" | "drift";
}

function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 10_000) / 10_000 : 0;
}

export function buildReconciliationReport(input: {
  totals: {
    users: unknown;
    currentBalanceTL: unknown;
    ledgerBalanceTL: unknown;
    creditsTL: unknown;
    debitsTL: unknown;
    usageRecordsTL: unknown;
    usageRecordCount: unknown;
    errorUsageCount: unknown;
    streamMissingUsageCount: unknown;
    upstreamErrorCount: unknown;
  };
  userDrifts: Array<{
    userId: string;
    email: string;
    currentBalanceTL: unknown;
    ledgerBalanceTL: unknown;
    driftTL: unknown;
  }>;
}): ReconciliationReport {
  const currentBalanceTL = toNum(input.totals.currentBalanceTL);
  const ledgerBalanceTL = toNum(input.totals.ledgerBalanceTL);
  const driftTL = toNum(currentBalanceTL - ledgerBalanceTL);
  const userDrifts = input.userDrifts
    .map((row) => ({
      userId: row.userId,
      email: row.email,
      currentBalanceTL: toNum(row.currentBalanceTL),
      ledgerBalanceTL: toNum(row.ledgerBalanceTL),
      driftTL: toNum(row.driftTL),
    }))
    .filter((row) => Math.abs(row.driftTL) >= 0.0001);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      users: Number(input.totals.users ?? 0),
      currentBalanceTL,
      ledgerBalanceTL,
      driftTL,
      creditsTL: toNum(input.totals.creditsTL),
      debitsTL: toNum(input.totals.debitsTL),
      usageRecordsTL: toNum(input.totals.usageRecordsTL),
      usageRecordCount: Number(input.totals.usageRecordCount ?? 0),
      errorUsageCount: Number(input.totals.errorUsageCount ?? 0),
      streamMissingUsageCount: Number(input.totals.streamMissingUsageCount ?? 0),
      upstreamErrorCount: Number(input.totals.upstreamErrorCount ?? 0),
    },
    userDrifts,
    status: Math.abs(driftTL) < 0.0001 && userDrifts.length === 0 ? "ok" : "drift",
  };
}

export async function getReconciliationReport(): Promise<ReconciliationReport> {
  const [totalsRows, driftRows] = await Promise.all([
    dbSql<{
      users: string;
      current_balance_tl: string;
      ledger_balance_tl: string;
      credits_tl: string;
      debits_tl: string;
      usage_records_tl: string;
      usage_record_count: string;
      error_usage_count: string;
      stream_missing_usage_count: string;
      upstream_error_count: string;
    }[]>`
      WITH ledger AS (
        SELECT
          COALESCE(SUM(miktar_tl), 0) AS ledger_balance_tl,
          COALESCE(SUM(CASE WHEN miktar_tl > 0 THEN miktar_tl ELSE 0 END), 0) AS credits_tl,
          COALESCE(SUM(CASE WHEN miktar_tl < 0 THEN ABS(miktar_tl) ELSE 0 END), 0) AS debits_tl
        FROM transactions
      ),
      balances AS (
        SELECT
          COUNT(*) AS users,
          COALESCE(SUM(bakiye_tl), 0) AS current_balance_tl
        FROM users
      ),
      usage AS (
        SELECT
          COALESCE(SUM(cost_tl), 0) AS usage_records_tl,
          COUNT(*) AS usage_record_count,
          COUNT(*) FILTER (WHERE status = 'error') AS error_usage_count,
          COUNT(*) FILTER (WHERE status = 'stream_missing_usage') AS stream_missing_usage_count,
          COUNT(*) FILTER (WHERE error_code LIKE 'upstream_%') AS upstream_error_count
        FROM usage_records
      )
      SELECT
        balances.users::text,
        balances.current_balance_tl::text,
        ledger.ledger_balance_tl::text,
        ledger.credits_tl::text,
        ledger.debits_tl::text,
        usage.usage_records_tl::text,
        usage.usage_record_count::text,
        usage.error_usage_count::text,
        usage.stream_missing_usage_count::text,
        usage.upstream_error_count::text
      FROM balances, ledger, usage
    `,
    dbSql<{
      user_id: string;
      email: string;
      current_balance_tl: string;
      ledger_balance_tl: string;
      drift_tl: string;
    }[]>`
      SELECT
        u.id::text AS user_id,
        u.email,
        u.bakiye_tl::text AS current_balance_tl,
        COALESCE(SUM(t.miktar_tl), 0)::text AS ledger_balance_tl,
        (u.bakiye_tl - COALESCE(SUM(t.miktar_tl), 0))::text AS drift_tl
      FROM users u
      LEFT JOIN transactions t ON t.user_id = u.id
      GROUP BY u.id, u.email, u.bakiye_tl
      HAVING ABS(u.bakiye_tl - COALESCE(SUM(t.miktar_tl), 0)) >= 0.0001
      ORDER BY ABS(u.bakiye_tl - COALESCE(SUM(t.miktar_tl), 0)) DESC
      LIMIT 100
    `,
  ]);

  const totals = totalsRows[0] ?? {
    users: "0",
    current_balance_tl: "0",
    ledger_balance_tl: "0",
    credits_tl: "0",
    debits_tl: "0",
    usage_records_tl: "0",
    usage_record_count: "0",
    error_usage_count: "0",
    stream_missing_usage_count: "0",
    upstream_error_count: "0",
  };

  return buildReconciliationReport({
    totals: {
      users: totals.users,
      currentBalanceTL: totals.current_balance_tl,
      ledgerBalanceTL: totals.ledger_balance_tl,
      creditsTL: totals.credits_tl,
      debitsTL: totals.debits_tl,
      usageRecordsTL: totals.usage_records_tl,
      usageRecordCount: totals.usage_record_count,
      errorUsageCount: totals.error_usage_count,
      streamMissingUsageCount: totals.stream_missing_usage_count,
      upstreamErrorCount: totals.upstream_error_count,
    },
    userDrifts: driftRows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      currentBalanceTL: row.current_balance_tl,
      ledgerBalanceTL: row.ledger_balance_tl,
      driftTL: row.drift_tl,
    })),
  });
}
