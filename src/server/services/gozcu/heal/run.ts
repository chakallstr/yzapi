// Gözcü — oto-müdahale orchestrator'ı (mode-bazlı: off / shadow / tiered / auto).
//
// shadow : dry-run + logla, UYGULAMA (ne yapacağını gör — güven inşası).
// tiered : para-DIŞI heal'ler oto uygulanır; para-hareketi heal'ler onay-bekliyor işaretlenir
//          + admin'e bildirilir (panelden "Onayla & Uygula" ile insan tetikler).
// auto   : tüm whitelist heal'ler oto.
// Tüm uygulamalar: rate-limit → guard → dryRun → cap → apply → audit. Her şey try/catch;
// bir heal patlasa diğeri devam. Para-hareketi heal mevcut idempotent path'e delege eder.

import { dbSql } from "../../../db/client.js";
import { logger } from "../../../lib/logger.js";
import { env } from "../../../lib/env.js";
import { writeAudit } from "../../audit-service.js";
import { notifyAdmin } from "../../admin-notify-service.js";
import { HEAL_REGISTRY, type HealAction } from "./registry.js";
import type { GozcuCheckResult } from "../types.js";

async function recentHealCount(id: string): Promise<number> {
  const rows = await dbSql<{ c: string }[]>`
    SELECT count(*)::text AS c FROM audit_logs
    WHERE action = ${"gozcu_heal_" + id} AND timestamp > now() - interval '1 hour'
  `;
  return Number(rows[0]?.c ?? 0);
}

async function markFinding(checks: string[], result: Record<string, unknown>): Promise<void> {
  await dbSql`
    UPDATE gozcu_findings
    SET autoheal_attempted = true, autoheal_result_json = ${JSON.stringify(result)}::jsonb
    WHERE check_name = ANY(${checks}::text[])
  `;
}

// Tek bir heal'i güvenlik raylarıyla UYGULA. Hem oto (tiered/auto) hem insan-onaylı yol kullanır.
async function runHealApply(heal: HealAction): Promise<{ ok: boolean; detail: string; applied: number }> {
  const recent = await recentHealCount(heal.id);
  if (recent >= heal.maxPerHour) {
    await writeAudit(`gozcu_heal_${heal.id}_blocked`, heal.id, `rate-limit: son saatte ${recent} ≥ ${heal.maxPerHour}`);
    return { ok: false, detail: "rate-limit aşıldı", applied: 0 };
  }
  const g = await heal.guard();
  if (!g.canRun) return { ok: false, detail: `guard: ${g.reason}`, applied: 0 };
  const dry = await heal.dryRun();
  if (dry.affected === 0) return { ok: false, detail: "etkilenecek kayıt yok", applied: 0 };
  if (dry.affected > env.GOZCU_HEAL_MAX_AFFECTED) {
    await writeAudit(`gozcu_heal_${heal.id}_refused`, heal.id, `affected ${dry.affected} > cap ${env.GOZCU_HEAL_MAX_AFFECTED} — reddedildi`);
    return { ok: false, detail: `cap aşıldı (${dry.affected} > ${env.GOZCU_HEAL_MAX_AFFECTED})`, applied: 0 };
  }
  await writeAudit(`gozcu_heal_${heal.id}_dryrun`, heal.id, dry.preview);
  const result = await heal.apply();
  await writeAudit(`gozcu_heal_${heal.id}`, heal.id, result.detail);
  await markFinding(result.fixedChecks, { mode: "applied", applied: result.applied, detail: result.detail });
  logger.info({ heal: heal.id, applied: result.applied }, "[gozcu-heal] uygulandı");
  return { ok: true, detail: result.detail, applied: result.applied };
}

// Tarama sonrası otomatik değerlendirme (mode'a göre). Kırmızı bulguları tetikler.
export async function runAutoHeals(findings: GozcuCheckResult[]): Promise<void> {
  const mode = env.GOZCU_AUTOHEAL_MODE;
  if (mode === "off") return;
  const redChecks = new Set(findings.filter((f) => f.severity === "red").map((f) => f.name));

  for (const heal of HEAL_REGISTRY) {
    if (!heal.triggerChecks.some((c) => redChecks.has(c))) continue;
    try {
      // dryRun her modda çalışır (salt-okunur) — gerçekte ne yapılacağını hesaplar.
      const g = await heal.guard();
      if (!g.canRun) continue;
      const dry = await heal.dryRun();
      if (dry.affected === 0) continue;

      if (mode === "shadow") {
        // SADECE logla — UYGULAMA. "Ne yapacaktı" görünür olur.
        await writeAudit(`gozcu_heal_${heal.id}_shadow`, heal.id, `[GÖLGE] ${dry.preview} (uygulanmadı)`);
        await markFinding(heal.triggerChecks, { mode: "shadow", wouldHeal: heal.id, affected: dry.affected, preview: dry.preview });
        logger.info({ heal: heal.id, affected: dry.affected }, "[gozcu-heal] GÖLGE — uygulanmadı");
        continue;
      }

      if (mode === "tiered" && heal.moneyMoving) {
        // Para-hareketi → OTO UYGULAMA; onay-bekliyor işaretle + bildir (insan tek-tık onaylar).
        await markFinding(heal.triggerChecks, { mode: "pending_approval", heal: heal.id, affected: dry.affected, preview: dry.preview });
        await notifyAdmin({
          kind: "sistem_uyarisi",
          severity: "red",
          title: `Gözcü onay bekliyor: ${heal.id}`,
          detail: `${dry.preview}\nPara-hareketi — otomatik YAPILMADI. Panelden "Onayla & Uygula" ile çalıştır.`,
        }).catch(() => {});
        logger.info({ heal: heal.id }, "[gozcu-heal] onay-bekliyor (para-hareketi)");
        continue;
      }

      // tiered + para-dışı, VEYA auto → uygula.
      await runHealApply(heal);
    } catch (e) {
      logger.error({ err: e, heal: heal.id }, "[gozcu-heal] hata (atlandı)");
    }
  }
}

// İnsan-onaylı tek-tık çalıştırma (panel "Onayla & Uygula" / WhatsApp). Mode'dan BAĞIMSIZ —
// açık insan aksiyonudur; tüm güvenlik rayları yine uygulanır (rate-limit/guard/dryRun/cap/audit).
export async function executeHealForCheck(checkName: string, actor: string): Promise<{ ok: boolean; detail: string }> {
  const heal = HEAL_REGISTRY.find((h) => h.triggerChecks.includes(checkName));
  if (!heal) return { ok: false, detail: "bu check için tanımlı bir heal yok" };
  const r = await runHealApply(heal);
  await writeAudit(`gozcu_heal_${heal.id}_manual`, heal.id, `insan onayı (${actor}): ${r.detail}`);
  return { ok: r.ok, detail: r.detail };
}
