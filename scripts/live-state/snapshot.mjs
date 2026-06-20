#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const ARCHIVE_ROOT = process.env.YZAPI_ARCHIVE_ROOT || "/Users/ufuk/Documents/Belgeler - ufuk Mac mini/api";
const SNAPSHOT_ROOT = process.env.YZAPI_SNAPSHOT_ROOT || path.join(os.homedir(), ".local/share/yzapi-live-snapshots");
const KEYCHAIN_SERVICE = "yzapi-live-snapshot";
const KEYCHAIN_ACCOUNT = "db-dump";
const SSH_HOST = process.env.YZAPI_SSH_HOST || "yzapi-vps";
const APP_DIR = process.env.YZAPI_REMOTE_APP_DIR || "/opt/turkapiprojesi";
const PUBLIC_BASE_URL = (process.env.YZAPI_PUBLIC_BASE_URL || "https://yapayzekalab.org").replace(/\/+$/, "");
const RETENTION_COUNT = Number(process.env.YZAPI_SNAPSHOT_RETENTION || "7");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", "vendor", "logs"]);
const KEYWORDS = [
  "live", "canli", "canlı", "billing", "provider", "deploy", "payment", "admin",
  "model", "price", "fiyat", "risk", "security", "güvenlik", "guvenlik",
];

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const ONCE = args.has("--once");
const ALLOW_INCOMPLETE = args.has("--allow-incomplete");

if (!DRY_RUN && !ONCE) {
  console.error("usage: node scripts/live-state/snapshot.mjs --dry-run|--once [--allow-incomplete]");
  process.exit(1);
}

function timestampForDir(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function todayForReport(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function statFlags(file) {
  if (process.platform !== "darwin") return "";
  try {
    return execFileSync("/usr/bin/stat", ["-f", "%Sf", file], { encoding: "utf8", timeout: 3000 }).trim();
  } catch {
    return "";
  }
}

function walkMd(root) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(full);
    }
  }
  if (fs.existsSync(root)) walk(root);
  return out.sort();
}

