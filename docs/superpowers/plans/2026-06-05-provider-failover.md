# Provider Failover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-request, self-healing failover that serves a model from a profile's `fallback_provider_id` (wellflow→closerouter/popusk) when the primary hits an infrastructure failure, gated by an in-memory circuit breaker.

**Architecture:** New nullable `provider_profiles.fallback_provider_id`; `resolveProviderChainForModel` returns `{primary, fallback}`; a pure `provider-circuit-breaker.ts` state machine; a `forwardWithFailover` wrapper (in `provider-failover.ts`) that runs the primary with a single-shot ~7s budget, and on an *eligible* pre-commit error records the breaker failure and retries the fallback. Reserve/settle stay OUTSIDE the wrapper (one reqId → no double-charge). Budget + single-shot reuse the EXISTING `fetchWithRuntimeTimeout(url, init, timeoutMs, maxAttempts)` params — no new AbortSignal plumbing.

**Tech Stack:** Express + TypeScript, Drizzle/Postgres, Vitest (unit + itest with real PG + nock).

**Spec:** `docs/superpowers/specs/2026-06-05-provider-failover-design.md` (3/3 QA PASS, commit a0f404b).

**Money-path rules:** `resolveBilledPromptTokens`/`normalizeProviderUsage`/reserve/settle are DOKUNULMAZ. Keep `resolveBilledPromptTokens` call count ≥4 in proxy.ts (`code_contracts proxy/billed-tokens-floor`). No provider codename in any client response/header. No deploy — local only.

---

### Task 1: Migration + schema column

**Files:**
- Create: `src/server/db/migrations/0024_provider_fallback.sql` (verify next idx from `meta/_journal.json` first — live max is `0023_user_lang`; `0019` is taken)
- Modify: `src/server/db/migrations/meta/_journal.json` (append idx 24 entry, matching existing entry shape)
- Modify: `src/server/db/schema.ts` (providerProfiles table — add column)

- [ ] **Step 1: Confirm next migration index**

Run: `cat src/server/db/migrations/meta/_journal.json | tail -20`
Expected: highest `idx` is 23 (tag `0023_user_lang`). New file = `0024`, new journal idx = 24. If different, use actual `max(idx)+1`.

- [ ] **Step 2: Create migration SQL**

```sql
-- 0024_provider_fallback.sql
-- Per-profile failover target (soft ref to provider_profiles.id; no hard FK).
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS fallback_provider_id text;
```

- [ ] **Step 3: Append journal entry**

Add to `meta/_journal.json` `entries` array (match the existing object shape — `idx`, `version`, `when`, `tag`, `breakpoints`). Use idx 24, tag `0024_provider_fallback`, a `when` epoch-ms consistent with the others, `breakpoints: true`.

- [ ] **Step 4: Add Drizzle column**

In `src/server/db/schema.ts`, inside the `providerProfiles` table definition, add after `modelMap`:

```ts
  fallbackProviderId: text("fallback_provider_id"),
```

- [ ] **Step 5: Apply + verify (real PG)**

Run: `npm run db:up && npm run db:migrate`
Expected: migrate completes; then
Run: `psql "$DATABASE_URL" -c "select column_name from information_schema.columns where table_name='provider_profiles' and column_name='fallback_provider_id';"`
Expected: one row `fallback_provider_id`.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/migrations/0024_provider_fallback.sql src/server/db/migrations/meta/_journal.json src/server/db/schema.ts
git commit -m "feat(failover): add provider_profiles.fallback_provider_id (migration 0024)"
```

---

### Task 2: Circuit breaker state machine (pure, in-memory)

**Files:**
- Create: `src/server/services/provider-circuit-breaker.ts`
- Test: `src/server/services/provider-circuit-breaker.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  shouldTryPrimary, recordReachable, recordFailure, getBreakerState,
  __resetBreaker, BREAKER_FAILURE_THRESHOLD, BREAKER_COOLDOWN_MS,
} from "./provider-circuit-breaker.js";

