import { env } from "../lib/env.js";
import { createOAuthState, verifyOAuthState } from "./google-oauth-service.js";

// State HMAC google-oauth-service ile ortak (JWT_SECRET imzalı, 5dk TTL).
export { createOAuthState, verifyOAuthState };

export interface GitHubProfile {
  id: string;
  email: string;
  name: string;
}

export function isGithubConfigured(): boolean {
  return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

export function buildGithubAuthUrl(state: string): string {
  if (!isGithubConfigured()) throw new Error("github oauth not configured");
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID!,
    redirect_uri: env.GITHUB_REDIRECT_URI,
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGithubCode(code: string): Promise<string> {
  if (!isGithubConfigured()) throw new Error("github oauth not configured");
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: env.GITHUB_CLIENT_ID!,
      client_secret: env.GITHUB_CLIENT_SECRET!,
      redirect_uri: env.GITHUB_REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("GitHub access token missing");
  return data.access_token;
}

export async function fetchGithubProfile(accessToken: string): Promise<GitHubProfile> {
  if (!isGithubConfigured()) throw new Error("github oauth not configured");
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "yapayzekalab",
    Accept: "application/vnd.github+json",
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error(`GitHub userinfo failed: ${userRes.status}`);
  const u = (await userRes.json()) as { id: number; login: string; name?: string };

  // GÜVENLİK: GET /user'ın `email` alanı doğrulanma bilgisi taşımaz (sahte/doğrulanmamış
  // e-posta hesap-ele-geçirmeye açar). Bu yüzden HER ZAMAN /user/emails'ten yalnız
  // `verified` primary'yi çözeriz (Google'ın açık `email_verified` gate'inin eşi).
  let email: string | undefined;
  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
    email = primary?.email;
  }
  if (!email) throw new Error("GitHub doğrulanmış e-posta bulunamadı");
  return { id: String(u.id), email, name: u.name || u.login };
}
