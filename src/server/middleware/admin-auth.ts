import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../services/auth-service.js";

declare global {
  namespace Express {
    interface Request {
      admin?: TokenPayload;
      user?: { id: string; email?: string };
      apiKey?: { id: string; userId: string };
    }
  }
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyAccessToken(auth.slice(7));
    if (payload.role !== "admin") {
      res.status(401).json({ error: "Admin role required" });
      return;
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
