import { Request, Response, NextFunction } from "express";
import { validateApiKey } from "../services/api-key-service.js";

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer yzk_live_")) {
    res.status(401).json({ error: "Valid yzk_live_ API key required" });
    return;
  }

  const result = await validateApiKey(auth.slice(7));
  if (!result) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.apiKey = { id: result.key.id, userId: result.user.id };
  req.user = { id: result.user.id, email: result.user.email };
  next();
}
