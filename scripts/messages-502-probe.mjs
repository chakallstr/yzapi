#!/usr/bin/env node
/**
 * opus-4.8 502/503 KARAR sondası v4 (SALT-OKUNUR — billing'e DOKUNMAZ, DB'ye YAZMAZ).
 *
 * Önceki v3 yalnız anthropic-beta header'ını test ediyordu; ama Dalga-1 kod denetimi
 * gateway'in upstream'e HİÇBİR beta/anthropic-version header'ı GÖNDERMEDİĞİNİ kanıtladı
 * (closerouter-service.baseHeaders = sadece Authorization/Content-Type/Accept). Yani beta
 * hipotezi mekanik olarak imkansız. Bu v4 PROXY'NİN GERÇEK header'larıyla 4 hipotezi ayırır:
 *
 *   A) MODEL-ÖZEL Mİ?   opus-4.8(dash) vs opus-4.8(dot) vs sonnet-4.6 vs haiku-4.5
 *                       — aynı koşulda fail oranı (opus-4.8'e özel mi, sağlayıcı geneli mi).
 *   B) ID FORMU?        opus dash `claude-opus-4-8` vs dot `claude-opus-4.8`
 *                       — canlı profil hangi wire-id'yi kabul ediyor (model_map çatlağı).
 *   C) HEADER ETKİSİ?   proxy-birebir (header yok) vs +anthropic-version vs +context-1m beta
 *                       — eksik header'lar mı bozuyor / düzeltiyor (H1'i empirik kapatır).
 *   D) ENDPOINT?        /messages vs /chat/completions (opus dash)
 *
 * GROUP A header'ları PROXY İLE BİREBİR aynı (anthropic-version YOK, beta YOK) → production reprodüksiyonu.
 * Key maskeli. max_tokens=16 (cüzi upstream maliyeti). Yalnız SELECT. Yalnız özet+verdict basar.
 *
 *   ENV_FILE_PATH=/opt/turkapiprojesi/.env.production node scripts/messages-502-probe.mjs
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
function secretCandidates() { const o = []; for (const k of ["API_KEY_ENCRYPTION_SECRET", "API_KEY_ENCRYPTION_SECRET_OLD", "JWT_SECRET"]) if (process.env[k]) o.push(process.env[k]); return o; }
function decryptCipher(payload, secs) {
  if (!payload) return null; const p = payload.split("."); if (p.length !== 4 || p[0] !== "v1") return null;
  for (const s of secs) { try { const d = createDecipheriv("aes-256-gcm", deriveKey(s), Buffer.from(p[1], "base64url")); d.setAuthTag(Buffer.from(p[2], "base64url")); return Buffer.concat([d.update(Buffer.from(p[3], "base64url")), d.final()]).toString("utf8"); } catch { /* sonraki */ } }
  return null;
}
const mask = (k) => (k ? `${k.slice(0, 3)}****${k.slice(-4)}` : null);
const sql = postgres(DATABASE_URL, { max: 1 });

const N_MAIN = 5; // Group A ana tekrar (head-to-head)
const N_SEC = 4;  // Group B/C/D ikincil tekrar (tek-flake hassasiyetini azaltır)
const BETA_1M = "claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14";
const BIG_PROMPT = "lorem ipsum dolor sit amet ".repeat(1900); // ~51K char (~12.5K token), 95K context-cap altı

/**
 * @param headerMode "proxy" (PROXY-BİREBİR: yalnız Auth/Content-Type/Accept) | "anthropic" (+anthropic-version) | "beta1m" (+anthropic-version +context-1m)
 */
