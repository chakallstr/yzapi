// Gözcü — Denetim Motoru (salt-okunur tarama + bulgu yaşam döngüsü).
//
// Mali İzleme'nin kanıtlanmış primitiflerini (applyHysteresis, deriveVerdict) REUSE eder.
// Tüm checkler safeRun ile izole — biri patlarsa yellow+check_failed, diğerleri devam,
// motor ASLA çökmez. Sinyal tablolarından yalnız SELECT okur; yalnız gozcu_findings /
// gozcu_signals'a yazar. Para hareketi YOK. Kırmızı bulgular (varsa) teşhis sink'ine
// devredilir (varsayılan no-op; Faz 4 LLM sink'ini kaydeder).

import { dbSql } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { applyHysteresis, deriveVerdict } from "../mali-izleme-checks.js";
import { hasActivitySince } from "../mali-izleme-service.js";
import { windowSnapshot } from "./metrics-collector.js";
import { snapshotHeartbeats } from "./heartbeat.js";
import { CHECK_REGISTRY } from "./registry.js";
import { scrubObject } from "./redact.js";
import type {
  Check,
  DiagnosisSink,
  Domain,
  GozcuCheckResult,
  GozcuScanResult,
  Severity,
  Verdict,
} from "./types.js";

const DOMAINS: Domain[] = ["money", "uptime", "provider", "security", "code"];

let diagnosisSink: DiagnosisSink | null = null;
// Faz 4 (LLM teşhis) gerçek sink'i buraya kaydeder. Kayıtlı değilse engine bağımsız çalışır.
export function registerDiagnosisSink(sink: DiagnosisSink): void {
  diagnosisSink = sink;
}

function dedupKey(c: GozcuCheckResult): string {
  return `${c.domain}:${c.name}`;
}

// Bir domain checkini güvenli sar — asla throw etmez (R19).
async function safeRun(check: Check): Promise<GozcuCheckResult[]> {
  try {
    const r = await check.run();
    return Array.isArray(r) ? r : [r];
  } catch (e) {
    logger.error({ err: e, check: check.name }, "[gozcu] check hatası");
    return [
      {
        name: check.name,
        domain: check.domain,
        signalSource: check.signalSource,
        measured: "kontrol hatası",
        threshold: "—",
        severity: "yellow",
        evidence: "check_failed",
      },
    ];
  }
}

// Histerezis için önceki severity (gozcu_findings'ten; ~25 satır).
async function prevSeverities(): Promise<Map<string, Severity>> {
  const rows = await dbSql<{ check_name: string; severity: string }[]>`
    SELECT check_name, severity FROM gozcu_findings
  `;
  return new Map(rows.map((r) => [r.check_name, r.severity as Severity]));
}

async function maxTimestamps(): Promise<{ usageTs: string | null; txTs: string | null }> {
  const r = await dbSql<{ u: string | null; t: string | null }[]>`
    SELECT (SELECT max(timestamp)::text FROM usage_records) AS u,
           (SELECT max(timestamp)::text FROM transactions) AS t
  `;
  return { usageTs: r[0]?.u ?? null, txTs: r[0]?.t ?? null };
}

// ── Ana tarama ────────────────────────────────────────────────────────────────
export async function runGozcuScan(trigger: "cron" | "on_demand" = "cron"): Promise<GozcuScanResult> {
  const start = Date.now();
  const prev = await prevSeverities();

  // Tüm domainleri eşzamanlı koş (her biri izole).
  const nested = await Promise.all(CHECK_REGISTRY.map((c) => safeRun(c)));
  const checks: GozcuCheckResult[] = nested.flat();

  // Histerezis: red checkler önceki severity'e göre değerlendirilir (immediate bypass).
  for (const c of checks) {
    if (c.severity === "red") {
      const h = applyHysteresis({
        currentSeverity: "red",
        previousSeverity: prev.get(c.name) ?? null,
        windowExceedRatio: 0,
        immediate: c.immediate === true,
      });
      c.severity = h.effectiveSeverity;
    }
  }

  const verdict = deriveVerdict(checks);
  const domainVerdicts = {} as Record<Domain, Verdict>;
  for (const d of DOMAINS) domainVerdicts[d] = deriveVerdict(checks.filter((c) => c.domain === d));

  const findings = checks.filter((c) => c.severity !== "green");
  const redCount = checks.filter((c) => c.severity === "red").length;
  const yellowCount = checks.filter((c) => c.severity === "yellow").length;
  const { usageTs, txTs } = await maxTimestamps();

  const result: GozcuScanResult = {
    scanAt: new Date().toISOString(),
    verdict,
    domainVerdicts,
    checks,
    findings,
    metrics: { http: windowSnapshot(), heartbeats: snapshotHeartbeats() },
    redCount,
    yellowCount,
    lastUsageTs: usageTs,
    lastTxTs: txTs,
    trigger,
    durationMs: Date.now() - start,
  };

  await persistScan(result);
  await handDiagnosis(result);
  return result;
}

