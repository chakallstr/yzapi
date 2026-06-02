// Canlı Mali İzleme — Denetim_Motoru (salt-okunur SQL kontrol motoru).
//
// Task 2'deki SAF fonksiyonları gerçek DB sorgularıyla besler, tüm kontrolleri
// (C1–C11) çalıştırır, verdict üretir, histerezisi önceki taramadan okur ve özeti
// mali_izleme_taramalari'na APPEND eder.
//
// DOKUNULMAZ: Para tablolarından (transactions/usage_records/users/payments/system_config/
// kur_history/signup_bonus_grants) yalnız SELECT okur; yalnız mali_izleme_taramalari'na
// INSERT eder. billing-service/pricing settle/charge ÇAĞRILMAZ. Secret kolon seçilmez.
// Her kontrol kendi try/catch'inde — bir kontrol patlarsa yellow+evidence, diğerleri devam (R19).

import { dbSql } from "../db/client.js";
import { logger } from "../lib/logger.js";
import {
  classifyDrift,
  classifyK1,
  round4,
  classifyOrphan,
  classifyStreamMissing,
  recomputeCostTL,
  recomputeDeviates,
  classifyRecompute,
  computeMarjUsd,
  classifyMarj,
  classifyKdv,
  kdvUyumsuz,
  classifyKur,
  classifyRowCount,
  classifyBonusDrift,
  deriveVerdict,
  applyHysteresis,
  type CheckResult,
  type Severity,
  type Verdict,
} from "./mali-izleme-checks.js";

export interface ScanResult {
  scanAt: string;
  verdict: Verdict;
  checks: CheckResult[];
  findings: CheckResult[];
  baselineDiff?: { driftTL?: number; streamMissingPct?: number };
  lastProcessedUsageTs: string | null;
  lastProcessedTxTs: string | null;
  trigger: "cron" | "on_demand";
  durationMs: number;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Bir kontrolü güvenli sar: patlarsa yellow + hata evidence, motor çökmesin (R19.3).
async function safeCheck(name: string, fn: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await fn();
  } catch (e) {
    logger.error({ err: e, check: name }, "[mali-izleme] kontrol hatası");
    return { name, measured: "kontrol hatası", threshold: "—", severity: "yellow", evidence: "check_failed" };
  }
}

// ── C1: Ledger drift (R8) ─────────────────────────────────────────────────────
async function checkDrift(): Promise<CheckResult> {
  const rows = await dbSql<{ drift_tl: string }[]>`
    WITH ledger AS (SELECT COALESCE(SUM(miktar_tl), 0) AS lb FROM transactions),
         bal AS (SELECT COALESCE(SUM(bakiye_tl), 0) AS cb FROM users)
    SELECT (cb - lb)::text AS drift_tl FROM bal, ledger
  `;
  const driftTL = num(rows[0]?.drift_tl);
  const result = classifyDrift(driftTL);
  if (result.severity === "red") {
    const userRows = await dbSql<{ user_id: string; email: string; drift_tl: string }[]>`
      SELECT u.id::text AS user_id, u.email,
        (u.bakiye_tl - COALESCE(SUM(t.miktar_tl), 0))::text AS drift_tl
      FROM users u LEFT JOIN transactions t ON t.user_id = u.id
      GROUP BY u.id, u.email, u.bakiye_tl
      HAVING ABS(u.bakiye_tl - COALESCE(SUM(t.miktar_tl), 0)) >= 0.0001
      ORDER BY ABS(u.bakiye_tl - COALESCE(SUM(t.miktar_tl), 0)) DESC
      LIMIT 100
    `;
    result.evidence = userRows.map((r) => ({ userId: r.user_id, email: r.email, driftTL: num(r.drift_tl) }));
  }
  return result;
}

// ── C2: K1 hata-tahsil garantisi (R9) ─────────────────────────────────────────
async function checkK1(): Promise<CheckResult> {
  const rows = await dbSql<{ k1: string }[]>`
    SELECT count(*)::text AS k1 FROM usage_records WHERE status='error' AND cost_tl::numeric > 0
  `;
  const count = num(rows[0]?.k1);
  const result = classifyK1(count);
  if (count > 0) {
    const ihlal = await dbSql<{ request_id: string; model_id: string; cost_tl: string; error_code: string; timestamp: string }[]>`
      SELECT request_id, model_id, cost_tl::text, error_code, timestamp::text
      FROM usage_records WHERE status='error' AND cost_tl::numeric > 0
      ORDER BY timestamp DESC LIMIT 50
    `;
    result.evidence = ihlal;
  }
  return result;
}

