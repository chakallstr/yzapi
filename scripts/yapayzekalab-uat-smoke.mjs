import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.QA_BASE_URL ?? "http://127.0.0.1:4567").replace(/\/$/, "");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = process.env.QA_OUT_DIR ?? `qa-artifacts/uat-smoke-${timestamp}`;

mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

const routes = [
  {
    path: "/",
    title: "Ana sayfa",
    requiredText: ["YapayZekaLab", "Bakiye"],
  },
  {
    path: "/models",
    title: "Modeller",
    requiredText: ["MODEL"],
  },
  {
    path: "/sss",
    title: "SSS",
    requiredText: ["Bakiye kredi mi"],
  },
  {
    path: "/docs",
    title: "Dokuman / API",
    requiredText: ["API Anahtarı", "cURL"],
    anyText: true,
  },
  {
    path: "/admin",
    title: "Admin guard",
    requiredText: ["YapayZekaLab"],
  },
];

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "home";
}

function hasRequiredText(bodyText, route) {
  if (route.anyText) {
    return route.requiredText.some((text) => bodyText.includes(text));
  }
  return route.requiredText.every((text) => bodyText.includes(text));
}

function summarizeIssue(result) {
  if (result.mainStatus >= 400) return `Ana cevap HTTP ${result.mainStatus}`;
  if (!result.requiredTextOk) return `Beklenen metin yok: ${result.requiredText.join(" veya ")}`;
  if (result.serverErrors.length > 0) return `Server error var: ${result.serverErrors.length}`;
  if (result.requestFailures.length > 0) return `Network failure var: ${result.requestFailures.length}`;
  return "";
}

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  headless: process.env.PLAYWRIGHT_HEADLESS !== "0",
});

const results = [];

for (const { name, viewport } of viewports) {
  const context = await browser.newContext({ viewport });
  for (const route of routes) {
    const page = await context.newPage();
    const consoleMessages = [];
    const badResponses = [];
    const requestFailures = [];

    page.on("console", (msg) => {
      if (["error", "warning"].includes(msg.type())) {
        consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 300) });
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        badResponses.push({
          status: res.status(),
          url: res.url(),
          contentType: res.headers()["content-type"] ?? "",
        });
      }
    });
    page.on("requestfailed", (req) => {
      requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? "unknown" });
    });

    const url = `${baseUrl}${route.path}`;
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 }).catch((error) => {
      requestFailures.push({ url, failure: String(error).slice(0, 300) });
      return null;
    });

    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const screenshot = join(outDir, `${name}-${safeName(route.path)}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
    await page.close();

    const mainStatus = response?.status() ?? 0;
    const serverErrors = badResponses.filter((item) => item.status >= 500);
    const requiredTextOk = hasRequiredText(bodyText, route);

    const result = {
      viewport: name,
      route: route.path,
      title: route.title,
      url,
      mainStatus,
      requiredText: route.requiredText,
      requiredTextOk,
      serverErrors,
      badResponses,
      consoleMessages,
      requestFailures,
      screenshot,
      status: "PENDING",
      note: "",
    };
    result.note = summarizeIssue(result);
    result.status = result.note ? "FAIL" : "PASS";
    results.push(result);
  }
  await context.close();
}

await browser.close();

const summary = {
  title: "YapayZekaLab UAT Smoke Raporu",
  baseUrl,
  createdAt: new Date().toISOString(),
  outDir,
  total: results.length,
  pass: results.filter((r) => r.status === "PASS").length,
  fail: results.filter((r) => r.status === "FAIL").length,
  results,
};

const jsonPath = join(outDir, "uat-smoke-report.json");
const mdPath = join(outDir, "uat-smoke-report.md");

writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  mdPath,
  [
    "# YapayZekaLab UAT Smoke Raporu",
    "",
    `- Base URL: \`${baseUrl}\``,
    `- Tarih: \`${summary.createdAt}\``,
    `- Sonuc: ${summary.fail === 0 ? "PASS" : "FAIL"}`,
    `- Gecen: ${summary.pass}/${summary.total}`,
    "",
    "| Viewport | Route | Sonuc | Not | Screenshot |",
    "|---|---|---|---|---|",
    ...results.map((r) => `| ${r.viewport} | \`${r.route}\` | ${r.status} | ${r.note || "-"} | \`${r.screenshot}\` |`),
    "",
    "## Notlar",
    "",
    "- Bu smoke gerçek para kullanmaz.",
    "- Google OAuth callback, funded API key ve ödeme provider webhookları bu komutla tamamlanmış sayılmaz.",
    "- Console/network detayları JSON rapordadır.",
    "",
  ].join("\n")
);

console.log(JSON.stringify({ report: mdPath, json: jsonPath, pass: summary.pass, fail: summary.fail }, null, 2));

if (summary.fail > 0) {
  process.exitCode = 1;
}
