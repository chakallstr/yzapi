#!/usr/bin/env node
// responses-tool-contract-report.mjs — /v1/responses arac sozlesmesi teshis raporu
// Spec: .kiro/specs/responses-tool-contract-fix/ (gorev 8.1)
//
// Kullanim:
//   ssh yzapi-vps 'journalctl -u turkapiprojesi --since today --no-pager -o cat' | node scripts/responses-tool-contract-report.mjs
//   ssh yzapi-vps 'journalctl -u turkapiprojesi --since today --no-pager -o cat' | node scripts/responses-tool-contract-report.mjs --json
//
// NE YAPAR: stdin'den pino JSON satirlarini okur, dort hata sinifini birbirinden ayirir:
//   1) tool-routing   → droppedToolTypes bos degil / native degrade degraded=true
//   2) halusinasyon   → mappedToolCount > 0 && toolCallCount === 0
//   3) emit hatasi    → toolCallCount > 0 && emittedToolItems === 0 (yalniz stream'de olculur)
//   4) sahte basari   → "responses tool contract suspicious success" warn sayisi + reason dagilimi
//
// NE YAPMAZ: ag istegi, DB erisimi, dosya yazma YOK — yalniz stdin → stdout.
// SIR/PII: yalnizca tip string'leri, sayilar ve oranlar basilir. requestId, api key,
// base_url, prompt, arac adi ve provider codename RAPORA ALINMAZ (okunmaz bile).

const MSG_REQUEST = "responses tool contract";
const MSG_DEGRADE = "responses native degrade";
const MSG_OUTCOME = "responses tool call outcome";
const MSG_SUSPICIOUS = "responses tool contract suspicious success";

const USAGE = `responses-tool-contract-report.mjs — /v1/responses arac sozlesmesi teshis raporu

Kullanim:
  ssh yzapi-vps 'journalctl -u turkapiprojesi --since today --no-pager -o cat' \\
    | node scripts/responses-tool-contract-report.mjs [--json]

  ssh yzapi-vps 'journalctl -u turkapiprojesi --since today --no-pager' \\
    | node scripts/responses-tool-contract-report.mjs        # onekli varsayilan format da ayristirilir

Secenekler:
  --json    Makine-okunur JSON cikti (varsayilan: insan-okunur tablo)
  --help    Bu yardim

Cikti yalniz tip string'leri, sayilar ve oranlar icerir; requestId/anahtar/prompt basilmaz.
`;

// ── yardimcilar ──────────────────────────────────────────────────────────────

function parseLine(line) {
  const trimmed = line.trim();
  if (trimmed === "") return null; // bos satir: atlanan sayilmaz
  const direct = tryParse(trimmed);
  if (direct) return direct;
  // journalctl varsayilan formati: "Jul 25 10:00:00 host svc[123]: {json}"
  const brace = trimmed.indexOf("{");
  if (brace > 0) {
    const tail = tryParse(trimmed.slice(brace));
    if (tail) return tail;
  }
  return "skip";
}

