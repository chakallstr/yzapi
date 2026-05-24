import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth-service.js";

export function userAuth(req: Request, res: Response, next: NextFunction): void {
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
    req.user = { id: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
