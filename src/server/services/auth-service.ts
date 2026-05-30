import bcrypt from "bcrypt";
import jwt, { JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { env } from "../lib/env.js";

export interface TokenPayload {
  sub: string;
  role: "admin" | "user";
  jti?: string;
}

export interface WhatsappPendingPayload {
  sub: string;
  email: string;
  isNew?: boolean;
  type: "whatsapp_pending";
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload: { sub: string; role: "admin" | "user" }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL_SEC });
}

export function signWhatsappPendingToken(payload: { sub: string; email: string; isNew?: boolean }): string {
  return jwt.sign({ ...payload, type: "whatsapp_pending" }, env.JWT_SECRET, {
    expiresIn: env.WHATSAPP_PENDING_TTL_SEC,
  });
}

export function verifyWhatsappPendingToken(token: string): WhatsappPendingPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload & WhatsappPendingPayload;
  if (payload.type !== "whatsapp_pending" || !payload.sub || !payload.email) {
    throw new Error("Invalid WhatsApp pending token");
  }
  return { sub: payload.sub, email: payload.email, isNew: payload.isNew === true, type: "whatsapp_pending" };
}

export async function signRefreshToken(userId: string): Promise<string> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SEC * 1000);

  await db.insert(sessions).values({
    userId,
    jti,
    tip: "refresh",
    expiresAt,
    revoked: false,
  });

  return jwt.sign({ sub: userId, jti, type: "refresh" }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL_SEC,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload & TokenPayload;
  if (!payload.sub || !payload.role) throw new Error("Invalid token payload");
  return { sub: payload.sub, role: payload.role, jti: payload.jti };
}

export async function rotateRefreshToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = jwt.verify(refreshToken, env.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload & {
    sub: string;
    jti: string;
    type: string;
  };

  if (payload.type !== "refresh") throw new Error("Not a refresh token");

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.jti, payload.jti))
    .limit(1);

  if (!rows.length || rows[0].revoked) throw new Error("Refresh token revoked or not found");
  if (new Date(rows[0].expiresAt) < new Date()) throw new Error("Refresh token expired");

  // Revoke old
  await db.update(sessions).set({ revoked: true }).where(eq(sessions.jti, payload.jti));

  // Lookup role for this user — for now user tokens are always "user"
  const accessToken = signAccessToken({ sub: payload.sub, role: "user" });
  const newRefreshToken = await signRefreshToken(payload.sub);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    const payload = jwt.verify(refreshToken, env.JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload & { jti: string };
    await db.update(sessions).set({ revoked: true }).where(eq(sessions.jti, payload.jti));
  } catch {
    // Already invalid — fine
  }
}
