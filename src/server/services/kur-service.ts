import { db } from "../db/client.js";
import { systemConfig, kurHistory } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { writeAudit } from "./audit-service.js";
import { logger } from "../lib/logger.js";

export interface KurEntry {
  timestamp: string;
  liveKur: number;
  sellKur: number;
  source: string;
}

export async function refreshKur(source: "auto" | "manual" = "auto"): Promise<KurEntry | null> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j: any = await r.json();
    const live: number = j?.rates?.TRY;
    if (!live || typeof live !== "number") throw new Error("Invalid TRY rate");

    const rows = await db.select().from(systemConfig).where(eq(systemConfig.id, 1)).limit(1);
    if (!rows.length) throw new Error("system_config missing");

    const bufferNum = Number(rows[0].kurBuffer);
    const sellKur = live * (1 + bufferNum);
    const kurSourceVal = rows[0].kurSource;
    const now = new Date();

    await db
      .update(systemConfig)
      .set({
        liveKur: String(live),
        kur: String(sellKur),
        lastKurRefresh: now,
        updatedAt: now,
      })
      .where(eq(systemConfig.id, 1));

    const entrySource = `${kurSourceVal} (${source})`;
    await db.insert(kurHistory).values({
      timestamp: now,
      liveKur: String(live),
      sellKur: String(sellKur),
      source: entrySource,
    });

    await writeAudit("kur_refresh", source, `${live.toFixed(4)} → ${sellKur.toFixed(4)}`);

    logger.info({ live, sellKur, source }, "KUR refreshed");
    return {
      timestamp: now.toISOString(),
      liveKur: live,
      sellKur,
      source: entrySource,
    };
  } catch (e: any) {
    logger.error({ err: e }, "[refreshKur] failed");
    return null;
  }
}

let kurRefreshTimer: ReturnType<typeof setInterval> | null = null;

export async function startKurRefresh(): Promise<void> {
  // Initial refresh on boot
  await refreshKur("auto").catch(() => {});

  // Schedule hourly; only actually call if autoKurRefresh is enabled
  if (kurRefreshTimer) clearInterval(kurRefreshTimer);
  kurRefreshTimer = setInterval(async () => {
    const rows = await db
      .select({ autoKurRefresh: systemConfig.autoKurRefresh })
      .from(systemConfig)
      .where(eq(systemConfig.id, 1))
      .limit(1)
      .catch(() => []);
    if (rows[0]?.autoKurRefresh) {
      await refreshKur("auto").catch(() => {});
    }
  }, 60 * 60_000);
}