async function post(baseUrl, key, { model, endpoint = "messages", headerMode = "proxy", big = false }) {
  const url = `${baseUrl.replace(/\/$/, "")}/${endpoint}`;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
  if (headerMode === "anthropic" || headerMode === "beta1m") headers["anthropic-version"] = "2023-06-01";
  if (headerMode === "beta1m") headers["anthropic-beta"] = BETA_1M;
  const content = big ? BIG_PROMPT : "hi";
  const body = { model, max_tokens: 16, messages: [{ role: "user", content }] };
  const t0 = Date.now();
  try {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await resp.text();
    return { http: resp.status, ms: Date.now() - t0, body: text };
  } catch (e) { return { http: -1, ms: Date.now() - t0, body: String(e?.message ?? e) }; }
}

function summarize(runs) {
  const statuses = {};
  let ok = 0, msSum = 0; let sampleErr = null;
  for (const r of runs) {
    statuses[r.http] = (statuses[r.http] ?? 0) + 1;
    msSum += r.ms;
    if (r.http === 200) ok++;
    else if (!sampleErr) sampleErr = (r.body || "").slice(0, 600);
  }
  return { n: runs.length, ok, fail: runs.length - ok, failRate: +(1 - ok / runs.length).toFixed(2), statuses, msAvg: Math.round(msSum / runs.length), sampleErr };
}

async function runCase(baseUrl, key, spec, n) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(await post(baseUrl, key, spec));
  return summarize(runs);
}

