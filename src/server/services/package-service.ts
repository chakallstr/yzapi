import { db, dbSql } from "../db/client.js";
import { packages } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { canonicalizeModelId } from "../../master-models.js";

/** allowedModels'i canonical id'ye çevir (admin tire-formu girse de paket kapsasın). */
function canonicalizeModels(models: string[]): string[] {
  return models.map((m) => canonicalizeModelId(m) ?? m);
}

/** Public katalog: yalnız enabled paketler, gizli alan yok. */
export async function listPublicPackages() {
  const rows = await dbSql<any[]>`
    SELECT id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun,
           allowed_models, fiyat_tl, fiyat_usd, display_order
    FROM packages WHERE enabled = true
    ORDER BY display_order ASC, ad ASC
  `;
  return rows.map(publicShape);
}

export async function getPublicPackage(id: string) {
  const rows = await dbSql<any[]>`
    SELECT id, ad, kategori, aciklama, tip, gunluk_istek_limiti, sure_gun,
           allowed_models, fiyat_tl, fiyat_usd, display_order
    FROM packages WHERE id = ${id} AND enabled = true LIMIT 1
  `;
  return rows.length ? publicShape(rows[0]) : null;
}

function publicShape(r: any) {
  return {
    id: r.id,
    ad: r.ad,
    kategori: r.kategori,
    aciklama: r.aciklama,
    tip: r.tip,
    gunlukIstekLimiti: Number(r.gunluk_istek_limiti),
    sureGun: Number(r.sure_gun),
    allowedModels: r.allowed_models ?? [],
    fiyatTL: Number(r.fiyat_tl),
    fiyatUsd: r.fiyat_usd != null ? Number(r.fiyat_usd) : null,
    displayOrder: Number(r.display_order),
  };
}

/** Admin: tüm paketler (enabled dahil/hariç). */
export async function listAllPackages() {
  return await db.select().from(packages);
}

export interface PackageInput {
  id: string;
  ad: string;
  kategori: string;
  aciklama?: string;
  gunlukIstekLimiti: number;
  sureGun: number;
  allowedModels: string[];
  fiyatTL: number;
  fiyatUsd?: number | null;
  enabled?: boolean;
  displayOrder?: number;
}

export async function createPackage(input: PackageInput) {
  const inserted = await db
    .insert(packages)
    .values({
      id: input.id,
      ad: input.ad,
      kategori: input.kategori,
      aciklama: input.aciklama ?? "",
      tip: "request_limit",
      gunlukIstekLimiti: input.gunlukIstekLimiti,
      sureGun: input.sureGun,
      allowedModels: canonicalizeModels(input.allowedModels),
      fiyatTL: String(input.fiyatTL),
      fiyatUsd: input.fiyatUsd != null ? String(input.fiyatUsd) : null,
      enabled: input.enabled ?? true,
      displayOrder: input.displayOrder ?? 0,
    })
    .returning();
  return inserted[0];
}

export async function updatePackage(id: string, patch: Partial<PackageInput>) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.ad !== undefined) set.ad = patch.ad;
  if (patch.kategori !== undefined) set.kategori = patch.kategori;
  if (patch.aciklama !== undefined) set.aciklama = patch.aciklama;
  if (patch.gunlukIstekLimiti !== undefined) set.gunlukIstekLimiti = patch.gunlukIstekLimiti;
  if (patch.sureGun !== undefined) set.sureGun = patch.sureGun;
  if (patch.allowedModels !== undefined) set.allowedModels = canonicalizeModels(patch.allowedModels);
  if (patch.fiyatTL !== undefined) set.fiyatTL = String(patch.fiyatTL);
  if (patch.fiyatUsd !== undefined) set.fiyatUsd = patch.fiyatUsd != null ? String(patch.fiyatUsd) : null;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.displayOrder !== undefined) set.displayOrder = patch.displayOrder;
  const updated = await db.update(packages).set(set).where(eq(packages.id, id)).returning();
  return updated[0] ?? null;
}

export async function setPackageEnabled(id: string, enabled: boolean) {
  await db.update(packages).set({ enabled, updatedAt: new Date() }).where(eq(packages.id, id));
}

export async function deletePackage(id: string) {
  // güvenli: disable (entitlement FK'ları korunur)
  await setPackageEnabled(id, false);
}

/** Feature flag: paket özelliği tümden açık mı? (system_config.packages_enabled, default true) */
export async function packagesFeatureEnabled(): Promise<boolean> {
  const rows = await dbSql<{ packages_enabled: boolean }[]>`
    SELECT packages_enabled FROM system_config WHERE id = 1 LIMIT 1
  `;
  return rows.length ? rows[0].packages_enabled !== false : true;
}
