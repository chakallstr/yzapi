// Gözcü — sağlayıcı (upstream) sağlığı domeni.

import { dbSql } from "../../../db/client.js";
import { aiProviderApiKey, aiProviderBaseUrl } from "../../../lib/env.js";
import type { GozcuCheckResult, Severity } from "../types.js";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// upstream_error_rate — usage_records.error_code LIKE 'upstream_%' (15dk).
async function checkUpstreamErrorRate(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ err: string; total: string }[]>`
    SELECT count(*) FILTER (WHERE error_code LIKE 'upstream_%')::text AS err, count(*)::text AS total
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
    name: "upstream_error_rate",
    domain: "provider",
    signalSource: "usage_records.error_code LIKE upstream_% (15dk)",
    measured: `%${(rate * 100).toFixed(2)} (${err}/${total})`,
    threshold: "<%2 🟢 · %2–10 🟡 · >%10 🔴 (min 10)",
    severity,
  };
}

// upstream_timeout_rate — timeout/abort imzalı upstream hataları (15dk).
async function checkUpstreamTimeoutRate(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ to: string; total: string }[]>`
    SELECT count(*) FILTER (WHERE error_code IN ('upstream_504','upstream_408','upstream_error'))::text AS to,
           count(*)::text AS total
    FROM usage_records WHERE timestamp >= now() - interval '15 minutes'
  `;
  const to = num(rows[0]?.to);
  const total = num(rows[0]?.total);
  const rate = total > 0 ? to / total : 0;
  let severity: Severity = "green";
  if (total >= 10) {
    if (rate > 0.05) severity = "red";
    else if (rate >= 0.01) severity = "yellow";
  }
  return {
    name: "upstream_timeout_rate",
    domain: "provider",
    signalSource: "usage_records.error_code (504/408/error, 15dk)",
    measured: `%${(rate * 100).toFixed(2)} (${to}/${total})`,
    threshold: "<%1 🟢 · %1–5 🟡 · >%5 🔴 (min 10)",
    severity,
  };
}

// models_reachability — upstream GET /models 2.5s probe (yalnız gerçek taramada çağrılır).
async function checkModelsReachability(): Promise<GozcuCheckResult> {
  const base = aiProviderBaseUrl();
  const key = aiProviderApiKey();
  let severity: Severity = "green";
  let measured = "erişilebilir";
  if (!base || !key) {
    severity = "yellow";
    measured = "sağlayıcı yapılandırılmamış";
  } else {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        severity = "red";
        measured = `HTTP ${res.status}`;
      }
    } catch {
      severity = "red";
      measured = "erişilemiyor / timeout";
    }
  }
  return {
    name: "models_reachability",
    domain: "provider",
    signalSource: "upstream GET /models",
    measured,
    threshold: "200 🟢 · yapılandırılmamış 🟡 · fail 🔴",
    severity,
    immediate: severity === "red",
  };
}

// provider_durum_staleness — provider_durumlari.son_kontrol yaşı + durum.
async function checkProviderDurumStaleness(): Promise<GozcuCheckResult> {
  const rows = await dbSql<{ provider: string; durum: string; age_min: string | null }[]>`
    SELECT provider, durum,
      (EXTRACT(EPOCH FROM (now() - son_kontrol)) / 60)::text AS age_min
    FROM provider_durumlari
  `;
  let severity: Severity = "green";
  const sorunlu: Array<{ provider: string; durum: string; ageMin: number }> = [];
  for (const r of rows) {
    const ageMin = num(r.age_min);
    const inactive = r.durum !== "aktif";
    const veryStale = ageMin > 720; // >12 saat
    const stale = ageMin > 120; // >2 saat
    if (inactive || veryStale) {
      severity = "red";
      sorunlu.push({ provider: r.provider, durum: r.durum, ageMin });
    } else if (stale && severity !== "red") {
      severity = "yellow";
      sorunlu.push({ provider: r.provider, durum: r.durum, ageMin });
    }
  }
  return {
    name: "provider_durum_staleness",
    domain: "provider",
    signalSource: "provider_durumlari.son_kontrol/durum",
    measured: sorunlu.length ? `${sorunlu.length} sağlayıcı sorunlu` : `${rows.length} sağlayıcı taze/aktif`,
    threshold: "aktif & <2sa 🟢 · 2–12sa 🟡 · pasif veya >12sa 🔴",
    severity,
    evidence: sorunlu.length ? sorunlu : undefined,
  };
}

export async function runProviderChecks(): Promise<GozcuCheckResult[]> {
  return [
    await checkUpstreamErrorRate(),
    await checkUpstreamTimeoutRate(),
    await checkModelsReachability(),
    await checkProviderDurumStaleness(),
  ];
}
