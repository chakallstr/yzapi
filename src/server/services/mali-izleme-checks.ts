// Canlı Mali İzleme — saf kontrol fonksiyonları (matematik çekirdeği).
//
// TASARIM: Bu dosyadaki HER fonksiyon SAF'tır — DB/IO/global state/Date.now YOK.
// Aynı girdi → her zaman aynı çıktı (determinizm, R18.1/R18.2). Denetim_Motoru
// (mali-izleme-service.ts) bu fonksiyonları DB'den okuduğu ham değerlerle besler.
//
// DOKUNULMAZ: billing-service.ts / pricing.ts İMPORT EDİLMEZ, çağrılmaz. round4/round8
// billing-service ile AYNI formüldür (kopya, bağımlılık değil). Maliyet tabanı sabiti
// bu dosyada PRIVATE; public'e sızmaz (R16).

export type Severity = "green" | "yellow" | "red";
export type Verdict = "SORUN_YOK" | "DIKKAT" | "SORUN_VAR";

export interface CheckResult {
  name: string;
  measured: number | string;
  threshold: string;
  severity: Severity;
  evidence?: unknown;
}

// ── Yuvarlama (billing-service.ts ile birebir AYNI) ───────────────────────────
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
export function round8(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}

// ── Eşik sabitleri (saglik-taramasi.md karar tablosu) ─────────────────────────
export const DRIFT_GREEN_MAX = 0.0001; // |drift| < bu → green
export const DRIFT_RED_MIN = 1; // |drift| >= bu → red
export const ORPHAN_COUNT_RED = 5; // count > bu → red
export const ORPHAN_LOCKED_RED_TL = 50; // kilitli TL > bu → red
export const STREAM_MISSING_YELLOW = 0.01; // oran >= bu → yellow
export const STREAM_MISSING_RED = 0.05; // oran > bu → red
export const RECOMPUTE_TOLERANCE = 0.0005; // |beklenen-kayitli| >= bu → sapma
export const KDV_TOLERANCE = 0.005; // |fark| >= bu → yellow (çift round4 payı)
export const KUR_SAPMA_RED = 0.02; // kur sapma > %2 → red
export const HYSTERESIS_WINDOW_RATIO = 0.05; // pencerenin >= %5'i → alarm etkin

// ── Maliyet tabanı (WellFlow Direct, doğrulanmış 2026-05-31; USD/1M, FLAT in=out) ─
// PRIVATE — yalnız marj hesabı için. Public'e ASLA export edilmez (R16 sızıntı yasağı).
const MALIYET_TABANI_USD_PER_1M: Record<string, number> = {
  "claude-opus-4-7": 0.30,
  "claude-opus-4-8": 0.30,
  "claude-opus-4-6": 0.20,
  "claude-sonnet-4-6": 0.20,
  "claude-haiku-4-5-20251001": 0.20,
  "claude-haiku-4-5": 0.20,
};
const MALIYET_TABANI_DEFAULT = 0.30; // bilinmeyen model: en yüksek alış (kötümser marj)

// Model kimliğinin alış fiyatını döndürür. Nokta/tire varyantını normalize eder
// (örn "claude-opus-4.8" → "claude-opus-4-8"). Bilinmeyen → kötümser default.
export function maliyetTabaniUsdPer1M(modelId: string): number {
  if (modelId in MALIYET_TABANI_USD_PER_1M) return MALIYET_TABANI_USD_PER_1M[modelId];
  const normalized = modelId.replace(/\./g, "-");
  if (normalized in MALIYET_TABANI_USD_PER_1M) return MALIYET_TABANI_USD_PER_1M[normalized];
  return MALIYET_TABANI_DEFAULT;
}

// ── C1: Ledger drift (R8) ─────────────────────────────────────────────────────
export function classifyDrift(driftTL: number): CheckResult {
  const abs = Math.abs(driftTL);
  let severity: Severity;
  if (abs < DRIFT_GREEN_MAX) severity = "green";
  else if (abs >= DRIFT_RED_MIN) severity = "red";
  else severity = "yellow";
  return {
    name: "ledger_drift",
    measured: round4(driftTL),
    threshold: `|drift| < ${DRIFT_GREEN_MAX} → 🟢 · ${DRIFT_GREEN_MAX}–${DRIFT_RED_MIN} → 🟡 · ≥${DRIFT_RED_MIN} → 🔴`,
    severity,
  };
}

