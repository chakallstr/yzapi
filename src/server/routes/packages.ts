import { Router } from "express";
import { listPublicPackages, getPublicPackage, packagesFeatureEnabled } from "../services/package-service.js";

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

export default router;