// ── C3: Orphan rezervasyon (R4) ───────────────────────────────────────────────
async function checkOrphan(): Promise<CheckResult> {
  const rows = await dbSql<{ orphan: string; kilitli_tl: string }[]>`
    SELECT count(*)::text AS orphan, COALESCE(SUM(ABS(miktar_tl)), 0)::text AS kilitli_tl
    FROM transactions r
    WHERE r.idempotency_key LIKE 'usage_reserve_%'
      AND r.timestamp < now() - interval '90 minutes'
      AND NOT EXISTS (SELECT 1 FROM transactions f WHERE f.idempotency_key = 'usage_final_' || substring(r.idempotency_key from '^usage_reserve_(.*)$'))
      AND NOT EXISTS (SELECT 1 FROM transactions x WHERE x.idempotency_key = 'usage_release_' || substring(r.idempotency_key from '^usage_reserve_(.*)$'))
      AND NOT EXISTS (SELECT 1 FROM usage_records u WHERE u.request_id = substring(r.idempotency_key from '^usage_reserve_(.*)$'))
  `;
  return classifyOrphan(num(rows[0]?.orphan), num(rows[0]?.kilitli_tl));
}

// ── C4: Para girişi — ödemesiz credit + bonus drift (R3) ──────────────────────
async function checkParaGirisi(): Promise<CheckResult[]> {
  const odemesiz = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM transactions t
    WHERE t.tip='yukleme'
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.transaction_id = t.id OR ('pay_' || p.idempotency_key) = t.idempotency_key)
  `;
  const bonus = await dbSql<{ fark: string }[]>`
    SELECT (
      (SELECT COALESCE(SUM(miktar_tl),0) FROM transactions WHERE tip='bonus')
      - (SELECT COALESCE(SUM(amount_tl),0) FROM signup_bonus_grants)
    )::text AS fark
  `;
  return [
    classifyRowCount("odemesiz_credit", num(odemesiz[0]?.c), "yukleme tx var ama payment yok = 0"),
    classifyBonusDrift(num(bonus[0]?.fark)),
  ];
}

// ── C5: Para çıkışı — usage↔ledger + karşılıksız iade (R4) ────────────────────
async function checkParaCikisi(): Promise<CheckResult[]> {
  const yarimSettle = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM usage_records u
    WHERE u.status='success' AND u.cost_tl::numeric > 0
      AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.idempotency_key IN ('usage_final_' || u.request_id, 'usage_' || u.request_id))
  `;
  const karsiliksizIade = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM transactions t
    WHERE t.idempotency_key LIKE 'usage_release_%'
      AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.idempotency_key = 'usage_reserve_' || substring(t.idempotency_key from '^usage_release_(.*)$'))
  `;
  return [
    classifyRowCount("usage_ledger_eslesme", num(yarimSettle[0]?.c), "success+cost>0 ama final tx yok = 0"),
    classifyRowCount("iade_butunluk", num(karsiliksizIade[0]?.c), "her usage_release_ için usage_reserve_ var"),
  ];
}

// ── C6: stream_missing maruziyeti (R5) ────────────────────────────────────────
async function checkStreamMissing(): Promise<CheckResult> {
  const rows = await dbSql<{ smu: string; toplam: string }[]>`
    SELECT count(*) FILTER (WHERE status='stream_missing_usage')::text AS smu, count(*)::text AS toplam
    FROM usage_records WHERE timestamp >= now() - interval '24 hours'
  `;
  return classifyStreamMissing(num(rows[0]?.smu), num(rows[0]?.toplam));
}

// ── C7: Recompute (R6) ────────────────────────────────────────────────────────
async function checkRecompute(): Promise<CheckResult> {
  const rows = await dbSql<{ cost_tl: string; input_usage: string; output_usage: string; input_tl: string; output_tl: string }[]>`
    SELECT cost_tl::text, input_usage::text, output_usage::text,
      (pricing_snapshot_json->'computed'->'input'->>'tl') AS input_tl,
      (pricing_snapshot_json->'computed'->'output'->>'tl') AS output_tl
    FROM usage_records
    WHERE status='success' AND type='text'
      AND pricing_snapshot_json->'computed'->'input'->>'tl' IS NOT NULL
      AND timestamp >= now() - interval '7 days'
    ORDER BY timestamp DESC LIMIT 500
  `;
  let deviating = 0;
  let skipped = 0;
  for (const r of rows) {
    const inputTl = r.input_tl === null ? null : num(r.input_tl);
    const outputTl = r.output_tl === null ? null : num(r.output_tl);
    if (inputTl === null || outputTl === null) { skipped += 1; continue; }
    const beklenen = recomputeCostTL(num(r.input_usage), num(r.output_usage), inputTl, outputTl);
    if (recomputeDeviates(beklenen, num(r.cost_tl))) deviating += 1;
  }
  return classifyRecompute(deviating, skipped);
}

// ── C8: Marj (R7) — model bazında satış − API gideri ──────────────────────────
async function checkMarj(): Promise<CheckResult> {
  const rows = await dbSql<{ model_id: string; tin: string; tout: string; satis_usd: string }[]>`
    SELECT model_id, COALESCE(SUM(input_usage),0)::text AS tin, COALESCE(SUM(output_usage),0)::text AS tout,
      COALESCE(SUM(cost_usd::numeric),0)::text AS satis_usd
    FROM usage_records WHERE status='success' AND timestamp >= now() - interval '30 days'
    GROUP BY model_id
  `;
  const modelMarjlari = rows.map((r) => ({
    modelId: r.model_id,
    marjUsd: computeMarjUsd(r.model_id, num(r.satis_usd), num(r.tin), num(r.tout)),
  }));
  return classifyMarj(modelMarjlari);
}

// ── C9: Idempotency / çift-credit (R10) ───────────────────────────────────────
async function checkIdempotency(): Promise<CheckResult[]> {
  const dup = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM (
      SELECT idempotency_key FROM transactions WHERE idempotency_key IS NOT NULL
      GROUP BY idempotency_key HAVING count(*) > 1
    ) d
  `;
  const payDup = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM (
      SELECT idempotency_key FROM transactions WHERE idempotency_key LIKE 'pay_%'
      GROUP BY idempotency_key HAVING count(*) > 1
    ) d
  `;
  return [
    classifyRowCount("idempotency_cakisma", num(dup[0]?.c), "tekrarlı idempotency_key = 0"),
    classifyRowCount("cift_credit", num(payDup[0]?.c), "tekrarlı pay_ anahtarı = 0"),
  ];
}

// ── C10: KDV aritmetiği (R11, bilgi amaçlı) ───────────────────────────────────
async function checkKdv(): Promise<CheckResult> {
  const rows = await dbSql<{ kdv_tl: string; net_tl: string; miktar_tl: string }[]>`
    SELECT kdv_tl::text, net_tl::text, miktar_tl::text FROM payments
    WHERE durum='basarili'
    ORDER BY olusturma DESC LIMIT 1000
  `;
  let uyumsuz = 0;
  for (const r of rows) {
    if (kdvUyumsuz(num(r.kdv_tl), num(r.net_tl), num(r.miktar_tl))) uyumsuz += 1;
  }
  return classifyKdv(uyumsuz);
}

// ── C11: Kur/pricing sağlığı (R12) ────────────────────────────────────────────
async function checkKur(): Promise<CheckResult> {
  const cfg = await dbSql<{ live_kur: string; kur_buffer: string; auto: boolean; interval_dk: string; age_min: string | null }[]>`
    SELECT live_kur::text, kur_buffer::text, auto_kur_refresh AS auto, kur_refresh_interval_dk::text AS interval_dk,
      CASE WHEN last_kur_refresh IS NULL THEN NULL
           ELSE (EXTRACT(EPOCH FROM (now() - last_kur_refresh)) / 60)::text END AS age_min
    FROM system_config WHERE id=1
  `;
  const hist = await dbSql<{ sell_kur: string }[]>`
    SELECT sell_kur::text FROM kur_history ORDER BY timestamp DESC LIMIT 1
  `;
  const c = cfg[0];
  const beklenenSellKur = c ? num(c.live_kur) * (1 + num(c.kur_buffer)) : 0;
  return classifyKur({
    beklenenSellKur,
    sonHistorySellKur: hist[0] ? num(hist[0].sell_kur) : null,
    refreshAgeMin: c?.age_min != null ? num(c.age_min) : null,
    intervalMin: c ? num(c.interval_dk) : 60,
    autoRefresh: c?.auto === true,
  });
}

// ── Önceki tarama (histerezis + baseline diff) ────────────────────────────────
async function getSonTarama(): Promise<{ verdict: Verdict; checksJson: CheckResult[]; lastUsageTs: string | null; lastTxTs: string | null } | null> {
  const rows = await dbSql<{ verdict: string; checks_json: CheckResult[]; lu: string | null; lt: string | null }[]>`
    SELECT verdict, checks_json, last_processed_usage_ts::text AS lu, last_processed_tx_ts::text AS lt
    FROM mali_izleme_taramalari ORDER BY scan_at DESC LIMIT 1
  `;
  if (!rows.length) return null;
  return { verdict: rows[0].verdict as Verdict, checksJson: rows[0].checks_json, lastUsageTs: rows[0].lu, lastTxTs: rows[0].lt };
}

async function getMaxTimestamps(): Promise<{ usageTs: string | null; txTs: string | null }> {
  const u = await dbSql<{ m: string | null }[]>`SELECT max(timestamp)::text AS m FROM usage_records`;
  const t = await dbSql<{ m: string | null }[]>`SELECT max(timestamp)::text AS m FROM transactions`;
  return { usageTs: u[0]?.m ?? null, txTs: t[0]?.m ?? null };
}

// Aktivite kapısı (R1): son tarama sonrası yeni usage/tx satırı var mı?
export async function hasActivitySince(lastUsageTs: string | null, lastTxTs: string | null): Promise<boolean> {
  const epoch = "1970-01-01T00:00:00.000Z";
  const u = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM usage_records WHERE timestamp > ${lastUsageTs ?? epoch}::timestamptz`;
  const t = await dbSql<{ c: string }[]>`SELECT count(*)::text AS c FROM transactions WHERE timestamp > ${lastTxTs ?? epoch}::timestamptz`;
  return num(u[0]?.c) > 0 || num(t[0]?.c) > 0;
}

