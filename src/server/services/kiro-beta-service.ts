// Private-beta gate for the Kiro seat (kiro-bridge upstream). Kiro-served models
// are callable ONLY by a hand-picked allowlist of users, and the matching
// packages are purchasable ONLY by that same allowlist — everyone else is
// refused before any billing reservation / balance deduction. Both lists live in
// env so they need no schema/migration; changing them is an env edit + restart.
// See ~/kiro-bridge/CLAUDE.md and the project_kiro_seat_bridge memory note.

// Restricted (Kiro-only) model ids, from env `KIRO_RESTRICTED_MODELS`
// (comma/space list). The customer-facing id is a normal name like "opus-4.8"
// (NOT "beta-*"); the "beta-" prefix is kept as a safety fallback so any leftover
// beta-* id stays gated during transitions. Matching is case-insensitive.
const DEFAULT_RESTRICTED = "opus-4.8";

let modelCache: { raw: string; set: Set<string> } | null = null;
function restrictedModelSet(): Set<string> {
  const raw = process.env.KIRO_RESTRICTED_MODELS ?? "";
  if (!modelCache || modelCache.raw !== raw) {
    // ALWAYS union the built-in default so the restriction cannot be turned OFF
    // via env (e.g. KIRO_RESTRICTED_MODELS="" must NOT un-restrict opus-4.8).
    const ids = `${DEFAULT_RESTRICTED},${raw}`.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    modelCache = { raw, set: new Set(ids) };
  }
  return modelCache.set;
}

export function isKiroRestrictedModel(modelId: string | null | undefined): boolean {
  if (typeof modelId !== "string" || !modelId) return false;
  const id = modelId.toLowerCase();
  return restrictedModelSet().has(id) || id.startsWith("beta-");
}

// True iff a package (by its allowed_models list) grants a Kiro-restricted model,
// i.e. buying it is only meaningful for an allowlisted user.
export function packageGrantsRestrictedModel(allowedModels: unknown): boolean {
  if (!Array.isArray(allowedModels)) return false;
  return allowedModels.some((m) => isKiroRestrictedModel(typeof m === "string" ? m : null));
}

// Package ids that are Kiro-private-beta (purchasable ONLY by allowlisted users).
// Default = the opus package; the customer uses the NORMAL model id
// (claude-opus-4.8) and the package's own provider override routes it to Kiro,
// so the gate can't key on the model — it keys on the package id.
const DEFAULT_BETA_PACKAGES = "beta-opus-500-24h";
let pkgCache: { raw: string; set: Set<string> } | null = null;
export function isKiroBetaPackage(packageId: string | null | undefined): boolean {
  if (!packageId) return false;
  const raw = process.env.KIRO_BETA_PACKAGE_IDS ?? "";
  if (!pkgCache || pkgCache.raw !== raw) {
    const ids = `${DEFAULT_BETA_PACKAGES},${raw}`.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    pkgCache = { raw, set: new Set(ids) };
  }
  return pkgCache.set.has(String(packageId).toLowerCase());
}

let userCache: { raw: string; set: Set<string> } | null = null;
function betaSet(): Set<string> {
  const raw = process.env.KIRO_BETA_USER_IDS ?? "";
  if (!userCache || userCache.raw !== raw) {
    const ids = raw.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    userCache = { raw, set: new Set(ids) };
  }
  return userCache.set;
}

// True iff this user is on the Kiro private-beta allowlist.
export function isKiroBetaUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return betaSet().has(String(userId).toLowerCase());
}
