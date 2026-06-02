#!/usr/bin/env node
/**
 * /v1/messages 502 teşhis sondası v2 (SALT-OKUNUR amaçlı).
 *
 * Üretimin kullandığı PROFİL key'ini (DB cipher) çözer, o key ile /v1/models
 * listeler, sonra wellflow'un listelediği HER model id'sine küçük bir /v1/messages
 * isteği atıp HAM status + gövdeyi yazar. Amaç: hangi modellerin gerçekten
 * çalıştığını ve hangilerinin 400/502 verdiğini PROFİL key ile kesinleştirmek.
 *
 * Billing'e DOKUNMAZ (proxy pipeline yok). Key maskeli. max_tokens=16 (cüzi).
 *
 *   ENV_FILE_PATH=/opt/turkapiprojesi/.env.production node messages-502-probe.mjs
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
if (!DATABASE_URL) { console.log(JSON.stringify({ status: "BLOCKED", reason: "DATABASE_URL yok" })); process.exit(2); }

const deriveKey = (s) => createHash("sha256").update(s).digest();
function secretCandidates() {
  const o = [];
  for (const k of ["API_KEY_ENCRYPTION_SECRET", "API_KEY_ENCRYPTION_SECRET_OLD", "JWT_SECRET"]) {
    if (process.env[k]) o.push(process.env[k]);
  }
  return o;
}
function decryptCipher(payload, secs) {
  if (!payload) return null;
  const p = payload.split(".");
  if (p.length !== 4 || p[0] !== "v1") return null;
  for (const s of secs) {
    try {
      const d = createDecipheriv("aes-256-gcm", deriveKey(s), Buffer.from(p[1], "base64url"));
      d.setAuthTag(Buffer.from(p[2], "base64url"));
      return Buffer.concat([d.update(Buffer.from(p[3], "base64url")), d.final()]).toString("utf8");
    } catch { /* sonraki */ }
  }
  return null;
}
const mask = (k) => (k ? `${k.slice(0, 3)}****${k.slice(-4)}` : null);
const sql = postgres(DATABASE_URL, { max: 1 });

async function listModels(baseUrl, key) {
  const url = `${baseUrl.replace(/\/$/, "")}/models`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const json = await resp.json().catch(() => ({}));
  const list = Array.isArray(json) ? json : (json?.data ?? json?.models ?? []);
  return { http: resp.status, ids: list.map((m) => m?.id ?? m?.model ?? m?.name).filter(Boolean) };
}

async function postMessages(baseUrl, key, model) {
  const url = `${baseUrl.replace(/\/$/, "")}/messages`;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "anthropic-version": "2023-06-01" };
  const body = { model, max_tokens: 16, messages: [{ role: "user", content: "ping" }] };
  const t0 = Date.now();
  try {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await resp.text();
    return { model, http: resp.status, ms: Date.now() - t0, bytes: Buffer.byteLength(text), body: text.slice(0, 200) };
  } catch (e) {
    return { model, http: -1, ms: Date.now() - t0, error: String(e?.message ?? e) };
  }
}

async function main() {
  const cfgRows = await sql`SELECT active_provider_id FROM system_api_config WHERE id=1`;
  const activeId = cfgRows[0]?.active_provider_id;
  const profRows = activeId
    ? await sql`SELECT id, base_url, api_key_cipher, model_map FROM provider_profiles WHERE id=${activeId} AND enabled=true LIMIT 1`
    : [];
  const profile = profRows[0] ?? null;
  const key = profile?.api_key_cipher ? decryptCipher(profile.api_key_cipher, secretCandidates()) : null;
  const baseUrl = profile?.base_url || process.env.AI_PROVIDER_BASE_URL;
  if (!key || !baseUrl) { console.log(JSON.stringify({ status: "BLOCKED", reason: "key/base yok" })); await sql.end(); process.exit(2); }

  const out = { status: "OK", active_provider: activeId, base_url: baseUrl, masked_profile_key: mask(key), model_map: profile?.model_map ?? null, models_list: null, message_probes: [] };

  out.models_list = await listModels(baseUrl, key);

  // wellflow'un listelediği modeller + bizim kullandığımız kanonik/varyantlar
  const toTry = new Set([...(out.models_list.ids || [])]);
  ["claude-sonnet-4-6", "claude-sonnet-4.6", "claude-haiku-4-5-20251001", "claude-opus-4-6", "claude-opus-4-7"].forEach((m) => toTry.add(m));

  for (const m of toTry) {
    out.message_probes.push(await postMessages(baseUrl, key, m));
  }
  console.log(JSON.stringify(out, null, 2));
  await sql.end({ timeout: 5 });
}
main().catch(async (e) => { try { await sql.end({ timeout: 5 }); } catch {} console.log(JSON.stringify({ status: "ERROR", error: String(e?.message ?? e) })); process.exit(1); });
