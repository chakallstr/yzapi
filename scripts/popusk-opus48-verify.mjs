#!/usr/bin/env node
/**
 * Claude Popusk reseller — opus-4.8 KARAR doğrulaması (STANDALONE, SALT-OKUNUR).
 *
 * Amaç: YENİ Popusk reseller key ile, PRODUCTION'A GEÇMEDEN ÖNCE şunları kanıtla:
 *   1) opus-4.8 Popusk'ta GERÇEKTEN çalışıyor mu? (sağlayıcı wire-id = DASH: claude-opus-4-8)
 *   2) model_map NEDEN gerekli? (bizim canonical DOT id'miz claude-opus-4.8 UNMAPPED → 404/400 vermeli)
 *   3) Sağlayıcı genel olarak sağlıklı mı? (sonnet kontrol kasası çalışmalı)
 *
 * Bu script DB'ye DOKUNMAZ, billing import ETMEZ, ham key BASMAZ (yalnız maskeli first3****last4).
 * Sağlayıcıyı DOĞRUDAN sağlayıcı key'iyle çağırır; bizim sistemimize göre SALT-OKUNUR.
 * messages-502-probe.mjs stiliyle modellendi ama DB GEREKTİRMEZ (key env ile verilir).
 *
 * ÇALIŞTIRMA:
 *   POPUSK_API_KEY='...' node scripts/popusk-opus48-verify.mjs
 *
 * Opsiyonel:
 *   POPUSK_BASE_URL='https://api.claude-popusk.shop/v1'   (varsayılan)
 *   ENV_FILE_PATH=/path/.env  node scripts/popusk-opus48-verify.mjs   (key'i dosyadan yükler)
 */
import { readFileSync } from "node:fs";

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

const BASE_URL = (process.env.POPUSK_BASE_URL || "https://api.claude-popusk.shop/v1").replace(/\/$/, "");
const KEY = process.env.POPUSK_API_KEY;
if (!KEY) {
  console.log(JSON.stringify({ status: "BLOCKED", reason: "POPUSK_API_KEY yok (env ile verin: POPUSK_API_KEY='...' node scripts/popusk-opus48-verify.mjs)" }));
  process.exit(2);
}

const mask = (k) => (k ? `${k.slice(0, 3)}****${k.slice(-4)}` : null);
const N = 4; // her kasa tekrar (tek-flake hassasiyetini azaltır)

/**
 * Sağlayıcıyı DOĞRUDAN çağırır. Proxy-birebir header'lar (Auth/Content-Type/Accept).
 * shape: "messages" (Anthropic-şekli) | "chat" (OpenAI-şekli)
 */
async function post({ model, endpoint = "messages", shape = "messages" }) {
  const url = `${BASE_URL}/${endpoint}`;
  const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" };
  const body = shape === "chat"
    ? { model, max_tokens: 16, messages: [{ role: "user", content: "hi" }] }
    : { model, max_tokens: 16, messages: [{ role: "user", content: "hi" }] };
  const t0 = Date.now();
  try {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await resp.text();
    return { http: resp.status, ms: Date.now() - t0, body: text };
  } catch (e) {
    return { http: -1, ms: Date.now() - t0, body: String(e?.message ?? e) };
  }
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
  return {
    n: runs.length,
    ok,
    fail: runs.length - ok,
    failRate: +(1 - ok / runs.length).toFixed(2),
    statuses,
    msAvg: Math.round(msSum / runs.length),
    sampleErr,
  };
}

async function runCase(spec, n) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(await post(spec));
  return summarize(runs);
}

async function main() {
  const cases = {
    // Sağlayıcının WIRE-ID'si = DASH → ÇALIŞAN olması beklenir.
    opus48_dash_messages: { model: "claude-opus-4-8", endpoint: "messages", shape: "messages" },
    // Bizim canonical DOT id'miz UNMAPPED → 404/400 vermeli (model_map'in NEDEN gerekli olduğunu kanıtlar).
    opus48_dot_messages: { model: "claude-opus-4.8", endpoint: "messages", shape: "messages" },
    // DASH, OpenAI-şekli /chat/completions — sanity.
    opus48_dash_chat: { model: "claude-opus-4-8", endpoint: "chat/completions", shape: "chat" },
    // Kontrol kasası — sağlayıcı genel sağlığı (çalışmalı).
    sonnet46_messages: { model: "claude-sonnet-4-6", endpoint: "messages", shape: "messages" },
  };

  const out = {
    status: "OK",
    base_url: BASE_URL,
    masked_key: mask(KEY),
    n_per_case: N,
    results: {},
  };
  for (const [name, spec] of Object.entries(cases)) out.results[name] = await runCase(spec, N);

  const r = out.results;
  const fr = (k) => r[k]?.failRate ?? null;
  const dashOk = fr("opus48_dash_messages") !== null && fr("opus48_dash_messages") < 0.3;
  const dotFails = fr("opus48_dot_messages") !== null && fr("opus48_dot_messages") >= 0.3;
  const sonnetOk = fr("sonnet46_messages") !== null && fr("sonnet46_messages") < 0.3;

  out.verdict = {
    opus48_works_on_popusk: dashOk, // dash failRate < 0.3
    mapNeeded: dashOk && dotFails,  // dash çalışıyor && dot patlıyor → model_map (dot→dash) ŞART
    provider_healthy: sonnetOk,     // kontrol kasası çalışıyor
    summary:
      `dash=${fr("opus48_dash_messages")} dot=${fr("opus48_dot_messages")} dash_chat=${fr("opus48_dash_chat")} sonnet=${fr("sonnet46_messages")} → ` +
      (dashOk && dotFails && sonnetOk
        ? "GEÇ: opus-4.8 Popusk'ta DASH ile çalışıyor; DOT unmapped patlıyor; model_map(claude-opus-4.8→claude-opus-4-8) ekle, sonra production'a al."
        : !sonnetOk
          ? "DUR: kontrol kasası (sonnet) FAIL — sağlayıcı/key sağlıksız, opus sonucu güvenilmez."
          : !dashOk
            ? "DUR: opus-4.8 DASH bile Popusk'ta çalışmıyor — bu reseller opus-4.8 sunmuyor; production'a ALMA."
            : !dotFails
              ? "DİKKAT: DOT id de çalışıyor — sağlayıcı dot'u kabul ediyor; model_map gerekmeyebilir, yine de canonical-id netleştir."
              : "BELİRSİZ — sampleErr gövdelerini incele."),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", error: String(e?.message ?? e) }));
  process.exit(1);
});