// Hangi kontroller histerezissiz anında alarm (K1, drift≥1TL — para-kritik).
function isImmediate(check: CheckResult): boolean {
  if (check.name === "k1") return true;
  if (check.name === "ledger_drift" && Math.abs(num(check.measured)) >= 1) return true;
  return false;
}

// Raw (histerezissiz) para kontrolleri — TEK kaynak. runScan ve Gözcü motoru ikisi de
// bunu çağırır → SQL tek yerde, kopya/drift olmaz. Histerezis/verdict/persist çağıranın işi.
export async function runMoneyChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  checks.push(await safeCheck("ledger_drift", checkDrift));
  checks.push(await safeCheck("k1", checkK1));
  checks.push(await safeCheck("orphan_rezervasyon", checkOrphan));
  checks.push(...(await safeCheckMany("para_girisi", checkParaGirisi)));
  checks.push(...(await safeCheckMany("para_cikisi", checkParaCikisi)));
  checks.push(await safeCheck("stream_missing", checkStreamMissing));
  checks.push(await safeCheck("recompute", checkRecompute));
  checks.push(await safeCheck("marj", checkMarj));
  checks.push(...(await safeCheckMany("idempotency", checkIdempotency)));
  checks.push(await safeCheck("kdv", checkKdv));
  checks.push(await safeCheck("kur_saglik", checkKur));
  return checks;
}

