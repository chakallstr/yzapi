import cron from "node-cron";
import { runGozcuScanIfActivity } from "../services/gozcu/engine.js";
import { recordHeartbeat } from "../services/gozcu/heartbeat.js";
import { notifyRedFindings, noteRecoveries } from "../services/gozcu/notify.js";
import { runAutoHeals } from "../services/gozcu/heal/run.js";
import { initGozcuDiagnosis } from "../services/gozcu/diagnose.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

// Gözcü — aktivite-kapılı tarama job'u (60s).
//
// Her dakika uyanır; kendi heartbeat'ini kaydeder, sonra aktivite varsa (para trafiği /
// collector / bayat job) tüm sistemi tarar ve gozcu_findings + gozcu_signals'a yazar.
// DAYANIKLILIK: tüm çevrim try/catch — bir tarama patlasa da job çökmez, sonraki çevrime
// devam eder. Tarama motoru zaten her check'i izole eder (safeRun).
export function startGozcuJob(): void {
  if (env.NODE_ENV === "test") return;

  initGozcuDiagnosis(); // Katman-2 LLM teşhis sink'ini engine'e kaydet

  cron.schedule("* * * * *", async () => {
    recordHeartbeat("gozcu-job");
    try {
      const result = await runGozcuScanIfActivity("cron");
      if (result) {
        await runAutoHeals(result.findings); // güvenli oto-müdahale (kill-switch'li, varsayılan kapalı)
        await notifyRedFindings(result.findings); // kırmızı → admin WhatsApp (cooldown'lu)
        noteRecoveries(result.checks); // green olanların cooldown'ını sıfırla (red recurrence kaçmasın)
        logger.info(
          {
            verdict: result.verdict,
            red: result.redCount,
            yellow: result.yellowCount,
            durationMs: result.durationMs,
          },
          "[gozcu-job] tarama tamamlandı",
        );
      }
    } catch (e) {
      logger.error({ err: e }, "[gozcu-job] tarama çevrimi başarısız");
    }
  });

  logger.info("[gozcu-job] scheduled (* * * * *)");
}
