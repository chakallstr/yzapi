/**
 * CodeFast reseller — admin uçları (AYRI router; kirli admin.ts'e dokunmamak için izole).
 * Mount: /api/admin/codefast (adminAuth + requireWhatsappVerified app.ts'te).
 * Owner-only: partner RBAC bu router'a uygulanmaz → her handler'da owner kontrolü.
 *
 * ⚠️ CF maliyeti (cf_reseller_cost_tl) yalnız ADMIN'e döner — public/partner'a ASLA.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { dbSql } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { attachManualCustomerKey } from "../services/codefast-provisioning-service.js";

const router = Router();

// Owner-only guard (req.admin admin-auth tarafından set edilir).
function requireOwner(req: Request, _res: Response, next: NextFunction) {
  const role = (req as unknown as { admin?: { role?: string } }).admin?.role;
  if (role !== "owner") throw new AppError(403, "Bu işlem yalnız hesap sahibine açıktır.");
  next();
}
router.use(requireOwner);

/** CF paketleri + marj (alış vs satış). */
router.get("/packages", async (_req: Request, res: Response) => {
  const rows = await dbSql<any[]>`
    SELECT id, ad, kategori, fiyat_tl, cf_reseller_cost_tl, cf_api_slug, cf_catalog_id,
           cf_manual, cf_token_millions, enabled, satista, gunluk_istek_limiti, sure_gun
    FROM packages WHERE cf_api_slug IS NOT NULL
    ORDER BY ad ASC
  `;
  const packages = rows.map((r) => {
    const satis = Number(r.fiyat_tl);
    const alis = r.cf_reseller_cost_tl == null ? null : Number(r.cf_reseller_cost_tl);
    const marjTl = alis == null ? null : Math.round((satis - alis) * 100) / 100;
    const marjPct = alis == null || satis <= 0 ? null : Math.round(((satis - alis) / satis) * 1000) / 10;
    return {
      id: r.id, ad: r.ad, slug: r.cf_api_slug, manual: r.cf_manual === true,
      tokenMillions: r.cf_token_millions, gunlukLimit: r.gunluk_istek_limiti, sureGun: r.sure_gun,
      alisTl: alis, satisTl: satis, marjTl, marjPct, enabled: r.enabled === true, satista: r.satista === true,
    };
  });
  res.json({ packages });
});

/** Elle teslim bekleyen (Claude) entitlement kuyruğu. */
router.get("/pending-manual", async (_req: Request, res: Response) => {
  const rows = await dbSql<any[]>`
    SELECT e.id, e.user_id, e.package_id, e.cf_api_slug, e.cf_order_id, e.cf_status,
           e.created_at, p.ad AS paket_adi, u.email
    FROM user_package_entitlements e
    JOIN packages p ON p.id = e.package_id
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.cf_status = 'pending_manual' AND e.status = 'active'
    ORDER BY e.created_at ASC
  `;
  res.json({
    pending: rows.map((r) => ({
      entitlementId: r.id, userId: r.user_id, email: r.email, paketAdi: r.paket_adi,
      slug: r.cf_api_slug, cfOrderId: r.cf_order_id, createdAt: r.created_at,
    })),
  });
});

/** Claude elle teslim: CodeFast admin'i teslim ettikten sonra cf_rc_live_ keyi entitlement'a bağla. */
router.post("/entitlements/:id/deliver-manual", async (req: Request, res: Response) => {
  const entitlementId = String(req.params.id ?? "");
  const customerApiKey = String((req.body as { customerApiKey?: string })?.customerApiKey ?? "");
  if (!entitlementId) throw new AppError(400, "entitlementId gerekli");
  if (!customerApiKey) throw new AppError(400, "customerApiKey gerekli");
  const ok = await attachManualCustomerKey(entitlementId, customerApiKey);
  if (!ok) throw new AppError(404, "Entitlement bulunamadı");
  res.json({ success: true, entitlementId, cfStatus: "provisioned" });
});

/** CF canlı katalog (admin görünümü — sync/karar için). */
router.get("/catalog", async (_req: Request, res: Response) => {
  const { cfCatalog } = await import("../services/codefast-reseller-service.js");
  try {
    const cat = await cfCatalog();
    res.json({
      catalog: cat.map((c) => ({
        id: c.id, slug: c.slug, name: c.name, currency: c.currency,
        listTl: c.base_price_amount, resellerCostTl: Math.round(c.base_price_amount * 0.9 * 100) / 100,
        durationDays: c.base_duration_days, limit: c.base_limit_amount,
        manual: c.requires_manual_review, resellable: c.is_resellable,
      })),
    });
  } catch (e) {
    throw new AppError(503, "CodeFast kataloğuna ulaşılamadı: " + (e as Error).message);
  }
});

export default router;
