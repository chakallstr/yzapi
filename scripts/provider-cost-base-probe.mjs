#!/usr/bin/env node
/**
 * Maliyet tabanı doğrulama sondası (SALT-OKUNUR, faturasız) — açık iş #5.
 *
 * Aktif provider profilinin GERÇEK key'ini DB cipher'dan çözer (env `sk-` stale
 * olabilir) ve `GET /v1/models/info`'yu o key ile çağırır → her model için
 * input/output/cache_read/cache_write fiyatlarını (per 1M) GERÇEK hesap fiyatından
 * okur. Amaç: maliyet-tabani.md tablosunu (opus $0.30, diğer $0.20) gerçek key ile
 * teyit etmek; env `sk-` key'in döndürdüğü PUBLIC/default fiyatla (opus $0.40)
 * çelişkiyi kapatmak.
 *
 * Billing'e DOKUNMAZ — yalnız fiyat okuması. Key plaintext yazılmaz (maskeli).
 *
 * Çalıştırma (VPS app dizininde, postgres node_modules için):
 *   ENV_FILE_PATH=/opt/turkapiprojesi/.env.production node provider-cost-base-probe.mjs
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

const TARGET = new Set(["claude-opus-4.8", "claude-opus-4.7", "claude-opus-4.6", "claude-sonnet-4.6", "claude-haiku-4.5"]);
const num = (v) => (v === undefined || v === null ? null : Number(v));

async function fetchModelsInfo(baseUrl, key) {
  const url = `${baseUrl.replace(/\/$/, "")}/models/info`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const json = await resp.json().catch(() => ({}));
  return { httpStatus: resp.status, json };
}

function extractPrices(json) {
  const list = Array.isArray(json) ? json : (json?.data ?? json?.models ?? []);
  const out = {};
  for (const m of list) {
    const id = m?.id ?? m?.model ?? m?.name;
    if (!id) continue;
    out[id] = {
      input_per_1m: num(m.input_price_per_1m),
      output_per_1m: num(m.output_price_per_1m),
      cache_read_per_1m: num(m.cache_read_price_per_1m),
      cache_write_per_1m: num(m.cache_write_price_per_1m),
    };
  }
  return out;
}

async function main() {
  const cfgRows = await sql`SELECT active_provider_id FROM system_api_config WHERE id=1`;
  const activeId = cfgRows[0]?.active_provider_id;
  const profRows = activeId
    ? await sql`SELECT id, base_url, api_key_cipher FROM provider_profiles WHERE id=${activeId} AND enabled=true LIMIT 1`
    : [];
  const profile = profRows[0] ?? null;
  const secs = secretCandidates();

  const profileKey = profile?.api_key_cipher ? decryptCipher(profile.api_key_cipher, secs) : null;
  const envKey = process.env.AI_PROVIDER_API_KEY || null;
  const baseUrl = profile?.base_url || process.env.AI_PROVIDER_BASE_URL;

  if (!baseUrl) { console.log(JSON.stringify({ status: "BLOCKED", reason: "base_url yok" })); await sql.end(); process.exit(2); }

  const result = { status: "OK", active_provider: activeId, base_url: baseUrl, with_profile_key: null, with_env_key: null, mismatch: null };

  // 1) GERÇEK profil key ile
  if (profileKey) {
    const r = await fetchModelsInfo(baseUrl, profileKey);
    const prices = extractPrices(r.json);
    result.with_profile_key = {
      masked_key: mask(profileKey), http_status: r.httpStatus,
      prices: Object.fromEntries(Object.entries(prices).filter(([id]) => TARGET.has(id))),
    };
  }
  // 2) env `sk-` key ile (çelişki kanıtı)
  if (envKey) {
    const r = await fetchModelsInfo(baseUrl, envKey);
    const prices = extractPrices(r.json);
    result.with_env_key = {
      masked_key: mask(envKey), http_status: r.httpStatus,
      prices: Object.fromEntries(Object.entries(prices).filter(([id]) => TARGET.has(id))),
    };
  }
  // 3) maliyet-tabani.md beklenen (doğrulanmış dashboard)
  result.expected_cost_base = {
    "claude-opus-4.8": 0.30, "claude-opus-4.7": 0.30,
    "claude-opus-4.6": 0.20, "claude-sonnet-4.6": 0.20, "claude-haiku-4.5": 0.20,
  };
  console.log(JSON.stringify(result, null, 2));
  await sql.end({ timeout: 5 });
}
main().catch(async (e) => { try { await sql.end({ timeout: 5 }); } catch {} console.log(JSON.stringify({ status: "ERROR", error: String(e?.message ?? e) })); process.exit(1); });