async function main() {
  const cfgRows = await sql`SELECT active_provider_id FROM system_api_config WHERE id=1`;
  const activeId = cfgRows[0]?.active_provider_id;
  const profRows = activeId ? await sql`SELECT id, name, base_url, api_key_cipher, model_map FROM provider_profiles WHERE id=${activeId} AND enabled=true LIMIT 1` : [];
  const profile = profRows[0] ?? null;
  const key = profile?.api_key_cipher ? decryptCipher(profile.api_key_cipher, secretCandidates()) : null;
  const baseUrl = profile?.base_url || process.env.AI_PROVIDER_BASE_URL;
  if (!key || !baseUrl) { console.log(JSON.stringify({ status: "BLOCKED", reason: !key ? "key çözülemedi" : "base_url yok", activeProvider: profile?.name ?? null })); await sql.end(); process.exit(2); }

  // model_map sadece anahtar listesi (değerler upstream-id, sızdırmamak için ham basmıyoruz)
  let mapKeys = null; try { mapKeys = profile.model_map ? Object.keys(typeof profile.model_map === "string" ? JSON.parse(profile.model_map) : profile.model_map) : []; } catch { mapKeys = "parse-err"; }

  const cases = {
    // A) MODEL HEAD-TO-HEAD — PROXY BİREBİR (header yok), /messages, küçük prompt.
    //    PRODUCTION WIRE-ID = DOT (claude-opus-4.8): strictCanonicalModelIds default=true →
    //    proxy.ts body.model = masterModel.id (dot); canlı wellflow model_map BOŞ → dot upstream'e gider.
    //    PRODUCTION BASELINE = A_opus48_dot. dash ayrıca test edilir (id-form karşılaştırması için).
    A_opus48_dot: { model: "claude-opus-4.8", n: N_MAIN },   // ← PRODUCTION reprodüksiyonu
    A_opus48_dash: { model: "claude-opus-4-8", n: N_MAIN },  // id-form kontrolü (production değil)
    A_sonnet46: { model: "claude-sonnet-4-6", n: N_MAIN },
    A_haiku45: { model: "claude-haiku-4-5-20251001", n: N_MAIN },
    // B) CONTEXT BOYUTU — opus DOT (production), proxy-birebir, küçük vs ~51K
    B_opus48_small: { model: "claude-opus-4.8", n: N_SEC },
    B_opus48_large: { model: "claude-opus-4.8", big: true, n: N_SEC },
    // C) HEADER ETKİSİ — opus dot
    C_opus48_proxyhdr: { model: "claude-opus-4.8", headerMode: "proxy", n: N_SEC },
    C_opus48_anthropicver: { model: "claude-opus-4.8", headerMode: "anthropic", n: N_SEC },
    C_opus48_beta1m: { model: "claude-opus-4.8", headerMode: "beta1m", n: N_SEC },
    // D) ENDPOINT — opus DOT. NOT: body Anthropic-şekli; compat gateway ikisini de kabul eder
    //    ama /chat fail'i şekil artefaktı olabilir → verdict caveat'li.
    D_opus48_chat: { model: "claude-opus-4.8", endpoint: "chat/completions", n: N_SEC },
  };

  const out = { status: "OK", activeProvider: profile.name, base_url: baseUrl, masked_key: mask(key), model_map_keys: mapKeys, results: {} };
  for (const [name, spec] of Object.entries(cases)) out.results[name] = await runCase(baseUrl, key, spec, spec.n);

  // VERDICT — operatörün tek bakışta okuması için
  const r = out.results;
  const fr = (k) => r[k]?.failRate ?? null;
  out.verdict = {
    A_opus_specific: `opus(prod,dot)=${fr("A_opus48_dot")} dash=${fr("A_opus48_dash")} | sonnet=${fr("A_sonnet46")} haiku=${fr("A_haiku45")} → ${(fr("A_opus48_dot") > 0.3 && fr("A_sonnet46") < 0.25 && fr("A_haiku45") < 0.25) ? "OPUS-4.8'E ÖZEL" : (fr("A_sonnet46") > 0.3 || fr("A_haiku45") > 0.3) ? "SAĞLAYICI GENELİ" : "BELİRSİZ"}`,
    B_id_form: `dot(prod)=${fr("A_opus48_dot")} dash=${fr("A_opus48_dash")} → ${fr("A_opus48_dash") - fr("A_opus48_dot") > 0.3 ? "DOT ÇALIŞIR/DASH BOZUK (zaten dot gidiyor — id sorun değil)" : fr("A_opus48_dot") - fr("A_opus48_dash") > 0.3 ? "DASH ÇALIŞIR/DOT BOZUK → model_map ile dot→dash çevir" : "ID FORMU FARK ETMİYOR"}`,
    C_context: `small=${fr("B_opus48_small")} large=${fr("B_opus48_large")} → ${fr("B_opus48_large") - fr("B_opus48_small") > 0.3 ? "BÜYÜK CONTEXT BOZUYOR" : "CONTEXT BAĞIMSIZ"}`,
    D_headers: `proxyhdr=${fr("C_opus48_proxyhdr")} anthropicver=${fr("C_opus48_anthropicver")} beta1m=${fr("C_opus48_beta1m")} → ${fr("C_opus48_proxyhdr") - fr("C_opus48_anthropicver") > 0.3 ? "ANTHROPIC-VERSION DÜZELTİYOR (proxy header eklemeli)" : fr("C_opus48_beta1m") - fr("C_opus48_proxyhdr") > 0.3 ? "BETA-1M BOZUYOR" : "HEADER FARK ETMİYOR (H1 empirik çürük)"}`,
    E_endpoint: `messages(dot)=${fr("A_opus48_dot")} chat(dot)=${fr("D_opus48_chat")} → ${fr("A_opus48_dot") - fr("D_opus48_chat") > 0.3 ? "/chat ÇALIŞIYOR (endpoint sorunu — AMA body Anthropic-şekli, şekil artefaktı olabilir; teyit gerek)" : "ENDPOINT FARK ETMİYOR"}`,
    HINT: "Tüm opus(dot) FAIL + sonnet/haiku OK + dash≈dot + header etkisiz + (büyük=küçük) → wellflow opus-4.8'i DESTEKLEMİYOR (docs'ta yok, max 4.7). Fix: opus-4.8'i devre dışı bırak VEYA destekleyen sağlayıcıya yönlendir. Aksi durumda ilgili verdict koluna göre.",
  };
  console.log(JSON.stringify(out, null, 2));
  await sql.end({ timeout: 5 });
}
main().catch(async (e) => { try { await sql.end({ timeout: 5 }); } catch {} console.log(JSON.stringify({ status: "ERROR", error: String(e?.message ?? e) })); process.exit(1); });
