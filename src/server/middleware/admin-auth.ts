import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../services/auth-service.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { recordAuthFailure, hashIp } from "../services/gozcu/metrics-collector.js";
import { requiredRoleFor, AdminRole } from "./admin-permissions.js";

export const ADMIN_EMAIL = "cix.crazy666@gmail.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

declare global {
  namespace Express {
    interface Request {
      admin?: TokenPayload;
      adminRole?: AdminRole;
      user?: { id: string; email?: string };
      apiKey?: { id: string; userId: string };
    }
  }
}

export async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    recordAuthFailure(hashIp(req.ip)); // Gözcü: auth_failure_spike sinyali
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAccessToken(auth.slice(7));
    if (payload.role !== "user") {
      res.status(401).json({ error: "User token required" });
      return;
    }

    const rows = await db
      .select({ id: users.id, email: users.email, durum: users.durum, role: users.role })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!rows.length) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const user = rows[0];
    if (user.durum !== "aktif") {
      res.status(403).json({ error: "User account is not active" });
      return;
    }

    // Rol çözümleme: owner her zaman e-posta ile (DB'ye bağlı değil); partner DB rolünden.
    let adminRole: AdminRole | null = null;
    if (normalizeEmail(user.email) === ADMIN_EMAIL) adminRole = "owner";
    else if (user.role === "partner") adminRole = "partner";

    if (!adminRole) {
      res.status(403).json({ error: "Admin email required" });
      return;
    }

    // Yetki (fail-closed): partner yalnız izinli uçlara; owner her şeye.
    if (adminRole === "partner") {
      const required = requiredRoleFor(req.method, req.baseUrl + req.path);
      if (required !== "partner") {
        recordAuthFailure(hashIp(req.ip));
        res.status(403).json({ error: "Bu işlem için yetkiniz yok" });
        return;
      }
    }

    req.user = { id: user.id, email: user.email };
    req.admin = { sub: user.id, role: "admin" };
    req.adminRole = adminRole;
    next();
  } catch {
    recordAuthFailure(hashIp(req.ip));
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