// ── C2: K1 hata-tahsil garantisi (R9) — histerezissiz anında alarm ────────────
export function classifyK1(violationCount: number): CheckResult {
  return {
    name: "k1",
    measured: violationCount,
    threshold: "status='error' AND cost_tl>0 sayısı = 0",
    severity: violationCount > 0 ? "red" : "green",
  };
}

// ── C3: Orphan rezervasyon (R4) ───────────────────────────────────────────────
export function classifyOrphan(count: number, lockedTL: number): CheckResult {
  let severity: Severity;
  if (count === 0 && lockedTL === 0) severity = "green";
  else if (count > ORPHAN_COUNT_RED || lockedTL > ORPHAN_LOCKED_RED_TL) severity = "red";
  else severity = "yellow";
  return {
    name: "orphan_rezervasyon",
    measured: `${count} adet / ${round4(lockedTL)} TL kilitli`,
    threshold: `0 → 🟢 · ≤${ORPHAN_COUNT_RED} & <${ORPHAN_LOCKED_RED_TL}TL → 🟡 · >${ORPHAN_COUNT_RED} veya >${ORPHAN_LOCKED_RED_TL}TL → 🔴`,
    severity,
  };
}

// ── C6: stream_missing maruziyeti (R5) ────────────────────────────────────────
export function classifyStreamMissing(smu: number, total: number): CheckResult {
  const oran = total > 0 ? smu / total : 0;
  let severity: Severity;
  if (oran > STREAM_MISSING_RED) severity = "red";
  else if (oran >= STREAM_MISSING_YELLOW) severity = "yellow";
  else severity = "green";
  return {
    name: "stream_missing",
    measured: `%${round4(oran * 100)} (${smu}/${total})`,
    threshold: `<%1 → 🟢 · %1–5 → 🟡 · >%5 → 🔴`,
    severity,
  };
}

// ── C7: Recompute (R6, deterministik fiyat denetimi) ──────────────────────────
// inputTl/outputTl = pricing_snapshot'taki PER 1M token TL fiyatı.
export function recomputeCostTL(inputUsage: number, outputUsage: number, inputTl: number, outputTl: number): number {
  return round4((inputUsage / 1e6) * inputTl + (outputUsage / 1e6) * outputTl);
}
export function recomputeDeviation(beklenen: number, kayitli: number): number {
  // Float artefaktını öldürmek için farkı round4 ile sabitle (mali kesinlik).
  return round4(Math.abs(round4(beklenen) - round4(kayitli)));
}
export function recomputeDeviates(beklenen: number, kayitli: number): boolean {
  return recomputeDeviation(beklenen, kayitli) >= RECOMPUTE_TOLERANCE;
}
export function classifyRecompute(deviatingRowCount: number, skippedRowCount = 0): CheckResult {
  return {
    name: "recompute",
    measured: `${deviatingRowCount} sapma (${skippedRowCount} atlandı: snapshot yok)`,
    threshold: `|beklenen-cost_tl| ≥ ${RECOMPUTE_TOLERANCE} olan satır = 0`,
    severity: deviatingRowCount > 0 ? "red" : "green",
  };
}

// ── C8: Marj (R7, satış − upstream API gideri) — ADMIN-ONLY çıktı ─────────────
export function computeMarjUsd(modelId: string, satisUsd: number, inputTok: number, outputTok: number): number {
  const apiGiderUsd = ((inputTok + outputTok) / 1e6) * maliyetTabaniUsdPer1M(modelId);
  return round8(satisUsd - apiGiderUsd);
}
// Birden çok modelin marjından en kötüsünü (negatif varsa) sınıflandırır.
export function classifyMarj(modelMarjlari: Array<{ modelId: string; marjUsd: number }>): CheckResult {
  const zararli = modelMarjlari.filter((m) => m.marjUsd < 0);
  return {
    name: "marj",
    measured: zararli.length > 0
      ? `≈ TAHMİNİ — ${zararli.length} model zararda: ${zararli.map((m) => m.modelId).join(", ")}`
      : `≈ TAHMİNİ — tüm modeller kârlı`,
    threshold: "her model için marj_usd ≥ 0 (satış ≥ API gideri)",
    severity: zararli.length > 0 ? "red" : "green",
    evidence: zararli.length > 0 ? zararli : undefined,
  };
}

