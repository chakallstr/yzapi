// Gözcü — sağlayıcı (upstream) sağlığı domeni.

import { dbSql } from "../../../db/client.js";
import { resolveProviderBaseUrl, resolveProviderApiKey } from "../../provider-config-service.js";
import type { GozcuCheckResult, Severity } from "../types.js";

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// models_reachability ardışık-başarısızlık sayacı (flaky sağlayıcı gürültüsünü önler).
let modelsFailStreak = 0;

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

// models_reachability — AKTİF sağlayıcının (proxy'nin gerçekte kullandığı) /models ucunu
// yoklar. Tek geçici timeout false-page atmasın diye 2 deneme (4sn/deneme); yalnız İKİSİ de
// başarısızsa red. resolveProviderBaseUrl/ApiKey proxy ile AYNI çözümlemeyi yapar.
async function checkModelsReachability(): Promise<GozcuCheckResult> {
  let base: string | undefined;
  let key: string | undefined;
  try {
    base = await resolveProviderBaseUrl();
    key = await resolveProviderApiKey();
  } catch {
    /* çözümleme hatası → yapılandırılmamış say */
  }
  if (!base || !key) {
    return {
      name: "models_reachability",
      domain: "provider",
      signalSource: "aktif sağlayıcı GET /models",
      measured: "sağlayıcı yapılandırılmamış",
      threshold: "200 🟢 · yapılandırılmamış 🟡 · 2/2 fail 🔴",
      severity: "yellow",
    };
  }

  let ok = false;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) ok = true;
      else lastErr = `HTTP ${res.status}`;
    } catch {
      lastErr = "erişilemiyor / timeout";
    }
  }

  modelsFailStreak = ok ? 0 : modelsFailStreak + 1;
  // 1–2 ardışık fail (geçici/flaky sağlayıcı) → yellow (page YOK). ≥3 ardışık (~3dk sürekli)
  // → red+immediate (gerçek kesinti) + failover önerisi. Aralıklı yavaşlık WhatsApp spam'i yapmaz.
  const severity: Severity = ok ? "green" : modelsFailStreak >= 3 ? "red" : "yellow";
  return {
    name: "models_reachability",
    domain: "provider",
    signalSource: "aktif sağlayıcı GET /models",
    measured: ok ? "erişilebilir" : `${lastErr} (2/2 deneme · ardışık ${modelsFailStreak})`,
    threshold: "200 🟢 · 1–2 ardışık fail 🟡 · ≥3 ardışık fail 🔴",
    severity,
    immediate: severity === "red",
    suggestedHeal:
      severity === "red"
        ? { id: "failover_provider", reason: "aktif sağlayıcı sürekli erişilemez", reversible: true }
        : undefined,
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
