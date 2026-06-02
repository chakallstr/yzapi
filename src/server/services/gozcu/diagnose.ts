// Gözcü — Katman-2 LLM teşhis beyni (advisory-only).
//
// Kırmızı bir bulgu geldiğinde: {bulgu + kontrat-beklentisi + REDAKSİYONLU kod dilimi}
// paketlenir → upstream OpenAI-uyumlu /chat/completions çağrılır (Haiku triage → güven
// düşük/kritikse Opus) → {rootCause, suggestedFix, confidence} üretilir → gozcu_findings'e
// yazılır. Maliyet: aylık token bütçesi + per-check cooldown. LLM çıktısı YALNIZ metin —
// DB/tool erişimi yok, oto-müdahale tetiklemez (Faz 6 deterministik guard'la çalışır).
// Yapılandırma/bütçe yoksa deterministik şablona düşer ($0). ASLA throw etmez.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbSql } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { env, aiProviderApiKey, aiProviderBaseUrl } from "../../lib/env.js";
import { normalizeProviderUsage } from "../closerouter-service.js";
import { registerDiagnosisSink } from "./engine.js";
import { CHECK_TO_FILES } from "./code-map.js";
import { CONTRACTS_BY_CHECK } from "./contracts/index.js";
import { scrub } from "./redact.js";
import type { GozcuCheckResult } from "./types.js";

const lastDiagnosed = new Map<string, number>();
const CRITICAL_CHECKS = new Set(["k1", "ledger_drift", "db_pool_health", "code_contracts"]);

function nowMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}
function llmBase(): string {
  return env.GOZCU_LLM_BASE_URL || aiProviderBaseUrl();
}
function llmKey(): string | undefined {
  return env.GOZCU_LLM_API_KEY || aiProviderApiKey();
}

// scrub() redact.ts'te (engine persist ile ORTAK); test uyumu için re-export.
export { scrub };

// İlgili kod dilimini güvenli oku (path-guard + uzantı + secret-deny).
function readCodeSlice(checkName: string): string {
  const root = resolve(env.GOZCU_REPO_ROOT);
  const files = (CHECK_TO_FILES[checkName] ?? []).slice(0, 2);
  const parts: string[] = [];
  for (const rel of files) {
    if (!/\.(ts|tsx|jsx|js)$/.test(rel)) continue;
    // .env/.key/.pem/migrations herhangi bir konumda → reddet (uç-bağlama bypass'ı yok).
    if (/(^|\/)\.env|\.key|\.pem|migrations\//.test(rel)) continue;
    const full = resolve(root, rel);
    if (!full.startsWith(root)) continue;
    try {
      const src = readFileSync(full, "utf8").split("\n").slice(0, 160).join("\n");
      parts.push(`/* ${rel} (ilk 160 satır) */\n${src}`);
    } catch {
      /* dosya yok (deploy drift) — atla */
    }
  }
  return parts.join("\n\n");
}

function buildPrompt(finding: GozcuCheckResult): { system: string; user: string } {
  const contracts = CONTRACTS_BY_CHECK.get(finding.name) ?? [];
  const expected = contracts.length ? contracts.map((c) => `- ${c.statement}`).join("\n") : "(tanımlı kontrat yok)";
  const evidence = finding.evidence != null ? JSON.stringify(finding.evidence).slice(0, 1500) : "(yok)";
  const code = readCodeSlice(finding.name) || "(kod dilimi yok)";
  const system =
    "Sen kıdemli bir SRE/teşhis mühendisisin. Bir izleme sistemi (Gözcü) bir kırmızı bulgu " +
    "iletti. Kök-nedeni ve SOMUT, güvenli bir çözüm önerisini Türkçe üret. Para/billing " +
    "sistemine dokunma; yalnız öneri ver. SADECE şu JSON şemasıyla yanıt ver: " +
    '{"rootCause": string, "severity": "info"|"warn"|"critical", "suggestedFix": string, "affectedFiles": string[], "confidence": number(0..1)}';
  const user = scrub(
    `GÖZCÜ BULGUSU\n` +
      `- check: ${finding.name} (${finding.domain})\n` +
      `- ölçülen: ${String(finding.measured)}\n` +
      `- eşik: ${finding.threshold}\n` +
      `- sinyal kaynağı: ${finding.signalSource}\n` +
      `- kanıt: ${evidence}\n\n` +
      `BEKLENEN DAVRANIŞ (kontratlar):\n${expected}\n\n` +
      `İLGİLİ KOD:\n${code}`,
  );
  return { system, user };
}

interface Diagnosis {
  rootCause: string;
  suggestedFix: string;
  confidence: number;
}

// LLM çıktısından JSON çıkar — markdown fence (```json) ve önek/sonek metni tolere eder
// (omniroute Claude'ları JSON'u fence ile sarıyor; gemini düz döndürüyor).
export function extractJson(content: string): Record<string, unknown> | null {
  let s = content.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    /* devam: ilk { … son } aralığını dene */
  }
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) {
    try {
      return JSON.parse(s.slice(i, j + 1)) as Record<string, unknown>;
    } catch {
      /* yok */
    }
  }
  return null;
}

