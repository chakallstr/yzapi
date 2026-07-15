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

// Google JWKS fetch'i, 2026-07-06'da CANLIDA kanıtlanan aralıklı ağ-stall'ına karşı sertleştirildi:
// sağlıklı fetch <1s tamamlanır; nadir bir kuyruk (~%1) bağlantıyı black-hole eder ve >5s askıda kalır.
// Kısa timeout + retry = hızlı başarısız ol, TAZE bağlantıyla tekrar dene. jose başarısız reload sonrası
// cooldown'a GİRMEZ (#jwksTimestamp yalnız başarıda set edilir) → retry gerçekten yeni bir fetch tetikler.
const JWKS_TIMEOUT_MS = 3000;
const TOKEN_FETCH_TIMEOUT_MS = 8000;
const AUTH_MAX_ATTEMPTS = 3; // 1 deneme + 2 retry

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: JWKS_TIMEOUT_MS }
);
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

function isTransientNetworkError(e: unknown): boolean {
  const err = e as { code?: string; name?: string } | undefined;
  return (
    err?.code === "ERR_JWKS_TIMEOUT" ||
    err?.name === "JWKSTimeout" ||
    err?.name === "TimeoutError" ||
    err?.name === "AbortError" ||
    err?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    err?.code === "UND_ERR_HEADERS_TIMEOUT" ||
    err?.code === "ECONNRESET" ||
    err?.code === "ETIMEDOUT"
  );
}

// Yalnız GEÇİCİ ağ hatalarında retry eder; imza/audience/issuer gibi kalıcı hatalar hemen fırlatılır.
async function retryTransient<T>(fn: () => Promise<T>, attempts = AUTH_MAX_ATTEMPTS): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isTransientNetworkError(e) || i === attempts - 1) throw e;
    }
  }
  throw lastErr;
}

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
    // Bounded timeout: token endpoint stall'ında sonsuz askıda kalmayı önler (auth code single-use → retry YOK).
    signal: AbortSignal.timeout(TOKEN_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

  const data = await res.json() as { id_token: string; access_token: string };
  return { idToken: data.id_token, accessToken: data.access_token };
}

export async function verifyIdToken(idToken: string): Promise<GoogleProfile> {
  if (!isGoogleConfigured()) throw new Error("google oauth not configured");

  // Geçici JWKS fetch timeout'unda retry (kanıtlanan kök neden). Kalıcı hatalar retry'lanmaz.
  const { payload } = await retryTransient(() =>
    jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: "https://accounts.google.com",
      audience: env.GOOGLE_CLIENT_ID!,
    })
  );

  return {
    sub: payload.sub as string,
    email: payload["email"] as string,
    email_verified: payload["email_verified"] as boolean,
    name: payload["name"] as string,
    picture: payload["picture"] as string,
  };
}
