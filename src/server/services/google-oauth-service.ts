import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../lib/env.js";

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

export function isGoogleConfigured(): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function base64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signStatePayload(payload: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
}

export function createOAuthState(now = Date.now()): string {
  const payload = base64Url(JSON.stringify({ nonce: randomUUID(), exp: now + OAUTH_STATE_TTL_MS }));
  return `${payload}.${signStatePayload(payload)}`;
}

export function verifyOAuthState(state: string, now = Date.now()): boolean {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) return false;

  const expected = signStatePayload(payload);
  const actualBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof parsed.exp === "number" && parsed.exp >= now;
  } catch {
    return false;
  }
}

export function buildAuthUrl(state: string): string {
  if (!isGoogleConfigured()) throw new Error("google oauth not configured");

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(
  code: string
): Promise<{ idToken: string; accessToken: string }> {
  if (!isGoogleConfigured()) throw new Error("google oauth not configured");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

  const data = await res.json() as { id_token: string; access_token: string };
  return { idToken: data.id_token, accessToken: data.access_token };
}

export async function verifyIdToken(idToken: string): Promise<GoogleProfile> {
  if (!isGoogleConfigured()) throw new Error("google oauth not configured");

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: "https://accounts.google.com",
    audience: env.GOOGLE_CLIENT_ID!,
  });

  return {
    sub: payload.sub as string,
    email: payload["email"] as string,
    email_verified: payload["email_verified"] as boolean,
    name: payload["name"] as string,
    picture: payload["picture"] as string,
  };
}
