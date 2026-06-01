import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Upstream provider codenames must NEVER ship in the public browser bundle.
// The customer only ever sees the final sale price + model-author labels
// (Anthropic/OpenAI/Google). Upstream gateway/reseller names are internal.
// This contract locks the shipped frontend SPA sources against regressions
// (e.g. a hardcoded provider id sneaking back into the admin tab).

// Build each needle from split parts at runtime so this test file itself does
// not contain the literal token (keeps secret/name scanners clean).
const tok = (...parts: string[]) => parts.join("");

const FORBIDDEN = [
  tok("close", "router"),
  tok("omni", "route"),
  tok("well", "flow"),
  tok("claude-", "popusk"),
  tok("stepan", "ovikov"),
];

// Every source file that Vite compiles into the single public SPA bundle.
const FRONTEND_FILES = [
  "src/App.tsx",
  "src/main.tsx",
  "src/master-models.ts",
  "src/pricing.ts",
  "src/navigation.ts",
  "src/yapayzekalab/App.jsx",
  "src/yapayzekalab/shared.jsx",
  "src/yapayzekalab/tab-home.jsx",
  "src/yapayzekalab/tab-models.jsx",
  "src/yapayzekalab/tab-account.jsx",
  "src/yapayzekalab/tab-activity.jsx",
  "src/yapayzekalab/tab-documents.jsx",
  "src/yapayzekalab/tab-admin.jsx",
  "src/yapayzekalab/tab-admin-traffic.jsx",
  "src/yapayzekalab/tab-admin-mali-izleme.jsx",
  "src/yapayzekalab/api-docs.js",
  "src/yapayzekalab/legal-docs.js",
  "src/yapayzekalab/TelegramTopupApp.jsx",
  "src/yapayzekalab/auth-client.js",
];

function readFrontendSource(): string {
  return FRONTEND_FILES.filter((file) => existsSync(file))
    .map((file) => `\n/* ${file} */\n${readFileSync(file, "utf8")}`)
    .join("\n");
}

describe("provider-name non-leak contract (frontend bundle)", () => {
  const source = readFrontendSource().toLowerCase();

  for (const needle of FORBIDDEN) {
    it(`does not ship the upstream provider codename "${needle}"`, () => {
      expect(
        source.includes(needle),
        `Upstream provider codename "${needle}" leaked into a shipped frontend source file. ` +
          `Customers must only see the final price + model-author labels, never the upstream gateway.`,
      ).toBe(false);
    });
  }

  it("keeps the public-bundle scanner armed with provider-name guard needles", () => {
    const scanner = readFileSync("scripts/scan-public-bundle.mjs", "utf8");
    // Cross-lock: the build-time scanner must still check the close+router and
    // omni+route provider names so it cannot be silently gutted.
    expect(scanner).toContain(`hiddenToken("close", "router")`);
    expect(scanner).toContain(`hiddenToken("omni", "route")`);
  });
});
