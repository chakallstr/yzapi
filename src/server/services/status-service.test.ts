import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveStatus, readLatestDeployRecord } from "./status-service.js";

describe("deriveStatus", () => {
  it("returns ok when DB is ok even if upstream is unknown", () => {
    expect(deriveStatus({ api: "ok", db: "ok", aiProvider: "unknown" })).toBe("ok");
  });

  it("returns degraded when DB fails", () => {
    expect(deriveStatus({ api: "ok", db: "fail", aiProvider: "ok" })).toBe("degraded");
  });
});

describe("readLatestDeployRecord (Faz 4)", () => {
  const created: string[] = [];
  const origEnv = process.env.DEPLOY_STATE_DIR;

  afterEach(() => {
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
    created.length = 0;
    if (origEnv === undefined) delete process.env.DEPLOY_STATE_DIR;
    else process.env.DEPLOY_STATE_DIR = origEnv;
  });

  function makeDeployDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "deploy-"));
    created.push(dir);
    process.env.DEPLOY_STATE_DIR = dir;
    return dir;
  }

  it("prefers current-release.json (deterministic pointer)", async () => {
    const dir = makeDeployDir();
    writeFileSync(join(dir, "current-release.json"), JSON.stringify({
      deploy_id: "sync-20260530T060000Z-abc1234",
      local_commit: "abc1234",
      timestamp_utc: "2026-05-30T06:00:00Z",
      health: "200",
    }));
    const rec = await readLatestDeployRecord();
    expect(rec.id).toBe("sync-20260530T060000Z-abc1234");
    expect(rec.commit).toBe("abc1234");
    expect(rec.deployedAt).toBe("2026-05-30T06:00:00Z");
  });

  it("falls back to latest release file when no pointer exists", async () => {
    const dir = makeDeployDir();
    mkdirSync(join(dir, "releases"));
    writeFileSync(join(dir, "releases", "sync-20260529T010000Z-old0001.json"), JSON.stringify({ deploy_id: "old", local_commit: "old0001" }));
    writeFileSync(join(dir, "releases", "sync-20260530T020000Z-new0002.json"), JSON.stringify({ deploy_id: "new", local_commit: "new0002" }));
    const rec = await readLatestDeployRecord();
    expect(rec.id).toBe("new");
    expect(rec.commit).toBe("new0002");
  });

  it("returns null fields (no stale data) when nothing exists", async () => {
    makeDeployDir();
    const rec = await readLatestDeployRecord();
    expect(rec.id).toBeNull();
    expect(rec.commit).toBeNull();
    expect(rec.deployedAt).toBeNull();
  });

  it("ignores an empty-named orphan .json without crashing", async () => {
    const dir = makeDeployDir();
    mkdirSync(join(dir, "releases"));
    writeFileSync(join(dir, "releases", ".json"), "not valid");
    writeFileSync(join(dir, "releases", "sync-20260530T020000Z-good0001.json"), JSON.stringify({ deploy_id: "good", local_commit: "good0001" }));
    const rec = await readLatestDeployRecord();
    expect(rec.id).toBe("good");
  });
});