describe("provider-circuit-breaker", () => {
  beforeEach(() => __resetBreaker());
  const K = "wellflow";

  it("starts closed and allows primary", () => {
    expect(getBreakerState(K)).toBe("closed");
    expect(shouldTryPrimary(K, 0)).toBe(true);
  });

  it("opens after THRESHOLD consecutive failures", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    expect(getBreakerState(K)).toBe("open");
    expect(shouldTryPrimary(K, 0)).toBe(false); // still cooling
  });

  it("reachable resets failures (no open)", () => {
    recordFailure(K, 0); recordFailure(K, 0);
    recordReachable(K);
    expect(getBreakerState(K)).toBe("closed");
    recordFailure(K, 0);
    expect(getBreakerState(K)).toBe("closed"); // counter was reset
  });

  it("open → half-open after cooldown, single probe only", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    const now = BREAKER_COOLDOWN_MS;
    expect(shouldTryPrimary(K, now)).toBe(true);  // first request probes
    expect(getBreakerState(K)).toBe("half-open");
    expect(shouldTryPrimary(K, now)).toBe(false); // concurrent → fallback
  });

  it("half-open probe success → closed", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    shouldTryPrimary(K, BREAKER_COOLDOWN_MS);
    recordReachable(K);
    expect(getBreakerState(K)).toBe("closed");
  });

  it("half-open probe failure → reopens with fresh cooldown", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    shouldTryPrimary(K, BREAKER_COOLDOWN_MS);
    recordFailure(K, BREAKER_COOLDOWN_MS);
    expect(getBreakerState(K)).toBe("open");
    expect(shouldTryPrimary(K, BREAKER_COOLDOWN_MS)).toBe(false); // new cooldown
  });

  it("half-open reachable on a 4xx (non-eligible) closes too — reachability semantics", () => {
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) recordFailure(K, 0);
    shouldTryPrimary(K, BREAKER_COOLDOWN_MS);
    recordReachable(K); // caller maps non-eligible 4xx → recordReachable
    expect(getBreakerState(K)).toBe("closed");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/server/services/provider-circuit-breaker.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/server/services/provider-circuit-breaker.ts
// In-memory circuit breaker for provider failover, keyed by PRIMARY profile id.
// Single Node process → module-level state is coherent. Reflects PRIMARY
// reachability only; fallback outcomes NEVER touch it. Spec §3.4.

export const BREAKER_FAILURE_THRESHOLD = 3;
export const BREAKER_COOLDOWN_MS = 60_000;

type BreakerState = "closed" | "open" | "half-open";
interface Entry { state: BreakerState; failures: number; openedAt: number; halfOpenInFlight: boolean; }

const entries = new Map<string, Entry>();

function get(key: string): Entry {
  let e = entries.get(key);
  if (!e) { e = { state: "closed", failures: 0, openedAt: 0, halfOpenInFlight: false }; entries.set(key, e); }
  return e;
}

// May the next request try the PRIMARY? Sets halfOpenInFlight SYNCHRONOUSLY (no
// await between decision and flag-set) so concurrent half-open requests yield
// exactly one probe.
export function shouldTryPrimary(key: string, now: number = Date.now()): boolean {
  const e = get(key);
  if (e.state === "open" && now - e.openedAt >= BREAKER_COOLDOWN_MS) {
    e.state = "half-open";
    e.halfOpenInFlight = false;
  }
  if (e.state === "closed") return true;
  if (e.state === "open") return false;
  if (!e.halfOpenInFlight) { e.halfOpenInFlight = true; return true; }
  return false;
}

// Primary responded at all (2xx OR non-eligible 4xx/5xx) → reachable → close.
export function recordReachable(key: string): void {
  entries.set(key, { state: "closed", failures: 0, openedAt: 0, halfOpenInFlight: false });
}

// Eligible infra failure on the primary → count / reopen. Releases halfOpenInFlight.
export function recordFailure(key: string, now: number = Date.now()): void {
  const e = get(key);
  if (e.state === "half-open") {
    e.state = "open"; e.openedAt = now; e.failures = BREAKER_FAILURE_THRESHOLD; e.halfOpenInFlight = false;
    return;
  }
  e.failures += 1;
  e.halfOpenInFlight = false;
  if (e.failures >= BREAKER_FAILURE_THRESHOLD) { e.state = "open"; e.openedAt = now; }
}

export function getBreakerState(key: string): BreakerState { return get(key).state; }

// test-only
export function __resetBreaker(): void { entries.clear(); }
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/server/services/provider-circuit-breaker.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/provider-circuit-breaker.ts src/server/services/provider-circuit-breaker.test.ts
git commit -m "feat(failover): in-memory circuit breaker (reachability semantics)"
```

---

### Task 3: `isFailoverEligible` taxonomy

**Files:**
- Create: `src/server/services/provider-failover.ts` (starts with the eligibility fn; wrapper added in Task 6)
- Test: `src/server/services/provider-failover.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { isFailoverEligible } from "./provider-failover.js";

describe("isFailoverEligible", () => {
  it("502/503/504 → eligible", () => {
    for (const s of [502, 503, 504]) expect(isFailoverEligible({ status: s })).toBe(true);
  });
  it("4xx and non-{502,503,504} 5xx → NOT eligible", () => {
    for (const s of [400, 401, 403, 404, 429, 500, 501]) expect(isFailoverEligible({ status: s })).toBe(false);
  });
  it("budget abort (AbortError/TimeoutError) → eligible", () => {
    expect(isFailoverEligible({ name: "AbortError" })).toBe(true);
    expect(isFailoverEligible({ name: "TimeoutError" })).toBe(true);
  });
  it("connection codes → eligible", () => {
    for (const code of ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])
      expect(isFailoverEligible({ cause: { code } })).toBe(true);
  });
  it("connect-timeout / socket hang up message → eligible", () => {
    expect(isFailoverEligible({ message: "Connect Timeout Error" })).toBe(true);
    expect(isFailoverEligible({ cause: { message: "socket hang up" } })).toBe(true);
  });
  it("null/plain/app errors → NOT eligible", () => {
    expect(isFailoverEligible(null)).toBe(false);
    expect(isFailoverEligible(new Error("boom"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/server/services/provider-failover.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement (eligibility only — wrapper in Task 6)**

```ts
// src/server/services/provider-failover.ts
// Cross-provider failover: eligibility taxonomy + execution wrapper. Spec §3.3/§3.5.

const FAILOVER_CONNECT_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

// Only INFRASTRUCTURE failures are eligible (spec §3.3): 502/503/504 + connection-level
// (connect timeout/refused/DNS) + our single-shot budget abort. Any 4xx and any other
// 5xx (incl 500/501) are NOT eligible (the fallback would just return the same app error).
export function isFailoverEligible(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e.status === 502 || e.status === 503 || e.status === 504) return true;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true; // primary budget abort
  const code = e.cause?.code ?? e.code;
  if (code && FAILOVER_CONNECT_CODES.has(code)) return true;
  const msg = `${e.cause?.message ?? ""} ${e.message ?? ""}`.toLowerCase();
  if (msg.includes("connect timeout") || msg.includes("connecttimeout") || msg.includes("socket hang up")) return true;
  return false;
}
```

- [ ] **Step 4: Run, verify pass** — Run: `npx vitest run src/server/services/provider-failover.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/provider-failover.ts src/server/services/provider-failover.test.ts
git commit -m "feat(failover): isFailoverEligible taxonomy"
```

---

### Task 4: Thread per-attempt budget into forward fns + adapter

**Files:**
- Modify: `src/server/services/closerouter-service.ts` (add `AttemptOptions`; 4 forward fns accept optional `attempt`)
- Modify: `src/server/services/provider-adapter.ts` (interface + impl pass `attempt` through)
- Test: `src/server/services/closerouter-attempt.test.ts`

- [ ] **Step 1: Write failing test (budget overrides reach fetch as maxAttempts/timeout)**

Use a global `fetch` spy. The test asserts that passing `attempt={timeoutMs:7000,maxAttempts:1}` causes a single fetch call (no connect-retry) and that omitting it preserves up-to-3 retries on a connect error.

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { forwardChat } from "./closerouter-service.js";

const CTX = { profileId: "wellflow", baseUrl: "https://up.test/v1", apiKey: "k", modelMap: {}, source: { baseUrl: "model_profile", apiKey: "model_profile" } } as const;

function connErr() { const e = new Error("connect") as any; e.cause = { code: "ECONNREFUSED" }; return e; }

afterEach(() => vi.restoreAllMocks());

describe("forward fn attempt override", () => {
  it("attempt.maxAttempts=1 → single fetch, no connect-retry", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(connErr());
    await expect(forwardChat({ model: "claude-opus-4-6", messages: [] } as any, CTX as any, { timeoutMs: 7000, maxAttempts: 1 }))
      .rejects.toMatchObject({ status: 503 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("no attempt → default 3 attempts on connect error", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(connErr());
    await expect(forwardChat({ model: "claude-opus-4-6", messages: [] } as any, CTX as any))
      .rejects.toMatchObject({ status: 503 });
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run, verify fail** — Run: `npx vitest run src/server/services/closerouter-attempt.test.ts` → FAIL (forwardChat takes only 2 args / extra arg ignored).

- [ ] **Step 3: Implement signature change**

In `closerouter-service.ts`, add near the top (after `ChatRequest`):

```ts
// Optional per-call override for the upstream attempt budget. Used by the failover
// wrapper to make the PRIMARY attempt single-shot with a short time-to-headers budget
// (spec §3.5). undefined → today's behavior (default timeout + 3 connect-retries).
export interface AttemptOptions { timeoutMs?: number; maxAttempts?: number; }
```

Then change each of the 4 forward fns to accept `attempt?: AttemptOptions` as the LAST param and thread it into `fetchWithRuntimeTimeout`:

- `forwardChat(body, ctx, attempt?)`:
```ts
  const res = await fetchWithRuntimeTimeout(url, {
    method: "POST", headers: baseHeaders(ctx.apiKey), body: JSON.stringify(providerBody),
  }, attempt?.timeoutMs ?? runtimeConfig.defaultRequestTimeoutMs, attempt?.maxAttempts ?? 3);
```
- `forwardTextEndpoint(endpoint, body, ctx, attempt?)`: same pattern, `defaultRequestTimeoutMs`.
- `forwardChatStream(body, res, ctx, attempt?)`: thread into its `fetchWithRuntimeTimeout(..., attempt?.timeoutMs ?? runtimeConfig.defaultStreamTimeoutMs, attempt?.maxAttempts ?? 3)`.
- `forwardChatStreamAsResponses(body, res, ctx, meta, attempt?)`: same, `defaultStreamTimeoutMs`.

(Do NOT touch the body-streaming loop or the `if (!upstream.ok) throw` ordering — the throw must stay BEFORE `res.setHeader`/`flushHeaders`, which it already is.)

In `provider-adapter.ts`, add `attempt?: AttemptOptions` to the interface methods `forwardChat`, `forwardChatStream`, `forwardResponsesStream`, `forwardResponses`, `forwardMessages`, and pass it through in `CloseRouterAdapter` (import `AttemptOptions` from closerouter-service). Example:
```ts
  forwardChat(body: ChatRequest, ctx: ProviderContext, attempt?: AttemptOptions) { return forwardChat(body, ctx, attempt); }
  forwardChatStream(body: ChatRequest, res: Response, ctx: ProviderContext, attempt?: AttemptOptions) { return forwardChatStream(body, res, ctx, attempt); }
  forwardResponsesStream(body, res, ctx, meta, attempt?) { return forwardChatStreamAsResponses(body, res, ctx, meta, attempt); }
  forwardResponses(body, ctx, attempt?) { return forwardTextEndpoint("responses", body, ctx, attempt); }
  forwardMessages(body, ctx, attempt?) { return forwardTextEndpoint("messages", body, ctx, attempt); }
```

- [ ] **Step 4: Run, verify pass** — Run: `npx vitest run src/server/services/closerouter-attempt.test.ts` → PASS. Then `npm run lint` → clean.

- [ ] **Step 5: Regression check** — Run: `npx vitest run src/server/services/closerouter-service.test.ts` → PASS (existing behavior unchanged with attempt omitted).

- [ ] **Step 6: Commit**

```bash
git add src/server/services/closerouter-service.ts src/server/services/provider-adapter.ts src/server/services/closerouter-attempt.test.ts
git commit -m "feat(failover): optional per-attempt budget on forward fns + adapter"
```

---

### Task 5: `resolveProviderChainForModel`

**Files:**
- Modify: `src/server/services/provider-config-service.ts`
- Test: `src/server/services/provider-chain.test.ts`

- [ ] **Step 1: Write failing tests** (fake-db style — mirror provider-config-service.test.ts setup; assert chain shape + bypass + null cases)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
// Reuse the test's existing db mock harness; here we assert the resolver contract:
import { resolveProviderChainForModel, invalidateProviderConfigCache } from "./provider-config-service.js";

// NOTE: follow provider-config-service.test.ts's existing db-mock pattern to seed:
//   wellflow: enabled, key OK, supportedModelIds=["claude-opus-4-6"], fallbackProviderId="closerouter"
//   closerouter: enabled, key OK, supportedModelIds=["claude-opus-4.8"], no fallback
beforeEach(() => invalidateProviderConfigCache());

describe("resolveProviderChainForModel", () => {
  it("primary pinned + fallback set → returns both", async () => {
    const { primary, fallback } = await resolveProviderChainForModel("claude-opus-4-6");
    expect(primary.profileId).toBe("wellflow");
    expect(fallback?.profileId).toBe("closerouter");
  });
  it("fallback profile carries its OWN modelMap (for wire remap)", async () => {
    const { fallback } = await resolveProviderChainForModel("claude-opus-4-6");
    expect(fallback?.modelMap).toMatchObject({ "claude-opus-4.8": "claude-opus-4-8" });
  });
  it("primary without fallbackProviderId → fallback null", async () => {
    const { primary, fallback } = await resolveProviderChainForModel("claude-opus-4.8");
    expect(primary.profileId).toBe("closerouter");
    expect(fallback).toBeNull();
  });
  it("fallback target disabled or keyless → fallback null", async () => {
    // seed closerouter disabled (or cipher undecryptable) → wellflow's fallback resolves to null
    const { fallback } = await resolveProviderChainForModel("claude-opus-4-6");
    expect(fallback).toBeNull();
  });
  it("unpinned model (active/db/env) → fallback null", async () => {
    const { primary, fallback } = await resolveProviderChainForModel("some-unpinned-model");
    expect(primary.profileId).toBeNull();
    expect(fallback).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/server/services/provider-chain.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement**

In `provider-config-service.ts`:

(a) Add `fallbackProviderId` to `ParsedProfile`:
```ts
interface ParsedProfile {
  id: string; baseUrl: string; apiKey: string | undefined;
  supportedModelIds: string[]; modelMap: Record<string, string>;
  fallbackProviderId: string | null;
}
```
(b) In `readAllEnabledProfiles`, in the `.map`, add:
```ts
      fallbackProviderId: isNonEmptyString(r.fallbackProviderId) ? r.fallbackProviderId : null,
```
(c) Add the chain resolver (export an interface + fn). Reuse the existing primary logic by extracting it, then resolve fallback:
```ts
export interface ProviderChain { primary: ProviderContext; fallback: ProviderContext | null; }

export async function resolveProviderChainForModel(canonicalModelId: string): Promise<ProviderChain> {
  const profiles = await readAllEnabledProfiles();
  const match = profiles.find((p) => p.supportedModelIds.includes(canonicalModelId));

  if (match && match.apiKey) {
    const primary: ProviderContext = {
      profileId: match.id, baseUrl: match.baseUrl, apiKey: match.apiKey,
      modelMap: match.modelMap, source: { baseUrl: "model_profile", apiKey: "model_profile" },
    };
    // Fallback: ONLY for a pinned primary with an explicit, enabled, decryptable target.
    // Mirrors the primary's `&& apiKey` guard (spec §3.2). Does NOT require the model to
    // be in the fallback's supportedModelIds (pin bypass).
    let fallback: ProviderContext | null = null;
    if (match.fallbackProviderId) {
      const fb = profiles.find((p) => p.id === match.fallbackProviderId);
      if (fb && fb.apiKey) {
        fallback = {
          profileId: fb.id, baseUrl: fb.baseUrl, apiKey: fb.apiKey,
          modelMap: fb.modelMap, source: { baseUrl: "model_profile", apiKey: "model_profile" },
        };
      }
    }
    return { primary, fallback };
  }

  // Unpinned → existing active/db/env behavior, no failover.
  const eff = await resolveEffectiveProviderConfig();
  const activeMap = await resolveActiveModelMap();
  return {
    primary: {
      profileId: null, baseUrl: eff.baseUrl, apiKey: eff.apiKey, modelMap: activeMap,
      source: {
        baseUrl: eff.source.baseUrl === "profile" ? "active_profile" : eff.source.baseUrl,
        apiKey: eff.source.apiKey === "profile" ? "active_profile" : eff.source.apiKey,
      },
    },
    fallback: null,
  };
}
```
(d) Re-express the existing `resolveProviderForModel` to delegate (keeps all current callers/tests byte-identical):
```ts
export async function resolveProviderForModel(canonicalModelId: string): Promise<ProviderContext> {
  return (await resolveProviderChainForModel(canonicalModelId)).primary;
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/server/services/provider-chain.test.ts` → PASS. Then `npx vitest run src/server/services/provider-config-service.test.ts` → PASS (delegation unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/server/services/provider-config-service.ts src/server/services/provider-chain.test.ts
git commit -m "feat(failover): resolveProviderChainForModel (primary + optional fallback)"
```

---

### Task 6: `forwardWithFailover` wrapper

**Files:**
- Modify: `src/server/services/provider-failover.ts` (add wrapper)
- Test: `src/server/services/provider-failover-wrapper.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { forwardWithFailover } from "./provider-failover.js";
import { __resetBreaker, getBreakerState, BREAKER_FAILURE_THRESHOLD } from "./provider-circuit-breaker.js";

const primary = { profileId: "wellflow", baseUrl: "p", apiKey: "k", modelMap: {}, source: {} as any };
const fallback = { profileId: "closerouter", baseUrl: "f", apiKey: "k", modelMap: {}, source: {} as any };
const e503 = () => { const x = new Error("x") as any; x.status = 503; return x; };
const e400 = () => { const x = new Error("x") as any; x.status = 400; return x; };

beforeEach(() => __resetBreaker());

describe("forwardWithFailover", () => {
  it("no fallback → runs primary once, no failover", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    const r = await forwardWithFailover({ primary, fallback: null }, {}, run);
    expect(r).toMatchObject({ result: "ok", servedBy: "wellflow", failedOver: false });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("primary 503 (eligible) → fallback served, breaker failure recorded", async () => {
    const run = vi.fn().mockRejectedValueOnce(e503()).mockResolvedValueOnce("fb");
    const r = await forwardWithFailover({ primary, fallback }, {}, run);
    expect(r).toMatchObject({ result: "fb", servedBy: "closerouter", failedOver: true });
    expect(run.mock.calls[0][1]).toMatchObject({ maxAttempts: 1 }); // primary got budget
    expect(run.mock.calls[1][1]).toBeUndefined();                   // fallback full
  });

  it("primary 400 (not eligible) → propagate, NO failover, breaker reachable", async () => {
    const run = vi.fn().mockRejectedValue(e400());
    await expect(forwardWithFailover({ primary, fallback }, {}, run)).rejects.toMatchObject({ status: 400 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(getBreakerState("wellflow")).toBe("closed");
  });

  it("post-commit (res.headersSent) eligible error → NO failover", async () => {
    const run = vi.fn().mockRejectedValue(e503());
    const res = { headersSent: true } as any;
    await expect(forwardWithFailover({ primary, fallback }, { res }, run)).rejects.toMatchObject({ status: 503 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("breaker open → skips primary, straight to fallback", async () => {
    const run = vi.fn().mockResolvedValue("fb");
    // Open the breaker via repeated eligible failures
    const fail = vi.fn().mockRejectedValue(e503()).mockResolvedValue("fb");
    for (let i = 0; i < BREAKER_FAILURE_THRESHOLD; i++) {
      await forwardWithFailover({ primary, fallback }, {}, vi.fn().mockRejectedValueOnce(e503()).mockResolvedValueOnce("fb"));
    }
    expect(getBreakerState("wellflow")).toBe("open");
    const r = await forwardWithFailover({ primary, fallback }, {}, run);
    expect(r.servedBy).toBe("closerouter");
    expect(run).toHaveBeenCalledTimes(1);           // primary skipped
    expect(run.mock.calls[0][0].profileId).toBe("closerouter");
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/server/services/provider-failover-wrapper.test.ts` → FAIL (forwardWithFailover not exported).

- [ ] **Step 3: Implement (append to provider-failover.ts)**

```ts
import type { Response } from "express";
import { logger } from "../lib/logger.js";
import type { ProviderContext, ProviderChain } from "./provider-config-service.js";
import type { AttemptOptions } from "./closerouter-service.js";
import { shouldTryPrimary, recordReachable, recordFailure } from "./provider-circuit-breaker.js";

export const FAILOVER_PRIMARY_BUDGET_MS = 7000;

export type RunForward<T> = (ctx: ProviderContext, attempt?: AttemptOptions) => Promise<T>;
export interface FailoverOpts { res?: Response; }

export async function forwardWithFailover<T>(
  chain: ProviderChain,
  opts: FailoverOpts,
  runForward: RunForward<T>,
): Promise<{ result: T; servedBy: string | null; failedOver: boolean }> {
  const { primary, fallback } = chain;
  if (!fallback) {
    const result = await runForward(primary, undefined);
    return { result, servedBy: primary.profileId, failedOver: false };
  }
  const key = primary.profileId ?? "_active";

  if (!shouldTryPrimary(key)) {
    const result = await runForward(fallback, undefined);
    return { result, servedBy: fallback.profileId, failedOver: true };
  }

  try {
    const result = await runForward(primary, { timeoutMs: FAILOVER_PRIMARY_BUDGET_MS, maxAttempts: 1 });
    recordReachable(key);
    return { result, servedBy: primary.profileId, failedOver: false };
  } catch (err) {
    const eligible = isFailoverEligible(err);
    const committed = opts.res?.headersSent === true;
    if (eligible && !committed) {
      recordFailure(key);
      logger.warn({ from: primary.profileId, to: fallback.profileId, reason: (err as Error)?.message }, "provider failover");
      const result = await runForward(fallback, undefined);
      return { result, servedBy: fallback.profileId, failedOver: true };
    }
    if (!eligible) recordReachable(key); // primary responded (4xx/app) → reachable
    throw err;
  }
}
```
(Also `export interface ProviderChain` already lives in provider-config-service.ts — import it; do not redefine.)

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/server/services/provider-failover-wrapper.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/provider-failover.ts src/server/services/provider-failover-wrapper.test.ts
git commit -m "feat(failover): forwardWithFailover wrapper (budget + breaker + fallback retry)"
```

---

### Task 7: Wire proxy.ts (5 forward sites)

**Files:**
- Modify: `src/server/routes/proxy.ts`

For EACH of the 5 sites, replace `const providerCtx = await resolveProviderForModel(masterModel.id)` + the direct adapter call with the chain + wrapper. Import at top: `resolveProviderChainForModel` (from provider-config-service) and `forwardWithFailover` (from provider-failover).

- [ ] **Step 1: handleTextJsonEndpoint (messages/responses non-stream, ~line 406-410)**

```ts
    const chain = await resolveProviderChainForModel(masterModel.id);
    const activeProviderAdapter = await getActiveProviderAdapter();
    const { result } = await forwardWithFailover(chain, {}, (ctx, attempt) =>
      endpoint === "responses"
        ? activeProviderAdapter.forwardResponses(providerBody, ctx, attempt)
        : activeProviderAdapter.forwardMessages(providerBody, ctx, attempt));
    const { raw, usage } = result;
```

- [ ] **Step 2: chat handler (stream + non-stream, ~line 567-596)**

```ts
    const chain = await resolveProviderChainForModel(masterModel.id);
    const activeProviderAdapter = await getActiveProviderAdapter();

    if (isStream) {
      res.setHeader("X-YZ-Request-Id", requestId);
      const { result: usage } = await forwardWithFailover(chain, { res }, (ctx, attempt) =>
        activeProviderAdapter.forwardChatStream(providerBody as any, res, ctx, attempt));
      // ...unchanged settle block...
    } else {
      const { result } = await forwardWithFailover(chain, {}, (ctx, attempt) =>
        activeProviderAdapter.forwardChat(providerBody as any, ctx, attempt));
      const { raw, usage } = result;
      // ...unchanged settle block...
    }
```

- [ ] **Step 3: responses handler (stream + non-stream, ~line 795-827)**

```ts
    const chain = await resolveProviderChainForModel(masterModel.id);
    const activeProviderAdapter = await getActiveProviderAdapter();

    if (isStream) {
      res.setHeader("X-YZ-Request-Id", requestId);
      const { result: usage } = await forwardWithFailover(chain, { res }, (ctx, attempt) =>
        activeProviderAdapter.forwardResponsesStream(providerBody as any, res, ctx, { id: requestId, model: masterModel.id, createdAt }, attempt));
      // ...unchanged settle block...
    } else {
      const { result } = await forwardWithFailover(chain, {}, (ctx, attempt) =>
        activeProviderAdapter.forwardChat(providerBody as any, ctx, attempt));
      const { raw, usage } = result;
      // ...unchanged settle + chatCompletionToResponses block...
    }
```

(Leave the image handler at ~996 untouched — images are 501, out of scope.)

- [ ] **Step 4: Verify `resolveBilledPromptTokens` still ≥4 occurrences**

Run: `grep -c resolveBilledPromptTokens src/server/routes/proxy.ts`
Expected: ≥4 (we did NOT remove any).

- [ ] **Step 5: Lint + existing proxy tests** — Run: `npm run lint` (clean) and `npx vitest run src/server/__tests__` (proxy-related unit/contract tests pass).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/proxy.ts
git commit -m "feat(failover): wire forwardWithFailover into chat/messages/responses"
```

---

### Task 8: Admin/seed — set `fallback_provider_id`

**Files:**
- Modify: `src/server/services/provider-config-service.ts` (`upsertProviderProfile` accepts `fallbackProviderId` + validation)
- Create: `scripts/set-provider-fallback.ts`
- Test: extend `src/server/services/provider-config-service.test.ts`

- [ ] **Step 1: Write failing test** (upsert persists fallbackProviderId; rejects self-ref and unknown/disabled target)

```ts
it("upsertProviderProfile sets fallbackProviderId; rejects self-ref", async () => {
  await expect(upsertProviderProfile({ id: "wellflow", fallbackProviderId: "wellflow" })).rejects.toThrow();
  const v = await upsertProviderProfile({ id: "wellflow", fallbackProviderId: "closerouter" });
  expect(v).toBeTruthy();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — add `fallbackProviderId?: string | null` to the `upsertProviderProfile` input; when provided: trim; reject `=== id` (BadRequestError "fallback kendisi olamaz"); when non-null, verify the target exists and is `enabled` (else BadRequestError); set `patch.fallbackProviderId` / insert value. Add `fallbackProviderId` to `ProviderProfileAdminView` + `toProviderProfileAdminView`. Create `scripts/set-provider-fallback.ts` (loads env via `ENV_FILE_PATH`, calls `upsertProviderProfile({ id, fallbackProviderId })`, prints result) — used by rollout, NOT by deploy.

- [ ] **Step 4: Run, verify pass.** Lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/provider-config-service.ts scripts/set-provider-fallback.ts src/server/services/provider-config-service.test.ts
git commit -m "feat(failover): admin/seed set fallback_provider_id with validation"
```

---

### Task 9: Integration tests (real PG + nock)

**Files:**
- Create: `src/server/__tests__/provider-failover.itest.ts`

- [ ] **Step 1: Write itests** (follow `money-flow.itest.ts` harness: real PG, seeded user+key+balance, two enabled profiles with fallback set; `nock` the wellflow + closerouter base URLs).

Scenarios (assert):
1. wellflow `/chat/completions` → 503 once, closerouter → 200: client gets 200; exactly ONE `usage_records` row for the reqId; balance debited once (no double-charge).
2. wellflow → 400: client gets 400; NO closerouter call (nock not consumed); error usage row (cost 0).
3. wellflow streaming → 503 BEFORE body: failover to closerouter stream; assert wellflow wrote 0 bytes to client before the status check (the 503 path throws pre-flush).
4. Both fail (wellflow 503, closerouter 503): client gets upstream error; reserve fully released (no orphan `usage_reserve_` hold — query transactions), usage row status error, 0 charge.
5. Breaker: 3 consecutive wellflow 503s → 4th request does NOT hit wellflow nock (assert wellflow nock pending), served by closerouter.

- [ ] **Step 2: Run** — `npm run db:up && npm run db:migrate && npx vitest run --config vitest.itest.config.ts src/server/__tests__/provider-failover.itest.ts`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/__tests__/provider-failover.itest.ts
git commit -m "test(failover): integration — failover, no double-charge, breaker, streaming pre-commit"
```

---

### Task 10: Full green + non-leak + final

- [ ] **Step 1: Unit suite** — Run: `npm test` → all PASS.
- [ ] **Step 2: Integration suite** — Run: `npm run itest` → all PASS.
- [ ] **Step 3: Build + public bundle scan** — Run: `npm run build && npm run scan:public` → no provider codename leak (failover/breaker only logs server-side; no client header added).
- [ ] **Step 4: Lint** — Run: `npm run lint` → clean.
- [ ] **Step 5: Contract check** — Run: `npx vitest run` (full) → provider-name-noleak, catalog-noleak, 42-lock, code_contracts all green.
- [ ] **Step 6: Final commit (if any residual)**

```bash
git add -A && git commit -m "chore(failover): full suite green (unit+itest+scan:public+lint)"
```

**STOP — do NOT deploy.** Hand back for: (1) 3-QA of the code diff (≥2 PASS), (2) isolation proof from live commit, (3) explicit second approval, (4) careful `sync-deploy.sh` deploy, (5) separate DB rollout steps (set `wellflow.fallback_provider_id`, then move opus-4.8) each under the approval gate. Keep `closerouter.model_map` opus-4.8 entry.
