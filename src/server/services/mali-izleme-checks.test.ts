import { describe, expect, it } from "vitest";
import {
  round4,
  classifyDrift,
  classifyK1,
  classifyOrphan,
  classifyStreamMissing,
  recomputeCostTL,
  recomputeDeviation,
  recomputeDeviates,
  classifyRecompute,
  computeMarjUsd,
  classifyMarj,
  maliyetTabaniUsdPer1M,
  classifyKdv,
  kdvUyumsuz,
  classifyKur,
  classifyRowCount,
  classifyBonusDrift,
  deriveVerdict,
  applyHysteresis,
  type CheckResult,
} from "./mali-izleme-checks.js";

// Canlı Mali İzleme matematik çekirdeği — %100 deterministik doğruluk kilidi.
// Her eşik sınırı 2 noktayla (altı/üstü), golden recompute değeri elle-hesapla,
// verdict + histerezis tüm karar tablosuyla, determinizm property ile doğrulanır.

describe("classifyDrift — ledger drift eşikleri (R8)", () => {
  it("|drift| < 0.0001 → green", () => {
    expect(classifyDrift(0.00009).severity).toBe("green");
    expect(classifyDrift(0).severity).toBe("green");
    expect(classifyDrift(-0.00005).severity).toBe("green");
  });
  it("0.0001 ≤ |drift| < 1 → yellow", () => {
    expect(classifyDrift(0.0001).severity).toBe("yellow"); // tam sınır → yellow
    expect(classifyDrift(0.5).severity).toBe("yellow");
    expect(classifyDrift(-0.99).severity).toBe("yellow");
  });
  it("|drift| ≥ 1 → red", () => {
    expect(classifyDrift(1).severity).toBe("red"); // tam sınır → red
    expect(classifyDrift(-5.5).severity).toBe("red");
  });
  it("measured round4 uygular", () => {
    expect(classifyDrift(0.123456).measured).toBe(0.1235);
  });
});

describe("classifyK1 — hata-tahsil garantisi (R9)", () => {
  it("0 ihlal → green", () => expect(classifyK1(0).severity).toBe("green"));
  it("1+ ihlal → red (histerezissiz)", () => {
    expect(classifyK1(1).severity).toBe("red");
    expect(classifyK1(50).severity).toBe("red");
  });
});

describe("classifyOrphan — orphan rezervasyon (R4)", () => {
  it("0 adet & 0 TL → green", () => expect(classifyOrphan(0, 0).severity).toBe("green"));
  it("1–5 adet & <50TL → yellow", () => {
    expect(classifyOrphan(1, 10).severity).toBe("yellow");
    expect(classifyOrphan(5, 49.99).severity).toBe("yellow"); // 5 ≤ eşik
  });
  it(">5 adet → red", () => expect(classifyOrphan(6, 10).severity).toBe("red"));
  it(">50 TL kilitli → red", () => expect(classifyOrphan(2, 50.01).severity).toBe("red"));
});

describe("classifyStreamMissing — stream_missing oranı (R5)", () => {
  it("<%1 → green", () => {
    expect(classifyStreamMissing(0, 1000).severity).toBe("green");
    expect(classifyStreamMissing(9, 1000).severity).toBe("green"); // %0.9
  });
  it("%1–%5 → yellow", () => {
    expect(classifyStreamMissing(10, 1000).severity).toBe("yellow"); // tam %1 → yellow
    expect(classifyStreamMissing(50, 1000).severity).toBe("yellow"); // tam %5 → yellow
  });
  it(">%5 → red", () => expect(classifyStreamMissing(51, 1000).severity).toBe("red")); // %5.1
  it("total=0 → green (bölme güvenliği)", () => expect(classifyStreamMissing(0, 0).severity).toBe("green"));
});