// Bulgu yaşam döngüsü (dedup_key başına upsert) + tarama özeti.
async function persistScan(result: GozcuScanResult): Promise<void> {
  for (const c of result.checks) {
    const key = dedupKey(c);
    // PII/secret redaksiyonu: evidence DB'ye yazılmadan ÖNCE temizlenir (örn. ledger_drift
    // e-postaları) → gozcu_findings.evidence_json ve admin API yanıtı maskelenmiş olur.
    const evidence = c.evidence != null ? JSON.stringify(scrubObject(c.evidence)) : null;
    if (c.severity === "green") {
      // Açık bir bulgu varsa çöz; yoksa hiçbir şey yapma (gereksiz satır üretme).
      await dbSql`
        UPDATE gozcu_findings
        SET severity='green', status='resolved', measured=${String(c.measured)}, last_seen_at=now()
        WHERE dedup_key=${key} AND status <> 'resolved'
      `;
    } else {
      await dbSql`
        INSERT INTO gozcu_findings
          (domain, check_name, severity, status, dedup_key, measured, threshold, evidence_json)
        VALUES
          (${c.domain}, ${c.name}, ${c.severity}, 'open', ${key}, ${String(c.measured)}, ${c.threshold}, ${evidence}::jsonb)
        ON CONFLICT (dedup_key) DO UPDATE SET
          severity=${c.severity},
          measured=${String(c.measured)},
          threshold=${c.threshold},
          evidence_json=${evidence}::jsonb,
          last_seen_at=now(),
          status=CASE
            WHEN gozcu_findings.status='ack' THEN 'ack'
            WHEN gozcu_findings.status='snoozed' AND gozcu_findings.snoozed_until > now() THEN 'snoozed'
            ELSE 'open' END
      `;
    }
  }

  await dbSql`
    INSERT INTO gozcu_signals
      (verdict, domain_verdicts_json, metrics_json, red_count, yellow_count, last_usage_ts, last_tx_ts, scan_trigger, duration_ms)
    VALUES
      (${result.verdict}, ${JSON.stringify(result.domainVerdicts)}::jsonb, ${JSON.stringify(result.metrics)}::jsonb,
       ${result.redCount}, ${result.yellowCount}, ${result.lastUsageTs}::timestamptz, ${result.lastTxTs}::timestamptz,
       ${result.trigger}, ${result.durationMs})
  `;
}

// Kırmızı bulguları teşhis sink'ine devret (varsayılan no-op; sink kendi try/catch'inde).
async function handDiagnosis(result: GozcuScanResult): Promise<void> {
  if (!diagnosisSink) return;
  for (const f of result.findings) {
    if (f.severity !== "red") continue;
    try {
      await diagnosisSink(f, result.scanAt);
    } catch (e) {
      logger.error({ err: e, check: f.name }, "[gozcu] teşhis sink hatası");
    }
  }
}

// Aktivite kapısı: para aktivitesi YA DA collector trafiği YA DA bayat heartbeat varsa tara.
export async function runGozcuScanIfActivity(
  trigger: "cron" | "on_demand" = "cron",
): Promise<GozcuScanResult | null> {
  const last = await dbSql<{ lu: string | null; lt: string | null; sa: string }[]>`
    SELECT last_usage_ts::text AS lu, last_tx_ts::text AS lt, scan_at::text AS sa
    FROM gozcu_signals ORDER BY scan_at DESC LIMIT 1
  `;
  if (last.length) {
    // Taban tarama: en az 10 dakikada bir TAM tara — sıfır-aktivite olsa bile bayat job /
    // kod regresyonu / dead-letter birikimi sessizce kaçmasın (heartbeat false-negatif fix).
    const idleTooLong = Date.now() - Date.parse(last[0].sa) >= 10 * 60 * 1000;
    if (!idleTooLong) {
      const moneyActive = await hasActivitySince(last[0].lu, last[0].lt);
      const w = windowSnapshot();
      const staleJob = snapshotHeartbeats().some((h) => h.stale);
      if (!moneyActive && w.total === 0 && w.auth401 === 0 && w.rate429 === 0 && !staleJob) {
        return null; // sessiz çık — sinyal yok ve taban-aralık dolmadı
      }
    }
  }
  return runGozcuScan(trigger);
}

// ── Panel API yardımcıları ───────────────────────────────────────────────────
export async function getOpenFindings(): Promise<Record<string, unknown>[]> {
  const rows = await dbSql<Record<string, unknown>[]>`
    SELECT id::text, domain, check_name, severity, status, measured, threshold,
      root_cause, suggested_fix, confidence::text, evidence_json,
      autoheal_attempted, autoheal_result_json, acked_by, snoozed_until::text,
      first_seen_at::text, last_seen_at::text
    FROM gozcu_findings
    WHERE status IN ('open','ack','snoozed') AND severity <> 'green'
    ORDER BY (severity='red') DESC, last_seen_at DESC
  `;
  return [...rows];
}

export async function getSignalHistory(limit = 200): Promise<Record<string, unknown>[]> {
  const rows = await dbSql<Record<string, unknown>[]>`
    SELECT scan_at::text, verdict, domain_verdicts_json, red_count, yellow_count, duration_ms
    FROM gozcu_signals ORDER BY scan_at DESC LIMIT ${limit}
  `;
  return [...rows];
}
