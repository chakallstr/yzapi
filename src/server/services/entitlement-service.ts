import { db, dbSql } from "../db/client.js";
import { usageRecords } from "../db/schema.js";

export interface PackageCoverage {
  covered: boolean;
  entitlementId?: string;
}

/** Salt-okunur: bu modeli kapsayan, süresi geçmemiş, bugün kotası dolmamış aktif hak var mı? */
export async function checkPackageCoverage(userId: string, modelId: string): Promise<boolean> {
  const rows = await dbSql<{ id: string }[]>`
    SELECT id FROM user_package_entitlements
    WHERE user_id = ${userId}::uuid
      AND status = 'active'
      AND expires_at > now()
      AND allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
      AND (last_reset_date < CURRENT_DATE OR requests_today < daily_limit_snapshot)
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Atomik: en erken biten kapsayan haktan bir günlük slot rezerve et. */
export async function tryReservePackageSlot(userId: string, modelId: string): Promise<PackageCoverage> {
  const rows = await dbSql<{ id: string }[]>`
    UPDATE user_package_entitlements AS upe
    SET requests_today = CASE WHEN upe.last_reset_date < CURRENT_DATE THEN 1 ELSE upe.requests_today + 1 END,
        last_reset_date = CURRENT_DATE,
        updated_at = now()
    WHERE upe.id = (
      SELECT id FROM user_package_entitlements
      WHERE user_id = ${userId}::uuid
        AND status = 'active'
        AND expires_at > now()
        AND allowed_models_snapshot @> ${JSON.stringify([modelId])}::jsonb
        AND (last_reset_date < CURRENT_DATE OR requests_today < daily_limit_snapshot)
      ORDER BY expires_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING upe.id
  `;
  if (rows.length) return { covered: true, entitlementId: rows[0].id };
  return { covered: false };
}

/** Hata durumunda slot iadesi (K1'in kota ikizi). */
export async function releasePackageSlot(entitlementId: string): Promise<void> {
  await dbSql`
    UPDATE user_package_entitlements
    SET requests_today = GREATEST(requests_today - 1, 0), updated_at = now()
    WHERE id = ${entitlementId}::uuid
  `;
}

/** Paket isteği için usage_records satırı (costTL=0, billed_via='package'). */
export async function recordPackageUsage(opts: {
  userId: string;
  apiKeyId: string;
  modelId: string;
  entitlementId: string;
  inputUsage: number;
  outputUsage: number;
  responseMs: number;
  status: "success" | "error";
  requestId: string;
  upstreamRequestId?: string;
  errorCode?: string;
}): Promise<void> {
  await db.insert(usageRecords).values({
    userId: opts.userId,
    apiKeyId: opts.apiKeyId,
    modelId: opts.modelId,
    type: "Metin",
    inputUsage: opts.inputUsage,
    outputUsage: opts.outputUsage,
    costUsd: "0",
    costTL: "0",
    requestId: opts.requestId,
    upstreamRequestId: opts.upstreamRequestId,
    errorCode: opts.errorCode,
    responseMs: opts.responseMs,
    status: opts.status,
    billedVia: "package",
    entitlementId: opts.entitlementId,
  }).onConflictDoNothing();
}

/**
 * Bir kullanıcıya paket entitlement'ı VER (aktif aynı paket varsa süreyi uzat, yoksa oluştur).
 * Bir transaction içinde çağrılır (txSql). purchase (bakiye) ve redeem (kod) ORTAK kullanır.
 * Snapshot (daily_limit, allowed_models) burada dondurulur. Para taşımaz.
 */
export async function grantPackageEntitlement(
  txSql: any,
  params: {
    userId: string;
    packageId: string;
    sureGun: number;
    gunlukIstekLimiti: number;
    allowedModels: unknown;
    purchaseTransactionId?: string | null;
  },
): Promise<string> {
  const allowedJson = JSON.stringify(params.allowedModels ?? []);
  const txId = params.purchaseTransactionId ?? null;

  const existing = await txSql<{ id: string }[]>`
    SELECT id FROM user_package_entitlements
    WHERE user_id = ${params.userId}::uuid AND package_id = ${params.packageId}
      AND status = 'active' AND expires_at > now()
    ORDER BY expires_at DESC LIMIT 1
  `;
  if (existing.length) {
    const ext = await txSql<{ id: string }[]>`
      UPDATE user_package_entitlements
      SET expires_at = expires_at + (${params.sureGun}::int * interval '1 day'),
          daily_limit_snapshot = ${params.gunlukIstekLimiti}::int,
          allowed_models_snapshot = ${allowedJson}::jsonb,
          purchase_transaction_id = ${txId}::uuid,
          updated_at = now()
      WHERE id = ${existing[0].id}::uuid
      RETURNING id
    `;
    return ext[0].id;
  }
  const ins = await txSql<{ id: string }[]>`
    INSERT INTO user_package_entitlements
      (user_id, package_id, daily_limit_snapshot, allowed_models_snapshot,
       activated_at, expires_at, status, requests_today, last_reset_date, purchase_transaction_id)
    VALUES
      (${params.userId}::uuid, ${params.packageId}, ${params.gunlukIstekLimiti}::int, ${allowedJson}::jsonb,
       now(), now() + (${params.sureGun}::int * interval '1 day'), 'active', 0, CURRENT_DATE, ${txId}::uuid)
    RETURNING id
  `;
  return ins[0].id;
}

export interface ActiveEntitlement {
  id: string;
  packageId: string;
  paketAdi: string;
  kategori: string;
  gunlukLimit: number;
  kalanBugun: number;
  expiresAt: string;
  allowedModels: string[];
}

export async function listUserEntitlements(userId: string): Promise<ActiveEntitlement[]> {
  const rows = await dbSql<any[]>`
    SELECT e.id, e.package_id, p.ad AS paket_adi, p.kategori,
           e.daily_limit_snapshot,
           CASE WHEN e.last_reset_date < CURRENT_DATE THEN 0 ELSE e.requests_today END AS requests_today,
           e.expires_at, e.allowed_models_snapshot
    FROM user_package_entitlements e
    JOIN packages p ON p.id = e.package_id
    WHERE e.user_id = ${userId}::uuid AND e.status = 'active' AND e.expires_at > now()
    ORDER BY e.expires_at ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    packageId: r.package_id,
    paketAdi: r.paket_adi,
    kategori: r.kategori,
    gunlukLimit: Number(r.daily_limit_snapshot),
    kalanBugun: Math.max(0, Number(r.daily_limit_snapshot) - Number(r.requests_today)),
    expiresAt: r.expires_at,
    allowedModels: r.allowed_models_snapshot ?? [],
  }));
}