function inspectMd(root, file) {
  const stat = fs.statSync(file);
  const flags = statFlags(file);
  const rel = path.relative(root, file);
  const item = {
    root,
    path: file,
    rel,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    flags,
    sha256: null,
    headings: [],
    keywords: [],
    status: "ok",
    error: null,
  };
  if (flags.includes("dataless")) {
    item.status = "materialize_required";
    return item;
  }
  try {
    const content = fs.readFileSync(file, "utf8");
    item.sha256 = sha256(content);
    item.headings = content
      .split(/\r?\n/)
      .filter((line) => /^#{1,3}\s+/.test(line))
      .slice(0, 8)
      .map((line) => line.replace(/^#+\s*/, ""));
    const lower = content.toLowerCase();
    item.keywords = KEYWORDS.filter((keyword) => lower.includes(keyword.toLowerCase()));
  } catch (error) {
    item.status = "read_error";
    item.error = error instanceof Error ? error.message : String(error);
  }
  return item;
}

function collectMdLedger() {
  const roots = [ARCHIVE_ROOT, REPO_ROOT];
  const files = roots.flatMap((root) => walkMd(root).map((file) => inspectMd(root, file)));
  const materializeRequired = files.filter((file) => file.status === "materialize_required");
  const readErrors = files.filter((file) => file.status === "read_error");
  return {
    roots,
    files,
    totals: {
      files: files.length,
      ok: files.filter((file) => file.status === "ok").length,
      materializeRequired: materializeRequired.length,
      readErrors: readErrors.length,
    },
    materializeRequired: materializeRequired.map((file) => file.path),
    readErrors: readErrors.map((file) => ({ path: file.path, error: file.error })),
  };
}

async function fetchPublic(pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${PUBLIC_BASE_URL}${pathname}`, {
      headers: { "user-agent": "yzapi-live-state-snapshot/1.0" },
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* HTML/static response */ }
    const count = Array.isArray(body)
      ? body.length
      : Array.isArray(body?.data)
        ? body.data.length
        : typeof body?.modelCount === "number"
          ? body.modelCount
          : null;
    return {
      path: pathname,
      status: res.status,
      contentType: res.headers.get("content-type"),
      server: res.headers.get("server"),
      poweredBy: res.headers.get("x-powered-by"),
      bytes: text.length,
      count,
      keys: body && !Array.isArray(body) ? Object.keys(body).slice(0, 16) : Array.isArray(body) ? ["array"] : [],
      prefix: body ? undefined : text.slice(0, 90).replace(/\s+/g, " "),
    };
  } catch (error) {
    return { path: pathname, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function sshText(command, timeout = 15000) {
  try {
    return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", SSH_HOST, command], {
      encoding: "utf8",
      timeout,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

function collectVpsHealth() {
  const command = [
    "set -e",
    "echo HOST=$(hostname)",
    "echo DATE=$(date -Is)",
    "echo SERVICE=$(systemctl is-active turkapiprojesi 2>/dev/null || true)",
    "echo APPDIR=$(test -d /opt/turkapiprojesi && echo yes || echo no)",
    "curl -fsS --max-time 5 http://127.0.0.1:4568/health || true",
  ].join("; ");
  return sshText(command);
}

function collectJournalAggregate() {
  const command = "journalctl -u turkapiprojesi --since '24 hours ago' --no-pager 2>/dev/null | node -e 'let s=\"\";process.stdin.on(\"data\",c=>s+=c);process.stdin.on(\"end\",()=>{const lines=s.split(/\\n/).filter(Boolean);const levels={};const issues={};for(const line of lines){try{const j=JSON.parse(line);if(j.level)levels[j.level]=(levels[j.level]||0)+1;if(j.msg)issues[j.msg]=(issues[j.msg]||0)+1}catch{}}console.log(JSON.stringify({lines:lines.length,levels,topIssues:Object.entries(issues).sort((a,b)=>b[1]-a[1]).slice(0,12)}));})'";
  const raw = sshText(command, 30000);
  try { return JSON.parse(raw); } catch { return { raw: raw.slice(0, 500) }; }
}

function collectDbAggregate() {
  const command = `cd ${APP_DIR} && DOTENV_CONFIG_QUIET=true node - <<'NODE'
require("dotenv").config({ path: ".env.production", quiet: true });
const postgres = require("postgres");
const tables = ${JSON.stringify([
  "users", "api_keys", "payments", "pending_iban_payments", "transactions", "usage_records",
  "audit_logs", "sessions", "kur_history", "model_saglik", "provider_profiles", "system_api_config",
  "model_overrides", "added_models", "announcements", "telegram_accounts", "whatsapp_verified_numbers", "user_webhooks",
])};
(async()=>{
 const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5, connect_timeout: 10 });
 const out = { snapshotUtc: new Date().toISOString(), counts: {}, details: {} };
 out.publicTableCount = Number((await sql\`select count(*) as n from information_schema.tables where table_schema=\${"public"}\`)[0].n);
 for (const t of tables) {
   try { const r = await sql.unsafe(\`select count(*)::int as n from \${t}\`); out.counts[t]=Number(r[0].n); } catch(e) { out.counts[t]="ERR"; }
 }
 out.details.apiKeys = await sql\`select aktif::text as aktif, count(*)::int as n from api_keys group by aktif order by aktif\`;
 out.details.pendingIban = await sql\`select durum, count(*)::int as n from pending_iban_payments group by durum order by durum\`;
 out.details.payments = await sql\`select durum::text as durum, count(*)::int as n from payments group by durum order by durum\`;
 out.details.providers = await sql\`select id, label, enabled, fallback_provider_id from provider_profiles order by id\`;
 out.details.models = await sql\`select provider_id, durum, count(*)::int as n from model_saglik group by provider_id, durum order by provider_id, durum\`;
 out.details.usage24h = await sql\`select status, count(*)::int as n, coalesce(sum(cost_tl),0)::numeric(18,6)::text as cost_tl from usage_records where timestamp > now() - \${"24 hours"}::interval group by status order by status\`;
 out.details.latestKur = (await sql\`select live_kur::text, sell_kur::text, source, created_at from kur_history order by created_at desc limit 1\`)[0] || null;
 console.log(JSON.stringify(out));
 await sql.end({timeout:5});
})().catch(e=>{console.log(JSON.stringify({error:e.message}));});
NODE`;
  const raw = sshText(command, 30000);
  try { return JSON.parse(raw); } catch { return { error: raw.slice(0, 500) }; }
}

function getOrCreatePassphrase() {
  try {
    return execFileSync("security", ["find-generic-password", "-w", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    const passphrase = crypto.randomBytes(48).toString("base64url");
    execFileSync("security", [
      "add-generic-password",
      "-U",
      "-s", KEYCHAIN_SERVICE,
      "-a", KEYCHAIN_ACCOUNT,
      "-w", passphrase,
    ], { stdio: "ignore" });
    return passphrase;
  }
}

function createEncryptedDump(outFile) {
  const passphrase = getOrCreatePassphrase();
  const remoteScript = `cd ${APP_DIR} && DOTENV_CONFIG_QUIET=true node - <<'NODE'
require("dotenv").config({ path: ".env.production", quiet: true });
const { spawn } = require("child_process");
const dbUrl = new URL(process.env.DATABASE_URL);
const pgEnv = {
  ...process.env,
  PGHOST: dbUrl.hostname,
  PGPORT: dbUrl.port || "5432",
  PGUSER: decodeURIComponent(dbUrl.username),
  PGPASSWORD: decodeURIComponent(dbUrl.password),
  PGDATABASE: decodeURIComponent(dbUrl.pathname.replace(/^\\//, "")),
};
delete pgEnv.DATABASE_URL;
const fs = require("fs");
const pgDump = fs.existsSync("/usr/pgsql-14/bin/pg_dump") ? "/usr/pgsql-14/bin/pg_dump" : "pg_dump";
const child = spawn(pgDump, ["--format=custom", "--compress=9", "--no-owner", "--no-acl"], {
  env: pgEnv,
  stdio: ["ignore", "pipe", "inherit"],
});
child.stdout.pipe(process.stdout);
child.on("exit", (code) => process.exit(code || 0));
NODE`;
  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", SSH_HOST, remoteScript], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const openssl = spawn("openssl", [
      "enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-iter", "200000",
      "-pass", "env:YZAPI_LIVE_SNAPSHOT_PASSPHRASE",
      "-out", outFile,
    ], {
      env: { ...process.env, YZAPI_LIVE_SNAPSHOT_PASSPHRASE: passphrase },
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";
    let sshCode = null;
    let opensslCode = null;
    let settled = false;
    const finish = () => {
      if (settled || sshCode === null || opensslCode === null) return;
      settled = true;
      if (sshCode !== 0 || opensslCode !== 0) {
        fs.rmSync(outFile, { force: true });
        reject(new Error(`encrypted dump failed (ssh=${sshCode}, openssl=${opensslCode}): ${stderr.slice(0, 1000)}`));
        return;
      }
      const bytes = fs.statSync(outFile).size;
      if (bytes < 1024) {
        fs.rmSync(outFile, { force: true });
        reject(new Error(`encrypted dump too small (${bytes} bytes)`));
        return;
      }
      resolve();
    };
    ssh.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    openssl.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    ssh.stdout.pipe(openssl.stdin);
    ssh.on("error", reject);
    openssl.on("error", reject);
    ssh.on("close", (code) => { sshCode = code ?? 1; finish(); });
    openssl.on("close", (code) => { opensslCode = code ?? 1; finish(); });
  });
}

function removeOldSnapshots() {
  if (!fs.existsSync(SNAPSHOT_ROOT)) return [];
  const dirs = fs.readdirSync(SNAPSHOT_ROOT)
    .map((name) => ({ name, full: path.join(SNAPSHOT_ROOT, name) }))
    .filter((entry) => fs.statSync(entry.full).isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name));
  const removed = [];
  for (const entry of dirs.slice(RETENTION_COUNT)) {
    fs.rmSync(entry.full, { recursive: true, force: true });
    removed.push(entry.full);
  }
  return removed;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function markdownReport(snapshot) {
  const publicRows = snapshot.public.map((row) => `- ${row.path}: status=${row.status ?? "ERR"} count=${row.count ?? "-"} type=${row.contentType ?? "-"}`).join("\n");
  const dbCounts = Object.entries(snapshot.db.counts || {}).map(([key, value]) => `- ${key}: ${value}`).join("\n");
  const materialize = snapshot.md.materializeRequired.length
    ? snapshot.md.materializeRequired.map((file) => `- ${file}`).join("\n")
    : "- Yok";
  return `# Canli Guncel Durum - ${todayForReport()}

Snapshot UTC: ${snapshot.snapshotUtc}
Complete: ${snapshot.complete ? "evet" : "hayir"}

## Public endpointler

${publicRows}

## DB sayimlari

Public table count: ${snapshot.db.publicTableCount ?? "-"}

${dbCounts}

## MD ledger

- Toplam: ${snapshot.md.totals.files}
- Okundu: ${snapshot.md.totals.ok}
- Materialize gerekli: ${snapshot.md.totals.materializeRequired}
- Read error: ${snapshot.md.totals.readErrors}

### Materialize gerekli dosyalar

${materialize}

## Dump

- Encrypted dump: ${snapshot.dump?.file || "dry-run"}
- SHA256: ${snapshot.dump?.sha256 || "-"}

## Not

Bu rapor secret veya ham musteri satiri icermez. Tam dump yalnizca sifreli lokal arsivde tutulur.
`;
}

function writeReports(snapshot, snapshotDir) {
  const archiveReport = path.join(ARCHIVE_ROOT, `CANLI_GUNCEL_DURUM_${todayForReport()}.md`);
  const repoReport = path.join(REPO_ROOT, "docs/live-state-current.md");
  fs.writeFileSync(archiveReport, markdownReport(snapshot));
  fs.writeFileSync(repoReport, markdownReport(snapshot));
  fs.writeFileSync(path.join(snapshotDir, "report.md"), markdownReport(snapshot));
  return { archiveReport, repoReport };
}

async function main() {
  const snapshotUtc = new Date().toISOString();
  const md = collectMdLedger();
  const publicPaths = ["/health", "/status", "/api/models", "/v1/models", "/robots.txt", "/sitemap.xml"];
  const publicResults = [];
  for (const pathname of publicPaths) publicResults.push(await fetchPublic(pathname));
  const vpsHealth = collectVpsHealth();
  const journal = collectJournalAggregate();
  const db = collectDbAggregate();
  const complete = md.totals.materializeRequired === 0 && md.totals.readErrors === 0;

  const snapshot = {
    snapshotUtc,
    complete,
    roots: { archive: ARCHIVE_ROOT, repo: REPO_ROOT, snapshotRoot: SNAPSHOT_ROOT },
    md,
    public: publicResults,
    vps: { health: vpsHealth, journal },
    db,
    dump: null,
  };

  if (!complete && !ALLOW_INCOMPLETE) {
    console.log(JSON.stringify({
      status: "incomplete",
      reason: "materialize_required_or_read_error",
      md: md.totals,
      materializeRequired: md.materializeRequired.slice(0, 30),
      hint: "iCloud dataless dosyalari indirildikten sonra tekrar calistir veya --allow-incomplete kullan.",
    }, null, 2));
    process.exit(2);
  }

  if (DRY_RUN) {
    console.log(JSON.stringify({
      status: complete ? "ok" : "incomplete_allowed",
      dryRun: true,
      md: md.totals,
      public: publicResults.map((row) => ({ path: row.path, status: row.status, count: row.count })),
      dbCounts: db.counts,
    }, null, 2));
    return;
  }

  fs.mkdirSync(SNAPSHOT_ROOT, { recursive: true });
  const snapshotDir = path.join(SNAPSHOT_ROOT, timestampForDir());
  fs.mkdirSync(snapshotDir, { recursive: true });
  const dumpFile = path.join(snapshotDir, "live-db.dump.openssl");
  await createEncryptedDump(dumpFile);
  snapshot.dump = {
    file: dumpFile,
    bytes: fs.statSync(dumpFile).size,
    sha256: sha256(fs.readFileSync(dumpFile)),
  };
  fs.writeFileSync(`${dumpFile}.sha256`, `${snapshot.dump.sha256}  ${path.basename(dumpFile)}\n`);
  writeJson(path.join(snapshotDir, "manifest.json"), snapshot);
  writeJson(path.join(snapshotDir, "md-ledger.json"), md);
  const reports = writeReports(snapshot, snapshotDir);
  const removed = removeOldSnapshots();
  console.log(JSON.stringify({ status: "ok", snapshotDir, dump: snapshot.dump, reports, removed }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
