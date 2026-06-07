import { Router } from "express";
import { adminAuth } from "../middleware/admin-auth.js";
import { allowedTabsForRole } from "../middleware/admin-permissions.js";

const router = Router();

// POST /api/admin/login
router.post("/login", (_req, res) => {
  res.status(410).json({
    error: "Admin girişi ayrı şifreyle yapılmaz. Yetkili Google hesabıyla giriş yapın.",
  });
});

// POST /api/admin/logout (client discards token; server just acks)
router.post("/logout", (_req, res) => {
  res.json({ success: true });
});

// GET /api/admin/me
router.get("/me", adminAuth, (req, res) => {
  const role = req.adminRole ?? "owner";
  res.json({
    role,
    sub: req.admin?.sub,
    email: req.user?.email,
    allowedTabs: allowedTabsForRole(role),
  });
});

export default router;
