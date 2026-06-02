#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = process.argv.slice(2);
const scanRoots = roots.length ? roots : ["dist/index.html", "dist/assets"];
const phrase = (...parts) => parts.join("");
const hiddenToken = (...parts) => parts.join("");
const needles = [
  "CLOSEROUTER_API_KEY",
  "closerouter_",
  hiddenToken("close", "router"),
  hiddenToken("omni", "route"),
  hiddenToken("well", "flow"),
  hiddenToken("claude-", "popusk"),
  hiddenToken("stepan", "ovikov"),
  hiddenToken("pop", "usk"),
  hiddenToken("met", "ro"),
  phrase("api.", "wellflow"),
  "textCarpan",
  "imageCarpan",
  "videoCarpan",
  hiddenToken("text", "Billing", "Ratio"),
  hiddenToken("billing", "Ratio"),
  hiddenToken("billing ", "ratio"),
  hiddenToken("text_", "billing_", "ratio"),
  hiddenToken("900", "K"),
  hiddenToken("900", "_000"),
  hiddenToken("1M ", "internal"),
  hiddenToken("1_000", "_000"),
  "Satış çarpanı",
  "Sağlayıcı maliyeti ×",
  "× 3.0",
  "× 2.3",
  "1 USD =",
  "formül",
  "formula",
  "2.30x",
  phrase("Scientific", "Data"),
  phrase("Molek", "üler analiz"),
  phrase("Bilimsel ", "veri formatları"),
  phrase("Demo ", "Modu"),
  phrase("/api/", "files"),
  phrase("/api/", "route-agent"),
  phrase("Route ", "Simulator"),
  phrase("Dosya ", "analizi"),
  phrase("api.yzlab.ai", "/v2/route"),
  phrase("Dataset ", "upload"),
  phrase("Route ", "Agent"),
  phrase("File ", "analysis"),
  phrase("Sim", "ülasyon"),
  phrase("MODEL MAL", "İYETİNİ SAKLAMAYAN AI API"),
  phrase("model maliyetini ", "saklamayan"),
  phrase("TÜRK GELİŞTİRİCİLER ", "İÇİN AI API PLATFORMU"),
  "tailwindcss",
  "Space Grotesk",
  "JetBrains Mono",
  "skeleton-shimmer",
];

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];
  const out = [];
  for (const entry of entries) out.push(...await files(join(path, entry.name)));
  return out;
}

const allFiles = (await Promise.all(scanRoots.map(files))).flat();
const hits = [];

for (const file of allFiles) {
  const text = await readFile(file, "utf8").catch(() => "");
  for (const needle of needles) {
    if (text.includes(needle)) hits.push({ file, needle });
  }
}

console.log(JSON.stringify({ scanned: allFiles.length, hits }, null, 2));
if (hits.length) process.exit(1);
