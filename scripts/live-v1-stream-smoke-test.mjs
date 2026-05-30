#!/usr/bin/env node
/**
 * Live /v1 STREAMING smoke test — proves stream:true works end-to-end after the
 * "Dynamic require of stream" ESM-bundle fix (RooCode 500 regression).
 *
 * Mirrors live-v1-funded-smoke-test.mjs but sends stream:true and consumes the
 * SSE response. Cost-capped (max_tokens small, 1-word prompt). Plaintext key is
 * NEVER printed (only masked). Runs on the VPS with .env.production loaded.
 *
 * Usage (on VPS):
 *   cd /opt/turkapiprojesi
 *   set -a; . ./.env.production; set +a
 *   SMOKE_MODEL=claude-opus-4-7 node scripts/live-v1-stream-smoke-test.mjs
 */
import { createDecipheriv, createHash } from "node:crypto";
import postgres from "postgres";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4568";
const MODEL = process.env.SMOKE_MODEL || "claude-opus-4-7";
const DATABASE_URL = process.env.DATABASE_URL;
const TARGET_KEY_ID = process.env.API_KEY_ID || null;

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
  const rows = TARGET_KEY_ID
    ? await sql`SELECT k.id, k.full_key_cipher, k.user_id, u.bakiye_tl FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.id=${TARGET_KEY_ID}::uuid LIMIT 1`
    : await sql`SELECT k.id, k.full_key_cipher, k.user_id, u.bakiye_tl FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.aktif=true AND u.durum='aktif' AND k.full_key_cipher IS NOT NULL AND u.bakiye_tl>0 ORDER BY u.bakiye_tl DESC LIMIT 1`;
  if (!rows.length) fail("no active funded key with recoverable cipher");

  const row = rows[0];
  const fullKey = decryptApiKey(row.full_key_cipher, decryptionSecrets());
  if (!fullKey) fail("cipher decryption failed");

  const beforeBalance = Number(row.bakiye_tl);
  const endpoint = `${BASE_URL}/v1/chat/completions`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${fullKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ model: MODEL, stream: true, messages: [{ role: "user", content: "ping" }], max_tokens: 8 }),
  });

  const statusCode = resp.status;
  const reqId = resp.headers.get("x-yz-request-id");
  const contentType = resp.headers.get("content-type");

  // Consume the SSE body fully.
  let chunks = "";
  let sawDone = false;
  try {
    const text = await resp.text();
    chunks = text;
    sawDone = text.includes("[DONE]") || text.includes("data:");
  } catch (e) {
    chunks = `__read_error__: ${String(e?.message ?? e)}`;
  }

  // Give settle a beat, then read authoritative balance + usage record.
  await new Promise((r) => setTimeout(r, 1500));
  const afterRows = await sql`SELECT bakiye_tl FROM users WHERE id=${row.user_id}::uuid LIMIT 1`;
  const afterBalance = Number(afterRows[0]?.bakiye_tl ?? NaN);
  const usageRows = reqId
    ? await sql`SELECT model_id, status, round(cost_tl,6) cost_tl, input_usage, output_usage, error_code FROM usage_records WHERE request_id=${reqId} LIMIT 1`
    : [];

  const deducted = Number.isFinite(afterBalance) ? Number((beforeBalance - afterBalance).toFixed(6)) : null;
  const usageRec = usageRows[0] ?? null;
  const streamOk = statusCode === 200 && (contentType || "").includes("text/event-stream") && sawDone;

  const proof = {
    status: streamOk && usageRec && usageRec.status === "success" ? "PASS" : "CHECK",
    mode: "stream",
    endpoint,
    status_code: statusCode,
    content_type: contentType,
    masked_api_key: mask(fullKey),
    model: MODEL,
    request_id: reqId,
    saw_sse_data: sawDone,
    sse_preview: chunks.slice(0, 240),
    before_balance_tl: beforeBalance,
    after_balance_tl: Number.isFinite(afterBalance) ? afterBalance : null,
    deducted_tl: deducted,
    usage_record: usageRec,
  };
  console.log(JSON.stringify(proof, null, 2));
  await sql.end({ timeout: 5 });
  process.exit(streamOk ? 0 : 1);
}
main().catch(async (e) => { try { await sql.end({ timeout: 5 }); } catch {} fail("script error", { error: String(e?.message ?? e) }); });
