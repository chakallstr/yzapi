import crypto from "node:crypto";
import { env } from "../../lib/env.js";
import type { GuardInput, GuardModule, GuardModuleResult } from "./types.js";

// NSFW guard (faz3). OpenAI omni-moderation proxy (ÜCRETSİZ endpoint). OmniRoute /v1/moderations mantığı.
// İlkeler: FAIL-OPEN (moderation hatası/timeout/unconfigured → istek GEÇER), timeout, in-memory cache
// (aynı metne tekrar ödeme/gecikme yok), default OFF. Secret backend-only (env.NSFW_MODERATION_API_KEY).
// moderate fn INJECTABLE → ağ çağrısı olmadan test edilebilir.

const FLAG_CATEGORIES = ["sexual", "sexual/minors"]; // "nude/NSFW" kapsamı; ileride genişletilebilir
const SCAN_LIMIT = 8000; // moderation input'u kırp (latency/cost)
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 5000;

export type ModerateResult = { flagged: boolean; categories: string[] } | null; // null = unavailable → fail-open
export type ModerateFn = (text: string, signal: AbortSignal) => Promise<ModerateResult>;

const cache = new Map<string, { flagged: boolean; categories: string[]; exp: number }>();

/** Test-only: cache temizle. */
export function __clearNsfwCacheForTest(): void {
  cache.clear();
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Defensive: moderate çıktısını güvenli şekle indirger. Bozuk/beklenmeyen şekil → null (fail-open, cache'lenmez). */
function normalizeModerateResult(raw: ModerateResult): ModerateResult {
  if (!raw || typeof raw !== "object") return null;
  if (raw.flagged === true && Array.isArray(raw.categories)) {
    return { flagged: true, categories: raw.categories.filter((c) => typeof c === "string") };
  }
  if (raw.flagged === false) return { flagged: false, categories: [] };
  return null; // malformed (örn flagged truthy ama categories array değil) → fail-open
}

export interface ModerateConfig {
  url: string;
  key?: string;
  model: string;
}

/**
 * Varsayılan moderate: OpenAI moderation endpoint. Unconfigured/hata → null (fail-open).
 * cfg INJECTABLE (default env) → gerçek ağ kodu, gerçek key olmadan kontrollü (fetch-stub) test edilebilir.
 */
export async function defaultModerate(
  text: string,
  signal: AbortSignal,
  cfg: ModerateConfig = { url: env.NSFW_MODERATION_URL, key: env.NSFW_MODERATION_API_KEY, model: env.NSFW_MODERATION_MODEL },
): Promise<ModerateResult> {
  if (!cfg.key) return null; // anahtar yok → fail-open (guard no-op)
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, input: text }),
    signal,
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { results?: Array<{ categories?: Record<string, boolean> }> };
  const res = j.results?.[0];
  if (!res || !res.categories) return null;
  const categories = FLAG_CATEGORIES.filter((c) => res.categories?.[c] === true);
  return { flagged: categories.length > 0, categories };
}

export function createNsfwGuard(moderate: ModerateFn = defaultModerate): GuardModule {
  return {
    name: "nsfw",
    priority: 30,
    configModeKey: "guardNsfwMode",
    async run(input: GuardInput): Promise<GuardModuleResult> {
      const text = (input.text || "").slice(0, SCAN_LIMIT);
      if (!text.trim()) return { guard: "nsfw", blocked: false, detections: [] };

      const hash = sha256(text);
      const now = Date.now();
      let result: ModerateResult;

      const hit = cache.get(hash);
      if (hit && hit.exp > now) {
        result = { flagged: hit.flagged, categories: hit.categories };
      } else {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), env.NSFW_MODERATION_TIMEOUT_MS);
        let raw: ModerateResult;
        try {
          raw = await moderate(text, ac.signal);
        } catch {
          raw = null; // fail-open (timeout/network/parse)
        } finally {
          clearTimeout(timer);
        }
        result = normalizeModerateResult(raw); // defensive: bozuk şekil → null (cache'lenmez)
        if (result) {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
          cache.set(hash, { flagged: result.flagged, categories: result.categories, exp: now + CACHE_TTL_MS });
        }
      }

      if (!result || !result.flagged) return { guard: "nsfw", blocked: false, detections: [] };
      return {
        guard: "nsfw",
        blocked: true, // aggregator yalnız mode==='block' iken bloklar
        detections: result.categories.map((c) => ({ kind: c, severity: "high" as const })),
        message: "İstek uygunsuz (cinsel) içerik tespit edildi.",
      };
    },
  };
}

export const nsfwGuard = createNsfwGuard();
