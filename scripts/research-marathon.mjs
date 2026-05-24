#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const RUN_MINUTES = Number(process.env.RESEARCH_MINUTES ?? "120");
const PORT = Number(process.env.RESEARCH_PORT ?? "4599");
const STARTED_AT = new Date();
const END_AT = new Date(STARTED_AT.getTime() + RUN_MINUTES * 60_000);
const RUN_ID = process.env.RESEARCH_RUN_ID ?? STARTED_AT.toISOString().replace(/[:.]/g, "-");
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "agent-team", "research-marathon", RUN_ID);
const LIVE_DIR = path.join(ROOT, "agent-team", "research-marathon", "live");
const REPORT_PATH = path.join(OUT_DIR, "API_SYSTEM_RESEARCH_REPORT.md");
const LIVE_REPORT_PATH = path.join(LIVE_DIR, "API_SYSTEM_RESEARCH_REPORT.md");
const STATUS_PATH = path.join(LIVE_DIR, "status.json");
const EVENTS_PATH = path.join(OUT_DIR, "events.jsonl");
const REPOS_PATH = path.join(OUT_DIR, "repos.jsonl");
const CODE_PATH = path.join(OUT_DIR, "code-hits.jsonl");
const FINDINGS_PATH = path.join(OUT_DIR, "findings.jsonl");

const AGENTS = [
  {
    id: "agent-backend-provider",
    name: "Backend / Provider / Router",
    mission: "OpenAI-compatible proxy, provider adapter, streaming billing, catalog sync, fallback router, image/video task flow.",
    queries: [
      "litellm",
      "one-api openai",
      "new-api openai",
      "openai proxy",
      "llm gateway",
      "ai gateway",
      "openai api gateway",
      "openai compatible",
      "provider adapter openai",
      "openrouter",
      "gemini openai proxy",
      "llm router",
    ],
    codeQueries: [
      "chat.completions",
      "chat/completions",
      "x-request-id",
      "images/generations",
      "videos/tasks",
      "provider adapter",
      "model catalog pricing",
      "stream_options include_usage",
    ],
  },
  {
    id: "agent-billing-security",
    name: "Billing / Security / Ops / Panel",
    mission: "TL prepaid wallet, append-only ledger, API key lifecycle, webhook idempotency, rate limit, audit, customer/admin panel, deploy/observability.",
    queries: [
      "api key management",
      "stripe webhook idempotency",
      "wallet ledger",
      "saas billing postgres",
      "prepaid billing",
      "rate limit redis express",
      "audit log nodejs",
      "usage dashboard api",
      "payment webhook nodejs",
      "crypto payment webhook",
      "billing ledger",
      "customer portal billing",
    ],
    codeQueries: [
      "api key hash",
      "api key prefix",
      "ledger_entries",
      "idempotency_key",
      "rate limit redis",
      "audit log",
      "usage_records",
      "webhook idempotency",
    ],
  },
];

const state = {
  runId: RUN_ID,
  status: "starting",
  startedAt: STARTED_AT.toISOString(),
  endAt: END_AT.toISOString(),
  port: PORT,
  agents: Object.fromEntries(AGENTS.map((agent) => [agent.id, {
    name: agent.name,
    mission: agent.mission,
    cycle: 0,
    currentQuery: "",
    repoSearches: 0,
    codeSearches: 0,
    reposSeen: 0,
    codeHitsSeen: 0,
    findings: 0,
    lastError: null,
    lastEvent: "waiting",
  }])),
  totals: {
    uniqueRepos: 0,
    codeHits: 0,
    findings: 0,
    events: 0,
  },
  topRepos: [],
  latestFindings: [],
};

const repoMap = new Map();
const codeHitMap = new Map();
const findingMap = new Map();

function shellJson(cmd, args, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 12 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || error.message}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "[]"));
      } catch (parseError) {
        reject(new Error(`JSON parse failed for ${cmd}: ${parseError.message}`));
      }
    });
  });
}

