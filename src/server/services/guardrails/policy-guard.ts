import type { GuardDetection, GuardInput, GuardModule, GuardModuleResult } from "./types.js";

// Policy deny-list guard (faz4). Operatörün system_api_config.guard_policy_denylist (JSONB) ile
// tanımladığı yasaklı-konu/kelime listesi. Dış bağımlılık yok. keyword = case-insensitive substring;
// regex = tam regex (kötü regex → o entry atlanır, fail-open). 32KB tarama sınırı.
// ⚠️ denylist OPERATÖR-kontrollü (admin), kullanıcı girdisi değil — yine de bozuk regex/aşırı-kapsam
// için try/catch + input slice. Audit'e yasaklı DEĞER sızmaz (kind = policy_keyword/policy_regex).

type Sev = "low" | "medium" | "high";
const SCAN_LIMIT = 32 * 1024;
const MAX_ENTRIES = 500; // operatör listesi makul sınır (runaway koruması)

export interface DenylistEntry {
  kind: "keyword" | "regex";
  value: string;
  severity?: Sev;
}

function normSev(s: unknown): Sev {
  return s === "low" || s === "high" ? s : "medium";
}

// ReDoS foot-gun koruması: operatör (admin) yanlışlıkla katastrofik regex girerse ÇALIŞTIRMADAN atla.
// JS regex senkron + timeout edilemez; 32KB slice exponential backtracking'i sınırlamaz (~30 karakter yeter).
// Heuristik: iç-quantifier'lı grubun dışında da quantifier ((a+)+, (a*)*, (.*a){20}) + aşırı uzun pattern.
// Mükemmel değil (alternation-overlap (a|a)+ yakalanmaz) ama klasik nested-quantifier vakalarını engeller.
const NESTED_QUANTIFIER = /\([^)]*[*+}][^)]*\)\s*[*+{]/;
export function isLikelyCatastrophicRegex(src: string): boolean {
  if (typeof src !== "string" || src.length > 200) return true;
  return NESTED_QUANTIFIER.test(src);
}

export function detectPolicy(text: string, denylist: unknown): GuardDetection[] {
  if (!Array.isArray(denylist) || denylist.length === 0) return [];
  const slice = (text || "").slice(0, SCAN_LIMIT);
  if (!slice) return [];
  const lower = slice.toLowerCase();
  const out: GuardDetection[] = [];
  const entries = denylist.slice(0, MAX_ENTRIES);
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Partial<DenylistEntry>;
    if (typeof e.value !== "string" || e.value.length === 0) continue;
    const sev = normSev(e.severity);
    try {
      if (e.kind === "regex") {
        if (isLikelyCatastrophicRegex(e.value)) continue; // ReDoS-şüpheli → çalıştırma (fail-open, atla)
        if (new RegExp(e.value, "i").test(slice)) out.push({ kind: "policy_regex", severity: sev });
      } else {
        // keyword (default): case-insensitive substring
        if (lower.includes(e.value.toLowerCase())) out.push({ kind: "policy_keyword", severity: sev });
      }
    } catch {
      // bozuk regex → bu entry'yi atla (fail-open), diğerleri çalışmaya devam
    }
  }
  return out;
}

export const policyGuard: GuardModule = {
  name: "policy",
  priority: 40,
  configModeKey: "guardPolicyMode",
  async run(input: GuardInput): Promise<GuardModuleResult> {
    const detections = detectPolicy(input.text, (input.config as Record<string, unknown>).guardPolicyDenylist);
    if (detections.length === 0) return { guard: "policy", blocked: false, detections: [] };
    return {
      guard: "policy",
      blocked: true, // aggregator yalnız mode==='block' iken bloklar
      detections,
      message: "İstek içerik politikasını ihlal ediyor.",
    };
  },
};
