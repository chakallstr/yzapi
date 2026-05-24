#!/usr/bin/env node
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4567";
const expectedModelCount = Number(process.env.SMOKE_EXPECTED_MODEL_COUNT || "33");
const optionalApiKey = process.env.SMOKE_API_KEY;
const optionalChatModel = process.env.SMOKE_CHAT_MODEL || "anthropic/claude-haiku-4.5";
const optionalLowBalanceApiKey = process.env.SMOKE_LOW_BALANCE_API_KEY;

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${res.url}, got: ${text.slice(0, 120)}`);
  }
}

async function expectJson404(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const contentType = res.headers.get("content-type") || "";
  if (res.status !== 404) throw new Error(`${path} expected 404, got ${res.status}`);
  if (!contentType.includes("application/json")) {
    throw new Error(`${path} expected JSON 404, got ${contentType || "missing content-type"}`);
  }
  await readJson(res);
  console.log(`${path}: json_404`);
}

async function main() {
  const health = await fetch(`${baseUrl}/health`);
  const healthJson = await readJson(health);
  if (!health.ok) throw new Error(`/health status ${health.status}`);
  if (healthJson?.checks?.db !== "ok") throw new Error(`/health db check is not ok`);
  console.log("/health:", healthJson.status, "db:", healthJson.checks.db);

  const status = await fetch(`${baseUrl}/status`);
  const statusJson = await readJson(status);
  if (!status.ok) throw new Error(`/status status ${status.status}`);
  if (statusJson?.checks?.db !== "ok") throw new Error(`/status db check is not ok`);
  if (statusJson?.modelCount !== expectedModelCount) {
    throw new Error(`/status expected modelCount ${expectedModelCount}, got ${statusJson?.modelCount}`);
  }
  console.log("/status:", statusJson.status, "models:", statusJson.modelCount);

  const models = await fetch(`${baseUrl}/api/models`);
  const modelsJson = await readJson(models);
  if (!models.ok) throw new Error(`/api/models status ${models.status}`);
  const count = Array.isArray(modelsJson) ? modelsJson.length : (modelsJson.models?.length ?? modelsJson.count);
  if (count !== expectedModelCount) throw new Error(`/api/models expected ${expectedModelCount}, got ${count}`);
  console.log("/api/models:", count);

  const unauth = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: optionalChatModel, messages: [{ role: "user", content: "ping" }] }),
  });
  if (unauth.status !== 401) throw new Error(`/v1/chat/completions without key expected 401, got ${unauth.status}`);
  console.log("/v1/chat/completions unauth:", unauth.status);

  await expectJson404("/api/__smoke_missing_route__");
  await expectJson404("/v1/__smoke_missing_route__");

  if (optionalApiKey) {
    const chat = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${optionalApiKey}`,
      },
      body: JSON.stringify({
        model: optionalChatModel,
        messages: [{ role: "user", content: "Sadece ok yaz." }],
        max_tokens: 8,
      }),
    });
    if (!chat.ok) throw new Error(`test API key chat expected success, got ${chat.status}`);
    console.log("/v1/chat/completions test key:", chat.status);
  } else {
    console.log("manual-live-required: SMOKE_API_KEY yok; başarılı chat smoke atlandı.");
  }

  if (optionalLowBalanceApiKey) {
    const lowBalance = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${optionalLowBalanceApiKey}`,
      },
      body: JSON.stringify({
        model: optionalChatModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
    });
    if (lowBalance.status !== 402) throw new Error(`low-balance key expected 402, got ${lowBalance.status}`);
    console.log("/v1/chat/completions low balance:", lowBalance.status);
  } else {
    console.log("manual-live-required: SMOKE_LOW_BALANCE_API_KEY yok; yetersiz bakiye smoke atlandı.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
