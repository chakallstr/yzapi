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
});
