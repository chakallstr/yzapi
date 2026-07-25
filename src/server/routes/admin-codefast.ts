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

// Owner-only guard. ⚠️ req.admin.role HER ZAMAN "admin"tir; gerçek rol req.adminRole
// ("owner"|"partner") — admin-auth.ts set eder. Owner kontrolü ONU okumalı.
function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if ((req as unknown as { adminRole?: string }).adminRole !== "owner") {
    throw new AppError(403, "Bu işlem yalnız hesap sahibine açıktır.");
  }
  next();
}
router.use(requireOwner);

/** CF paketleri + marj (alış vs satış). */
router.get("/packages", async (_req: Request, res: Response) => {
  const rows = await dbSql<any[]>`
    SELECT id, ad, kategori, fiyat_tl, cf_reseller_cost_tl, cf_api_slug, cf_catalog_id,
           cf_manual, cf_token_millions, cf_template_id, enabled, satista, gunluk_istek_limiti, sure_gun
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
      templateId: r.cf_template_id ?? null,
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

/** CF kayıtlı paket şablonları (admin: pakete bağlamak için template id seç). */
router.get("/templates", async (_req: Request, res: Response) => {
  const { cfListTemplates } = await import("../services/codefast-reseller-service.js");
  try {
    const tpls = await cfListTemplates();
    res.json({
      templates: tpls.map((t) => ({
        id: t.id, name: t.name, status: t.status, currency: t.currency,
        durationDays: t.duration_days, itemCount: t.item_count ?? null, itemsSummary: t.items_summary ?? null,
      })),
    });
  } catch {
    throw new AppError(503, "CodeFast şablonlarına ulaşılamadı");
  }
});

/**
 * Bir CF paketini şablona bağla/çöz (deploy GEREKMEZ — provisioning her satın almada DB'den taze okur).
 * Body: { templateId: string|null }. Doluysa order template_id ile, null/boş ise items[catalog_id] akışı.
 */
router.post("/packages/:id/template", async (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");
  if (!id) throw new AppError(400, "packageId gerekli");
  const raw = (req.body as { templateId?: unknown })?.templateId;
  let templateId: string | null;
  if (raw === null || raw === undefined || raw === "") {
    templateId = null;
  } else if (typeof raw === "string" && /^[A-Za-z0-9-]{6,64}$/.test(raw.trim())) {
    templateId = raw.trim();
  } else {
    throw new AppError(400, "Geçersiz templateId (boş bırak veya geçerli şablon id'si gir)");
  }
  const rows = await dbSql<{ id: string }[]>`
    UPDATE packages SET cf_template_id = ${templateId}, updated_at = now()
    WHERE id = ${id} AND cf_api_slug IS NOT NULL
    RETURNING id
  `;
  if (!rows.length) throw new AppError(404, "CodeFast paketi bulunamadı");
  res.json({ success: true, packageId: id, templateId });
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
  } catch {
    throw new AppError(503, "CodeFast kataloğuna ulaşılamadı");
  }
});

export default router;
