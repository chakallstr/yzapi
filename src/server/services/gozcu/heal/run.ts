// Gözcü — oto-müdahale orchestrator'ı.
//
// Akış (her heal için): kill-switch → rate-limit (audit_logs say) → guard() (deterministik,
// LLM'den bağımsız) → dryRun() (her zaman önce, audit'lenir) → dryRun.affected > cap ise
// REDDEt+insan → apply() → writeAudit + finding işaretle. Para hareketi olan heal mevcut
// idempotent path'e delege eder. Her şey try/catch — bir heal patlasa diğeri devam.

import { dbSql } from "../../../db/client.js";
import { logger } from "../../../lib/logger.js";
import { env } from "../../../lib/env.js";
import { writeAudit } from "../../audit-service.js";
import { HEAL_REGISTRY } from "./registry.js";
import type { GozcuCheckResult } from "../types.js";

async function recentHealCount(id: string): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM audit_logs
    WHERE action = ${"gozcu_heal_" + id} AND timestamp > now() - interval '1 hour'
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function runAutoHeals(findings: GozcuCheckResult[]): Promise<void> {
  if (!env.GOZCU_AUTOHEAL_ENABLED) return; // kill-switch (varsayılan kapalı)
  const redChecks = new Set(findings.filter((f) => f.severity === "red").map((f) => f.name));

  for (const heal of HEAL_REGISTRY) {
    if (!heal.triggerChecks.some((c) => redChecks.has(c))) continue;
    try {
      const recent = await recentHealCount(heal.id);
      if (recent >= heal.maxPerHour) {
        await writeAudit(`gozcu_heal_${heal.id}_blocked`, heal.id, `rate-limit: son saatte ${recent} ≥ ${heal.maxPerHour}`);
        continue;
      }
      // dryRun TEK count yapar; affected>0 zaten guard işlevi görür (redundant ikinci COUNT yok).
      const dry = await heal.dryRun();
      if (dry.affected === 0) continue;
      if (dry.affected > env.GOZCU_HEAL_MAX_AFFECTED) {
        await writeAudit(
          `gozcu_heal_${heal.id}_refused`,
          heal.id,
          `dryRun.affected ${dry.affected} > cap ${env.GOZCU_HEAL_MAX_AFFECTED} — insana bırakıldı`,
        );
        continue;
      }

      await writeAudit(`gozcu_heal_${heal.id}_dryrun`, heal.id, dry.preview);
      const result = await heal.apply();
      await writeAudit(`gozcu_heal_${heal.id}`, heal.id, result.detail);

      await dbSql`
        UPDATE gozcu_findings
        SET autoheal_attempted = true, autoheal_result_json = ${JSON.stringify(result)}::jsonb
        WHERE check_name = ANY(${result.fixedChecks}::text[])
      `;
      logger.info({ heal: heal.id, applied: result.applied }, "[gozcu-heal] uygulandı");
    } catch (e) {
      logger.error({ err: e, heal: heal.id }, "[gozcu-heal] hata (atlandı)");
    }
  }
}
