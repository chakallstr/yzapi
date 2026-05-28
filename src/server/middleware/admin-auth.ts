import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../services/auth-service.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const ADMIN_EMAIL = "cix.crazy666@gmail.com";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

declare global {
  namespace Express {
    interface Request {
      admin?: TokenPayload;
      user?: { id: string; email?: string };
      apiKey?: { id: string; userId: string };
    }
  }
}

export async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
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
      .select({ id: users.id, email: users.email, durum: users.durum })
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
    if (normalizeEmail(user.email) !== ADMIN_EMAIL) {
      res.status(403).json({ error: "Admin email required" });
      return;
    }

    req.user = { id: user.id, email: user.email };
    req.admin = { sub: user.id, role: "admin" };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
