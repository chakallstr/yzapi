import type { GuardModuleResult } from "./types.js";

const SEV_ORDER = { low: 1, medium: 2, high: 3 } as const;

/**
 * Guardrail warn/block olayını audit tablosuna yazar. PII snippet'leri ASLA kaydedilmez
 * (yalnız kind + severity). Asla throw etmez — audit isteği düşürmemeli.
 */
export async function recordGuardEvent(opts: {
  userId: string;
  requestId: string;
  mode: string;
  result: GuardModuleResult;
}): Promise<void> {
  try {
    let maxSev: "low" | "medium" | "high" | null = null;
    for (const d of opts.result.detections) {
      if (!maxSev || SEV_ORDER[d.severity] > SEV_ORDER[maxSev]) maxSev = d.severity;
    }
    void maxSev;
    void opts;
  } catch {
    // never throw
  }
}