// ── Ana tarama ────────────────────────────────────────────────────────────────
export async function runScan(trigger: "cron" | "on_demand" = "cron"): Promise<ScanResult> {
  const start = Date.now();
  const son = await getSonTarama();

  const checks = await runMoneyChecks();

  // Histerezis: red kontrolleri önceki tarama severity'siyle değerlendir.
  const prevByName = new Map((son?.checksJson ?? []).map((c) => [c.name, c.severity]));
  for (const c of checks) {
    if (c.severity === "red") {
      const h = applyHysteresis({
        currentSeverity: "red",
        previousSeverity: prevByName.get(c.name) ?? null,
        windowExceedRatio: 0, // pencere-oranı bu sürümde kontrol-bazlı hesaplanmıyor; ardışıklık baz alınır
        immediate: isImmediate(c),
      });
      c.severity = h.effectiveSeverity;
    }
  }

  const verdict = deriveVerdict(checks);
  const findings = checks.filter((c) => c.severity !== "green");
  const { usageTs, txTs } = await getMaxTimestamps();

  const driftCheck = checks.find((c) => c.name === "ledger_drift");
  const streamCheck = checks.find((c) => c.name === "stream_missing");
  // stream_missing.measured formatı: "%<oran> (<smu>/<total>)" → baştaki yüzdeyi ayıkla.
  const streamPct = (c: CheckResult | undefined): number | undefined => {
    if (!c) return undefined;
    const m = String(c.measured).match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : undefined;
  };
  const curStreamPct = streamPct(streamCheck);
  const prevStreamPct = streamPct(son?.checksJson.find((c) => c.name === "stream_missing"));
  const baselineDiff = son
    ? {
        driftTL: driftCheck ? num(driftCheck.measured) - num(son.checksJson.find((c) => c.name === "ledger_drift")?.measured) : undefined,
        streamMissingPct:
          curStreamPct !== undefined && prevStreamPct !== undefined
            ? round4(curStreamPct - prevStreamPct)
            : undefined,
      }
    : undefined;

  const result: ScanResult = {
    scanAt: new Date().toISOString(),
    verdict,
    checks,
    findings,
    baselineDiff,
    lastProcessedUsageTs: usageTs,
    lastProcessedTxTs: txTs,
    trigger,
    durationMs: Date.now() - start,
  };
  return result;
}

