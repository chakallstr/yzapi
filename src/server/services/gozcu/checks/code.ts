// Gözcü — kod domeni. Kontrat verify()'lerini her taramada çalıştırır; ihlal varsa
// runtime kırmızıdan BAĞIMSIZ "kod regresyonu" bulgusu üretir (immediate).

import { verifyAllContracts } from "../contracts/index.js";
import type { GozcuCheckResult } from "../types.js";

export async function runCodeChecks(): Promise<GozcuCheckResult[]> {
  const results = await verifyAllContracts();
  const failed = results.filter((r) => !r.ok);
  return [
    {
      name: "code_contracts",
      domain: "code",
      signalSource: "gozcu/contracts (grep/AST-lite)",
      measured: failed.length
        ? `${failed.length} kontrat ihlali: ${failed.map((f) => f.id).join(", ")}`
        : `${results.length} kontrat OK`,
      threshold: "tüm verify()'li kontratlar geçmeli",
      severity: failed.length ? "red" : "green",
      immediate: failed.length > 0, // kod regresyonu → anında alarm
      evidence: failed.length ? failed : undefined,
    },
  ];
}
