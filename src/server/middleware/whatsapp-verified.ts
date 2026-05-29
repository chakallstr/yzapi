import { NextFunction, Request, Response } from "express";
import {
  hasActiveVerifiedWhatsappForUser,
  isWhatsappOtpEnabled,
} from "../services/whatsapp-otp-service.js";
import { ADMIN_EMAIL } from "./admin-auth.js";

export async function requireWhatsappVerified(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isWhatsappOtpEnabled()) {
    next();
    return;
  }

  const userId = req.user?.id || req.apiKey?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const email = String(req.user?.email || "").trim().toLowerCase();
  if (email === ADMIN_EMAIL) {
    next();
    return;
  }

  if (
    req.user &&
    req.path === "/me" &&
    (req.method === "GET" || req.method === "PATCH")
  ) {
    next();
    return;
  }

  if (!(await hasActiveVerifiedWhatsappForUser(userId))) {
    res.status(403).json({
      error: "WhatsApp doğrulaması gerekli.",
      code: "whatsapp_verification_required",
    });
    return;
  }

  next();
}
