import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MASTER_MODELS } from "../../master-models.js";

interface CloseRouterEndpoint {
  type: string;
  supports_streaming: boolean;
  supported_parameters: string[];
}

interface CloseRouterModel {
  id: string;
  aliases?: string[];
  name: string;
  context_length: number | null;
  max_output_tokens: number | null;
  pricing: {
    prompt?: string;
    completion?: string;
    second?: string;
    second_by_resolution?: Record<string, string>;
    unit: "usd_per_million_tokens" | "usd_per_second";
  };
  supported_parameters?: string[];
  endpoints?: string[];
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

interface CloseRouterScan {
  models: CloseRouterModel[];
  endpointDetails: Record<string, {
    data: {
      provider: { slug: string; name: string };
      endpoints: CloseRouterEndpoint[];
    };
  }>;
}

function loadScan(): CloseRouterScan {
  const path = join(process.cwd(), "pricing/closerouter-scan/models-full-2026-05-24.json");
  return JSON.parse(readFileSync(path, "utf8")) as CloseRouterScan;
}

describe("MASTER_MODELS — CloseRouter catalog snapshot coverage", () => {
  const scan = loadScan();
  const localById = new Map(MASTER_MODELS.map((model) => [model.id, model]));

  it("contains exactly the scanned CloseRouter model ids", () => {
    expect([...localById.keys()].sort()).toEqual(scan.models.map((model) => model.id).sort());
  });

  it("matches live snapshot pricing for every model", () => {
    for (const remote of scan.models) {
      const local = localById.get(remote.id);
      expect(local, remote.id).toBeTruthy();

      if (remote.pricing.unit === "usd_per_million_tokens") {
        const localInput = local!.type === "Görsel" ? local!.providerImageInputUsd : local!.providerInputUsd;
        const localOutput = local!.type === "Görsel" ? local!.providerImageOutputUsd : local!.providerOutputUsd;
        expect(localInput, `${remote.id} input`).toBe(Number(remote.pricing.prompt));
        expect(localOutput, `${remote.id} output`).toBe(Number(remote.pricing.completion));
      }

      if (remote.pricing.unit === "usd_per_second") {
        if (remote.pricing.second_by_resolution) {
          for (const [resolution, value] of Object.entries(remote.pricing.second_by_resolution)) {
            expect(local!.providerPerSecond?.[resolution as "480p" | "720p" | "1080p"], `${remote.id} ${resolution}`).toBe(Number(value));
          }
        } else {
          expect(local!.providerPerSecond?.default, `${remote.id} default seconds`).toBe(Number(remote.pricing.second));
        }
      }
    }
  });

  it("keeps exact metadata fields from the CloseRouter snapshot", () => {
    for (const remote of scan.models) {
      const local = localById.get(remote.id)!;
      const detail = scan.endpointDetails[remote.id].data;

      expect(local.name, `${remote.id} name`).toBe(remote.name);
      expect(local.provider, `${remote.id} provider`).toBe(detail.provider.name);
      expect(local.providerSlug, `${remote.id} provider slug`).toBe(detail.provider.slug);
      expect(local.contextTokens, `${remote.id} context`).toBe(remote.context_length);
      expect(local.maxOutputTokens, `${remote.id} max output`).toBe(remote.max_output_tokens);
      expect(local.aliases ?? [], `${remote.id} aliases`).toEqual(remote.aliases ?? []);
      expect(local.inputModalities ?? [], `${remote.id} input modalities`).toEqual(remote.architecture?.input_modalities ?? []);
      expect(local.outputModalities ?? [], `${remote.id} output modalities`).toEqual(remote.architecture?.output_modalities ?? []);
      expect(local.endpoints, `${remote.id} endpoints`).toEqual(remote.endpoints ?? []);
      expect(local.supportedParameters ?? [], `${remote.id} supported params`).toEqual(remote.supported_parameters ?? []);
      expect(local.pricingUnit, `${remote.id} pricing unit`).toBe(remote.pricing.unit);
      expect(local.endpointDetails ?? [], `${remote.id} endpoint details`).toEqual(
        detail.endpoints.map((endpoint) => ({
          type: endpoint.type,
          supportsStreaming: endpoint.supports_streaming,
          supportedParameters: endpoint.supported_parameters,
        }))
      );
    }
  });
});