function gh(args, timeoutMs) {
  return shellJson("gh", args, timeoutMs);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function appendJsonl(file, data) {
  await appendFile(file, `${JSON.stringify(data)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function timeLeftMs() {
  return Math.max(0, END_AT.getTime() - Date.now());
}

async function event(agentId, type, message, extra = {}) {
  const entry = { at: nowIso(), agentId, type, message, ...extra };
  state.totals.events += 1;
  if (state.agents[agentId]) state.agents[agentId].lastEvent = message;
  await appendJsonl(EVENTS_PATH, entry);
  await persistStatus();
}

function repoScore(repo, signals) {
  const stars = Number(repo.stargazersCount ?? repo.stargazerCount ?? 0);
  const updatedAt = repo.updatedAt ? Date.parse(repo.updatedAt) : 0;
  const freshness = updatedAt > Date.now() - 365 * 24 * 60 * 60 * 1000 ? 20 : 0;
  return Math.round(Math.log10(stars + 1) * 25 + freshness + signals.length * 8);
}

function extractSignals(text) {
  const t = String(text || "").toLowerCase();
  const signalMap = {
    "openai-compatible": ["openai compatible", "chat/completions", "responses api", "messages api"],
    "provider-adapter": ["provider adapter", "provider", "fallback", "router"],
    "streaming": ["streaming", "sse", "server-sent"],
    "usage-metering": ["usage", "metering", "tokens", "cost", "billing"],
    "wallet-ledger": ["ledger", "wallet", "balance", "prepaid"],
    "webhook-idempotency": ["webhook", "idempotency", "idempotent"],
    "api-key-security": ["api key", "hash", "prefix", "revoke"],
    "rate-limit": ["rate limit", "ratelimit", "quota", "redis"],
    "admin-panel": ["admin", "dashboard", "usage logs", "pricing"],
    "observability": ["observability", "tracing", "metrics", "pino", "prometheus"],
    "image-video": ["image generation", "video generation", "videos_task", "images/generations"],
  };
  return Object.entries(signalMap)
    .filter(([, needles]) => needles.some((needle) => t.includes(needle)))
    .map(([signal]) => signal);
}

async function fetchReadme(fullName) {
  try {
    const data = await gh(["api", `repos/${fullName}/readme`], 30_000);
    if (!data?.content) return "";
    return Buffer.from(String(data.content).replace(/\n/g, ""), "base64").toString("utf8").slice(0, 80_000);
  } catch {
    return "";
  }
}

async function searchRepos(agent, query) {
  let rows = await gh([
    "search", "repos", query,
    "--limit", "10",
    "--json", "fullName,description,stargazersCount,url,updatedAt,language",
  ], 60_000);
  if (!rows.length && query.includes(" ")) {
    const fallback = query.split(/\s+/).slice(0, 2).join(" ");
    await event(agent.id, "repo-search-empty", `no repo results; fallback: ${fallback}`);
    rows = await gh([
      "search", "repos", fallback,
      "--limit", "10",
      "--json", "fullName,description,stargazersCount,url,updatedAt,language",
    ], 60_000);
  }
  state.agents[agent.id].repoSearches += 1;
  if (!rows.length) {
    await event(agent.id, "repo-search-empty", `no repo results: ${query}`);
  }
  for (const repo of rows) {
    const key = repo.fullName;
    const baseText = `${repo.fullName}\n${repo.description || ""}`;
    const readme = await fetchReadme(repo.fullName);
    const signals = [...new Set([...extractSignals(baseText), ...extractSignals(readme)])];
    const record = {
      at: nowIso(),
      agentId: agent.id,
      query,
      fullName: repo.fullName,
      url: repo.url,
      description: repo.description,
      stars: repo.stargazersCount,
      language: repo.language ?? null,
      updatedAt: repo.updatedAt,
      signals,
      score: repoScore(repo, signals),
      readmeExcerpt: readme.slice(0, 1200),
    };
    const existing = repoMap.get(key);
    if (!existing || record.score > existing.score) {
      repoMap.set(key, record);
      await appendJsonl(REPOS_PATH, record);
    }
    if (signals.length) {
      const findingKey = `${agent.id}:${repo.fullName}:${signals.join("|")}`;
      if (!findingMap.has(findingKey)) {
        const finding = {
          at: nowIso(),
          agentId: agent.id,
          source: repo.url,
          title: repo.fullName,
          signals,
          whyItMatters: explainSignals(signals),
          nextUse: recommendUse(signals),
        };
        findingMap.set(findingKey, finding);
        await appendJsonl(FINDINGS_PATH, finding);
      }
    }
  }
}

async function searchCode(agent, query) {
  try {
    const rows = await gh([
      "search", "code", query,
      "--limit", "10",
      "--json", "path,repository,url",
    ], 60_000);
    state.agents[agent.id].codeSearches += 1;
    for (const hit of rows) {
      const key = `${hit.repository?.fullName}:${hit.path}`;
      if (codeHitMap.has(key)) continue;
      const record = {
        at: nowIso(),
        agentId: agent.id,
        query,
        repository: hit.repository?.fullName,
        path: hit.path,
        url: hit.url,
      };
      codeHitMap.set(key, record);
      await appendJsonl(CODE_PATH, record);
    }
  } catch (error) {
    await event(agent.id, "warn", "code search skipped/rate-limited", { error: String(error.message || error).slice(0, 300) });
  }
}

function explainSignals(signals) {
  const notes = {
    "openai-compatible": "API yüzeyini OpenAI uyumlu tutmak için örnek contract ve SDK davranışı sağlar.",
    "provider-adapter": "CloseRouter/9Router/başka provider geçişini billing katmanından ayırır.",
    "streaming": "Stream cevabında usage ve hata durumlarını doğru kapatmak için kritik.",
    "usage-metering": "Token, saniye, görsel birimi ve kalan bakiye kanıtı için gerekli.",
    "wallet-ledger": "Bakiye negatif olmadan para hareketlerini açıklanabilir yapar.",
    "webhook-idempotency": "Ödeme tekrarlarında çift bakiye yüklemeyi engeller.",
    "api-key-security": "Müşteri key güvenliği, revoke, prefix lookup ve sızıntı azaltma için gerekli.",
    "rate-limit": "Kötüye kullanım ve maliyet patlamasını sınırlar.",
    "admin-panel": "Model aç/kapat, fiyat override ve kullanıcı itiraz kanıtı için gerekli.",
    "observability": "Production hatalarını request_id ile izlenebilir yapar.",
    "image-video": "Text dışı modalitelerde usage/billing varsayım risklerini azaltır.",
  };
  return signals.map((signal) => notes[signal] ?? signal).join(" ");
}

function recommendUse(signals) {
  if (signals.includes("wallet-ledger") || signals.includes("webhook-idempotency")) return "Ledger/payment idempotency tasarımına aday örnek.";
  if (signals.includes("provider-adapter") || signals.includes("openai-compatible")) return "ProviderAdapter ve OpenAI-compatible proxy tasarımına aday örnek.";
  if (signals.includes("streaming") || signals.includes("usage-metering")) return "Streaming metering ve kullanım kaydı testlerine aday örnek.";
  if (signals.includes("api-key-security") || signals.includes("rate-limit")) return "Security/abuse guard tasarımına aday örnek.";
  return "Mimari fikir ve checklist için değerlendir.";
}

function refreshDerivedState() {
  const topRepos = [...repoMap.values()].sort((a, b) => b.score - a.score).slice(0, 25);
  state.totals.uniqueRepos = repoMap.size;
  state.totals.codeHits = codeHitMap.size;
  state.totals.findings = findingMap.size;
  state.topRepos = topRepos.map(({ readmeExcerpt, ...repo }) => repo);
  state.latestFindings = [...findingMap.values()].slice(-20).reverse();
  for (const agent of AGENTS) {
    const agentRepos = [...repoMap.values()].filter((repo) => repo.agentId === agent.id).length;
    const agentCode = [...codeHitMap.values()].filter((hit) => hit.agentId === agent.id).length;
    const agentFindings = [...findingMap.values()].filter((finding) => finding.agentId === agent.id).length;
    state.agents[agent.id].reposSeen = agentRepos;
    state.agents[agent.id].codeHitsSeen = agentCode;
    state.agents[agent.id].findings = agentFindings;
  }
}

async function persistStatus() {
  refreshDerivedState();
  await writeJson(STATUS_PATH, {
    ...state,
    now: nowIso(),
    remainingSeconds: Math.ceil(timeLeftMs() / 1000),
    reportPath: REPORT_PATH,
    liveReportPath: LIVE_REPORT_PATH,
  });
}

function markdownTable(rows, columns) {
  const header = `| ${columns.map((col) => col.label).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((col) => String(col.value(row) ?? "").replace(/\|/g, "\\|").slice(0, 280)).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}

async function writeReport(final = false) {
  refreshDerivedState();
  const topFindings = [...findingMap.values()].slice(-80).reverse();
  const topRepos = [...repoMap.values()].sort((a, b) => b.score - a.score).slice(0, 30);
  const md = [
    `# YapayZekaLab API Sistemi 2 Saatlik Araştırma Raporu`,
    "",
    `- Durum: ${final ? "tamamlandı" : "devam ediyor"}`,
    `- Run ID: \`${RUN_ID}\``,
    `- Başlangıç: ${STARTED_AT.toISOString()}`,
    `- Bitiş hedefi: ${END_AT.toISOString()}`,
    `- Kalan süre: ${Math.ceil(timeLeftMs() / 1000)} sn`,
    `- Toplam benzersiz repo: ${state.totals.uniqueRepos}`,
    `- Toplam code hit: ${state.totals.codeHits}`,
    `- Toplam bulgu: ${state.totals.findings}`,
    "",
    "## Agent Hatları",
    "",
    ...AGENTS.map((agent) => `### ${agent.name}\n\n${agent.mission}\n\n- Cycle: ${state.agents[agent.id].cycle}\n- Son query: \`${state.agents[agent.id].currentQuery || "-"}\`\n- Repo araması: ${state.agents[agent.id].repoSearches}\n- Code araması: ${state.agents[agent.id].codeSearches}\n- Repo: ${state.agents[agent.id].reposSeen}\n- Code hit: ${state.agents[agent.id].codeHitsSeen}\n- Bulgu: ${state.agents[agent.id].findings}\n- Son olay: ${state.agents[agent.id].lastEvent}`),
    "",
    "## En Güçlü Repo Adayları",
    "",
    topRepos.length ? markdownTable(topRepos, [
      { label: "Repo", value: (row) => `[${row.fullName}](${row.url})` },
      { label: "Skor", value: (row) => row.score },
      { label: "Star", value: (row) => row.stars },
      { label: "Sinyal", value: (row) => row.signals.join(", ") },
      { label: "Neden", value: (row) => recommendUse(row.signals) },
    ]) : "_Henüz repo yok._",
    "",
    "## İşimize Yarayan Kalıplar",
    "",
    summarizePatterns([...findingMap.values()]),
    "",
    "## Uygulama Fikirleri",
    "",
    implementationIdeas([...findingMap.values()]),
    "",
    "## Son Bulgu Akışı",
    "",
    topFindings.length ? markdownTable(topFindings.slice(0, 30), [
      { label: "Agent", value: (row) => row.agentId },
      { label: "Kaynak", value: (row) => `[${row.title}](${row.source})` },
      { label: "Sinyal", value: (row) => row.signals.join(", ") },
      { label: "Kullanım", value: (row) => row.nextUse },
    ]) : "_Henüz bulgu yok._",
    "",
    "## Ham Veri",
    "",
    `- Events: \`${EVENTS_PATH}\``,
    `- Repos: \`${REPOS_PATH}\``,
    `- Code hits: \`${CODE_PATH}\``,
    `- Findings: \`${FINDINGS_PATH}\``,
    "",
  ].join("\n");
  await writeFile(REPORT_PATH, md);
  await writeFile(LIVE_REPORT_PATH, md);
}

function summarizePatterns(findings) {
  const counts = new Map();
  for (const finding of findings) for (const signal of finding.signals) counts.set(signal, (counts.get(signal) || 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([signal, count]) => ({ signal, count, note: explainSignals([signal]) }));
  if (!rows.length) return "_Araştırma sinyalleri toplandıkça bu bölüm dolacak._";
  return markdownTable(rows, [
    { label: "Kalıp", value: (row) => row.signal },
    { label: "Adet", value: (row) => row.count },
    { label: "Bizdeki karşılığı", value: (row) => row.note },
  ]);
}

function implementationIdeas(findings) {
  const signals = new Set(findings.flatMap((finding) => finding.signals));
  const ideas = [];
  if (signals.has("provider-adapter") || signals.has("openai-compatible")) ideas.push("ProviderAdapter sınırını koru: CloseRouter direct MVP, 9Router/fallback sadece adapter arkasında POC.");
  if (signals.has("streaming") || signals.has("usage-metering")) ideas.push("Streaming metering için final usage event yoksa pessimistic reserve + reconcile tasarımı ekle.");
  if (signals.has("wallet-ledger") || signals.has("webhook-idempotency")) ideas.push("Bakiye kaynağı append-only ledger olsun; cached balance sadece okunabilir hızlandırıcı olsun.");
  if (signals.has("api-key-security")) ideas.push("API key sadece bir kez gösterilsin; DB’de hash + kısa prefix + revoked_at + last_used_at tutulmalı.");
  if (signals.has("rate-limit")) ideas.push("Rate limit memory yerine Redis/Postgres tabanlı, user+key+route+model bazlı olmalı.");
  if (signals.has("image-video")) ideas.push("Image/video usage birimleri canlı upstream response ile doğrulanmadan production billing açılmamalı.");
  if (signals.has("observability")) ideas.push("Her istek `X-YZ-Request-Id`, upstream request id, model snapshot id, pricing snapshot id ile izlenmeli.");
  if (!ideas.length) ideas.push("Araştırma devam ediyor; fikirler bulgular geldikçe netleşecek.");
  return ideas.map((idea) => `- ${idea}`).join("\n");
}

function renderHtml() {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>YapayZekaLab Research Marathon</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #080b12; color: #e5e7eb; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 20% -10%, #1d4ed833, transparent 35%), #080b12; }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 28px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
    h1 { font-size: 24px; margin: 0 0 8px; letter-spacing: 0; }
    p { color: #94a3b8; margin: 0; line-height: 1.5; }
    .pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid #1f2a44; border-radius: 8px; background: #0f172a; color: #93c5fd; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
    .card { border: 1px solid #1f2a44; border-radius: 8px; background: #0f172acc; padding: 16px; box-shadow: 0 18px 40px #00000033; }
    .card h2 { font-size: 12px; margin: 0 0 6px; color: #94a3b8; text-transform: uppercase; font-weight: 700; }
    .metric { font: 24px ui-monospace, SFMono-Regular, Menlo, monospace; color: #f8fafc; }
    .agents { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; }
    .agent-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .agent-title h3 { margin: 0; font-size: 16px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .small { font-size: 12px; color: #94a3b8; }
    .bar { height: 8px; background: #111827; border-radius: 999px; overflow: hidden; border: 1px solid #1f2a44; margin-top: 12px; }
    .bar > div { height: 100%; background: linear-gradient(90deg, #2563eb, #22c55e); width: 0%; transition: width .4s ease; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; border-bottom: 1px solid #1f2a44; padding: 9px 8px; vertical-align: top; }
    th { color: #94a3b8; font-size: 11px; text-transform: uppercase; }
    a { color: #60a5fa; text-decoration: none; }
    .log { max-height: 260px; overflow: auto; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: #cbd5e1; background: #020617; border-radius: 8px; border: 1px solid #1f2a44; padding: 12px; }
    @media (max-width: 900px) { .grid, .agents { grid-template-columns: 1fr; } header { flex-direction: column; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>YapayZekaLab API Sistemi Araştırma Maratonu</h1>
        <p>İki araştırma hattı GitHub repo/code/README sonuçlarını iki saat boyunca tarar; rapor sürekli güncellenir.</p>
      </div>
      <div class="pill" id="status-pill">başlatılıyor</div>
    </header>
    <div class="grid">
      <div class="card"><h2>Kalan Süre</h2><div class="metric" id="remaining">-</div></div>
      <div class="card"><h2>Repo</h2><div class="metric" id="repos">0</div></div>
      <div class="card"><h2>Code Hit</h2><div class="metric" id="codeHits">0</div></div>
      <div class="card"><h2>Bulgu</h2><div class="metric" id="findings">0</div></div>
    </div>
    <div class="card">
      <h2>İlerleme</h2>
      <div class="bar"><div id="progress"></div></div>
      <p class="small mono" id="timeLine"></p>
    </div>
    <section class="agents" id="agents"></section>
    <div class="card">
      <h2>En Güçlü Repo Adayları</h2>
      <table><thead><tr><th>Repo</th><th>Skor</th><th>Star</th><th>Sinyal</th></tr></thead><tbody id="repoRows"></tbody></table>
    </div>
    <div class="card" style="margin-top:12px">
      <h2>Son Bulgular</h2>
      <table><thead><tr><th>Agent</th><th>Kaynak</th><th>Sinyal</th><th>Kullanım</th></tr></thead><tbody id="findingRows"></tbody></table>
    </div>
    <div class="card" style="margin-top:12px">
      <h2>Canlı Log</h2>
      <div class="log" id="log"></div>
    </div>
  </div>
  <script>
    function fmt(sec) {
      sec = Math.max(0, Number(sec || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
    }
    function esc(v) {
      return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
    }
    async function tick() {
      const status = await fetch("/status.json?ts=" + Date.now()).then(r => r.json());
      document.getElementById("status-pill").textContent = status.status + " • " + status.runId;
      document.getElementById("remaining").textContent = fmt(status.remainingSeconds);
      document.getElementById("repos").textContent = status.totals.uniqueRepos;
      document.getElementById("codeHits").textContent = status.totals.codeHits;
      document.getElementById("findings").textContent = status.totals.findings;
      const total = (new Date(status.endAt) - new Date(status.startedAt)) / 1000;
      const elapsed = total - status.remainingSeconds;
      document.getElementById("progress").style.width = Math.max(0, Math.min(100, elapsed / total * 100)) + "%";
      document.getElementById("timeLine").textContent = "Başlangıç: " + status.startedAt + " • Bitiş: " + status.endAt + " • Rapor: " + status.liveReportPath;
      document.getElementById("agents").innerHTML = Object.entries(status.agents).map(([id, a]) => \`
        <div class="card">
          <div class="agent-title"><h3>\${esc(a.name)}</h3><span class="pill">cycle \${a.cycle}</span></div>
          <p>\${esc(a.mission)}</p>
          <p class="small mono">query: \${esc(a.currentQuery || "-")}</p>
          <p class="small">Repo: \${a.reposSeen} • Code: \${a.codeHitsSeen} • Bulgu: \${a.findings} • Arama: \${a.repoSearches}/\${a.codeSearches}</p>
          <p class="small">Son: \${esc(a.lastEvent || "-")}</p>
        </div>\`).join("");
      document.getElementById("repoRows").innerHTML = (status.topRepos || []).slice(0, 12).map(r => \`
        <tr><td><a href="\${esc(r.url)}" target="_blank">\${esc(r.fullName)}</a></td><td>\${r.score}</td><td>\${r.stars ?? ""}</td><td>\${esc((r.signals || []).join(", "))}</td></tr>\`).join("");
      document.getElementById("findingRows").innerHTML = (status.latestFindings || []).slice(0, 12).map(f => \`
        <tr><td>\${esc(f.agentId)}</td><td><a href="\${esc(f.source)}" target="_blank">\${esc(f.title)}</a></td><td>\${esc((f.signals || []).join(", "))}</td><td>\${esc(f.nextUse)}</td></tr>\`).join("");
      const events = await fetch("/events?ts=" + Date.now()).then(r => r.text());
      document.getElementById("log").textContent = events;
    }
    tick();
    setInterval(tick, 5000);
  </script>
</body>
</html>`;
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/status.json")) {
        res.setHeader("content-type", "application/json");
        res.end(existsSync(STATUS_PATH) ? await readFile(STATUS_PATH, "utf8") : JSON.stringify(state));
        return;
      }
      if (req.url?.startsWith("/events")) {
        res.setHeader("content-type", "text/plain; charset=utf-8");
        if (!existsSync(EVENTS_PATH)) {
          res.end("");
          return;
        }
        const raw = await readFile(EVENTS_PATH, "utf8");
        res.end(raw.trim().split("\n").slice(-80).join("\n"));
        return;
      }
      if (req.url?.startsWith("/report")) {
        res.setHeader("content-type", "text/markdown; charset=utf-8");
        res.end(existsSync(LIVE_REPORT_PATH) ? await readFile(LIVE_REPORT_PATH, "utf8") : "");
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(renderHtml());
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error.stack || error));
    }
  });
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  return server;
}

async function agentLoop(agent) {
  let index = 0;
  let codeIndex = 0;
  await event(agent.id, "start", "agent started", { mission: agent.mission });
  while (Date.now() < END_AT.getTime()) {
    state.status = "running";
    state.agents[agent.id].cycle += 1;
    const query = agent.queries[index % agent.queries.length];
    state.agents[agent.id].currentQuery = query;
    index += 1;
    try {
      await event(agent.id, "repo-search", `repo search: ${query}`);
      await searchRepos(agent, query);
      if (state.agents[agent.id].cycle % 2 === 0) {
        const codeQuery = agent.codeQueries[codeIndex % agent.codeQueries.length];
        codeIndex += 1;
        state.agents[agent.id].currentQuery = codeQuery;
        await event(agent.id, "code-search", `code search: ${codeQuery}`);
        await searchCode(agent, codeQuery);
      }
      await writeReport(false);
      await persistStatus();
    } catch (error) {
      state.agents[agent.id].lastError = String(error.message || error).slice(0, 500);
      await event(agent.id, "error", "search cycle failed; continuing", { error: state.agents[agent.id].lastError });
    }
    await sleep(18_000);
  }
  await event(agent.id, "finish", "agent finished two-hour window");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(LIVE_DIR, { recursive: true });
  await writeFile(EVENTS_PATH, "");
  await writeFile(REPOS_PATH, "");
  await writeFile(CODE_PATH, "");
  await writeFile(FINDINGS_PATH, "");
  await writeReport(false);
  await persistStatus();
  const server = await serve();
  console.log(JSON.stringify({
    status: "started",
    url: `http://127.0.0.1:${PORT}`,
    runId: RUN_ID,
    endAt: END_AT.toISOString(),
    reportPath: REPORT_PATH,
  }, null, 2));
  try {
    await Promise.all(AGENTS.map(agentLoop));
    state.status = "completed";
    await writeReport(true);
    await persistStatus();
    console.log(JSON.stringify({
      status: "completed",
      runId: RUN_ID,
      reportPath: REPORT_PATH,
      uniqueRepos: state.totals.uniqueRepos,
      codeHits: state.totals.codeHits,
      findings: state.totals.findings,
    }, null, 2));
  } finally {
    server.close();
  }
}

main().catch(async (error) => {
  state.status = "failed";
  await mkdir(LIVE_DIR, { recursive: true }).catch(() => {});
  await persistStatus().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
