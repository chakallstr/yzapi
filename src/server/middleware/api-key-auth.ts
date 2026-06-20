import { Request, Response, NextFunction } from "express";
import { validateApiKey } from "../services/api-key-service.js";
import { recordAuthFailure, hashIp } from "../services/gozcu/metrics-collector.js";

// Müşteri anahtarını iki şemadan da çıkar:
//  - `Authorization: Bearer yzk_live_...` (OpenAI-uyumlu istemciler, Claude Code)
//  - `x-api-key: yzk_live_...` (Anthropic-native: Claude Desktop "Configure
//    Third-Party Inference", Anthropic SDK). Böylece yzapi gerçek bir
//    Anthropic-uyumlu gateway olur. Yalnız `yzk_live_` ile başlayan değer geçerli.
function extractProxyApiKey(req: Request): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string") return xKey;
  if (Array.isArray(xKey) && xKey.length > 0) return xKey[0];
  return "";
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = extractProxyApiKey(req);
  if (!apiKey.startsWith("yzk_live_")) {
    recordAuthFailure(hashIp(req.ip)); // Gözcü: auth_failure_spike sinyali
    res.status(401).json({ error: "Valid yzk_live_ API key required" });
    return;
  }

  const result = await validateApiKey(apiKey);
  if (!result) {
    recordAuthFailure(hashIp(req.ip));
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.apiKey = { id: result.key.id, userId: result.user.id };
  req.user = { id: result.user.id, email: result.user.email };
  next();
}
