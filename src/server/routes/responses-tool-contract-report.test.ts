// scripts/responses-tool-contract-report.mjs davranış testi — spec görev 8.1
//
// NEDEN: script canlı journal çıktısını sınıflandırıyor. Sınıflandırma yanlış sayarsa
// "hangi hata sınıfı aktif" sorusuna yanlış cevap verir ve fix'in işe yaradığı yanlış
// iddia edilir. Bu yüzden sentetik log satırlarıyla sayımlar kilitlenir.
// Ayrıca script'in sır/PII (requestId, api key, araç adı, prompt) BASMADIĞI doğrulanır.
//
// Script alt-süreç olarak koşulur (stdin→stdout sözleşmesi aynen test edilir).

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "responses-tool-contract-report.mjs");

const SECRET_REQUEST_ID = "req-secret-0001";
const SECRET_KEY = "sk-live-supersecret";
const SECRET_TOOL_NAME = "apply_patch_secret_name";
const SECRET_PROMPT = "musteri gizli prompt metni";

function line(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

// Sentetik journal gövdesi: 5 istek logu, 2 degrade logu, 4 sonuç logu (1'i warn), 2 bozuk satır.
const SYNTHETIC_LINES: string[] = [
  // 1) araç düşen stream isteği (tool-routing)
  line({
    level: 30,
    time: 1,
    msg: "responses tool contract",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: true,
    toolCount: 2,
    mappedToolCount: 1,
    declaredToolTypes: ["function", "web_search"],
    mappedToolTypes: ["function"],
    droppedToolTypes: ["web_search"],
    toolChoiceKind: "auto",
  }),
  // 2) araç düşen non-stream isteği (tool-routing)
  line({
    level: 30,
    time: 2,
    msg: "responses tool contract",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: false,
    toolCount: 3,
    mappedToolCount: 1,
    declaredToolTypes: ["custom", "function", "web_search"],
    mappedToolTypes: ["function"],
    droppedToolTypes: ["custom", "web_search"],
    toolChoiceKind: "required",
  }),
  // 3) araç düşmeyen stream isteği
  line({
    level: 30,
    time: 3,
    msg: "responses tool contract",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: true,
    toolCount: 1,
    mappedToolCount: 1,
    declaredToolTypes: ["function"],
    mappedToolTypes: ["function"],
    droppedToolTypes: [],
    toolChoiceKind: "auto",
  }),
  // 4) araçsız stream isteği
  line({
    level: 30,
    time: 4,
    msg: "responses tool contract",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: true,
    toolCount: 0,
    mappedToolCount: 0,
    declaredToolTypes: [],
    mappedToolTypes: [],
    droppedToolTypes: [],
    toolChoiceKind: "none",
  }),
  // 5) journalctl varsayılan formatı (satır başında zaman/host öneki) — yine ayrıştırılmalı
  `Jul 25 10:00:00 seslab turkapiprojesi[123]: ${line({
    level: 30,
    time: 5,
    msg: "responses tool contract",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: false,
    toolCount: 1,
    mappedToolCount: 0,
    declaredToolTypes: ["web_search"],
    mappedToolTypes: [],
    droppedToolTypes: ["web_search"],
    toolChoiceKind: "none",
  })}`,
  // degrade kararları
  line({ level: 30, time: 6, msg: "responses native degrade", requestId: SECRET_REQUEST_ID, stream: true, degraded: true, lossyToolTypes: [] }),
  line({ level: 30, time: 7, msg: "responses native degrade", requestId: SECRET_REQUEST_ID, stream: false, degraded: false, lossyToolTypes: ["custom"] }),
  // sonuç logları
  // a) halüsinasyon: araç eşlendi, çağrı yok (dropped boş → suspicious değil)
  line({
    level: 30,
    time: 8,
    msg: "responses tool call outcome",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: false,
    status: "success",
    native: false,
    toolCount: 2,
    mappedToolCount: 2,
    droppedToolTypes: [],
    toolCallCount: 0,
    finishReason: "stop",
  }),
  // b) emit hatası (stream): upstream çağrı verdi, biz yayımlamadık
  line({
    level: 30,
    time: 9,
    msg: "responses tool call outcome",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: true,
    status: "success",
    native: false,
    toolCount: 1,
    mappedToolCount: 1,
    droppedToolTypes: [],
    toolCallCount: 2,
    emittedToolItems: 0,
    finishReason: "tool_calls",
  }),
  // c) sağlıklı stream turu
  line({
    level: 30,
    time: 10,
    msg: "responses tool call outcome",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: true,
    status: "success",
    native: false,
    toolCount: 1,
    mappedToolCount: 1,
    droppedToolTypes: [],
    toolCallCount: 1,
    emittedToolItems: 1,
    finishReason: "tool_calls",
  }),
  // d) sahte başarı uyarısı (warn)
  line({
    level: 40,
    time: 11,
    msg: "responses tool contract suspicious success",
    requestId: SECRET_REQUEST_ID,
    endpoint: "responses",
    stream: false,
    status: "success",
    native: false,
    toolCount: 2,
    mappedToolCount: 1,
    droppedToolTypes: ["custom"],
    toolCallCount: 0,
    finishReason: "stop",
    reason: "tools_dropped_and_no_tool_call",
  }),
  // bozuk / ilgisiz satırlar
  "bu bir JSON degil",
  "{ bozuk json",
  "",
  // sırlar içeren ama bizim mesajlarımız olmayan satırlar (rapora sızmamalı)
  line({ level: 30, time: 12, msg: "provider request", apiKey: SECRET_KEY, base_url: "https://gizli.example/v1", prompt: SECRET_PROMPT, tool: SECRET_TOOL_NAME }),
];

function runReport(args: string[], stdin: string): { status: number | null; stdout: string; stderr: string } {
  const proc = spawnSync(process.execPath, [SCRIPT, ...args], {
    input: stdin,
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  return { status: proc.status, stdout: proc.stdout ?? "", stderr: proc.stderr ?? "" };
}

const SYNTHETIC_STDIN = SYNTHETIC_LINES.join("\n");

describe("responses-tool-contract-report.mjs", () => {
  it("--help kısa kullanım basar ve stdin okumaz", () => {
    const { status, stdout } = runReport(["--help"], "");
    expect(status).toBe(0);
    expect(stdout).toContain("responses-tool-contract-report.mjs");
    expect(stdout).toContain("journalctl");
  });

  it("--json ile toplamları ve stream kırılımını doğru sayar", () => {
    const { status, stdout } = runReport(["--json"], SYNTHETIC_STDIN);
    expect(status).toBe(0);
    const report = JSON.parse(stdout) as Record<string, any>;

    expect(report.totals.responsesRequests).toBe(5);
    expect(report.totals.stream).toBe(3);
    expect(report.totals.nonStream).toBe(2);
    expect(report.totals.requestsWithTools).toBe(4);
    expect(report.totals.outcomes).toBe(4);
    expect(report.totals.skipped).toBe(2); // boş satır atlanan sayılmaz
  });

  it("tool-routing sınıfını sayar (dropped + degrade)", () => {
    const { stdout } = runReport(["--json"], SYNTHETIC_STDIN);
    const report = JSON.parse(stdout) as Record<string, any>;

    expect(report.classes.toolRouting.requestsWithDroppedTools).toBe(3);
    expect(report.classes.toolRouting.requestsWithDroppedToolsRatio).toBeCloseTo(3 / 5, 6);
    expect(report.classes.toolRouting.degradeDecisions).toBe(2);
    expect(report.classes.toolRouting.degraded).toBe(1);
    expect(report.classes.toolRouting.degradedRatio).toBeCloseTo(0.5, 6);
    expect(report.classes.toolRouting.lossyToolTypes).toEqual({ custom: 1 });
  });

  it("halüsinasyon sınıfını sayar (araç eşlendi, çağrı yok)", () => {
    const { stdout } = runReport(["--json"], SYNTHETIC_STDIN);
    const report = JSON.parse(stdout) as Record<string, any>;

    expect(report.classes.hallucination.outcomesWithMappedTools).toBe(4);
    expect(report.classes.hallucination.noToolCall).toBe(2);
    expect(report.classes.hallucination.ratio).toBeCloseTo(0.5, 6);
  });

  it("emit hatası sınıfını stream/non-stream ayrı raporlar", () => {
    const { stdout } = runReport(["--json"], SYNTHETIC_STDIN);
    const report = JSON.parse(stdout) as Record<string, any>;

    expect(report.classes.emitFailure.stream.withToolCalls).toBe(2);
    expect(report.classes.emitFailure.stream.measured).toBe(2);
    expect(report.classes.emitFailure.stream.noEmittedItems).toBe(1);
    expect(report.classes.emitFailure.stream.ratio).toBeCloseTo(0.5, 6);

    expect(report.classes.emitFailure.nonStream.withToolCalls).toBe(0);
    expect(report.classes.emitFailure.nonStream.measured).toBe(0);
    expect(report.classes.emitFailure.nonStream.noEmittedItems).toBe(0);
    expect(report.classes.emitFailure.nonStream.ratio).toBe(null);
  });

  it("sahte başarı uyarılarını ve reason dağılımını sayar", () => {
    const { stdout } = runReport(["--json"], SYNTHETIC_STDIN);
    const report = JSON.parse(stdout) as Record<string, any>;

    expect(report.classes.fakeSuccess.suspiciousSuccess).toBe(1);
    expect(report.classes.fakeSuccess.ratio).toBeCloseTo(1 / 4, 6);
    expect(report.classes.fakeSuccess.reasons).toEqual({ tools_dropped_and_no_tool_call: 1 });
  });

  it("histogramları üretir (declared / dropped / finishReason)", () => {
    const { stdout } = runReport(["--json"], SYNTHETIC_STDIN);
    const report = JSON.parse(stdout) as Record<string, any>;

    expect(report.histograms.declaredToolTypes).toEqual({ function: 3, web_search: 3, custom: 1 });
    expect(report.histograms.droppedToolTypes).toEqual({ web_search: 3, custom: 1 });
    expect(report.histograms.finishReason).toEqual({ stop: 2, tool_calls: 2 });
  });

  it("sır/PII basmaz — ne JSON ne insan-okunur çıktıda", () => {
    const json = runReport(["--json"], SYNTHETIC_STDIN).stdout;
    const human = runReport([], SYNTHETIC_STDIN).stdout;

    for (const out of [json, human]) {
      expect(out).not.toContain(SECRET_REQUEST_ID);
      expect(out).not.toContain(SECRET_KEY);
      expect(out).not.toContain(SECRET_TOOL_NAME);
      expect(out).not.toContain(SECRET_PROMPT);
      expect(out).not.toContain("requestId");
      expect(out).not.toContain("gizli.example");
    }
  });

  it("insan-okunur çıktı sınıf başlıklarını ve sayıları içerir", () => {
    const { status, stdout } = runReport([], SYNTHETIC_STDIN);
    expect(status).toBe(0);
    expect(stdout).toContain("tool-routing");
    expect(stdout).toContain("halusinasyon");
    expect(stdout).toContain("emit");
    expect(stdout).toContain("sahte basari");
    expect(stdout).toContain("skipped");
  });

  it("boş girdide çökmez, sıfır sayılarla rapor üretir", () => {
    const { status, stdout } = runReport(["--json"], "");
    expect(status).toBe(0);
    const report = JSON.parse(stdout) as Record<string, any>;
    expect(report.totals.responsesRequests).toBe(0);
    expect(report.totals.outcomes).toBe(0);
    expect(report.classes.toolRouting.requestsWithDroppedToolsRatio).toBe(null);
  });

  it("ağ/dosya-yazma yapmaz — yalnız stdin→stdout", () => {
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).not.toMatch(/writeFileSync|createWriteStream|appendFileSync|mkdirSync/);
    expect(source).not.toMatch(/node:https?|\bfetch\(|undici|postgres|drizzle/);
  });
});
