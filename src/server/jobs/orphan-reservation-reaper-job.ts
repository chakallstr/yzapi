import cron from "node-cron";
import { dbSql } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";

// A reservation (transactions.idempotency_key = 'usage_reserve_<requestId>')
// debits the balance up front. If the request dies between reserve and settle
// (SIGKILL/OOM/deploy/DB drop), settleReservedUsage never runs and the held
// balance is locked forever. reconciliation only reports drift, it does not fix
// it. This job refunds orphan reservations: a reserve row with no matching
// final charge ('usage_final_<id>'), no release ('usage_release_<id>') and no
// usage_records row, older than the grace period.
const ORPHAN_GRACE_MINUTES = Number(env.ORPHAN_RESERVATION_GRACE_MIN ?? 15);

export async function reapOrphanReservations(graceMinutes = ORPHAN_GRACE_MINUTES): Promise<number> {
  // Insert a release transaction + refund for each orphan, atomically and
  // idempotently. The unique idempotency_key 'usage_release_<id>' guarantees a
  // second run can never double-refund. SKIP LOCKED avoids contention with a
  // concurrent settle for the same row.
  const refunded = await dbSql.begin(async (txSql) => {
    const orphans = await txSql<{
      idempotency_key: string;
      request_id: string;
      user_id: string;
      user_email: string;
      amount_tl: string;
    }[]>`
      SELECT
        r.idempotency_key,
        substring(r.idempotency_key from 'usage_reserve_(.*)') AS request_id,
        r.user_id::text AS user_id,
        r.user_email,
        abs(r.miktar_tl)::text AS amount_tl
      FROM transactions r
      WHERE r.idempotency_key LIKE 'usage_reserve_%'
        AND r.timestamp < now() - (${graceMinutes} || ' minutes')::interval
        AND NOT EXISTS (
          SELECT 1 FROM transactions f
          WHERE f.idempotency_key = 'usage_final_' || substring(r.idempotency_key from 'usage_reserve_(.*)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM transactions rel
          WHERE rel.idempotency_key = 'usage_release_' || substring(r.idempotency_key from 'usage_reserve_(.*)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM usage_records u
          WHERE u.request_id = substring(r.idempotency_key from 'usage_reserve_(.*)')
        )
      FOR UPDATE OF r SKIP LOCKED
      LIMIT 200
    `;

    let count = 0;
    for (const orphan of orphans) {
      const amount = Number(orphan.amount_tl);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const amountStr = amount.toFixed(4);

      const updated = await txSql<{ bakiye_tl: string }[]>`
        UPDATE users
        SET bakiye_tl = bakiye_tl + ${amountStr}::numeric,
            son_aktivite = now()
        WHERE id = ${orphan.user_id}::uuid
        RETURNING bakiye_tl
      `;
      if (!updated.length) continue;

      const after = Number(updated[0].bakiye_tl);
      const before = after - amount;

      await txSql`
        INSERT INTO transactions (
          user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, idempotency_key
        ) VALUES (
          ${orphan.user_id}::uuid,
          ${orphan.user_email},
          'iade',
          ${amountStr}::numeric,
          ${before.toFixed(4)}::numeric,
          ${after.toFixed(4)}::numeric,
          ${`orphan rezervasyon iadesi (${orphan.request_id})`},
          ${`usage_release_${orphan.request_id}`}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
      count += 1;
    }
    return count;
  });

  if (refunded > 0) {
    logger.info({ refunded, graceMinutes }, "[orphan-reservation-reaper] refunded stale reservations");
  }
  return refunded;
}

export function startOrphanReservationReaperJob(): void {
  if (env.NODE_ENV === "test") return;

  // Every hour at minute 30
  cron.schedule("30 * * * *", async () => {
    try {
      await reapOrphanReservations();
    } catch (e) {
      logger.error({ err: e }, "[orphan-reservation-reaper] run failed");
    }
  });

  logger.info("[orphan-reservation-reaper-job] scheduled (30 * * * *)");
}