describe("recomputeCostTL — GOLDEN değer (elle hesap = kod)", () => {
  it("input=1000,output=200,tl=60.5125 → 0.0726 (money-flow pin kur=47 buffer=0.03)", () => {
    // sellKur = 47 × 1.03 = 48.41; opus satış $1.25 → input_tl = 1.25 × 48.41 = 60.5125
    // beklenen = (1000/1e6)×60.5125 + (200/1e6)×60.5125 = 0.0605125 + 0.0121025 = 0.072615 → round4 = 0.0726
    expect(recomputeCostTL(1000, 200, 60.5125, 60.5125)).toBe(0.0726);
  });
  it("yalnız input (output=0)", () => {
    // (1000/1e6)×60.5125 = 0.0605125 → 0.0605
    expect(recomputeCostTL(1000, 0, 60.5125, 60.5125)).toBe(0.0605);
  });
  it("sıfır token → 0", () => {
    expect(recomputeCostTL(0, 0, 60.5125, 60.5125)).toBe(0);
  });
});

describe("recomputeDeviates — sapma eşiği 0.0005 (R6)", () => {
  it("fark < 0.0005 → sapma yok", () => {
    expect(recomputeDeviates(0.0726, 0.0726)).toBe(false);
    expect(recomputeDeviates(0.0726, 0.07269)).toBe(false); // fark ~0.00009
  });
  it("fark ≥ 0.0005 → sapma var", () => {
    expect(recomputeDeviates(0.0726, 0.0731)).toBe(true); // fark 0.0005 tam
    expect(recomputeDeviates(0.0726, 0.0826)).toBe(true); // fark 0.01
  });
  it("recomputeDeviation mutlak fark döner", () => {
    expect(recomputeDeviation(0.0726, 0.0826)).toBe(0.01);
  });
});

describe("classifyRecompute — sapan satır sayısı", () => {
  it("0 sapma → green", () => expect(classifyRecompute(0, 5).severity).toBe("green"));
  it("1+ sapma → red", () => expect(classifyRecompute(1, 0).severity).toBe("red"));
});

describe("maliyetTabaniUsdPer1M — alış fiyatı (WellFlow Direct)", () => {
  it("opus-4-7 / opus-4-8 = 0.30", () => {
    expect(maliyetTabaniUsdPer1M("claude-opus-4-7")).toBe(0.30);
    expect(maliyetTabaniUsdPer1M("claude-opus-4-8")).toBe(0.30);
  });
  it("opus-4-6 / sonnet-4-6 / haiku-4-5 = 0.20", () => {
    expect(maliyetTabaniUsdPer1M("claude-opus-4-6")).toBe(0.20);
    expect(maliyetTabaniUsdPer1M("claude-sonnet-4-6")).toBe(0.20);
    expect(maliyetTabaniUsdPer1M("claude-haiku-4-5-20251001")).toBe(0.20);
  });
  it("nokta varyantını normalize eder (claude-opus-4.8 → 0.30)", () => {
    expect(maliyetTabaniUsdPer1M("claude-opus-4.8")).toBe(0.30);
  });
  it("bilinmeyen model → kötümser default 0.30", () => {
    expect(maliyetTabaniUsdPer1M("gpt-bilinmeyen")).toBe(0.30);
  });
});

describe("computeMarjUsd — satış − API gideri", () => {
  it("opus-4-7 kârlı: satış 0.10774, in=86094 out=100 → marj > 0", () => {
    // API gider = (86194/1e6)×0.30 = 0.0258582 ; marj = 0.107743 − 0.0258582 = 0.0818848 → round8
    const marj = computeMarjUsd("claude-opus-4-7", 0.107743, 86094, 100);
    expect(marj).toBeCloseTo(0.08188480, 8);
    expect(marj).toBeGreaterThan(0);
  });
  it("zararlı senaryo: satış API giderinden düşük → marj < 0", () => {
    // satış 0.01, token büyük → API gider çok > satış
    const marj = computeMarjUsd("claude-opus-4-7", 0.01, 86094, 100);
    expect(marj).toBeLessThan(0);
  });
});

