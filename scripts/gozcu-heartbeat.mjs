#!/usr/bin/env node
// Gözcü — DIŞ heartbeat nöbetçisi (uygulamadan TAMAMEN bağımsız).
//
// Uygulama-içi gozcu-job kendi ölümünü (process/DB/event-loop) bildiremez. Bu betik
// ayrı bir systemd timer ile 60s'te bir çalışır, /health'i yoklar ve N ardışık başarısızlıkta
// DOĞRUDAN OpenWA WhatsApp API'sine yazar (uygulamayı bypass eder). Uygulama kodunu IMPORT
// ETMEZ; .env'i kendi mini-reader'ıyla okur (build hatası bu betiği düşüremez). Bağımlılıksız:
// yalnız Node built-in fetch/fs. Tek-atış (oneshot) — systemd timer tekrar tetikler.
//
// State dosyası DOWN/RECOVERED dedup'u yapar: bir kesintide TEK "DOWN" + TEK "RECOVERED".

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// ── .env mini-reader (process.env önce; eksikse dosyadan tamamla) ───────────────
function loadEnv() {
  const out = { ...process.env };
  for (const file of [".env.production", ".env"]) {
    if (out.OPENWA_API_URL) break; // yeterli config zaten var
    try {
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1];
        let val = m[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (out[key] === undefined) out[key] = val;
      }
    } catch {
      /* dosya okunamadı — yok say */
    }
  }
  return out;
}

// TR telefon → WhatsApp chatId (admin-notify-service ile birebir mantık).
function toChatId(raw) {
  const input = String(raw ?? "").trim();
  if (/@(c|g)\.us$/i.test(input)) return input;
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  else if (digits.startsWith("5")) digits = `90${digits}`;
  return digits ? `${digits}@c.us` : "";
}

async function sendWhatsApp(env, text) {
  const base = String(env.OPENWA_API_URL).replace(/\/+$/, "");
  const session = encodeURIComponent(env.OPENWA_SESSION_ID);
  const chatId = toChatId(env.ADMIN_WHATSAPP_NUMBER);
  if (!chatId) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${base}/api/sessions/${session}/messages/send-text`, {
      method: "POST",
      headers: { "x-api-key": String(env.OPENWA_API_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

async function probeHealth(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { healthy: false, reason: `HTTP ${res.status}` };
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* gövde JSON değil — 200 yeterli */
    }
    if (body && body.checks && body.checks.db && body.checks.db !== "ok") {
      return { healthy: false, reason: `db=${body.checks.db}` };
    }
    return { healthy: true, reason: "ok" };
  } catch {
    clearTimeout(timer);
    return { healthy: false, reason: "bağlanılamadı / timeout" };
  }
}

function readState(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { consecutiveFailures: 0, alertedDown: false };
  }
}

function writeState(path, state) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state));
  } catch {
    /* yazılamadı — bir sonraki turda yeniden dener */
  }
}

function ts() {
  // Avrupa/İstanbul yerel saat etiketi (env TZ'ye saygı; varsayılan sistem saati).
  return new Date().toLocaleString("tr-TR");
}

async function main() {
  const env = loadEnv();
  const url = env.GOZCU_HEARTBEAT_URL || "http://127.0.0.1:4567/health";
  const threshold = Number(env.GOZCU_HEARTBEAT_FAIL_THRESHOLD || 3);
  const statePath = env.GOZCU_HEARTBEAT_STATE_FILE || ".sentinel/heartbeat-state.json";
  const configured =
    String(env.ADMIN_NOTIFY_WHATSAPP_ENABLED) === "true" &&
    env.OPENWA_API_URL &&
    env.OPENWA_API_KEY &&
    env.OPENWA_SESSION_ID &&
    env.ADMIN_WHATSAPP_NUMBER;

  const { healthy, reason } = await probeHealth(url);
  const state = readState(statePath);

  if (healthy) {
    if (state.alertedDown && configured) {
      await sendWhatsApp(env, `🟢 Gözcü — yzapi yine AYAKTA (${ts()})`);
    }
    writeState(statePath, { consecutiveFailures: 0, alertedDown: false });
    console.log(`[gozcu-heartbeat] ok (${url})`);
    return;
  }

  const consecutiveFailures = (state.consecutiveFailures || 0) + 1;
  let alertedDown = !!state.alertedDown;
  if (consecutiveFailures >= threshold && !alertedDown) {
    if (configured) {
      await sendWhatsApp(
        env,
        `🔴 Gözcü — yzapi ERİŞİLEMİYOR\nNeden: ${reason}\nArt arda ${consecutiveFailures} başarısız yoklama\n${ts()}`,
      );
    }
    alertedDown = true;
  }
  writeState(statePath, { consecutiveFailures, alertedDown });
  console.error(`[gozcu-heartbeat] DOWN (${reason}) failures=${consecutiveFailures}`);
}

main().catch((e) => {
  console.error("[gozcu-heartbeat] beklenmedik hata:", e?.message || e);
  process.exit(0); // nöbetçi asla "fail" exit vermez — systemd timer'ı bozmasın
});
