import cron from "node-cron";
import { runScanIfActivity } from "../services/mali-izleme-service.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

// Canlı Mali İzleme — aktivite-kapılı Tarama_Job (R1).
//
// Her 60 saniyede uyanır; SON taramadan beri yeni usage_records/transactions satırı
// varsa Denetim_Motoru'nu çalıştırıp özeti mali_izleme_taramalari'na yazar. Aktivite
// yoksa SESSİZ çıkar (motor çağrılmaz — gereksiz iş/maliyet yok, R1.3).
//
// DAYANIKLILIK (R19): tüm çevrim try/catch — DB hatası loglanır (secret'sız), job çökmez,
// bir sonraki cron çevrimine devam eder. Yarıda kalan tarama persist EDİLMEZ (runScanIfActivity
// içinde önce runScan tamamlanır, sonra persist) → son başarılı özet korunur.
//
// DUPLICATE-RUN KORUMASI: runScanIfActivity son tarama özetindeki last_processed_*_ts'i
// baz alır; aynı pencere iki kez işlense de yeni satır yoksa sessiz çıkar (idempotent davranış).
export function startMaliIzlemeJob(): void {
  if (env.NODE_ENV === "test") return;

  // Her dakika başı (60sn periyot).
  cron.schedule("* * * * *", async () => {
    try {
      const result = await runScanIfActivity("cron");
      if (result) {
        logger.info(
          { verdict: result.verdict, findings: result.findings.length, durationMs: result.durationMs },
          "[mali-izleme-job] tarama tamamlandı",
        );
      }
    } catch (e) {
      // Secret'sız logla; sonraki çevrime devam (job çökmesin).
      logger.error({ err: e }, "[mali-izleme-job] tarama çevrimi başarısız");
    }
  });

  logger.info("[mali-izleme-job] scheduled (* * * * *)");
}
