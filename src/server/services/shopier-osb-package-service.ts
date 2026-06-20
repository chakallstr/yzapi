import { db, dbSql } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { grantPackageEntitlement } from "./entitlement-service.js";

/**
 * Shopier OSB → PAKET (entitlement) verme (B2). billing-service'e DOKUNMAZ;
 * mevcut OSB bakiye-yolunun (creditUserBalance) paket ikizidir. Karar mantığı
 * tamamen DEPENDENCY-INJECTED (DB/grant/dead-letter/notify) → DB'siz unit-test
 * edilebilir; route varsayılan (DB-backed) deps'le çağırır.
 *
 * INERT: SHOPIER_OSB_PRODUCT_MAP'te hiçbir entry'de `packageId` yoksa (canlı
 * varsayılan) bu yol HİÇ çağrılmaz; davranış byte-for-byte aynı kalır.
 *
 * Exactly-once: gerçek grant idempotency'si OSB `payments` satırı + ledger
 * `idempotencyKey = osb_<orderid>` UNIQUE ankrajından gelir (bakiye yoluyla aynı
 * mekanizma). `grantEntitlement` `{ already:true }` döndürürse replay'dir → bildirim YOK.
 */

export interface OsbPackageRow {
  id: string;
  enabled: boolean;
  satista: boolean;
  kategori: string;
  sureGun: number;
  gunlukIstekLimiti: number;
  allowedModels: unknown;
}

export interface OsbGrantDeps {
  /** Paketi grant için yükle (null = bilinmeyen/yok). */
  loadPackageForGrant: (packageId: string) => Promise<OsbPackageRow | null>;
  /** Entitlement'ı idempotent ver. `{ already:true }` = replay (önceden verilmiş). */
  grantEntitlement: (params: {
    userId: string;
    packageId: string;
    idempotencyKey: string;
    pkg: OsbPackageRow;
  }) => Promise<{ entitlementId: string; already: boolean }>;
  /** Eşleşme/aktiflik hatası → dead-letter kaydı (mevcut OSB yoluyla aynı tablo). */
  recordDeadLetter: (orderId: string, reason: string, detail: Record<string, unknown>) => Promise<void>;
  /** Taze grant'ta admin'e "ödeme yapıldı/paket verildi" bildir. */
  notifyPaid: (params: { userId: string; packageId: string; orderId: string }) => Promise<void>;
  /** Para alındı ama paket VERİLEMEDİ → admin'e "ödeme sorunu" (insan gerekir). */
  notifyProblem: (params: { userId: string; packageId: string; orderId: string; reason: string }) => Promise<void>;
}

export interface OsbGrantResult {
  granted: boolean;
  alreadyGranted?: boolean;
  deadLetter?: boolean;
  reason?: string;
}

/**
 * Bir paket grant edilebilir mi? (aktif + satışta + bilinen). Salt-karar, yan etki yok.
 */
export function isPackageGrantable(pkg: OsbPackageRow | null): { ok: boolean; reason?: string } {
  if (!pkg) return { ok: false, reason: "unknown_package" };
  // enabled=false → tamamen kapalı; satista=false → "yakında satışta" (henüz satılamaz).
  if (!pkg.enabled || pkg.satista === false) return { ok: false, reason: "package_not_sellable" };
  return { ok: true };
}

export async function grantOsbPackageEntitlement(
  deps: OsbGrantDeps,
  args: { userId: string; packageId: string; orderId: string },
): Promise<OsbGrantResult> {
  const idempotencyKey = `osb_${args.orderId}`;
  const pkg = await deps.loadPackageForGrant(args.packageId);
  const grantable = isPackageGrantable(pkg);
  if (!grantable.ok) {
    // Para alındı ama paket verilemez → dead-letter + odeme_sorunu (insan kontrolü).
    await deps.recordDeadLetter(args.orderId, grantable.reason!, {
      userId: args.userId,
      packageId: args.packageId,
    });
    await deps.notifyProblem({
      userId: args.userId,
      packageId: args.packageId,
      orderId: args.orderId,
      reason: grantable.reason!,
    });
    return { granted: false, deadLetter: true, reason: grantable.reason };
  }

  const r = await deps.grantEntitlement({
    userId: args.userId,
    packageId: args.packageId,
    idempotencyKey,
    pkg: pkg!,
  });
  // Yalnız TAZE grant'ta bildir (replay'de tekrar atma — exactly-once).
  if (!r.already) {
    await deps.notifyPaid({ userId: args.userId, packageId: args.packageId, orderId: args.orderId });
  }
  return { granted: true, alreadyGranted: r.already };
}

