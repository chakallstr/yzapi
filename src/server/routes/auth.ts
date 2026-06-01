import { Router } from "express";
import {
  buildAuthUrl,
  createOAuthState,
  exchangeCode,
  verifyIdToken,
  verifyOAuthState,
  isGoogleConfigured,
} from "../services/google-oauth-service.js";
import {
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken,
  signWhatsappPendingToken,
  verifyWhatsappPendingToken,
} from "../services/auth-service.js";
import { welcomeEmail } from "../services/email-service.js";
import { notifyAdmin } from "../services/admin-notify-service.js";
import { grantSignupBonusIfEligible } from "../services/signup-bonus-service.js";
import {
  hasActiveVerifiedWhatsappForUser,
  isWhatsappOtpEnabled,
  resendWhatsappOtp,
  startWhatsappOtp,
  verifyWhatsappOtp,
} from "../services/whatsapp-otp-service.js";
import { db } from "../db/client.js";
import { users, auditLogs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const router = Router();

function buildFrontendReturnUrl(params: Record<string, string>): string {
  const url = new URL(env.FRONTEND_AUTH_RETURN, env.APP_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function readPendingToken(req: { headers: Record<string, unknown>; body?: unknown }): string | null {
  const header = String(req.headers.authorization || "");
  if (header.startsWith("Bearer ")) return header.slice(7);
  const body = req.body as { pendingToken?: unknown } | undefined;
  return typeof body?.pendingToken === "string" ? body.pendingToken : null;
}

// GET /api/auth/google
router.get("/google", (req, res) => {
  if (!isGoogleConfigured()) {
    res.status(503).json({ error: "google oauth not configured" });
    return;
  }

  const url = buildAuthUrl(createOAuthState());
  res.redirect(url);
});

// GET /api/auth/google/callback
router.get("/google/callback", async (req, res, next) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }

    if (!verifyOAuthState(state)) {
      res.status(400).json({ error: "Invalid or expired state" });
      return;
    }

    const { idToken } = await exchangeCode(code);
    const profile = await verifyIdToken(idToken);

    if (!profile.email_verified) {
      res.status(403).json({ error: "Google e-posta doğrulaması gerekli." });
      return;
    }

    // Upsert user
    const existing = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);

    let userId: string;
    let isNew = false;

    if (existing.length) {
      userId = existing[0].id;
      // Update googleId if first time OAuth
      if (!existing[0].googleId) {
        await db.update(users).set({ googleId: profile.sub, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    } else {
      const inserted = await db.insert(users).values({
        email: profile.email,
        adSoyad: profile.name || profile.email,
        googleId: profile.sub,
        bakiyeTL: "0",
        plan: "ucretsiz",
      }).returning();
      userId = inserted[0].id;
      isNew = true;

      // Fire-and-forget welcome email — must NOT block auth flow
      welcomeEmail({ email: profile.email, adSoyad: profile.name || profile.email }).catch((e) =>
        logger.error({ err: e }, "[auth] welcome email failed"),
      );

      // Admin'e yeni üye bildirimi (WhatsApp) — fire-and-forget, akışı bloklamaz.
      notifyAdmin({
        kind: "yeni_uye",
        title: "Yeni üye kaydı",
        userEmail: profile.email,
      }).catch((e) => logger.error({ err: e }, "[auth] admin notify (signup) failed"));
    }

    await db.insert(auditLogs).values({
      action: isNew ? "user_signup" : "user_login",
      hedef: userId,
      ozet: `Google OAuth: ${profile.email}`,
      actorId: userId,
    });

    if (isWhatsappOtpEnabled() && !(await hasActiveVerifiedWhatsappForUser(userId))) {
      await db.insert(auditLogs).values({
        action: "user_whatsapp_otp_pending",
        hedef: userId,
        ozet: `WhatsApp OTP bekliyor: ${profile.email}`,
        actorId: userId,
      });
      const pendingToken = signWhatsappPendingToken({ sub: userId, email: profile.email, isNew });
      res.redirect(buildFrontendReturnUrl({ wv: "required", wpt: pendingToken }));
      return;
    }

    // Deneme bonusu: SADECE GERÇEKTEN YENİ kullanıcıya (isNew). Mevcut kullanıcı
    // tekrar giriş yaptığında bonus ALMAZ. WhatsApp OTP kapalıyken (telefon gate'i
    // yok) burada IP sinyaliyle verilir. OTP açıkken bonus, telefon doğrulaması
    // başarılı olunca whatsapp-otp/verify ucunda verilir (1 telefon = 1 bonus).
    // grantSignupBonusIfEligible idempotent + abuse-korumalı; auth akışını bloklamaz.
    if (isNew && !isWhatsappOtpEnabled()) {
      await grantSignupBonusIfEligible(userId, { ip: req.ip }).catch((e) =>
        logger.error({ err: e, userId }, "[auth] signup bonus failed"),
      );
    }

    const accessToken = signAccessToken({ sub: userId, role: "user" });
    const refreshToken = await signRefreshToken(userId);

    res.redirect(buildFrontendReturnUrl({ at: accessToken, rt: refreshToken }));
  } catch (e) {
    next(e);
  }
});

// POST /api/auth/whatsapp-otp/start
router.post("/whatsapp-otp/start", async (req, res, next) => {
  try {
    if (!isWhatsappOtpEnabled()) {
      res.status(503).json({ error: "WhatsApp doğrulaması şu an kapalı." });
      return;
    }

    const pendingToken = readPendingToken(req);
    if (!pendingToken) {
      res.status(401).json({ error: "WhatsApp doğrulama oturumu gerekli." });
      return;
    }
    const pending = verifyWhatsappPendingToken(pendingToken);
    const { phone } = req.body as { phone?: string };
    if (!phone) {
      res.status(400).json({ error: "phone required" });
      return;
    }

    const result = await startWhatsappOtp({
      userId: pending.sub,
      phone,
      ip: req.ip,
      userAgent: req.get("user-agent") || "",
    });

    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/auth/whatsapp-otp/resend
router.post("/whatsapp-otp/resend", async (req, res, next) => {
  try {
    if (!isWhatsappOtpEnabled()) {
      res.status(503).json({ error: "WhatsApp doğrulaması şu an kapalı." });
      return;
    }

    const pendingToken = readPendingToken(req);
    if (!pendingToken) {
      res.status(401).json({ error: "WhatsApp doğrulama oturumu gerekli." });
      return;
    }
    const pending = verifyWhatsappPendingToken(pendingToken);
    const { verificationId } = req.body as { verificationId?: string };
    if (!verificationId) {
      res.status(400).json({ error: "verificationId required" });
      return;
    }

    const result = await resendWhatsappOtp({
      userId: pending.sub,
      verificationId,
      ip: req.ip,
      userAgent: req.get("user-agent") || "",
    });

    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/auth/whatsapp-otp/verify
router.post("/whatsapp-otp/verify", async (req, res, next) => {
  try {
    if (!isWhatsappOtpEnabled()) {
      res.status(503).json({ error: "WhatsApp doğrulaması şu an kapalı." });
      return;
    }

    const pendingToken = readPendingToken(req);
    if (!pendingToken) {
      res.status(401).json({ error: "WhatsApp doğrulama oturumu gerekli." });
      return;
    }
    const pending = verifyWhatsappPendingToken(pendingToken);
    const { verificationId, code, marketingConsent } = req.body as {
      verificationId?: string;
      code?: string;
      marketingConsent?: boolean;
    };
    if (!verificationId || !code) {
      res.status(400).json({ error: "verificationId and code required" });
      return;
    }

    const verified = await verifyWhatsappOtp({
      userId: pending.sub,
      verificationId,
      code,
      marketingConsent,
      ip: req.ip,
      userAgent: req.get("user-agent") || "",
    });

    await db.insert(auditLogs).values({
      action: "user_whatsapp_otp_verified",
      hedef: pending.sub,
      ozet: `WhatsApp doğrulandı: ${pending.email}`,
      actorId: pending.sub,
    });

    // Deneme bonusu: SADECE GERÇEKTEN YENİ üyeye (pending token'daki isNew). OTP
    // açık yolda telefon doğrulaması BAŞARILI olunca verilir — verifyWhatsappOtp
    // phone_hash UNIQUE guard'ı (1 telefon=1 doğrulama) en güçlü abuse gate'idir.
    // Mevcut kullanıcı (isNew=false) WhatsApp doğrulasa bile bonus ALMAZ.
    // Idempotent (hesap başına 1 kez); auth akışını bloklamaz.
    if (pending.isNew) {
      await grantSignupBonusIfEligible(pending.sub, { ip: req.ip }).catch((e) =>
        logger.error({ err: e, userId: pending.sub }, "[auth] signup bonus (whatsapp) failed"),
      );
    }

    const accessToken = signAccessToken({ sub: pending.sub, role: "user" });
    const refreshToken = await signRefreshToken(pending.sub);
    res.json({ accessToken, refreshToken, ...verified });
  } catch (e) { next(e); }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken required" });
      return;
    }
    const tokens = await rotateRefreshToken(refreshToken);
    res.json(tokens);
  } catch (e: any) {
    res.status(401).json({ error: e.message || "Invalid refresh token" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) await revokeRefreshToken(refreshToken);
  res.json({ success: true });
});

export default router;