describe("classifyMarj — model bazında zarar tespiti (R7)", () => {
  it("tüm modeller kârlı → green", () => {
    const r = classifyMarj([{ modelId: "claude-opus-4-7", marjUsd: 0.08 }, { modelId: "claude-haiku-4-5", marjUsd: 0.01 }]);
    expect(r.severity).toBe("green");
  });
  it("bir model zararda → red + model adı + evidence", () => {
    const r = classifyMarj([{ modelId: "claude-opus-4-7", marjUsd: 0.08 }, { modelId: "claude-haiku-4-5", marjUsd: -0.02 }]);
    expect(r.severity).toBe("red");
    expect(String(r.measured)).toContain("claude-haiku-4-5");
    expect(r.evidence).toEqual([{ modelId: "claude-haiku-4-5", marjUsd: -0.02 }]);
  });
  it("measured '≈ TAHMİNİ' etiketli (kesin sunulmaz)", () => {
    expect(String(classifyMarj([]).measured)).toContain("≈ TAHMİNİ");
  });
});

describe("classifyKdv / kdvUyumsuz — KDV aritmetiği tolerans 0.005 (R11)", () => {
  it("fark < 0.005 → uyumlu", () => {
    expect(kdvUyumsuz(20, 80, 100)).toBe(false); // tam
    expect(kdvUyumsuz(20, 80, 100.004)).toBe(false); // fark 0.004
  });
  it("fark ≥ 0.005 → uyumsuz", () => {
    expect(kdvUyumsuz(20, 80, 100.005)).toBe(true);
    expect(kdvUyumsuz(20, 80, 100.5)).toBe(true);
  });
  it("classifyKdv: 0 uyumsuz → green, 1+ → yellow", () => {
    expect(classifyKdv(0).severity).toBe("green");
    expect(classifyKdv(3).severity).toBe("yellow");
  });
});

describe("classifyKur — kur sağlığı (R12)", () => {
  it("sapma ≤%2 & taze → green", () => {
    const r = classifyKur({ beklenenSellKur: 48.41, sonHistorySellKur: 48.41, refreshAgeMin: 30, intervalMin: 60, autoRefresh: true });
    expect(r.severity).toBe("green");
  });
  it("sapma >%2 → red", () => {
    const r = classifyKur({ beklenenSellKur: 48.41, sonHistorySellKur: 50.0, refreshAgeMin: 10, intervalMin: 60, autoRefresh: true });
    expect(r.severity).toBe("red"); // |48.41-50|/48.41 = %3.28
  });
  it("auto açık & 2 periyot bayat → yellow", () => {
    const r = classifyKur({ beklenenSellKur: 48.41, sonHistorySellKur: 48.41, refreshAgeMin: 130, intervalMin: 60, autoRefresh: true });
    expect(r.severity).toBe("yellow"); // 130 > 120
  });
  it("history yok → green (kıyas yapılamaz, taze sayılır)", () => {
    const r = classifyKur({ beklenenSellKur: 48.41, sonHistorySellKur: null, refreshAgeMin: 10, intervalMin: 60, autoRefresh: false });
    expect(r.severity).toBe("green");
  });
});

describe("classifyRowCount / classifyBonusDrift — satır bazlı kontroller (R3/R4/R10)", () => {
  it("0 satır → green, 1+ → red (default)", () => {
    expect(classifyRowCount("test", 0, "x").severity).toBe("green");
    expect(classifyRowCount("test", 1, "x").severity).toBe("red");
  });
  it("bonus drift |fark| < 0.0001 → green, ≥ → yellow", () => {
    expect(classifyBonusDrift(0.00005).severity).toBe("green");
    expect(classifyBonusDrift(0.0001).severity).toBe("yellow");
  });
});