// ── DB-backed default deps (route bunu kullanır) ───────────────────────────────

/** Paketi grant için yükle (satista varsayılan true: kolon null ise satışta sayılır). */
export async function loadPackageForGrantDb(packageId: string): Promise<OsbPackageRow | null> {
  const rows = await dbSql<any[]>`
    SELECT id, enabled, satista, kategori, sure_gun, gunluk_istek_limiti, allowed_models
    FROM packages WHERE id = ${packageId} LIMIT 1
  `;
  if (!rows.length) return null;
  const p = rows[0];
  return {
    id: p.id,
    enabled: p.enabled === true,
    satista: p.satista !== false, // null/true → satışta; yalnız açık false kapatır
    kategori: p.kategori ?? "",
    sureGun: Number(p.sure_gun ?? 0),
    gunlukIstekLimiti: Number(p.gunluk_istek_limiti ?? 0),
    allowedModels: p.allowed_models ?? [],
  };
}

/**
 * Idempotent paket grant'ı: ledger satırı (idempotencyKey UNIQUE) + entitlement.
 * UNIQUE çakışması (replay) → already:true, çift grant YOK.
 */
export async function grantEntitlementDb(params: {
  userId: string;
  packageId: string;
  idempotencyKey: string;
  pkg: OsbPackageRow;
}): Promise<{ entitlementId: string; already: boolean }> {
  const ledgerKey = `pkg_${params.idempotencyKey}`; // pkg_osb_<orderid>
  // Replay ön-kontrolü: aynı key ile zaten grant edilmişse mevcut hakkı döndür.
  const dup = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.idempotencyKey, ledgerKey))
    .limit(1);
  if (dup.length) {
    const ent = await dbSql<{ id: string }[]>`
      SELECT id FROM user_package_entitlements
      WHERE purchase_transaction_id = ${dup[0].id}::uuid LIMIT 1
    `;
    return { entitlementId: ent[0]?.id ?? "", already: true };
  }

  try {
    return await dbSql.begin(async (txSql) => {
      const userRows = await txSql<{ email: string }[]>`
        SELECT email FROM users WHERE id = ${params.userId}::uuid LIMIT 1
      `;
      const email = userRows[0]?.email ?? "";
      // Para taşımayan, izlenebilir ledger satırı (miktar 0; paket Shopier'de ödendi).
      const txRows = await txSql<{ id: string }[]>`
        INSERT INTO transactions
          (user_id, user_email, tip, miktar_tl, onceki_bakiye, sonraki_bakiye, aciklama, metod, idempotency_key)
        VALUES
          (${params.userId}::uuid, ${email}, 'paket_satin_alma', 0::numeric,
           0::numeric, 0::numeric, ${"Paket (Shopier OSB): " + params.packageId}, 'shopier_osb', ${ledgerKey})
        RETURNING id
      `;
      const txId = txRows[0].id;
      const { entitlementId } = await grantPackageEntitlement(txSql, {
        userId: params.userId,
        packageId: params.packageId,
        sureGun: params.pkg.sureGun,
        gunlukIstekLimiti: params.pkg.gunlukIstekLimiti,
        allowedModels: params.pkg.allowedModels,
        purchaseTransactionId: txId,
      });
      return { entitlementId, already: false };
    });
  } catch (e) {
    // Eşzamanlı mükerrer (UNIQUE idempotency_key 23505) → çift grant olmadı; replay durumu.
    if ((e as { code?: string })?.code === "23505") {
      const tx = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.idempotencyKey, ledgerKey))
        .limit(1);
      const ent = tx.length
        ? await dbSql<{ id: string }[]>`SELECT id FROM user_package_entitlements WHERE purchase_transaction_id = ${tx[0].id}::uuid LIMIT 1`
        : [];
      return { entitlementId: ent[0]?.id ?? "", already: true };
    }
    logger.error({ err: e, userId: params.userId, packageId: params.packageId }, "OSB package grant failed");
    throw e;
  }
}