async function callLLM(
  model: string,
  system: string,
  user: string,
): Promise<{ diag: Diagnosis; tokensIn: number; tokensOut: number } | null> {
  const key = llmKey();
  if (!key) return null;
  const base = llmBase().replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0,
        // response_format göndermiyoruz: omniroute'un yönlendirdiği bazı modeller (gemini-pro)
        // bunda 400 veriyor. JSON, sistem prompt'uyla isteniyor + gevşek ayrıştırma fence'i soyuyor.
        stream: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = extractJson(content);
    if (!parsed) return null;
    const rootCause = typeof parsed.rootCause === "string" ? parsed.rootCause : "";
    const suggestedFix = typeof parsed.suggestedFix === "string" ? parsed.suggestedFix : "";
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    if (!rootCause || !suggestedFix) return null;
    const usage = normalizeProviderUsage(data.usage) as { promptTokens?: number; completionTokens?: number };
    return {
      diag: { rootCause, suggestedFix, confidence },
      tokensIn: Number(usage?.promptTokens ?? 0),
      tokensOut: Number(usage?.completionTokens ?? 0),
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function deterministic(finding: GozcuCheckResult): Diagnosis {
  const contracts = CONTRACTS_BY_CHECK.get(finding.name) ?? [];
  const expected = contracts.map((c) => c.statement).join(" ") || "—";
  const files = (CHECK_TO_FILES[finding.name] ?? []).join(", ") || "—";
  return {
    rootCause: `Eşik aşıldı: ${finding.name} = ${String(finding.measured)} (kural: ${finding.threshold}).`,
    suggestedFix: `Beklenen: ${expected}\nİlgili dosyalar: ${files}\n(LLM teşhis yapılandırılmadı/bütçe doldu → deterministik özet.)`,
    confidence: 0.5,
  };
}

async function monthlyTokens(): Promise<number> {
  const rows = await dbSql<{ t: string }[]>`
    SELECT COALESCE(SUM(tokens_in + tokens_out), 0)::text AS t
    FROM gozcu_llm_spend WHERE billing_month = ${nowMonth()}
  `;
  return Number(rows[0]?.t ?? 0);
}
async function recordSpend(checkName: string, model: string, tin: number, tout: number): Promise<void> {
  await dbSql`
    INSERT INTO gozcu_llm_spend (check_name, model, tokens_in, tokens_out, billing_month)
    VALUES (${checkName}, ${model}, ${tin}, ${tout}, ${nowMonth()})
  `;
}

// Engine'in çağırdığı sink. ASLA throw etmez (engine handDiagnosis zaten sarar; yine de güvenli).
async function diagnoseFinding(finding: GozcuCheckResult, _scanAt: string): Promise<void> {
  const key = `${finding.domain}:${finding.name}`;
  const cooldownMs = (env.GOZCU_DIAGNOSE_COOLDOWN_HOURS || 6) * 3_600_000;
  if (Date.now() - (lastDiagnosed.get(key) ?? 0) < cooldownMs) return;
  lastDiagnosed.set(key, Date.now());

  let diag: Diagnosis | null = null;
  try {
    if (llmKey() && (await monthlyTokens()) < (env.GOZCU_LLM_MONTHLY_TOKENS || 2_000_000)) {
      const { system, user } = buildPrompt(finding);
      // Triage (Haiku).
      const triage = await callLLM(env.GOZCU_LLM_TRIAGE_MODEL, system, user);
      if (triage) {
        await recordSpend(finding.name, env.GOZCU_LLM_TRIAGE_MODEL, triage.tokensIn, triage.tokensOut);
        diag = triage.diag;
        // Eskalasyon: güven düşük VEYA kritik check → Opus.
        if (triage.diag.confidence < (env.GOZCU_ESCALATE_CONFIDENCE || 0.6) || CRITICAL_CHECKS.has(finding.name)) {
          const deep = await callLLM(env.GOZCU_LLM_DEEP_MODEL, system, user);
          if (deep) {
            await recordSpend(finding.name, env.GOZCU_LLM_DEEP_MODEL, deep.tokensIn, deep.tokensOut);
            diag = deep.diag;
          }
        }
      }
    }
  } catch (e) {
    logger.error({ err: e, check: finding.name }, "[gozcu-diagnose] LLM teşhis hatası");
  }
  if (!diag) diag = deterministic(finding);

  try {
    await dbSql`
      UPDATE gozcu_findings
      SET root_cause = ${diag.rootCause}, suggested_fix = ${diag.suggestedFix}, confidence = ${diag.confidence}
      WHERE dedup_key = ${key}
    `;
  } catch (e) {
    logger.error({ err: e, check: finding.name }, "[gozcu-diagnose] bulgu güncelleme hatası");
  }
}

// gozcu-job tarafından bir kez çağrılır: teşhis sink'ini engine'e kaydeder.
export function initGozcuDiagnosis(): void {
  registerDiagnosisSink(diagnoseFinding);
  logger.info("[gozcu-diagnose] teşhis sink'i kaydedildi (Katman-2)");
}
