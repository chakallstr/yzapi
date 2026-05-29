import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("live VPS deploy target contract", () => {
  it("defaults deploy tooling to the real active turkapiprojesi service", () => {
    const script = source("scripts/vps-deploy.sh");

    expect(script).toContain('APP_DIR="${APP_DIR:-/opt/turkapiprojesi}"');
    expect(script).toContain('SERVICE="${SERVICE:-turkapiprojesi}"');
    expect(script).toContain('SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:4568}"');
  });

  it("documents the real live target instead of the old placeholder target", () => {
    const docs = [
      "docs/vps-deploy.md",
      "docs/release-vps-beta-checklist.md",
    ].map(source).join("\n");

    expect(docs).toContain("/opt/turkapiprojesi");
    expect(docs).toContain("turkapiprojesi");
    expect(docs).toContain("127.0.0.1:4568");
    expect(docs).not.toContain("APP_DIR=/opt/yapayzekalab bash scripts/vps-deploy.sh");
    expect(docs).not.toContain("/opt/yapayzekalab/.deploy/rollback-last.sh");
  });

  it("enforces production secret guards in the deploy script (K4, Y4)", () => {
    const script = source("scripts/vps-deploy.sh");

    // Y4: API key encryption secret is a required env key and must differ from JWT_SECRET.
    expect(script).toContain("API_KEY_ENCRYPTION_SECRET");
    expect(script).toContain("must differ from JWT_SECRET");

    // K4: when the Telegram bot is configured, the webhook secret is mandatory.
    expect(script).toContain("TELEGRAM_BOT_TOKEN");
    expect(script).toContain("TELEGRAM_WEBHOOK_SECRET");
  });
});