async function safeCheckMany(name: string, fn: () => Promise<CheckResult[]>): Promise<CheckResult[]> {
  try {
    return await fn();
  } catch (e) {
    logger.error({ err: e, check: name }, "[mali-izleme] çoklu kontrol hatası");
    return [{ name, measured: "kontrol hatası", threshold: "—", severity: "yellow", evidence: "check_failed" }];
  }
}

// ── Persist (yalnız mali_izleme_taramalari'na INSERT — append-only) ───────────
export async function persistScan(result: ScanResult): Promise<void> {
  await dbSql`
    INSERT INTO mali_izleme_taramalari (
      verdict, checks_json, findings_json, last_processed_usage_ts, last_processed_tx_ts, scan_trigger, duration_ms
    ) VALUES (
      ${result.verdict},
      ${JSON.stringify(result.checks)}::jsonb,
      ${JSON.stringify(result.findings)}::jsonb,
      ${result.lastProcessedUsageTs}::timestamptz,
      ${result.lastProcessedTxTs}::timestamptz,
      ${result.trigger},
      ${result.durationMs}
    )
  `;
}

// Aktivite-kapılı tarama: yeni aktivite varsa tara + persist, yoksa null döner.
export async function runScanIfActivity(trigger: "cron" | "on_demand" = "cron"): Promise<ScanResult | null> {
  const son = await getSonTarama();
  if (son) {
    const active = await hasActivitySince(son.lastUsageTs, son.lastTxTs);
    if (!active) return null; // sessiz çık — aktivite yok
  }
  const result = await runScan(trigger);
  await persistScan(result);
  return result;
}

// Son tarama özetini API için döndür (panel).
export async function getLatestScan(): Promise<ScanResult | null> {
  const rows = await dbSql<{
    scan_at: string; verdict: string; checks_json: CheckResult[]; findings_json: CheckResult[];
    lu: string | null; lt: string | null; trigger: string; duration_ms: string;
  }[]>`
    SELECT scan_at::text, verdict, checks_json, findings_json,
      last_processed_usage_ts::text AS lu, last_processed_tx_ts::text AS lt, scan_trigger AS trigger, duration_ms::text
    FROM mali_izleme_taramalari ORDER BY scan_at DESC LIMIT 1
  `;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    scanAt: r.scan_at,
    verdict: r.verdict as Verdict,
    checks: r.checks_json,
    findings: r.findings_json,
    lastProcessedUsageTs: r.lu,
    lastProcessedTxTs: r.lt,
    trigger: r.trigger as "cron" | "on_demand",
    durationMs: num(r.duration_ms),
  };
}
