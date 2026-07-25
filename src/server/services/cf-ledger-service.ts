/**
 * CF usage ledger — our OWN durable, uncapped copy of CodeFast's per-request
 * consumption events.
 *
 * WHY: CodeFast's GET /v1/customers/:extId/usage caps `events` at the latest 250
 * and exposes no pagination / reseller ledger; meanwhile the streaming response
 * header (`x-codefast-remaining`) is read at stream-open and is frequently NULL
 * for heavy streaming users — so `user_package_entitlements.cf_remaining` goes
 * stale and we lose sight of how many requests / units CF actually billed.
 *
 * This service polls /usage on a short interval and upserts each event into
 * `cf_usage_ledger`, deduping on CF's stable event id. Over time we accumulate
 * the COMPLETE history (surpassing the 250 window), giving exact CF request
 * counts + cost_units for reconciliation.
 *
 * INERT & SAFE: read-only against CF, writes only to its own table, never touches
 * money/serving paths, never throws to callers.
 */
import { dbSql } from "../db/client.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { cfUsage, type CfUsageResponse } from "./codefast-reseller-service.js";

export interface CfLedgerRow {
  cfEventId: string;
  externalCustomerId: string;
  cfCustomerId: string | null;
  customerApiKeyId: string | null;
  requestId: string | null;
  apiSlug: string | null;
  cfStatus: string | null;
  costUnits: number | null;
  remaining: number | null;
  cfCreatedAt: string | null;
}

const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** PURE: turn a CF /usage response into ledger rows keyed by CF event id. Never throws. */
export function mapCfEventsToLedgerRows(
  externalCustomerId: string,
  usage: CfUsageResponse | null | undefined,
): CfLedgerRow[] {
  const events = usage?.events;
  if (!Array.isArray(events)) return [];
  const rows: CfLedgerRow[] = [];
  for (const e of events) {
    if (!e || typeof e.id !== "string" || e.id.length === 0) continue;
    rows.push({
      cfEventId: e.id,
      externalCustomerId,
      cfCustomerId: usage?.customer?.id ?? e.customer_id ?? null,
      customerApiKeyId: e.customer_api_key_id ?? null,
      requestId: e.request_id ?? null,
      apiSlug: e.result?.api_slug ?? null,
      cfStatus: e.status ?? null,
      costUnits: numOrNull(e.cost_units),
      remaining: numOrNull(e.remaining),
      cfCreatedAt: typeof e.created_at === "string" ? e.created_at : null,
    });
  }
  return rows;
}

export interface LatestRemainingEvent { remaining: number; ts: number | null }

/**
 * PURE: en-yeni CF event'inin `remaining`'i — DİZİ SIRASINA GÜVENMEZ.
 * (2026-07-14 vakası: /usage bir tick'te bayat bir event'i öne koydu; "newest-first"
 * varsayımıyla ilk finite remaining seçilince LEAST aynası kalıcı 50-düşük yapıştı.)
 * Finite-remaining satırlar arasında max `cfCreatedAt` kazanır; timestamp'i olmayan/
 * parse edilemeyen satırlar yalnız hiç timestamp'li aday yokken (eski davranış:
 * ilk finite) kullanılır. Aday yok → null. Never throws.
 */
export function latestRemainingEventFromRows(
  rows: CfLedgerRow[] | null | undefined,
): LatestRemainingEvent | null {
  if (!Array.isArray(rows)) return null;
  let best: LatestRemainingEvent | null = null;
  let noTsFallback: LatestRemainingEvent | null = null;
  for (const r of rows) {
    const rem = r?.remaining;
    if (typeof rem !== "number" || !Number.isFinite(rem)) continue;
    const ts = r?.cfCreatedAt == null ? Number.NaN : Date.parse(r.cfCreatedAt);
    if (Number.isFinite(ts)) {
      if (best === null || ts > (best.ts as number)) best = { remaining: rem, ts };
    } else if (noTsFallback === null) {
      noTsFallback = { remaining: rem, ts: null };
    }
  }
  return best ?? noTsFallback;
}

/** PURE: latestRemainingEventFromRows'un yalnız-değer sarmalayıcısı (geriye uyum). */
export function latestRemainingFromRows(rows: CfLedgerRow[] | null | undefined): number | null {
  return latestRemainingEventFromRows(rows)?.remaining ?? null;
}

