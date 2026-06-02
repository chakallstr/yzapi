import cron from "node-cron";
import { dbSql } from "../db/client.js";
import { notifyAdmin } from "../services/admin-notify-service.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

// Gözcü — günlük digest. Anlık kırmızı alarmlar zaten gozcu-job'dan (cooldown'lu) gider;
// bu, birikmiş SARI + hâlâ-açık kırmızı bulguları günde 1 kez tek mesajda toparlar
// (alarm yorgunluğu önleme). Temizse mesaj gönderilmez.
export function startGozcuDigestJob(): void {
  if (env.NODE_ENV === "test") return;

  // Her gün 09:00 (daily-report ile aynı saat; sunucu TZ Europe/Istanbul varsayımı).
  cron.schedule("0 9 * * *", async () => {
    try {
      const rows = await dbSql<{ severity: string; check_name: string; domain: string; measured: string }[]>`
        SELECT severity, check_name, domain, measured
        FROM gozcu_findings
        WHERE status IN ('open', 'ack') AND severity <> 'green'
        ORDER BY (severity = 'red') DESC, last_seen_at DESC
        LIMIT 30
      `;
      if (!rows.length) return; // temiz — digest yok

      const reds = rows.filter((r) => r.severity === "red");
      const yellows = rows.filter((r) => r.severity === "yellow");
      const lines = rows
        .map((r) => `${r.severity === "red" ? "🔴" : "🟡"} ${r.check_name} (${r.domain}) — ${r.measured}`)
        .join("\n");

      await notifyAdmin({
        kind: "sistem_uyarisi",
        severity: reds.length ? "red" : "yellow",
        title: `Gözcü günlük özet — ${reds.length} kırmızı, ${yellows.length} sarı`,
        detail: lines,
      });
      logger.info({ red: reds.length, yellow: yellows.length }, "[gozcu-digest] gönderildi");
    } catch (e) {
      logger.error({ err: e }, "[gozcu-digest] başarısız");
    }
  });

  logger.info("[gozcu-digest] scheduled (0 9 * * *)");
}
