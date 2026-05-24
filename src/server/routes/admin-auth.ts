import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { signAccessToken } from "../services/auth-service.js";
import { adminAuth } from "../middleware/admin-auth.js";
import { env } from "../lib/env.js";
import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";

const router = Router();

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still compare to avoid timing leak on length differences
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// POST /api/admin/login
router.post("/login", async (req, res, next) => {
  try {
    const { password } = req.body as { password?: string };
    if (!password || !constantTimeCompare(password, env.ADMIN_PASSWORD)) {
      await db.insert(auditLogs).values({
        action: "admin_login_failed",
        hedef: "admin",
        ozet: "Wrong admin password attempt",
      });
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    const token = signAccessToken({ sub: "admin", role: "admin" });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await db.insert(auditLogs).values({
      action: "admin_login",
      hedef: "admin",
      ozet: "Admin logged in",
    });

    res.json({ token, expiresAt });
  } catch (e) {
    next(e);
  }
});

// POST /api/admin/logout (client discards token; server just acks)
router.post("/logout", (_req, res) => {
  res.json({ success: true });
});

// GET /api/admin/me
router.get("/me", adminAuth, (req, res) => {
  res.json({ role: "admin", sub: req.admin?.sub });
});

export default router;