describe("deriveVerdict — verdict birleştirme tablosu (R13)", () => {
  const green: CheckResult = { name: "a", measured: 0, threshold: "", severity: "green" };
  const yellow: CheckResult = { name: "b", measured: 0, threshold: "", severity: "yellow" };
  const red: CheckResult = { name: "c", measured: 0, threshold: "", severity: "red" };
  it("hepsi green → SORUN_YOK", () => expect(deriveVerdict([green, green])).toBe("SORUN_YOK"));
  it("≥1 yellow (red yok) → DIKKAT", () => {
    expect(deriveVerdict([green, yellow])).toBe("DIKKAT");
    expect(deriveVerdict([yellow, yellow])).toBe("DIKKAT");
  });
  it("≥1 red → SORUN_VAR (yellow sayısı fark etmez)", () => {
    expect(deriveVerdict([green, red])).toBe("SORUN_VAR");
    expect(deriveVerdict([red, yellow, yellow])).toBe("SORUN_VAR");
  });
  it("boş → SORUN_YOK", () => expect(deriveVerdict([])).toBe("SORUN_YOK"));
});

describe("applyHysteresis — gürültü bastırma (R13.5)", () => {
  it("green → alarm yok, severity korunur", () => {
    const r = applyHysteresis({ currentSeverity: "green", previousSeverity: "red", windowExceedRatio: 1, immediate: false });
    expect(r.alarmActive).toBe(false);
    expect(r.effectiveSeverity).toBe("green");
  });
  it("immediate (K1/drift≥1) → anında alarm, histerezis atlanır", () => {
    const r = applyHysteresis({ currentSeverity: "red", previousSeverity: "green", windowExceedRatio: 0, immediate: true });
    expect(r.alarmActive).toBe(true);
    expect(r.effectiveSeverity).toBe("red");
  });
  it("tek red + önceki green + pencere <%5 → henüz alarm değil (yellow'a indir)", () => {
    const r = applyHysteresis({ currentSeverity: "red", previousSeverity: "green", windowExceedRatio: 0.01, immediate: false });
    expect(r.alarmActive).toBe(false);
    expect(r.effectiveSeverity).toBe("yellow");
  });
  it("2 ardışık red → alarm etkin", () => {
    const r = applyHysteresis({ currentSeverity: "red", previousSeverity: "red", windowExceedRatio: 0, immediate: false });
    expect(r.alarmActive).toBe(true);
    expect(r.effectiveSeverity).toBe("red");
  });
  it("pencere ≥%5 → alarm etkin (önceki green olsa bile)", () => {
    const r = applyHysteresis({ currentSeverity: "red", previousSeverity: "green", windowExceedRatio: 0.05, immediate: false });
    expect(r.alarmActive).toBe(true);
    expect(r.effectiveSeverity).toBe("red");
  });
});

describe("Property 1 — Determinizm (R18.1): aynı girdi → aynı çıktı", () => {
  it("classifyDrift 2 çağrı eşit", () => {
    expect(classifyDrift(0.5)).toEqual(classifyDrift(0.5));
  });
  it("recomputeCostTL 2 çağrı eşit", () => {
    expect(recomputeCostTL(1234, 567, 60.5125, 60.5125)).toBe(recomputeCostTL(1234, 567, 60.5125, 60.5125));
  });
  it("computeMarjUsd 2 çağrı eşit", () => {
    expect(computeMarjUsd("claude-opus-4-7", 0.1, 1000, 200)).toBe(computeMarjUsd("claude-opus-4-7", 0.1, 1000, 200));
  });
  it("deriveVerdict 2 çağrı eşit", () => {
    const checks: CheckResult[] = [{ name: "a", measured: 0, threshold: "", severity: "yellow" }];
    expect(deriveVerdict(checks)).toBe(deriveVerdict(checks));
  });
});

describe("Property 2 — round4 billing-service ile birebir", () => {
  it("Math.round(x*1e4)/1e4 formülü", () => {
    expect(round4(0.072615)).toBe(0.0726);
    expect(round4(0.07265)).toBe(0.0727); // yukarı yuvarlama
    expect(round4(0.123449)).toBe(0.1234);
  });
});
