#!/usr/bin/env node
/**
 * Live /v1 funded smoke test — proves a real billed call works end-to-end.
 *
 * Runs on the host that has the production env + DB + app (the VPS). It:
 *   1. Picks an active funded API key (or API_KEY_ID), decrypts its stored
 *      cipher IN MEMORY using API_KEY_ENCRYPTION_SECRET — the plaintext key is
 *      NEVER printed or logged (only masked as yzk_live_****<last4>).
 *   2. Reads the owner's balance BEFORE.
 *   3. Sends ONE minimal /v1/chat/completions request (max_tokens=1, "ping").
 *   4. Reads the owner's balance AFTER.
 *   5. Prints a masked proof: status, request id, usage, before/after, deducted.
 *
 * Cost cap: the request is hardcoded to max_tokens=1 with a 1-word prompt, so a
 * run can only ever cost a fraction of a kuruş. It refuses to inflate output.
 *
 * Env (read at runtime, never committed):
 *   DATABASE_URL                  required
 *   API_KEY_ENCRYPTION_SECRET     required in prod (falls back to JWT_SECRET in dev)
 *   API_KEY_ENCRYPTION_SECRET_OLD optional (rotation window)
 *   JWT_SECRET                    dev/test fallback only
 *   SMOKE_BASE_URL                default http://127.0.0.1:4568
 *   SMOKE_MODEL                   default gpt-5.4-mini (cheap, known-good)
 *   API_KEY_ID                    optional — target a specific api_keys.id
 *
 * Usage (on VPS):
 *   cd /opt/turkapiprojesi
 *   set -a; . ./.env.production; set +a
 *   node scripts/live-v1-funded-smoke-test.mjs
 */
import { createDecipheriv, createHash } from "node:crypto";
import postgres from "postgres";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4568";
const MODEL = process.env.SMOKE_MODEL || "gpt-5.4-mini";
const DATABASE_URL = process.env.DATABASE_URL;
const TARGET_KEY_ID = process.env.API_KEY_ID || null;

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ status: "BLOCKED", reason, ...extra }, null, 2));
  process.exit(2);
}

if (!DATABASE_URL) fail("DATABASE_URL not set");

function deriveKey(secret) {
  return createHash("sha256").update(secret).digest();
}

function decryptionSecrets() {
  const secrets = [];
  if (process.env.API_KEY_ENCRYPTION_SECRET) secrets.push(process.env.API_KEY_ENCRYPTION_SECRET);
  if (process.env.API_KEY_ENCRYPTION_SECRET_OLD) secrets.push(process.env.API_KEY_ENCRYPTION_SECRET_OLD);
  if (process.env.JWT_SECRET) secrets.push(process.env.JWT_SECRET); // dev/test fallback
  return secrets;
}

function decryptApiKey(payload, secrets) {
  if (!payload) return null;
  const [version, iv, tag, enc] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !enc) return null;
  for (const secret of secrets) {
    try {
      const d = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      const out = Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]);
      return out.toString("utf8");
    } catch {
      /* try next secret */
    }
  }
  return null;
}

function mask(fullKey) {
  if (!fullKey) return null;
  return `yzk_live_${"*".repeat(4)}${fullKey.slice(-4)}`;
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function main() {
  // 1. Pick an active funded key with a recoverable cipher.
  const rows = TARGET_KEY_ID
    ? await sql`
        SELECT k.id, k.full_key_cipher, k.user_id, u.bakiye_tl, u.email
        FROM api_keys k JOIN users u ON u.id = k.user_id
        WHERE k.id = ${TARGET_KEY_ID}::uuid LIMIT 1`
    : await sql`
        SELECT k.id, k.full_key_cipher, k.user_id, u.bakiye_tl, u.email
        FROM api_keys k JOIN users u ON u.id = k.user_id
        WHERE k.aktif = true AND u.durum = 'aktif'
          AND k.full_key_cipher IS NOT NULL AND u.bakiye_tl > 0
        ORDER BY u.bakiye_tl DESC LIMIT 1`;

  if (!rows.length) fail("no active funded key with recoverable cipher", { needed: "an active api_keys row with full_key_cipher and user bakiye_tl > 0" });

  const row = rows[0];
  const fullKey = decryptApiKey(row.full_key_cipher, decryptionSecrets());
  if (!fullKey) fail("cipher decryption failed", { hint: "API_KEY_ENCRYPTION_SECRET mismatch (rotation?)" });

  const maskedKey = mask(fullKey);
  const beforeBalance = Number(row.bakiye_tl);
  const tsBefore = new Date().toISOString();

  // 2. Minimal billed call (cost-capped).
  const endpoint = `${BASE_URL}/v1/chat/completions`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${fullKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
  });

  const statusCode = resp.status;
  const reqId = resp.headers.get("x-yz-request-id");
  const costHeader = resp.headers.get("x-yz-cost-tl");
  const remainingHeader = resp.headers.get("x-yz-remaining-tl");
  let body = null;
  try { body = await resp.json(); } catch { body = null; }
  const tsAfter = new Date().toISOString();

  // 3. Balance after (authoritative DB read).
  const afterRows = await sql`SELECT bakiye_tl FROM users WHERE id = ${row.user_id}::uuid LIMIT 1`;
  const afterBalance = Number(afterRows[0]?.bakiye_tl ?? NaN);

  // 4. Usage record for this request (ledger proof).
  const usageRows = reqId
    ? await sql`SELECT model_id, status, round(cost_tl,6) cost_tl, input_usage, output_usage, error_code
                FROM usage_records WHERE request_id = ${reqId} LIMIT 1`
    : [];

  const deducted = Number.isFinite(afterBalance) ? Number((beforeBalance - afterBalance).toFixed(6)) : null;

  const proof = {
    status: statusCode === 200 && deducted !== null && deducted > 0 ? "PASS" : "CHECK",
    endpoint,
    method: "POST",
    status_code: statusCode,
    masked_api_key: maskedKey,
    model: MODEL,
    request_id: reqId,
    response_id: body?.id ?? null,
    timestamp_before: tsBefore,
    timestamp_after: tsAfter,
    before_balance_tl: beforeBalance,
    after_balance_tl: Number.isFinite(afterBalance) ? afterBalance : null,
    deducted_tl: deducted,
    cost_header_tl: costHeader,
    remaining_header_tl: remainingHeader,
    usage: body?.usage ?? null,
    usage_record: usageRows[0] ?? null,
    upstream_error: statusCode !== 200 ? (body?.error ?? body ?? null) : null,
  };
  console.log(JSON.stringify(proof, null, 2));
  await sql.end({ timeout: 5 });
  process.exit(statusCode === 200 ? 0 : 1);
}

main().catch(async (e) => {
  try { await sql.end({ timeout: 5 }); } catch {}
  fail("script error", { error: String(e?.message ?? e) });
});
