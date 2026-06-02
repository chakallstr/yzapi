// Gözcü — bildirim teslimatı (kırmızı bulgu → admin WhatsApp).
//
// notifyAdmin zaten asla-throw + yapılandırılmamışsa sessiz no-op. Burada yalnız
// SPAM önleme var: dedup_key başına en fazla saatte 1 bildirim (in-memory cooldown).
// Histerezis zaten non-immediate kırmızıları yellow'a indirir → yalnız para-kritik /
// immediate kırmızılar (k1, drift≥1TL, DB down, mali-job durması, models down, auth
// saldırısı) buradan geçer. Sarı bulgular günlük digest'e (Faz 3) kalır.

import { notifyAdmin } from "../admin-notify-service.js";
import { logger } from "../../lib/logger.js";
import type { GozcuCheckResult } from "./types.js";

const COOLDOWN_MS = 60 * 60 * 1000; // dedup_key başına 1 saat
const lastNotified = new Map<string, number>();

let nowFn: () => number = () => Date.now();
export function __setClock(fn: () => number): void {
  nowFn = fn;
}
export function __reset(): void {
  lastNotified.clear();
}

export async function notifyRedFindings(findings: GozcuCheckResult[]): Promise<void> {
  for (const f of findings) {
    if (f.severity !== "red") continue;
    const key = `${f.domain}:${f.name}`;
    const last = lastNotified.get(key) ?? 0;
    if (nowFn() - last < COOLDOWN_MS) continue; // cooldown — spam yok
    lastNotified.set(key, nowFn());
    // notifyAdmin asla throw etmez; yine de savunmacı sar.
    try {
      await notifyAdmin({
        kind: "sistem_uyarisi",
        severity: "red",
        title: `Gözcü 🔴 ${f.name}`,
        detail: `${f.domain} · ${String(f.measured)}\nEşik: ${f.threshold}`,
      });
    } catch (e) {
      logger.error({ err: e, check: f.name }, "[gozcu-notify] bildirim hatası");
    }
  }
}

// Bir check green'e döndüğünde (recovery) cooldown'ı sıfırla — aynı check 1 saat içinde
// tekrar red olursa bildirim SESSİZ kalmasın (red→green→red kör noktası fix).
export function noteRecoveries(checks: GozcuCheckResult[]): void {
  for (const c of checks) {
    if (c.severity === "green") lastNotified.delete(`${c.domain}:${c.name}`);
  }
}
