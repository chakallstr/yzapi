import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db, dbSql } from "../db/client.js";
import { systemConfig } from "../db/schema.js";
import { aiProviderApiKey, aiProviderBaseUrl } from "../lib/env.js";
import { MASTER_MODELS } from "../../master-models.js";

export interface StatusSnapshot {
  status: "ok" | "degraded";
  service: "yapayzekalab";
  timestamp: string;
  version: string;
  uptimeSeconds: number;
  modelCount: number;
  checks: {
    api: "ok";
    db: "ok" | "fail";
    aiProvider: "ok" | "fail" | "unknown";
  };
  lastKurRefresh: string | null;
  deploy: {
    id: string | null;
    previousRev: string | null;
    backupFile: string | null;
    smoke: unknown | null;
  };
}

export function deriveStatus(checks: StatusSnapshot["checks"]): StatusSnapshot["status"] {
  return checks.db === "ok" ? "ok" : "degraded";
}

async function checkDb(): Promise<"ok" | "fail"> {
  try {
    await dbSql`SELECT 1`;
    return "ok";
  } catch {
    return "fail";
  }
}

async function checkAiProvider(): Promise<"ok" | "fail" | "unknown"> {
  if (!aiProviderApiKey()) return "unknown";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${aiProviderBaseUrl()}/models`, {
      headers: { Authorization: `Bearer ${aiProviderApiKey()}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok ? "ok" : "fail";
  } catch {
    return "fail";
  }
}

async function readLastKurRefresh(): Promise<string | null> {
  try {
    const rows = await db.select({ lastKurRefresh: systemConfig.lastKurRefresh }).from(systemConfig).limit(1);
    const last = rows[0]?.lastKurRefresh;
    return last instanceof Date ? last.toISOString() : last ? String(last) : null;
  } catch {
    return null;
  }
}

async function readLatestDeployRecord(): Promise<StatusSnapshot["deploy"]> {
  const deployDir = process.env.DEPLOY_STATE_DIR ?? ".deploy";
  try {
    const rootFiles = (await readdir(deployDir))
      .filter((name) => name.endsWith(".txt") || name.endsWith(".json"))
      .map((name) => ({ dir: deployDir, name }));
    const releaseFiles = await readdir(join(deployDir, "releases"))
      .then((files) => files
        .filter((name) => name.endsWith(".json"))
        .map((name) => ({ dir: join(deployDir, "releases"), name })))
      .catch(() => []);
    const latest = [...rootFiles, ...releaseFiles]
      .sort((a, b) => b.name.localeCompare(a.name))[0];
    if (!latest) throw new Error("no deploy record");

    const raw = await readFile(join(latest.dir, latest.name), "utf8");
    if (latest.name.endsWith(".json")) {
      const parsed = JSON.parse(raw);
      return {
        id: parsed.deploy_id ?? parsed.deployId ?? latest.name.replace(/\.json$/, ""),
        previousRev: parsed.previous_rev ?? parsed.previousRev ?? null,
        backupFile: parsed.backup_file ?? parsed.db_backup ?? parsed.backupFile ?? null,
        smoke: parsed.smoke ?? null,
      };
    }

    const fields = Object.fromEntries(
      raw.split(/\r?\n/)
        .filter((line) => line.includes("="))
        .map((line) => {
          const [key, ...rest] = line.split("=");
          return [key, rest.join("=")];
        }),
    );

    return {
      id: fields.deploy_id ?? latest.name.replace(/\.txt$/, ""),
      previousRev: fields.previous_rev ?? null,
      backupFile: fields.db_backup ?? null,
      smoke: null,
    };
  } catch {
    return { id: null, previousRev: null, backupFile: null, smoke: null };
  }
}

export async function getStatusSnapshot(opts: {
  startedAt: number;
  version: string;
}): Promise<StatusSnapshot> {
  const [dbStatus, aiProvider, lastKurRefresh, deploy] = await Promise.all([
    checkDb(),
    checkAiProvider(),
    readLastKurRefresh(),
    readLatestDeployRecord(),
  ]);

  const checks = { api: "ok" as const, db: dbStatus, aiProvider };

  return {
    status: deriveStatus(checks),
    service: "yapayzekalab",
    timestamp: new Date().toISOString(),
    version: opts.version,
    uptimeSeconds: Math.round((Date.now() - opts.startedAt) / 1000),
    modelCount: MASTER_MODELS.length,
    checks,
    lastKurRefresh,
    deploy,
  };
}