/**
 * Fetch ∪ ledger içinden EN-YENİ bilinen event'in remaining'i (ayna-ratchet koruması).
 * /usage cevabı kısmi/sıra-bozuk gelip ledger'ın ZATEN bildiği en yeni event'ten eski bir
 * aday üretirse, ledger'daki daha yeni değer kazanır — LEAST aynasını bayat-düşük değerle
 * aşağı ratchet'lemek imkânsızlaşır. Yazma-tetikleme koşulları eski davranışla birebir:
 * fetch'te finite aday yoksa null döner (ayna yazılmaz); ledger okunamazsa fetch adayına
 * düşer. Never throws.
 */
export async function resolveFreshestRemaining(
  externalCustomerId: string,
  rows: CfLedgerRow[] | null | undefined,
): Promise<number | null> {
  const fetched = latestRemainingEventFromRows(rows);
  if (fetched === null) return null;
  try {
    const led = await dbSql<{ remaining: unknown; cf_created_at: unknown }[]>`
      SELECT remaining, cf_created_at FROM cf_usage_ledger
      WHERE external_customer_id = ${externalCustomerId}::uuid AND remaining IS NOT NULL
      ORDER BY cf_created_at DESC NULLS LAST LIMIT 1
    `;
    const lr = led[0] == null ? null : numOrNull(led[0].remaining);
    const rawTs = led[0]?.cf_created_at;
    const lts = rawTs == null ? Number.NaN
      : rawTs instanceof Date ? rawTs.getTime()
      : Date.parse(String(rawTs));
    if (lr != null && Number.isFinite(lts) && (fetched.ts == null || lts > fetched.ts)) {
      if (fetched.remaining !== lr) {
        logger.warn(
          { externalCustomerId, fetchedRemaining: fetched.remaining, fetchedTs: fetched.ts, ledgerRemaining: lr, ledgerTs: lts },
          "[cf-ledger] bayat/kısmi /usage cevabı — ledger'daki daha yeni event kazandı (ayna ratchet önlendi)",
        );
      }
      return lr;
    }
  } catch (e) {
    logger.warn({ err: e, externalCustomerId }, "[cf-ledger] resolveFreshestRemaining ledger okuması başarısız — fetch adayı kullanılıyor");
  }
  return fetched.remaining;
}

/**
 * Durable CF mirror sync: write CF's authoritative pool `remaining` into the panel's
 * `cf_remaining` mirror for EVERY active CF-lazy entitlement sharing this CF customer.
 *
 * WHY: the streaming `x-codefast-remaining` header is frequently absent on SSE, so the
 * header-fed mirror freezes for heavy streamers. CF's /usage events carry the real
 * pool-remaining; this refreshes the mirror header-independently on every 3-min poll.
 *
 * SAFE: gated on `cf_units_ordered > 0` (CF-lazy only) AND `status = 'active'` — never
 * touches non-CF / inactive entitlements. Read-from-CF, write-to-mirror ONLY: it does NOT
 * trigger any CF order / top-up (top-up fires on actual request use, not here). Never throws
 * — a mirror failure must not break ingestion.
 *
 * We DELIBERATELY skip `remaining <= 0`: CF orders are async, so right after a top-up-on-use
 * optimistically bumps cf_remaining, the next /usage poll can still read a pre-bump 0 and would
 * clobber the fresh value with a stale 0 (gate blocks for ≤10min until self-heal). Exhaustion is
 * already represented by the success-path mirror + the cap-block, so the poll only needs to cure
 * the frozen-positive-number symptom (remaining > 0). This removes the only wrong-block race.
 */
