#!/usr/bin/env node
/**
 * count_tokens sondası (SALT-OKUNUR, faturasız) — char/4 tahmini vs sağlayıcının
 * KESİN count_tokens'ı.
 *
 * Amaç: Açık iş #3'ün (count_tokens entegrasyonu) gerçekten gerekli/faydalı olup
 * olmadığını kanıtla. WellFlow `POST /v1/messages/count_tokens` istek çalıştırmadan
 * (faturasız) kesin `input_tokens` döndürür. Bu sonda, bizim mevcut sunucu-tarafı
 * tahminimizi (estimateRequestContextTokens = char/4) sağlayıcının kesin sayımıyla
 * yan yana koyar ve floor şişme/eksiklik oranını ölçer.
 *
 * KRİTİK: billing hot-path'e DOKUNMAZ — hiçbir gerçek üretim çağrısı yapmaz, hiçbir
 * bakiye düşmez, hiçbir usage_record yazılmaz. Yalnız count_tokens (faturasız) +
 * aktif provider profilinin key'ini DB'den çözer (env stale olabilir). Key plaintext
 * yazılmaz (maskeli). Çıkışta kesin token ile char/4 farkı + öneri raporlanır.
 *
 * Çalıştırma (canlı VPS'te, .env.production ile):
 *   ENV_FILE_PATH=/opt/turkapiprojesi/.env.production node scripts/count-tokens-probe.mjs
 * veya env'ler dışarıdan verilir:
 *   DATABASE_URL=... API_KEY_ENCRYPTION_SECRET=... node scripts/count-tokens-probe.mjs
 */
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

// ── Opsiyonel .env yükleme (ENV_FILE_PATH; yalnız gerekli anahtarlar) ──────────
function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch { /* yoksa sessiz geç */ }
}
if (process.env.ENV_FILE_PATH) loadEnvFile(process.env.ENV_FILE_PATH);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log(JSON.stringify({ status: "BLOCKED", reason: "DATABASE_URL yok (ENV_FILE_PATH ver veya export et)" }));
  process.exit(2);
}
const MODEL = process.env.PROBE_MODEL || "claude-haiku-4-5-20251001";
// Test promptu: Claude Code büyük-JSON benzeri kabarık bir gövde simüle eder.
const REPEAT = Number(process.env.PROBE_REPEAT || 200);
const FILLER = "Bu bir test cumlesidir ve tokenizer ile char/4 arasindaki farki olcer. ".repeat(REPEAT);

// ── api_key_service.decryptApiKey ile AYNI format (v1.iv.tag.enc, aes-256-gcm) ──
const deriveKey = (s) => createHash("sha256").update(s).digest();
function secretCandidates() {
  const o = [];
  if (process.env.API_KEY_ENCRYPTION_SECRET) o.push(process.env.API_KEY_ENCRYPTION_SECRET);
  if (process.env.API_KEY_ENCRYPTION_SECRET_OLD) o.push(process.env.API_KEY_ENCRYPTION_SECRET_OLD);
  if (process.env.JWT_SECRET) o.push(process.env.JWT_SECRET);
  return o;
}
function decryptCipher(payload, secs) {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, iv, tag, enc] = parts;
  for (const s of secs) {
    try {
      const d = createDecipheriv("aes-256-gcm", deriveKey(s), Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
    } catch { /* sonraki secret */ }
  }
  return null;
}
const mask = (k) => (k ? `${k.slice(0, 3)}****${k.slice(-4)}` : null);

// char/4 — estimateRequestContextTokens ile AYNI mantık (gövde JSON.stringify / 4).
function charDiv4(body) {
  return Math.ceil(JSON.stringify(body).length / 4);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function main() {
  // Aktif provider profili: base_url + api_key_cipher (env stale olabilir → DB-first).
  const cfgRows = await sql`SELECT active_provider_id FROM system_api_config WHERE id=1`;
  const activeId = cfgRows[0]?.active_provider_id;
  const profRows = activeId
    ? await sql`SELECT id, base_url, api_key_cipher FROM provider_profiles WHERE id=${activeId} AND enabled=true LIMIT 1`
    : [];
  const profile = profRows[0] ?? null;

  const baseUrl = profile?.base_url || process.env.AI_PROVIDER_BASE_URL;
  const secs = secretCandidates();
  const apiKey = profile?.api_key_cipher ? decryptCipher(profile.api_key_cipher, secs) : (process.env.AI_PROVIDER_API_KEY || null);

  if (!baseUrl || !apiKey) {
    console.log(JSON.stringify({ status: "BLOCKED", reason: "aktif profil base_url/key cozulemedi", activeId, baseUrl, key_resolved: !!apiKey }));
    await sql.end({ timeout: 5 });
    process.exit(2);
  }

  const body = { model: MODEL, messages: [{ role: "user", content: FILLER }] };
  const url = `${baseUrl.replace(/\/$/, "")}/messages/count_tokens`;

  let httpStatus = null;
  let providerExact = null;
  let errBody = null;
  let rawResponse = null;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    httpStatus = resp.status;
    const json = await resp.json().catch(() => ({}));
    if (resp.ok) { providerExact = json?.input_tokens ?? null; rawResponse = json; }
    else errBody = json;
  } catch (e) {
    errBody = { fetch_error: String(e?.message ?? e) };
  }

  const estimate = charDiv4(body);
  const out = {
    status: providerExact !== null ? "OK" : "ENDPOINT_UNAVAILABLE",
    active_provider: activeId,
    base_url: baseUrl,
    masked_key: mask(apiKey),
    model: MODEL,
    prompt_chars: JSON.stringify(body).length,
    http_status: httpStatus,
    provider_exact_input_tokens: providerExact,
    server_estimate_char_div_4: estimate,
    // KARARLAR
    overestimate_factor: providerExact ? Number((estimate / providerExact).toFixed(3)) : null,
    overestimate_tokens: providerExact ? estimate - providerExact : null,
    note: providerExact
      ? "char/4, sağlayıcı kesin sayımının overestimate_factor katı. >1.5 ise count_tokens entegrasyonu floor doğruluğunu artırır (ekstra çağrı maliyetiyle)."
      : "count_tokens bu key/endpoint ile erişilemedi veya 0 döndü. 200+0 → sağlayıcı count_tokens'ı da güvenilmez (gerçek istek usage gibi). char/4 floor korunmalı.",
    raw_response: rawResponse,
    error: errBody,
  };
  console.log(JSON.stringify(out, null, 2));
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  try { await sql.end({ timeout: 5 }); } catch {}
  console.log(JSON.stringify({ status: "ERROR", error: String(e?.message ?? e) }));
  process.exit(1);
});
