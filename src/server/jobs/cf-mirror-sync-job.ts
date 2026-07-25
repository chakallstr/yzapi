import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { dbSql } from "../db/client.js";
import {
  listCfCustomerIds,
  mapCfEventsToLedgerRows,
  latestRemainingFromRows,
  resolveFreshestRemaining,
  syncCfRemainingMirror,
} from "../services/cf-ledger-service.js";
import { cfUsage } from "../services/codefast-reseller-service.js";
import { topUpCfIfNeeded } from "../services/codefast-provisioning-service.js";
import { CodefastError } from "../services/codefast-reseller-service.js";

/**
 * cf-mirror-sync: CF kalan-ünite aynasını CF'nin GERÇEĞİYLE anlık (saniyeler) eşitler
 * ve havuz gerçekte düşükse 403'ten ÖNCE proaktif top-up tetikler.
 *
 * NEDEN AYRI JOB: `cf-ledger-job` (her 3 dk) durable ledger + mirror sync yapar ama 3 dakika
 * "anlık" değil; streaming `x-codefast-remaining` header'ı stream-açılışında sık NULL → ayna
 * donar (over-report) → panel "var" derken CF havuzu boş → sürpriz 403. Bu job aynı yardımcıları
 * (`cfUsage` + `latestRemainingFromRows` + `syncCfRemainingMirror`) ~30sn'de koşar; ayrıca
 * `topUpCfIfNeeded`'a CF-gerçeği `remaining`'i `poolRemainingOverride` olarak geçer → top-up artık
 * aynaya değil CF-gerçeğine bakar (over-report kör-noktası kapanır = aralıklı-403 kök fix).
 *
 * SAFE: salt CF-okuma + mevcut audited yazıcılar (`syncCfRemainingMirror` zaten kardeş-satır
 * senkron + remaining<=0 clobber-race guard'lı; `topUpCfIfNeeded` daily_limit tavanı + idempotent).
 * Ledger upsert YAPMAZ (o 3dk job'ın işi). never-throw: bir müşterinin hatası diğerlerini durdurmaz.
 */

/** Bir CF müşterisinin aktif provisioned entitlement id'si (top-up tetiklemek için; en çok headroom'lu). */
async function getActiveCfEntitlementId(externalCustomerId: string): Promise<string | null> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT id FROM user_package_entitlements
    WHERE cf_customer_id = ${externalCustomerId}
      AND status = 'active' AND cf_status = 'provisioned' AND cf_units_ordered > 0
    ORDER BY (daily_limit_snapshot - cf_units_ordered) DESC, expires_at ASC
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function runCfMirrorSyncTick(
  opts: { dryRun: boolean; proactiveTopup: boolean },
): Promise<{ customers: number }> {
  const ids = await listCfCustomerIds();
  let sawRateLimit = false;
  for (const id of ids) {
    if (sawRateLimit) break;
    try {
      const usage = await cfUsage(id);
      const rows = mapCfEventsToLedgerRows(id, usage);
      if (opts.dryRun) {
        // DRY-RUN: hiçbir yazma/SELECT yok; yalnız ne yapılacağını logla (kademeli aktivasyon doğrulaması).
        logger.info(
          { customerId: id, remaining: latestRemainingFromRows(rows), wouldTopup: opts.proactiveTopup },
          "[cf-mirror-sync] DRY-RUN: would sync cf_remaining mirror",
        );
        continue;
      }
      // Fetch ∪ ledger en-yenisi: bayat/kısmi /usage cevabı LEAST aynasını ratchet edemez.
      const remaining = await resolveFreshestRemaining(id, rows);
      // Ayna eşitle (CF-gerçeği header'dan bağımsız). syncCfRemainingMirror null/<=0'da KENDİSİ atlar.
      await syncCfRemainingMirror(id, remaining);
      // Proaktif top-up: CF-gerçeği remaining'i override olarak geç → over-report'ta körleşmez.
      if (opts.proactiveTopup && remaining != null && Number.isFinite(remaining)) {
        // entId yalnız müşteriyi çözer + "aktif CF hak var mı" kapısıdır; gerçekte sipariş edilecek kardeş
        // adayını topUpCfIfNeeded cf_customer_id'den KENDİSİ (en-headroom'lu) yeniden seçer → bu seed'dir.
        const entId = await getActiveCfEntitlementId(id);
        if (entId) await topUpCfIfNeeded(entId, remaining);
      }
    } catch (e) {
      logger.warn({ err: e, customerId: id }, "[cf-mirror-sync] customer tick failed");
      if (e instanceof CodefastError && e.status === 429) {
        sawRateLimit = true;
      }
    }
  }
  return { customers: ids.length };
}

export function startCfMirrorSyncJob(): void {
  if (env.NODE_ENV === "test") return;
  if (!env.CF_MIRROR_SYNC_ENABLED) {
    logger.info("[cf-mirror-sync] disabled (CF_MIRROR_SYNC_ENABLED=false)");
    return;
  }
  if (!env.CODEFAST_RESELLER_API_KEY) {
    logger.info("[cf-mirror-sync] skipped (no CodeFast reseller key configured)");
    return;
  }
  cron.schedule(env.CF_MIRROR_SYNC_CRON, async () => {
    try {
      await runCfMirrorSyncTick({
        dryRun: env.CF_MIRROR_SYNC_DRY_RUN,
        proactiveTopup: env.CF_PROACTIVE_TOPUP_ENABLED,
      });
    } catch (e) {
      logger.error({ err: e }, "[cf-mirror-sync] run failed");
    }
  });
  logger.info(
    { cron: env.CF_MIRROR_SYNC_CRON, dryRun: env.CF_MIRROR_SYNC_DRY_RUN, proactiveTopup: env.CF_PROACTIVE_TOPUP_ENABLED },
    "[cf-mirror-sync] scheduled",
  );
}
