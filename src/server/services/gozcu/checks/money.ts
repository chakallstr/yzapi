// Gözcü — para domeni. Mali İzleme'nin 11 kontrolünü (14 alt-sonuç) REUSE eder.
// YENİ MATEMATİK YOK: runMoneyChecks() = mali-izleme-service'in raw (histerezissiz)
// check listesi; Gözcü kendi histerezisini gozcu_findings'ten uygular.

import { runMoneyChecks } from "../../mali-izleme-service.js";
import type { GozcuCheckResult } from "../types.js";

const MONEY_SIGNAL: Record<string, string> = {
  ledger_drift: "users.bakiye_tl vs SUM(transactions.miktar_tl)",
  k1: "usage_records(status='error' AND cost_tl>0)",
  orphan_rezervasyon: "transactions(usage_reserve_* sızıntı)",
  odemesiz_credit: "transactions(tip='yukleme') vs payments",
  bonus_butunluk: "transactions(tip='bonus') vs signup_bonus_grants",
  usage_ledger_eslesme: "usage_records(success) vs transactions(usage_final_*)",
  iade_butunluk: "transactions(usage_release_*)",
  stream_missing: "usage_records(status='stream_missing_usage')",
  recompute: "usage_records.pricing_snapshot_json",
  marj: "usage_records.cost_usd vs maliyet tabanı",
  idempotency_cakisma: "transactions.idempotency_key",
  cift_credit: "transactions(pay_* tekrarı)",
  kdv: "payments(kdv_tl/net_tl/miktar_tl)",
  kur_saglik: "system_config + kur_history",
};

export async function runMoneyDomainChecks(): Promise<GozcuCheckResult[]> {
  const results = await runMoneyChecks();
  return results.map((c) => ({
    ...c,
    domain: "money" as const,
    signalSource: MONEY_SIGNAL[c.name] ?? "money",
    immediate: c.name === "k1" || (c.name === "ledger_drift" && Math.abs(Number(c.measured) || 0) >= 1),
  }));
}