function tryParse(text) {
  if (!text.startsWith("{")) return null;
  try {
    const value = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function bump(histogram, key) {
  histogram[key] = (histogram[key] ?? 0) + 1;
}

function typeList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sortHistogram(histogram) {
  return Object.fromEntries(Object.entries(histogram).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

// ── sinıflandirma ────────────────────────────────────────────────────────────

export function buildReport(lines) {
  let skipped = 0;
  let responsesRequests = 0;
  let streamRequests = 0;
  let nonStreamRequests = 0;
  let requestsWithTools = 0;
  let requestsWithDroppedTools = 0;

  let degradeDecisions = 0;
  let degraded = 0;
  const lossyToolTypes = {};

  let outcomes = 0;
  let outcomesWithMappedTools = 0;
  let hallucinationHits = 0;
  let suspiciousSuccess = 0;
  const suspiciousReasons = {};

  const emit = {
    stream: { withToolCalls: 0, measured: 0, noEmittedItems: 0 },
    nonStream: { withToolCalls: 0, measured: 0, noEmittedItems: 0 },
  };

  const declaredHistogram = {};
  const droppedHistogram = {};
  const finishReasonHistogram = {};

  for (const line of lines) {
    const record = parseLine(line);
    if (record === null) continue;
    if (record === "skip") {
      skipped += 1;
      continue;
    }

    const msg = typeof record.msg === "string" ? record.msg : "";

    if (msg === MSG_REQUEST) {
      responsesRequests += 1;
      if (record.stream === true) streamRequests += 1;
      else nonStreamRequests += 1;

      const declared = typeList(record.declaredToolTypes);
      const dropped = typeList(record.droppedToolTypes);
      const toolCount = num(record.toolCount) ?? declared.length;
      if (toolCount > 0) requestsWithTools += 1;
      if (dropped.length > 0) requestsWithDroppedTools += 1;
      for (const type of declared) bump(declaredHistogram, type);
      for (const type of dropped) bump(droppedHistogram, type);
      continue;
    }

    if (msg === MSG_DEGRADE) {
      degradeDecisions += 1;
      if (record.degraded === true) degraded += 1;
      for (const type of typeList(record.lossyToolTypes)) bump(lossyToolTypes, type);
      continue;
    }

    if (msg === MSG_OUTCOME || msg === MSG_SUSPICIOUS) {
      outcomes += 1;
      const mapped = num(record.mappedToolCount) ?? 0;
      const calls = num(record.toolCallCount) ?? 0;
      const emitted = num(record.emittedToolItems);
      const isStream = record.stream === true;

      if (mapped > 0) {
        outcomesWithMappedTools += 1;
        if (calls === 0) hallucinationHits += 1;
      }

      const bucket = isStream ? emit.stream : emit.nonStream;
      if (calls > 0) {
        bucket.withToolCalls += 1;
        if (emitted !== undefined) {
          bucket.measured += 1;
          if (emitted === 0) bucket.noEmittedItems += 1;
        }
      }

      if (typeof record.finishReason === "string") bump(finishReasonHistogram, record.finishReason);

      if (msg === MSG_SUSPICIOUS) {
        suspiciousSuccess += 1;
        const reason = typeof record.reason === "string" ? record.reason : "unspecified";
        bump(suspiciousReasons, reason);
      }
      continue;
    }

    // Bizim mesajlarimiz degil — hic okunmaz, hic sayilmaz (sir sizmasi imkansiz).
  }

  const emitBranch = (bucket) => ({
    withToolCalls: bucket.withToolCalls,
    measured: bucket.measured,
    noEmittedItems: bucket.noEmittedItems,
    ratio: ratio(bucket.noEmittedItems, bucket.measured),
  });

  return {
    totals: {
      responsesRequests,
      stream: streamRequests,
      nonStream: nonStreamRequests,
      requestsWithTools,
      requestsWithToolsRatio: ratio(requestsWithTools, responsesRequests),
      outcomes,
      skipped,
    },
    classes: {
      toolRouting: {
        requestsWithDroppedTools,
        requestsWithDroppedToolsRatio: ratio(requestsWithDroppedTools, responsesRequests),
        degradeDecisions,
        degraded,
        degradedRatio: ratio(degraded, degradeDecisions),
        lossyToolTypes: sortHistogram(lossyToolTypes),
      },
      hallucination: {
        outcomesWithMappedTools,
        noToolCall: hallucinationHits,
        ratio: ratio(hallucinationHits, outcomesWithMappedTools),
      },
      emitFailure: {
        stream: emitBranch(emit.stream),
        nonStream: emitBranch(emit.nonStream),
      },
      fakeSuccess: {
        suspiciousSuccess,
        ratio: ratio(suspiciousSuccess, outcomes),
        reasons: sortHistogram(suspiciousReasons),
      },
    },
    histograms: {
      declaredToolTypes: sortHistogram(declaredHistogram),
      droppedToolTypes: sortHistogram(droppedHistogram),
      finishReason: sortHistogram(finishReasonHistogram),
    },
  };
}

// ── insan-okunur cikti ───────────────────────────────────────────────────────

function pct(value) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function histogramLine(histogram) {
  const entries = Object.entries(histogram);
  return entries.length === 0 ? "(bos)" : entries.map(([key, count]) => `${key}=${count}`).join("  ");
}

export function renderReport(report) {
  const t = report.totals;
  const c = report.classes;
  const out = [];

  out.push("/v1/responses arac sozlesmesi — teshis raporu");
  out.push("=".repeat(60));
  out.push("");
  out.push("OZET");
  out.push(`  responses istegi        : ${t.responsesRequests}  (stream=${t.stream}  non-stream=${t.nonStream})`);
  out.push(`  arac deklare eden istek : ${t.requestsWithTools}  (${pct(t.requestsWithToolsRatio)})`);
  out.push(`  sonuc kaydi             : ${t.outcomes}`);
  out.push(`  ayristirilamayan satir  : ${t.skipped}  (skipped)`);
  out.push("");
  out.push("SINIF 1 — tool-routing (arac dusuyor / degrade kirpiyor)");
  out.push(`  droppedToolTypes bos degil : ${c.toolRouting.requestsWithDroppedTools} / ${t.responsesRequests}  (${pct(c.toolRouting.requestsWithDroppedToolsRatio)})`);
  out.push(`  degrade karari             : ${c.toolRouting.degradeDecisions}  degraded=true: ${c.toolRouting.degraded}  (${pct(c.toolRouting.degradedRatio)})`);
  out.push(`  lossyToolTypes dagilimi    : ${histogramLine(c.toolRouting.lossyToolTypes)}`);
  out.push("");
  out.push("SINIF 2 — halusinasyon (arac verildi, model cagirmadi)");
  out.push(`  mappedToolCount > 0        : ${c.hallucination.outcomesWithMappedTools}`);
  out.push(`  bunlarda toolCallCount = 0 : ${c.hallucination.noToolCall}  (${pct(c.hallucination.ratio)})`);
  out.push("");
  out.push("SINIF 3 — emit hatasi (BIZDE: cagri geldi, istemciye yayilmadi)");
  out.push(`  stream     : cagrili tur=${c.emitFailure.stream.withToolCalls}  olculen=${c.emitFailure.stream.measured}  emittedToolItems=0 → ${c.emitFailure.stream.noEmittedItems}  (${pct(c.emitFailure.stream.ratio)})`);
  out.push(`  non-stream : cagrili tur=${c.emitFailure.nonStream.withToolCalls}  olculen=${c.emitFailure.nonStream.measured}  emittedToolItems=0 → ${c.emitFailure.nonStream.noEmittedItems}  (${pct(c.emitFailure.nonStream.ratio)})`);
  out.push("  not: emittedToolItems yalniz stream yolunda olculur; non-stream 'olculen=0' beklenen durumdur.");
  out.push("");
  out.push("SINIF 4 — sahte basari (success faturalandi, cagri yok)");
  out.push(`  uyari satiri : ${c.fakeSuccess.suspiciousSuccess} / ${t.outcomes}  (${pct(c.fakeSuccess.ratio)})`);
  out.push(`  reason       : ${histogramLine(c.fakeSuccess.reasons)}`);
  out.push("");
  out.push("HISTOGRAMLAR");
  out.push(`  declaredToolTypes : ${histogramLine(report.histograms.declaredToolTypes)}`);
  out.push(`  droppedToolTypes  : ${histogramLine(report.histograms.droppedToolTypes)}`);
  out.push(`  finishReason      : ${histogramLine(report.histograms.finishReason)}`);
  out.push("");

  return out.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
    });
    process.stdin.on("end", () => resolve(buffer));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  const asJson = args.includes("--json");
  const raw = await readStdin();
  const report = buildReport(raw.split("\n"));
  process.stdout.write(asJson ? `${JSON.stringify(report, null, 2)}\n` : `${renderReport(report)}\n`);
}

main().catch((err) => {
  process.stderr.write(`responses-tool-contract-report: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