// ── C10: KDV aritmetiği (R11, bilgi amaçlı) ───────────────────────────────────
export function classifyKdv(uyumsuzRowCount: number): CheckResult {
  return {
    name: "kdv",
    measured: `${uyumsuzRowCount} uyumsuz kayıt`,
    threshold: `|kdv_tl + net_tl − miktar_tl| ≥ ${KDV_TOLERANCE} (basarili) = 0`,
    severity: uyumsuzRowCount > 0 ? "yellow" : "green",
  };
}
export function kdvUyumsuz(kdvTl: number, netTl: number, miktarTl: number): boolean {
  // Farkı round4 ile sabitle: float artefaktı (örn. 0.00499999...) tolerans sınırında
  // yanlış-negatif üretmesin. KDV kayıtları zaten 4 ondalıkta tutulur.
  return Math.abs(round4(kdvTl + netTl - miktarTl)) >= KDV_TOLERANCE;
}

// ── C11: Kur/pricing sağlığı (R12) ────────────────────────────────────────────
export function classifyKur(opts: {
  beklenenSellKur: number;
  sonHistorySellKur: number | null;
  refreshAgeMin: number | null;
  intervalMin: number;
  autoRefresh: boolean;
}): CheckResult {
  const { beklenenSellKur, sonHistorySellKur, refreshAgeMin, intervalMin, autoRefresh } = opts;
  let severity: Severity = "green";
  let note = "taze & tutarlı";

  if (sonHistorySellKur !== null && beklenenSellKur > 0) {
    const sapma = Math.abs(beklenenSellKur - sonHistorySellKur) / beklenenSellKur;
    if (sapma > KUR_SAPMA_RED) {
      severity = "red";
      note = `kur sapması %${round4(sapma * 100)} > %2`;
    }
  }
  if (severity === "green" && autoRefresh && refreshAgeMin !== null && refreshAgeMin > intervalMin * 2) {
    severity = "yellow";
    note = `kur bayat (${refreshAgeMin}dk > ${intervalMin * 2}dk)`;
  }
  return {
    name: "kur_saglik",
    measured: note,
    threshold: "sapma ≤%2 & taze → 🟢 · 2 periyot bayat → 🟡 · sapma >%2 → 🔴",
    severity,
  };
}

// ── C4/C5/C9: satır-sayısı bazlı kontroller (kırık satır varsa red) ───────────
export function classifyRowCount(name: string, count: number, threshold: string, sev: Severity = "red"): CheckResult {
  return {
    name,
    measured: `${count} sorunlu kayıt`,
    threshold,
    severity: count > 0 ? sev : "green",
  };
}
export function classifyBonusDrift(farkTL: number): CheckResult {
  return {
    name: "bonus_butunluk",
    measured: round4(farkTL),
    threshold: `|tip='bonus' − signup_bonus_grants| < ${DRIFT_GREEN_MAX}`,
    severity: Math.abs(farkTL) >= DRIFT_GREEN_MAX ? "yellow" : "green",
  };
}

// ── Verdict birleştirme (R13) ─────────────────────────────────────────────────
export function deriveVerdict(checks: CheckResult[]): Verdict {
  const reds = checks.filter((c) => c.severity === "red").length;
  const yellows = checks.filter((c) => c.severity === "yellow").length;
  if (reds >= 1) return "SORUN_VAR";
  if (yellows >= 1) return "DIKKAT";
  return "SORUN_YOK";
}

// ── Histerezis (R13.5) ────────────────────────────────────────────────────────
// red bir kontrol için alarm yalnız (a) önceki tarama da red VEYA (b) pencerenin
// ≥%5'i eşik aşımı ise ETKİN sayılır. immediate=true (K1, drift≥1TL) → anında alarm.
export interface HysteresisResult {
  effectiveSeverity: Severity;
  alarmActive: boolean;
}
export function applyHysteresis(opts: {
  currentSeverity: Severity;
  previousSeverity: Severity | null;
  windowExceedRatio: number;
  immediate: boolean;
}): HysteresisResult {
  const { currentSeverity, previousSeverity, windowExceedRatio, immediate } = opts;
  if (currentSeverity !== "red") {
    return { effectiveSeverity: currentSeverity, alarmActive: false };
  }
  if (immediate) {
    return { effectiveSeverity: "red", alarmActive: true };
  }
  const alarmActive = previousSeverity === "red" || windowExceedRatio >= HYSTERESIS_WINDOW_RATIO;
  return { effectiveSeverity: alarmActive ? "red" : "yellow", alarmActive };
}
