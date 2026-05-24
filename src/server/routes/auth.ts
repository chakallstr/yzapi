import { Router } from "express";
import { randomUUID } from "crypto";
import {
  buildAuthUrl,
  exchangeCode,
  verifyIdToken,
  isGoogleConfigured,
} from "../services/google-oauth-service.js";
import { signAccessToken, signRefreshToken, rotateRefreshToken, revokeRefreshToken } from "../services/auth-service.js";
import { welcomeEmail } from "../services/email-service.js";
import { db } from "../db/client.js";
import { users, auditLogs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const router = Router();

// In-memory state store (UUID → expiry) — TTL 5 min
const oauthStates = new Map<string, number>();

function pruneStates(): void {
  const now = Date.now();
  for (const [k, exp] of oauthStates) {
    if (exp < now) oauthStates.delete(k);
  }
}

// GET /api/auth/google
router.get("/google", (req, res) => {
  if (!isGoogleConfigured()) {
    res.status(503).json({ error: "google oauth not configured" });
    return;
  }

  pruneStates();
  const state = randomUUID();
  oauthStates.set(state, Date.now() + 5 * 60 * 1000);

  const url = buildAuthUrl(state);
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

    pruneStates();
    if (!oauthStates.has(state) || oauthStates.get(state)! < Date.now()) {
      res.status(400).json({ error: "Invalid or expired state" });
      return;
    }
    oauthStates.delete(state);

    const { idToken } = await exchangeCode(code);
    const profile = await verifyIdToken(idToken);

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
    }

    await db.insert(auditLogs).values({
      action: isNew ? "user_signup" : "user_login",
      hedef: userId,
      ozet: `Google OAuth: ${profile.email}`,
      actorId: userId,
    });

    const accessToken = signAccessToken({ sub: userId, role: "user" });
    const refreshToken = await signRefreshToken(userId);

    const returnUrl = `${env.APP_BASE_URL}${env.FRONTEND_AUTH_RETURN}?at=${encodeURIComponent(accessToken)}&rt=${encodeURIComponent(refreshToken)}`;
    res.redirect(returnUrl);
  } catch (e) {
    next(e);
  }
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
