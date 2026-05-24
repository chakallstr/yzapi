#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = process.argv.slice(2);
const scanRoots = roots.length ? roots : ["dist/index.html", "dist/assets"];
const needles = [
  "CLOSEROUTER_API_KEY",
  "closerouter_",
  "textCarpan",
  "imageCarpan",
  "videoCarpan",
  "textBillingRatio",
  "billingRatio",
  "billing ratio",
  "Satış çarpanı",
  "1 USD =",
  "formül",
  "formula",
  "2.30x",
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
