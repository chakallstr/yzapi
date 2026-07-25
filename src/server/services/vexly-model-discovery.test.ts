import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import type { MasterModel } from "../../master-models.js";
import {
  buildVexlyProfileDiscoveryUpdate,
  extractModelIds,
} from "./vexly-model-discovery.js";

const baseModel = {
  name: "",
  type: "Metin",
  provider: "Anthropic",
  providerSlug: "anthropic",
  context: "1M",
  endpoints: ["chat", "messages"],
} satisfies Omit<MasterModel, "id">;

function model(id: string, aliases: string[] = []): MasterModel {
  return { ...baseModel, id, aliases };
}

describe("vexly model discovery", () => {
  it("extracts model ids from OpenAI-style and plain arrays", () => {
    expect(extractModelIds({ data: [{ id: "claude-opus-4.6" }, { id: "gpt-5" }] })).toEqual([
      "claude-opus-4.6",
      "gpt-5",
    ]);
    expect(() => extractModelIds(["claude-haiku-4-5-20251001"])).toThrow(/invalid/i);
    expect(() => extractModelIds({ data: [{ name: "missing-id" }] })).toThrow(/invalid/i);
  });

  it("keeps only CLI/API/common local Claude models and excludes Sonnet 4.6 aliases", () => {
    const update = buildVexlyProfileDiscoveryUpdate({
      cliModelIds: [
        "claude-opus-4.6",
        "claude-opus-4.5",
        "claude-sonnet-4.5",
        "claude-sonnet-4.6",
        "claude-haiku-4.5",
        "unknown-claude",
      ],
      apiModelIds: [
        "claude-opus-4.6",
        "claude-opus-4.5",
        "claude-sonnet-4.5",
        "claude-sonnet-4-6",
        "claude-haiku-4.5",
        "gpt-5.5",
      ],
      localModels: [
        model("claude-opus-4-6", ["claude-opus-4.6"]),
        model("claude-opus-4-5-20251101"),
        model("claude-sonnet-4-5-20250929"),
        model("claude-sonnet-4-6", ["claude-sonnet-4.6"]),
        model("claude-haiku-4-5-20251001"),
        model("gpt-5.5", []),
      ],
    });

    expect(update.supportedModelIds).toEqual([
      "claude-opus-4-6",
      "claude-opus-4-5-20251101",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
    ]);
    expect(update.cliModelMap).toEqual({
      "claude-opus-4-6": "claude-opus-4.6",
      "claude-opus-4-5-20251101": "claude-opus-4.5",
      "claude-sonnet-4-5-20250929": "claude-sonnet-4.5",
      "claude-haiku-4-5-20251001": "claude-haiku-4.5",
    });
    expect(update.apiModelMap).toEqual({
      "claude-opus-4-6": "claude-opus-4.6",
      "claude-opus-4-5-20251101": "claude-opus-4.5",
      "claude-sonnet-4-5-20250929": "claude-sonnet-4.5",
      "claude-haiku-4-5-20251001": "claude-haiku-4.5",
    });
  });

  it("throws before writes when discovery intersection is empty", () => {
    expect(() => buildVexlyProfileDiscoveryUpdate({
      cliModelIds: ["claude-opus-4.6"],
      apiModelIds: ["claude-haiku-4-5-20251001"],
      localModels: [model("claude-opus-4-6", ["claude-opus-4.6"])],
    })).toThrow(/empty/i);
  });

  it("operator script keeps Vexly base URLs fixed and applies only through --apply", () => {
    const script = readFileSync("scripts/discover-vexly-models.ts", "utf8");

    expect(script).toContain("const CLI_BASE_URL = \"http://127.0.0.1:8328/cli/v1\"");
    expect(script).toContain("const API_BASE_URL = \"http://127.0.0.1:8328/api/v1\"");
    expect(script).not.toContain("VEXLY_CLI_BASE_URL");
    expect(script).not.toContain("VEXLY_API_BASE_URL");
    expect(script).not.toContain("process.env.VEXLY_CLI_API_KEY");
    expect(script).not.toContain("process.env.VEXLY_API_KEY");
    expect(script).toContain("--apply");
  });
});
