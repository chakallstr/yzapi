#!/usr/bin/env node
/**
 * 1M-context teşhis sondası v3 (SALT-OKUNUR). QUERY YOK (bizim proxy gibi),
 * yalnız anthropic-beta header farkı: header yok / base beta / context-1m beta.
 * Amaç: context-1m-2025-08-07 flag'inin opus-4.8'i wellflow'da bozup bozmadığını
 * izole etmek. Billing'e DOKUNMAZ. Key maskeli. max_tokens=16.
 */
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch { /* yoksa geç */ }
}
if (process.env.ENV_FILE_PATH) loadEnvFile(process.env.ENV_FILE_PATH);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.log(JSON.stringify({ status: "BLOCKED" })); process.exit(2); }
const deriveKey = (s) => createHash("sha256").update(s).digest();
function secretCandidates() { const o = []; for (const k of ["API_KEY_ENCRYPTION_SECRET", "API_KEY_ENCRYPTION_SECRET_OLD", "JWT_SECRET"]) if (process.env[k]) o.push(process.env[k]); return o; }
function decryptCipher(payload, secs) {
  if (!payload) return null; const p = payload.split("."); if (p.length !== 4 || p[0] !== "v1") return null;
  for (const s of secs) { try { const d = createDecipheriv("aes-256-gcm", deriveKey(s), Buffer.from(p[1], "base64url")); d.setAuthTag(Buffer.from(p[2], "base64url")); return Buffer.concat([d.update(Buffer.from(p[3], "base64url")), d.final()]).toString("utf8"); } catch { /* */ } }
  return null;
}
const mask = (k) => (k ? `${k.slice(0, 3)}****${k.slice(-4)}` : null);
const sql = postgres(DATABASE_URL, { max: 1 });

const BETA_BASE = "claude-code-20250219,interleaved-thinking-2025-05-14";
const BETA_1M = "claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14";

async function post(baseUrl, key, { model, beta }) {
  const url = `${baseUrl.replace(/\/$/, "")}/messages`; // QUERY YOK — proxy davranışı
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  const body = { model, max_tokens: 16, messages: [{ role: "user", content: "hi" }] };
  const t0 = Date.now();
  try { const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); const text = await resp.text(); return { http: resp.status, ms: Date.now() - t0, body: text.slice(0, 200) }; }
  catch (e) { return { http: -1, ms: Date.now() - t0, error: String(e?.message ?? e) }; }
}

async function main() {
  const cfgRows = await sql`SELECT active_provider_id FROM system_api_config WHERE id=1`;
  const activeId = cfgRows[0]?.active_provider_id;
  const profRows = activeId ? await sql`SELECT base_url, api_key_cipher FROM provider_profiles WHERE id=${activeId} AND enabled=true LIMIT 1` : [];
  const profile = profRows[0] ?? null;
  const key = profile?.api_key_cipher ? decryptCipher(profile.api_key_cipher, secretCandidates()) : null;
  const baseUrl = profile?.base_url || process.env.AI_PROVIDER_BASE_URL;
  if (!key || !baseUrl) { console.log(JSON.stringify({ status: "BLOCKED" })); await sql.end(); process.exit(2); }
  const cases = [
    { name: "opus48_no_beta_header", model: "claude-opus-4.8", beta: null },
    { name: "opus48_beta_base", model: "claude-opus-4.8", beta: BETA_BASE },
    { name: "opus48_beta_1M", model: "claude-opus-4.8", beta: BETA_1M },
  ];
  const out = { status: "OK", base_url: baseUrl, masked_key: mask(key), cases: {} };
  for (const c of cases) { out.cases[c.name] = []; for (let i = 0; i < 4; i++) out.cases[c.name].push(await post(baseUrl, key, c)); }
  console.log(JSON.stringify(out, null, 2));
  await sql.end({ timeout: 5 });
}
main().catch(async (e) => { try { await sql.end({ timeout: 5 }); } catch {} console.log(JSON.stringify({ status: "ERROR", error: String(e?.message ?? e) })); process.exit(1); });
