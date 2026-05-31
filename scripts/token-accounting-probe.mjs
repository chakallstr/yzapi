#!/usr/bin/env node
/**
 * Token muhasebesi sondası — TEK BİR gerçek /v1/chat/completions çağrısı yapar,
 * sağlayıcının raporladığı prompt+completion token'ı ile bizim usage_record'a
 * yazdığımız input_usage/output_usage/cost'u ve elle yeniden hesaplanan beklenen
 * maliyeti YAN YANA gösterir. Amaç: çıkış token'ı sayılıyor mu + maliyet doğru mu
 * + drift var mı kesin kanıt. Key plaintext yazılmaz (maskeli). cost-cap'li.
 */
import { createDecipheriv, createHash } from "node:crypto";
import postgres from "postgres";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4568";
const MODEL = process.env.PROBE_MODEL || "gpt-5.4";
const MAXTOK = Number(process.env.PROBE_MAXTOK || 300);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.log(JSON.stringify({ status: "BLOCKED", reason: "DATABASE_URL yok" })); process.exit(2); }

const deriveKey = (s) => createHash("sha256").update(s).digest();
function secrets() {
  const o = [];
  if (process.env.API_KEY_ENCRYPTION_SECRET) o.push(process.env.API_KEY_ENCRYPTION_SECRET);
  if (process.env.API_KEY_ENCRYPTION_SECRET_OLD) o.push(process.env.API_KEY_ENCRYPTION_SECRET_OLD);
  if (process.env.JWT_SECRET) o.push(process.env.JWT_SECRET);
  return o;
}
function decrypt(payload, secs) {
  if (!payload) return null;
  const [v, iv, tag, enc] = payload.split(".");
  if (v !== "v1") return null;
  for (const s of secs) {
    try {
      const d = createDecipheriv("aes-256-gcm", deriveKey(s), Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
    } catch { /* next */ }
  }
  return null;
}
const mask = (k) => (k ? `yzk_live_****${k.slice(-4)}` : null);

const sql = postgres(DATABASE_URL, { max: 1 });

async function main() {
  const cfgRows = await sql`SELECT kur, live_kur, kur_buffer, text_carpan FROM system_config WHERE id=1`;
  const cfg = cfgRows[0];
  const sellKur = Number(cfg.live_kur) * (1 + Number(cfg.kur_buffer));

  const keyRows = await sql`
    SELECT k.id, k.full_key_cipher, k.user_id, u.bakiye_tl
    FROM api_keys k JOIN users u ON u.id=k.user_id
    WHERE k.aktif=true AND u.durum='aktif' AND k.full_key_cipher IS NOT NULL AND u.bakiye_tl>0
    ORDER BY u.bakiye_tl DESC LIMIT 1`;
  if (!keyRows.length) { console.log(JSON.stringify({ status: "BLOCKED", reason: "funded key yok" })); await sql.end(); process.exit(2); }
  const fullKey = decrypt(keyRows[0].full_key_cipher, secrets());
  if (!fullKey) { console.log(JSON.stringify({ status: "BLOCKED", reason: "cipher cozulemedi" })); await sql.end(); process.exit(2); }

  const beforeBalance = Number(keyRows[0].bakiye_tl);

  const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${fullKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "Write a detailed 200-word story about a robot." }], max_tokens: MAXTOK }),
  });
  const reqId = resp.headers.get("x-yz-request-id");
  const costHeader = Number(resp.headers.get("x-yz-cost-tl"));
  const body = await resp.json().catch(() => ({}));
  const provUsage = body?.usage ?? {};

  await new Promise((r) => setTimeout(r, 1500));
  const recRows = await sql`
    SELECT model_id, input_usage, output_usage, round(cost_tl,6) cost_tl, round(cost_usd,8) cost_usd, status,
           raw_usage_json, pricing_snapshot_json
    FROM usage_records WHERE request_id=${reqId} LIMIT 1`;
  const rec = recRows[0] ?? null;
  const afterRows = await sql`SELECT bakiye_tl FROM users WHERE id=${keyRows[0].user_id}::uuid`;
  const afterBalance = Number(afterRows[0]?.bakiye_tl ?? NaN);

  // Beklenen maliyeti pricing_snapshot içindeki input/output USD fiyatından elle hesapla.
  let expected = null;
  if (rec && rec.pricing_snapshot_json) {
    const snap = rec.pricing_snapshot_json;
    const inUsd = snap?.computed?.input?.usd ?? null;
    const outUsd = snap?.computed?.output?.usd ?? null;
    if (inUsd !== null && outUsd !== null) {
      const inTok = Number(rec.input_usage);
      const outTok = Number(rec.output_usage);
      const expUsd = (inTok / 1e6) * inUsd + (outTok / 1e6) * outUsd;
      const expTL = expUsd * sellKur;
      expected = {
        input_usd_per_1m: inUsd, output_usd_per_1m: outUsd,
        formula: "(in/1e6)*inUsd + (out/1e6)*outUsd, sonra *sellKur",
        expected_cost_usd: Number(expUsd.toFixed(8)),
        expected_cost_tl: Number(expTL.toFixed(6)),
      };
    }
  }

  const out = {
    model: MODEL,
    masked_key: mask(fullKey),
    config: { live_kur: Number(cfg.live_kur), kur_buffer: Number(cfg.kur_buffer), sellKur: Number(sellKur.toFixed(6)) },
    provider_reported_usage: provUsage,
    our_usage_record: rec ? {
      input_usage: Number(rec.input_usage), output_usage: Number(rec.output_usage),
      cost_tl: Number(rec.cost_tl), cost_usd: Number(rec.cost_usd), status: rec.status,
    } : null,
    raw_usage_json: rec?.raw_usage_json ?? null,
    expected_recompute: expected,
    cost_header_tl: costHeader,
    balance_before: beforeBalance, balance_after: Number.isFinite(afterBalance) ? afterBalance : null,
    deducted_tl: Number.isFinite(afterBalance) ? Number((beforeBalance - afterBalance).toFixed(6)) : null,
    // KARARLAR
    output_token_counted: rec ? Number(rec.output_usage) > 0 : null,
    provider_vs_ours_input_match: rec && provUsage.prompt_tokens !== undefined ? Number(rec.input_usage) === Number(provUsage.prompt_tokens) : null,
    provider_vs_ours_output_match: rec && provUsage.completion_tokens !== undefined ? Number(rec.output_usage) === Number(provUsage.completion_tokens) : null,
    cost_matches_recompute: expected ? Math.abs(expected.expected_cost_tl - Number(rec.cost_tl)) < 0.0002 : null,
  };
  console.log(JSON.stringify(out, null, 2));
  await sql.end({ timeout: 5 });
}
main().catch(async (e) => { try { await sql.end({ timeout: 5 }); } catch {} console.log(JSON.stringify({ status: "ERROR", error: String(e?.message ?? e) })); process.exit(1); });
