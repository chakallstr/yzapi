import { canonicalizeModelId } from "../../master-models.js";
import { AppError } from "../lib/errors.js";
import {
  resolveProfileById as defaultResolveProfileById,
  type ProviderChain,
  type ProviderContext,
} from "./provider-config-service.js";

export type ClaudeCloakEndpoint = "messages" | "chat" | "responses";

export const VEXLY_CLI_PROFILE_ID = "vexly-cli";
export const VEXLY_API_PROFILE_ID = "vexly-api";
export const LEGACY_VEXLY_PROFILE_ID = "vexly";
export const SONNET_46_MODEL_ID = "claude-sonnet-4-6";
const VEXLY_CLI_BASE_URL = "http://127.0.0.1:8328/cli/v1";
const VEXLY_API_BASE_URL = "http://127.0.0.1:8328/api/v1";

interface RouteLockModel {
  id: string;
  providerSlug?: string | null;
}

interface RouteLockOptions {
  endpoint: ClaudeCloakEndpoint;
  model: RouteLockModel;
  chain: ProviderChain;
  resolveProfileById?: (profileId: string) => Promise<ProviderContext | null>;
}

export function isVexlyProfileId(profileId: string | null | undefined): boolean {
  return profileId === VEXLY_CLI_PROFILE_ID || profileId === VEXLY_API_PROFILE_ID || profileId === LEGACY_VEXLY_PROFILE_ID;
}

export function isSonnet46ModelId(modelId: string | undefined): boolean {
  const canonical = canonicalizeModelId(modelId);
  return canonical === SONNET_46_MODEL_ID;
}

function isClaudeModel(model: RouteLockModel): boolean {
  const canonical = canonicalizeModelId(model.id) ?? model.id;
  return canonical.startsWith("claude-") || model.providerSlug === "anthropic";
}

function vexlyProfileIdForEndpoint(endpoint: ClaudeCloakEndpoint): string {
  return endpoint === "messages" ? VEXLY_CLI_PROFILE_ID : VEXLY_API_PROFILE_ID;
}

function vexlyBaseUrlForProfile(profileId: string): string {
  return profileId === VEXLY_CLI_PROFILE_ID ? VEXLY_CLI_BASE_URL : VEXLY_API_BASE_URL;
}

function vexlyAllowedKeyPrefixesForProfile(profileId: string): string[] {
  return profileId === VEXLY_CLI_PROFILE_ID ? ["tk_live_", "api_live_"] : ["api_live_"];
}

function hasAnyVexlyCandidate(chain: ProviderChain): boolean {
  return isVexlyProfileId(chain.primary.profileId) || isVexlyProfileId(chain.fallback?.profileId);
}

function profileSupportsModel(profile: ProviderContext, modelId: string): boolean {
  const supportedModelIds = profile.supportedModelIds;
  if (!Array.isArray(supportedModelIds)) return false;
  const canonicalModelId = canonicalizeModelId(modelId) ?? modelId;
  return supportedModelIds.some((id) => (canonicalizeModelId(id) ?? id) === canonicalModelId);
}

function assertExactVexlyProfile(profile: ProviderContext, profileId: string, modelId: string): void {
  const expectedBaseUrl = vexlyBaseUrlForProfile(profileId);
  const expectedKeyPrefixes = vexlyAllowedKeyPrefixesForProfile(profileId);
  if (
    profile.profileId !== profileId ||
    profile.baseUrl !== expectedBaseUrl ||
    !expectedKeyPrefixes.some((prefix) => profile.apiKey?.startsWith(prefix)) ||
    profile.fallbackProviderId !== null ||
    !profileSupportsModel(profile, modelId)
  ) {
    throw new AppError(503, "Claude route unavailable");
  }
}

export async function applyClaudeCloakRouteLock(options: RouteLockOptions): Promise<ProviderChain> {
  const { endpoint, model, chain } = options;

  if (isSonnet46ModelId(model.id)) {
    if (hasAnyVexlyCandidate(chain)) {
      throw new AppError(503, "Claude Sonnet 4.6 route unavailable", {
        code: "sonnet_46_vexly_forbidden",
      });
    }
    return chain;
  }

  if (!isClaudeModel(model)) return chain;

  const profileId = vexlyProfileIdForEndpoint(endpoint);
  const resolveProfileById = options.resolveProfileById ?? defaultResolveProfileById;
  const profile = await resolveProfileById(profileId);
  if (!profile?.apiKey) {
    throw new AppError(503, "Claude route unavailable");
  }
  assertExactVexlyProfile(profile, profileId, model.id);

  return { primary: profile, fallback: null };
}