export async function syncCfRemainingMirror(
  externalCustomerId: string,
  remaining: number | null | undefined,
): Promise<void> {
  try {
    if (remaining == null || !Number.isFinite(remaining)) return;
    if (env.CF_UNIFIED_COUNTER_ENABLED) {
      // TEK SAYAÇ: CF asla YÜKSELTEMEZ (LEAST → koltuk-düşümünü ezmez). remaining<=0 → t=0 yazılabilir
      // (fren cf_remaining<=0 tetiği bu 30sn yoldan da ulaşılsın; eski erken-çıkış bunu engelliyordu).
      const t = Math.max(0, Math.trunc(remaining));
      await dbSql`
        UPDATE user_package_entitlements
        SET cf_remaining = LEAST(COALESCE(cf_remaining, ${t}), ${t}), cf_remaining_at = now(), updated_at = now()
        WHERE cf_customer_id = ${externalCustomerId}
          AND status = 'active'
          AND cf_units_ordered > 0
      `;
      return;
    }
    // Eski davranış (flag KAPALI): remaining<=0 atla, koşulsuz trunc yaz.
    if (remaining <= 0) return;
    await dbSql`
      UPDATE user_package_entitlements
      SET cf_remaining = ${Math.trunc(remaining)}, cf_remaining_at = now(), updated_at = now()
      WHERE cf_customer_id = ${externalCustomerId}
        AND status = 'active'
        AND cf_units_ordered > 0
    `;
  } catch (e) {
    logger.warn({ err: e, externalCustomerId }, "[cf-ledger] cf_remaining mirror sync failed");
  }
}

/** Distinct external_customer_id (= our userId) of every provisioned CF entitlement. */
export async function listCfCustomerIds(): Promise<string[]> {
  const rows = await dbSql<{ cf_customer_id: string }[]>`
    SELECT DISTINCT cf_customer_id
    FROM user_package_entitlements
    WHERE cf_customer_id IS NOT NULL
  `;
  return rows.map((r) => r.cf_customer_id).filter(Boolean);
}

/** Upsert ledger rows; dedup on CF event id (ON CONFLICT DO NOTHING). Returns inserted count. */
export async function upsertCfLedgerRows(rows: CfLedgerRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (const r of rows) {
    const res = await dbSql`
      INSERT INTO cf_usage_ledger (
        cf_event_id, external_customer_id, cf_customer_id, customer_api_key_id,
        request_id, api_slug, cf_status, cost_units, remaining, cf_created_at
      ) VALUES (
        ${r.cfEventId}, ${r.externalCustomerId}::uuid, ${r.cfCustomerId}, ${r.customerApiKeyId},
        ${r.requestId}, ${r.apiSlug}, ${r.cfStatus},
        ${r.costUnits == null ? null : r.costUnits.toString()}::numeric,
        ${r.remaining == null ? null : r.remaining.toString()}::numeric,
        ${r.cfCreatedAt}::timestamptz
      )
      ON CONFLICT (cf_event_id) DO NOTHING
    `;
    inserted += res.count ?? 0;
  }
  return inserted;
}

/** Fetch one customer's CF /usage and persist new events. Never throws. */
export async function ingestCfUsageForCustomer(
  externalCustomerId: string,
): Promise<{ fetched: number; inserted: number }> {
  try {
    const usage = await cfUsage(externalCustomerId);
    const rows = mapCfEventsToLedgerRows(externalCustomerId, usage);
    const inserted = await upsertCfLedgerRows(rows);
    // Durable mirror: refresh cf_remaining from CF's authoritative latest event
    // (header-independent; fetch ∪ ledger en-yenisi — bayat/kısmi cevap ratchet edemez).
    // Own never-throw; must NOT break ledger ingestion.
    await syncCfRemainingMirror(externalCustomerId, await resolveFreshestRemaining(externalCustomerId, rows));
    return { fetched: rows.length, inserted };
  } catch (e) {
    logger.warn({ err: e, externalCustomerId }, "[cf-ledger] ingest failed for customer");
    return { fetched: 0, inserted: 0 };
  }
}

/** Poll every provisioned CF customer and persist new events. Never throws. */
export async function ingestAllCfUsage(): Promise<{ customers: number; fetched: number; inserted: number }> {
  let customers = 0, fetched = 0, inserted = 0;
  try {
    const ids = await listCfCustomerIds();
    for (const id of ids) {
      const r = await ingestCfUsageForCustomer(id);
      customers += 1; fetched += r.fetched; inserted += r.inserted;
    }
  } catch (e) {
    logger.error({ err: e }, "[cf-ledger] ingestAllCfUsage failed");
  }
  if (inserted > 0) logger.info({ customers, fetched, inserted }, "[cf-ledger] ingested CF usage events");
  return { customers, fetched, inserted };
}
