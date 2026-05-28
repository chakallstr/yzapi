import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth-service.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function userAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Let API keys pass through to api-key-auth middleware
  const token = auth.slice(7);
  if (token.startsWith("yzk_live_")) {
    res.status(401).json({ error: "Use API key auth endpoint" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== "user") {
      res.status(401).json({ error: "User role required" });
      return;
    }

    const rows = await db
      .select({ id: users.id, email: users.email, durum: users.durum })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!rows.length || rows[0].durum !== "aktif") {
      res.status(403).json({ error: "User account is not active" });
      return;
    }

    req.user = { id: rows[0].id, email: rows[0].email };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
