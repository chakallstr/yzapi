import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { reconcilePackageSlots } from "../services/package-slot-reconcile-service.js";

/**
 * Paket istek-sayacı self-healing uzlaştırma job'u.
 * requests_today (rezervasyon sayacı) ile usage_records (gerçek başarılı istek) arasındaki sızıntı
 * sapmasını (rezerve-edilip-kaydedilmeyen slot) periyodik kapatır → panel=gate=Aktivite=gerçek.
 * Salt sayaç düzeltir; bakiye/ledger/CF'ye dokunmaz. Hata yutulur (job asla çökmez).
 */
export function startPackageSlotReconcileJob(): void {
  if (env.NODE_ENV === "test") return;

  // Her 10 dakikada bir
  cron.schedule("*/10 * * * *", async () => {
    try {
      const { checked, corrected } = await reconcilePackageSlots();
      if (corrected > 0) {
        logger.info({ checked, corrected }, "[package-slot-reconcile] sayaç düzeltildi");
      }
    } catch (e) {
      logger.error({ err: e }, "[package-slot-reconcile] run failed");
    }
  });

  logger.info("[package-slot-reconcile-job] scheduled (*/10 * * * *)");
}
