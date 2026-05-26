#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 1024 * 1024;
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".pgdata",
  "qa-artifacts",
]);

const sensitivePatterns = [
  { rule: "private-key", regex: /-----BEGIN PRIVATE KEY-----[\s\S]{20,}?-----END PRIVATE KEY-----/g, sample: "BEGIN PRIVATE KEY" },
  { rule: "private-key", regex: /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----[\s\S]{20,}?-----END (?:RSA|EC|OPENSSH) PRIVATE KEY-----/g, sample: "BEGIN PRIVATE KEY" },
  { rule: "github-token", regex: /(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, sample: "github_pat_" },
  { rule: "openai-style-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, sample: "sk-*" },
  { rule: "yapayzekalab-api-key", regex: /\byzk_live_[A-Za-z0-9_-]{20,}\b/g, sample: "yzk_live_*" },
  { rule: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, sample: "jwt" },
  {
    rule: "sensitive-assignment",
    regex: /\b(?:api[_-]?key|secret|token|password|client_secret|private_key)\b\s*[:=]\s*["']([^"']{16,})["']/gi,
    sample: "secret assignment",
  },
];

const safeValueMarkers = [
  "test",
  "example",
  "dummy",
  "placeholder",
  "changeme",
  "change-me",
  "your_",
  "your-",
  "localhost",
];

function redact(value) {
  if (!value) return "***REDACTED***";
  return "***REDACTED***";
}

function isSafePlaceholder(value) {
  const lower = value.toLowerCase();
  return safeValueMarkers.some((marker) => lower.includes(marker));
}

async function gitFiles() {
  // Uses: git ls-files -co --exclude-standard
  const { stdout } = await execFileAsync("git", ["ls-files", "-co", "--exclude-standard"], {
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout.split("\n").filter(Boolean);
}

async function walk(path = ".") {
  const entries = await readdir(path, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      out.push(fullPath.replace(/^\.\//, ""));
    }
  }

  return out;
}

async function listFiles() {
  try {
    return await gitFiles();
  } catch {
    return await walk(".");
  }
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

async function scanFile(file) {
  const info = await stat(file).catch(() => null);
  if (!info || info.size > MAX_FILE_BYTES) return [];

  const text = await readFile(file, "utf8").catch(() => "");
  if (!text || text.includes("\0")) return [];

  const hits = [];
  for (const { rule, regex, sample } of sensitivePatterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text))) {
      const candidate = match[1] ?? match[0];
      if (rule === "sensitive-assignment" && isSafePlaceholder(candidate)) continue;

      hits.push({
        file,
        line: lineNumberAt(text, match.index),
        rule,
        sample: redact(sample),
      });
    }
  }

  return hits;
}

const files = await listFiles();
const nestedHits = await Promise.all(files.map(scanFile));
const hits = nestedHits.flat();

console.log(JSON.stringify({
  scanned: files.length,
  hits,
}, null, 2));

if (hits.length) process.exit(1);
