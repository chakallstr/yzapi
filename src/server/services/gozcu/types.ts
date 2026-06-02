// Gözcü (Sentinel) — ortak tipler.
//
// Mali İzleme'nin kanıtlanmış CheckResult/Severity/Verdict tiplerini SÜPERSET eder:
// her Gözcü check'i ayrıca domain + signalSource taşır, opsiyonel immediate (histerezis
// bypass) ve suggestedHeal (öneri-only oto-müdahale adayı) ekler.

import type { Severity, Verdict, CheckResult } from "../mali-izleme-checks.js";

export type { Severity, Verdict, CheckResult };

export type Domain = "money" | "uptime" | "provider" | "security" | "code";

// Oto-müdahale önerisi (öneri-only; heal'i deterministik orchestrator tetikler — Faz 6).
export interface HealSuggestion {
  id: string; // gozcu/heal/registry id'si
  reason: string;
  reversible: boolean;
}

// Tek bir check sonucu (mali CheckResult süperseti).
export interface GozcuCheckResult extends CheckResult {
  domain: Domain;
  signalSource: string; // tam tablo.kolon / metrik adı
  immediate?: boolean; // true → histerezisi bypass et (para-kritik / DB down)
  suggestedHeal?: HealSuggestion;
}

// Kayıtlı bir check (registry üyesi).
export interface Check {
  name: string;
  domain: Domain;
  signalSource: string;
  immediate?: boolean;
  // Birden çok sonuç dönebilir (örn. money checkleri 14 alt-sonuç üretir).
  run: () => Promise<GozcuCheckResult | GozcuCheckResult[]>;
}

// Tek bir tam tarama sonucu.
export interface GozcuScanResult {
  scanAt: string;
  verdict: Verdict;
  domainVerdicts: Record<Domain, Verdict>;
  checks: GozcuCheckResult[];
  findings: GozcuCheckResult[]; // severity !== green
  metrics: Record<string, unknown>; // collector window + heartbeat anlık görüntüsü
  redCount: number;
  yellowCount: number;
  lastUsageTs: string | null;
  lastTxTs: string | null;
  trigger: "cron" | "on_demand";
  durationMs: number;
}

// Katman-2 (LLM teşhis) için sink imzası — engine kırmızı bulguyu buraya devreder.
// Varsayılan no-op; Faz 4 gerçek LLM sink'ini kaydeder.
export type DiagnosisSink = (finding: GozcuCheckResult, scanAt: string) => Promise<void>;
