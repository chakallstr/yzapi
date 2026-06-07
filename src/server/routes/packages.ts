import { Router } from "express";
import { listPublicPackages, getPublicPackage, packagesFeatureEnabled } from "../services/package-service.js";
import { previewConfigurablePrice } from "../services/package-purchase-service.js";

const router = Router();

router.get("/packages", async (_req, res, next) => {
  try {
    if (!(await packagesFeatureEnabled())) {
      res.status(404).json({ error: "Paket özelliği kapalı" });
      return;
    }
    res.json(await listPublicPackages());
  } catch (e) {
    next(e);
  }
});

router.get("/packages/:id", async (req, res, next) => {
  try {
    if (!(await packagesFeatureEnabled())) {
      res.status(404).json({ error: "Paket özelliği kapalı" });
      return;
    }
    const pkg = await getPublicPackage(req.params.id);
    if (!pkg) {
      res.status(404).json({ error: "Paket bulunamadı" });
      return;
    }
    res.json(pkg);
  } catch (e) {
    next(e);
  }
});

/** GET /api/packages/:id/price-preview?limit=500&days=1
 *  Configurable paket için anlık fiyat hesabı (sunucu taraflı kur).
 */
router.get("/packages/:id/price-preview", async (req, res, next) => {
  try {
    if (!(await packagesFeatureEnabled())) {
      res.status(404).json({ error: "Paket özelliği kapalı" });
      return;
    }
    const limit = parseInt(String(req.query.limit), 10);
    const days = parseInt(String(req.query.days), 10);
    if (!limit || !days || isNaN(limit) || isNaN(days)) {
      res.status(400).json({ error: "limit ve days query parametresi gerekli" });
      return;
    }
    const preview = await previewConfigurablePrice(req.params.id, limit, days);
    res.json(preview);
  } catch (e) {
    next(e);
  }
});

export default router;
