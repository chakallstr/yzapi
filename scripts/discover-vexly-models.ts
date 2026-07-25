import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.ENV_FILE_PATH || ".env" });

import { dbSql } from "../src/server/db/client.js";
import { getMergedCatalogModels } from "../src/server/services/added-model-service.js";
import { upsertProviderProfile } from "../src/server/services/provider-config-service.js";
import {
  buildVexlyProfileDiscoveryUpdate,
  extractModelIds,
} from "../src/server/services/vexly-model-discovery.js";

const CLI_PROFILE_ID = "vexly-cli";
const API_PROFILE_ID = "vexly-api";
const CLI_BASE_URL = "http://127.0.0.1:8328/cli/v1";
const API_BASE_URL = "http://127.0.0.1:8328/api/v1";
const CLI_PROFILE_CREDENTIAL_SOURCE = "api_live";
const APPLY = process.argv.includes("--apply");

function requireKey(name: string, value: string | undefined, prefix: string): string {
  if (!value || !value.startsWith(prefix)) {
    throw new Error(`${name} missing or invalid prefix`);
  }
  return value;
}

async function readKeysFromStdin(): Promise<{ cliKey: string; apiKey: string }> {
  if (process.stdin.isTTY) {
    throw new Error("pipe JSON secrets on stdin: {\"cliKey\":\"...\",\"apiKey\":\"...\"}");
  }
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  raw = raw.trim();
  const parsed = JSON.parse(raw) as { cliKey?: unknown; apiKey?: unknown };
  return {
    cliKey: requireKey("cliKey", typeof parsed.cliKey === "string" ? parsed.cliKey : undefined, "tk_live_"),
    apiKey: requireKey("apiKey", typeof parsed.apiKey === "string" ? parsed.apiKey : undefined, "api_live_"),
  };
}

async function fetchModelIds(baseUrl: string, apiKey: string): Promise<string[]> {
  const response = await fetch(new URL("models", `${baseUrl.replace(/\/+$/, "")}/`), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`model discovery failed: ${response.status}`);
  }
  return extractModelIds(await response.json());
}

async function fetchCliModelIds(cliKey: string, apiModelIds: string[]): Promise<{
  modelIds: string[];
  fallbackUsed: boolean;
  fallbackReason: string | null;
}> {
  try {
    return {
      modelIds: await fetchModelIds(CLI_BASE_URL, cliKey),
      fallbackUsed: false,
      fallbackReason: null,
    };
  } catch (error) {
    return {
      modelIds: apiModelIds,
      fallbackUsed: true,
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function upsertVexlyProfiles(input: {
  supportedModelIds: string[];
  cliModelMap: Record<string, string>;
  apiModelMap: Record<string, string>;
  cliKey: string;
  apiKey: string;
}): Promise<void> {
  await upsertProviderProfile({
    id: CLI_PROFILE_ID,
    label: "Vexly CLI",
    baseUrl: CLI_BASE_URL,
    apiKey: input.apiKey,
    enabled: true,
    supportedModelIds: input.supportedModelIds,
    modelMap: input.cliModelMap,
    fallbackProviderId: null,
  });
  await upsertProviderProfile({
    id: API_PROFILE_ID,
    label: "Vexly API",
    baseUrl: API_BASE_URL,
    apiKey: input.apiKey,
    enabled: true,
    supportedModelIds: input.supportedModelIds,
    modelMap: input.apiModelMap,
    fallbackProviderId: null,
  });
}

async function main(): Promise<void> {
  const { cliKey, apiKey } = await readKeysFromStdin();
  const [apiModelIds, localModels] = await Promise.all([
    fetchModelIds(API_BASE_URL, apiKey),
    getMergedCatalogModels(),
  ]);
  const cliDiscovery = await fetchCliModelIds(cliKey, apiModelIds);
  const update = buildVexlyProfileDiscoveryUpdate({
    cliModelIds: cliDiscovery.modelIds,
    apiModelIds,
    localModels,
  });

  console.log(JSON.stringify({
    dryRun: !APPLY,
    profiles: [CLI_PROFILE_ID, API_PROFILE_ID],
    cliDiscoveryFallbackUsed: cliDiscovery.fallbackUsed,
    cliDiscoveryFallbackReason: cliDiscovery.fallbackReason,
    cliProfileCredentialSource: CLI_PROFILE_CREDENTIAL_SOURCE,
    supportedModelCount: update.supportedModelIds.length,
    supportedModelIds: update.supportedModelIds,
    cliMappedCount: Object.keys(update.cliModelMap).length,
    apiMappedCount: Object.keys(update.apiModelMap).length,
    sonnet46Excluded: true,
  }, null, 2));

  if (APPLY) {
    await upsertVexlyProfiles({ ...update, cliKey, apiKey });
    console.log(JSON.stringify({ updated: true, profiles: [CLI_PROFILE_ID, API_PROFILE_ID] }));
  }

  await dbSql.end();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await dbSql.end({ timeout: 1 }).catch(() => undefined);
  process.exit(1);
});
