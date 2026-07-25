import { canonicalizeModelId, type MasterModel } from "../../master-models.js";
import { isSonnet46ModelId } from "./claude-cloak-route.js";

const VEXLY_MODEL_ID_TO_LOCAL_ID: Record<string, string> = {
  "claude-haiku-4.5": "claude-haiku-4-5-20251001",
  "claude-opus-4.5": "claude-opus-4-5-20251101",
  "claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
};

export interface VexlyProfileDiscoveryInput {
  cliModelIds: string[];
  apiModelIds: string[];
  localModels: MasterModel[];
}

export interface VexlyProfileDiscoveryUpdate {
  supportedModelIds: string[];
  cliModelMap: Record<string, string>;
  apiModelMap: Record<string, string>;
}

export function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("invalid model discovery payload");
  }
  const items = (payload as { data?: unknown }).data;
  if (!Array.isArray(items)) throw new Error("invalid model discovery payload");
  const ids: string[] = [];
  for (const item of items) {
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      ids.push((item as { id: string }).id);
    } else {
      throw new Error("invalid model discovery payload");
    }
  }
  return ids;
}

function upstreamLookup(modelIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawId of modelIds) {
    const canonical = VEXLY_MODEL_ID_TO_LOCAL_ID[rawId] ?? canonicalizeModelId(rawId) ?? rawId;
    if (!map.has(canonical)) map.set(canonical, rawId);
  }
  return map;
}

function isClaudeTextModel(model: MasterModel): boolean {
  const canonical = canonicalizeModelId(model.id) ?? model.id;
  return model.type === "Metin" && (canonical.startsWith("claude-") || model.providerSlug === "anthropic");
}

function mapForLane(supportedModelIds: string[], lookup: Map<string, string>): Record<string, string> {
  const modelMap: Record<string, string> = {};
  for (const localId of supportedModelIds) {
    const upstreamId = lookup.get(localId);
    if (upstreamId) modelMap[localId] = upstreamId;
  }
  return modelMap;
}

export function buildVexlyProfileDiscoveryUpdate(input: VexlyProfileDiscoveryInput): VexlyProfileDiscoveryUpdate {
  const cli = upstreamLookup(input.cliModelIds);
  const api = upstreamLookup(input.apiModelIds);
  const supportedModelIds: string[] = [];

  for (const model of input.localModels) {
    const localId = canonicalizeModelId(model.id) ?? model.id;
    if (!isClaudeTextModel(model)) continue;
    if (isSonnet46ModelId(localId)) continue;
    if (!cli.has(localId) || !api.has(localId)) continue;
    supportedModelIds.push(localId);
  }

  if (supportedModelIds.length === 0) {
    throw new Error("empty Vexly Claude discovery intersection");
  }

  return {
    supportedModelIds,
    cliModelMap: mapForLane(supportedModelIds, cli),
    apiModelMap: mapForLane(supportedModelIds, api),
  };
}
