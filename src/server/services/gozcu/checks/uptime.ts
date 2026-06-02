// Gözcü — uptime & hata domeni.
// /v1 latency/hata zaten usage_records'tan SQL ile türetilir (response_ms/status/error_code).
// /api/* 5xx + unhandled collector'dan gelir (tap yoksa boş → yeterli örnek yok → green).

import { dbSql } from "../../../db/client.js";
import { windowSnapshot } from "../metrics-collector.js";
import { snapshotHeartbeats } from "../heartbeat.js";
import type { GozcuCheckResult, Severity } from "../types.js";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// api_5xx_rate — collector 15dk penceresi (min 20 istek yoksa green).
function checkApi5xxRate(): GozcuCheckResult {
  const w = windowSnapshot();
  let severity: Severity = "green";
  if (w.total >= 20) {
    if (w.fivexxRate > 0.05) severity = "red";
    else if (w.fivexxRate >= 0.01) severity = "yellow";
  }
  return {
    name: "api_5xx_rate",
    domain: "uptime",
    signalSource: "collector(/api/* 5xx, 15dk)",
    measured: `%${(w.fivexxRate * 100).toFixed(2)} (${w.s5xx}/${w.total})`,
    threshold: "<%1 🟢 · %1–5 🟡 · >%5 🔴 (min 20 istek)",
    severity,
  };
}

// proxy_error_rate — usage_records son 15dk.
async function checkProxyErrorRate(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ err: string; total: string }[]>`
    SELECT count(*) FILTER (WHERE status='error')::text AS err, count(*)::text AS total
    FROM usage_records WHERE timestamp >= now() - interval '15 minutes'
  `;
  const err = num(rows[0]?.err);
  const total = num(rows[0]?.total);
  const rate = total > 0 ? err / total : 0;
  let severity: Severity = "green";
  if (total >= 10) {
    if (rate > 0.1) severity = "red";
    else if (rate >= 0.02) severity = "yellow";
  }
  return {
    name: "proxy_error_rate",
    domain: "uptime",
    signalSource: "usage_records.status (15dk)",
    measured: `%${(rate * 100).toFixed(2)} (${err}/${total})`,
    threshold: "<%2 🟢 · %2–10 🟡 · >%10 🔴 (min 10)",
    severity,
  };
}

// p95_latency — usage_records başarılı son 15dk.
async function checkP95Latency(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ p95: string | null; n: string }[]>`
    SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY response_ms)::text AS p95, count(*)::text AS n
    FROM usage_records
    WHERE status='success' AND response_ms > 0 AND timestamp >= now() - interval '15 minutes'
  `;
  const n = num(rows[0]?.n);
  const p95ms = num(rows[0]?.p95);
  let severity: Severity = "green";
  if (n >= 20) {
    if (p95ms > 20_000) severity = "red";
    else if (p95ms >= 8_000) severity = "yellow";
  }
  return {
    name: "p95_latency",
    domain: "uptime",
    signalSource: "usage_records.response_ms (15dk)",
    measured: `${(p95ms / 1000).toFixed(1)}s (n=${n})`,
    threshold: "<8s 🟢 · 8–20s 🟡 · >20s 🔴 (min 20)",
    severity,
  };
}

// job_liveness — heartbeat haritası (mali-izleme durması → 🔴 immediate).
function checkJobLiveness(): GozcuCheckResult {
  const stale = snapshotHeartbeats().filter((h) => h.stale);
  const maliStale = stale.some((h) => h.job === "mali-izleme-job");
  let severity: Severity = "green";
  let immediate = false;
  if (stale.length > 0) {
    if (maliStale) {
      severity = "red";
      immediate = true;
    } else {
      severity = "yellow";
    }
  }
  return {
    name: "job_liveness",
    domain: "uptime",
    signalSource: "in-memory heartbeat",
    measured: stale.length ? `${stale.length} bayat: ${stale.map((h) => h.job).join(", ")}` : "tüm joblar taze",
    threshold: "now − lastRun ≤ 2×beklenen",
    severity,
    immediate,
    evidence: stale.length ? stale : undefined,
  };
}

// db_pool_health — zamanlı SELECT 1.
async function checkDbPool(): Promise<GozcuCheckResult> {
  const start = Date.now();
  let ok = true;
  try {
    await dbSql`SELECT 1`;
  } catch {
    ok = false;
  }
  const ms = Date.now() - start;
  let severity: Severity = "green";
  let immediate = false;
  if (!ok) {
    severity = "red";
    immediate = true; // DB GERÇEKTEN erişilemiyor → anında alarm
  } else if (ms > 2500) {
    severity = "red"; // çok yavaş ama CANLI → red ama immediate DEĞİL (geçici yavaşlık false-page atmasın; histerezise tabi)
  } else if (ms > 500) {
    severity = "yellow";
  }
  return {
    name: "db_pool_health",
    domain: "uptime",
    signalSource: "SELECT 1 latency",
    measured: ok ? `${ms}ms` : "DB erişilemiyor",
    threshold: "ok&<500ms 🟢 · <2500ms 🟡 · fail 🔴(anında) · >2500ms 🔴",
    severity,
    immediate,
  };
}

// unhandled_error_spike — collector 500.
function checkUnhandledSpike(): GozcuCheckResult {
  const w = windowSnapshot();
  let severity: Severity = "green";
  if (w.unhandled500 > 3) severity = "red";
  else if (w.unhandled500 >= 1) severity = "yellow";
  return {
    name: "unhandled_error_spike",
    domain: "uptime",
    signalSource: "collector(unhandled 500, 15dk)",
    measured: `${w.unhandled500} adet`,
    threshold: "0 🟢 · 1–3 🟡 · >3 🔴",
    severity,
  };
}

export async function runUptimeChecks(): Promise<GozcuCheckResult[]> {
  return [
    checkApi5xxRate(),
    await checkProxyErrorRate(),
    await checkP95Latency(),
    checkJobLiveness(),
    await checkDbPool(),
    checkUnhandledSpike(),
  ];
}
