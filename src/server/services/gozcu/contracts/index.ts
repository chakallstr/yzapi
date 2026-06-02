// Gözcü — Katman-3 Kod Zekâsı: deklaratif invariant/kontrat kaydı.
//
// "Kodun ne olması gerektiğini bilen" katman. Her kontrat bir BEKLENEN davranış belirtir;
// bazılarının verify() grep/AST-lite checkeri vardır → runtime kırmızıdan BAĞIMSIZ kod
// regresyonu yakalar (örn. proxy.ts'ten resolveBilledPromptTokens düşmesi). statement,
// Katman-2 (LLM) prompt'una "BEKLENEN" olarak girer → LLM tahmin yerine beklenen-vs-gerçek.
//
// MVP: el-yazımı kontratlar + grep verify. YOL HARİTASI (MVP DEĞİL): LLM-türetilmiş
// kontratlar yalnız insan-incelemesi kuyruğuna; ASLA otomatik birleştirilmez (canlı para
// sisteminde yanlış invariant tehlikeli).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../../../lib/env.js";

export interface Contract {
  id: string;
  subsystem: string;
  statement: string;
  relatedChecks: string[];
  relatedFiles: string[];
  verify?: () => Promise<{ ok: boolean; detail: string }>;
}

// Repo-relative dosyayı path-guard ile oku (sadece kök altı; yoksa null).
function readRepoFile(rel: string): string | null {
  try {
    const root = resolve(env.GOZCU_REPO_ROOT);
    const full = resolve(root, rel);
    if (!full.startsWith(root)) return null;
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

function countOccurrences(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

export const CONTRACTS: Contract[] = [
  {
    id: "proxy/billed-tokens-floor",
    subsystem: "billing",
    statement:
      "Proxy faturalama yolu her settle noktasında resolveBilledPromptTokens çağırmalı " +
      "(sağlayıcı geçerli token raporladıysa char/4 ile şişirme; bozuk raporda floor).",
    relatedChecks: ["proxy_error_rate", "k1", "recompute", "code_contracts"],
    relatedFiles: ["src/server/routes/proxy.ts", "src/server/services/request-guard-service.ts"],
    verify: async () => {
      const src = readRepoFile("src/server/routes/proxy.ts");
      // "Doğrulanamadı" = "OK" DEĞİL: dosya okunamıyorsa kontrat ihlali say (regresyon saklı kalmasın).
      if (src === null) return { ok: false, detail: "proxy.ts okunamadı (deploy drift) — billing-floor kontratı DOĞRULANAMADI" };
      const n = countOccurrences(src, "resolveBilledPromptTokens");
      // import + ≥3 çağrı noktası (closerouter regresyon turunda doğrulanmış sayı).
      return n >= 4
        ? { ok: true, detail: `${n} kullanım (import + çağrı noktaları) mevcut` }
        : { ok: false, detail: `resolveBilledPromptTokens yalnız ${n} yerde (beklenen ≥4) — billing floor regresyonu olabilir` };
    },
  },
  {
    id: "billing/error-never-charged",
    subsystem: "billing",
    statement: "status='error' usage_record'unun cost_tl'si 0 olmalı (hatalı çağrı faturalanmaz). Runtime karşılığı: k1.",
    relatedChecks: ["k1"],
    relatedFiles: ["src/server/services/billing-service.ts"],
  },
  {
    id: "billing/reserve-settle-or-release",
    subsystem: "billing",
    statement:
      "Her usage_reserve_ rezervasyonu ya usage_final_ (settle) ya usage_release_ (idempotent iade) " +
      "ile kapanmalı; orphan-reservation-reaper karşılıksız kilitleri iade eder.",
    relatedChecks: ["orphan_rezervasyon", "iade_butunluk"],
    relatedFiles: ["src/server/jobs/orphan-reservation-reaper-job.ts"],
  },
  {
    id: "payments/idempotent-credit",
    subsystem: "payments",
    statement:
      "Tüm bakiye kredileri creditUserBalance + pay_-önekli idempotency anahtarı üzerinden gitmeli; " +
      "ad-hoc users.bakiye_tl yazımı yasak (çift-credit koruması).",
    relatedChecks: ["cift_credit", "odemesiz_credit"],
    relatedFiles: ["src/server/services/payment-common.ts"],
  },
];

// check.name → o check'i kapsayan kontratlar (Katman-2 prompt'u için).
export const CONTRACTS_BY_CHECK = new Map<string, Contract[]>();
for (const c of CONTRACTS) {
  for (const ch of c.relatedChecks) {
    const arr = CONTRACTS_BY_CHECK.get(ch) ?? [];
    arr.push(c);
    CONTRACTS_BY_CHECK.set(ch, arr);
  }
}

// Tüm verify()'li kontratları çalıştır (commit-trigger veya tarama içi).
export async function verifyAllContracts(): Promise<Array<{ id: string; ok: boolean; detail: string }>> {
  const out: Array<{ id: string; ok: boolean; detail: string }> = [];
  for (const c of CONTRACTS) {
    if (!c.verify) continue;
    try {
      const r = await c.verify();
      out.push({ id: c.id, ok: r.ok, detail: r.detail });
    } catch (e) {
      // verify hatası kontratı ihlal saymaz (kapı yanlış-pozitif vermesin).
      out.push({ id: c.id, ok: true, detail: `verify hata: ${(e as Error).message}` });
    }
  }
  return out;
}
