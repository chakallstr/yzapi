#!/usr/bin/env node
/**
 * Live /v1 BIG-PROMPT smoke test — proves large-context requests no longer hit
 * the 60s upstream timeout (AbortError → upstream_error) after raising
 * default_request_timeout_ms. Cost-capped (small max output). Plaintext key is
 * NEVER printed (only masked). Runs on the VPS with .env.production loaded.
 *
 * Usage (on VPS):
 *   cd /opt/turkapiprojesi
 *   set -a; . ./.env.production; set +a
 *   SMOKE_MODEL=claude-opus-4.8 PROMPT_TOKENS=20000 node scripts/live-v1-bigprompt-smoke-test.mjs
 */
import { createDecipheriv, createHash } from "node:crypto";
import postgres from "postgres";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4568";
const MODEL = process.env.SMOKE_MODEL || "claude-opus-4.8";
const PROMPT_TOKENS = Number(process.env.PROMPT_TOKENS || "20000");
const DATABASE_URL = process.env.DATABASE_URL;

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ status: "BLOCKED", reason, ...extra }, null, 2));
  process.exit(2);
}
if (!DATABASE_URL) fail("DATABASE_URL not set");

const deriveKey = (s) => createHash("sha256").update(s).digest();
function decryptionSecrets() {
  const out = [];
  if (process.env.API_KEY_ENCRYPTION_SECRET) out.push(process.env.API_KEY_ENCRYPTION_SECRET);
  if (process.env.API_KEY_ENCRYPTION_SECRET_OLD) out.push(process.env.API_KEY_ENCRYPTION_SECRET_OLD);
  if (process.env.JWT_SECRET) out.push(process.env.JWT_SECRET);
  return out;
}
function decryptApiKey(payload, secrets) {
  if (!payload) return null;
  const [v, iv, tag, enc] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !enc) return null;
  for (const secret of secrets) {
    try {
      const d = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
    } catch { /* next */ }
  }
  return null;
}
const mask = (k) => (k ? `yzk_live_****${k.slice(-4)}` : null);

const sql = postgres(DATABASE_URL, { max: 1 });

async function main() {
  const rows = await sql`SELECT k.id, k.full_key_cipher, k.user_id, u.bakiye_tl FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.aktif=true AND u.durum='aktif' AND k.full_key_cipher IS NOT NULL AND u.bakiye_tl>0 ORDER BY u.bakiye_tl DESC LIMIT 1`;
  if (!rows.length) fail("no active funded key with recoverable cipher");
  const row = rows[0];
  const fullKey = decryptApiKey(row.full_key_cipher, decryptionSecrets());
  if (!fullKey) fail("cipher decryption failed");

  // Build a large prompt (~PROMPT_TOKENS tokens; ~4 chars/token heuristic).
  const filler = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(Math.ceil((PROMPT_TOKENS * 4) / 55));
  const bigContent = filler.slice(0, PROMPT_TOKENS * 4);

  const beforeBalance = Number(row.bakiye_tl);
  const start = Date.now();
  const endpoint = `${BASE_URL}/v1/chat/completions`;
  let statusCode = 0, reqId = null, errBody = null;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${fullKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16,
        messages: [
          { role: "system", content: "Reply with a single word." },
          { role: "user", content: `${bigContent}\n\nSummarize the above in one word.` },
        ],
      }),
    });
    statusCode = resp.status;
    reqId = resp.headers.get("x-yz-request-id");
    const body = await resp.json().catch(() => null);
    if (statusCode !== 200) errBody = body?.error ?? body ?? null;
  } catch (e) {
    errBody = `__fetch_error__: ${String(e?.message ?? e)}`;
  }
  const elapsedMs = Date.now() - start;

  await new Promise((r) => setTimeout(r, 1500));
  const afterRows = await sql`SELECT bakiye_tl FROM users WHERE id=${row.user_id}::uuid LIMIT 1`;
  const afterBalance = Number(afterRows[0]?.bakiye_tl ?? NaN);
  const usageRows = reqId
    ? await sql`SELECT model_id, status, round(cost_tl,6) cost_tl, input_usage, output_usage, error_code FROM usage_records WHERE request_id=${reqId} LIMIT 1`
    : [];

  const proof = {
    status: statusCode === 200 ? "PASS" : "CHECK",
    mode: "big-prompt",
    approx_prompt_tokens: PROMPT_TOKENS,
    endpoint,
    status_code: statusCode,
    elapsed_ms: elapsedMs,
    exceeded_old_60s_limit: elapsedMs > 60000,
    masked_api_key: mask(fullKey),
    model: MODEL,
    request_id: reqId,
    before_balance_tl: beforeBalance,
    after_balance_tl: Number.isFinite(afterBalance) ? afterBalance : null,
    deducted_tl: Number.isFinite(afterBalance) ? Number((beforeBalance - afterBalance).toFixed(6)) : null,
    usage_record: usageRows[0] ?? null,
    error: errBody,
  };
  console.log(JSON.stringify(proof, null, 2));
  await sql.end({ timeout: 5 });
  process.exit(statusCode === 200 ? 0 : 1);
}
main().catch(async (e) => { try { await sql.end({ timeout: 5 }); } catch {} fail("script error", { error: String(e?.message ?? e) }); });
