---
name: clone-website
description: Use when the user points at a live URL and wants it recreated — cloned, replicated, rebuilt, reverse-engineered, or copied into a working frontend. Also triggers on "make a copy of this site", "rebuild this page", "pixel-perfect clone". Targets a Next.js App Router + shadcn/ui + Tailwind scaffold. Provide one or more target URLs as arguments.
argument-hint: "<url1> [<url2> ...]"
user-invocable: true
---

# Clone Website

You are about to reverse-engineer and rebuild **$ARGUMENTS** as pixel-perfect clones. You work as a **foreman walking the job site**: as you inspect each section, you write a detailed spec to a file, then hand that file to a specialist builder agent with everything it needs. Extraction and construction run in parallel, but extraction is meticulous and produces auditable artifacts.

When multiple URLs are given, process them independently, keeping each site's artifacts in its own folder (`docs/research/<hostname>/`, `docs/design-references/<hostname>/`).

## Legal & Ethics (read first)

Cloning reproduces another site's design, branding, and assets. Before proceeding:
- If the target is a production site the user does not clearly own, **confirm they own it or are authorized**. This skill is for rebuilding your own work, prototyping, and learning — not impersonation.
- **Never reproduce login / account / payment UI** in any way that could harvest real credentials.
- Treat **fonts and media as licensed**: commercial/foundry/Typekit font binaries and licensed Lottie/3D/stock assets often cannot be re-hosted. Prefer the closest open substitute and flag the swap to the user.
- Keep secrets out of artifacts: never commit downloaded session cookies, signed URLs, or PII into spec files or `public/`. If extraction captured any, scrub it.

## When NOT to Use

Stop and tell the user (don't silently produce a broken clone) when the target is:
- **Canvas / WebGL / 3D-rendered** (Three.js, Spline, Unity, Rive, heavy `<canvas>`). Computed CSS yields an empty box — these can't be DOM-cloned. Ask the user: ship a static poster/screenshot stand-in, or skip that section?
- **Auth-walled / logged-in views.** Out of scope, and screenshotting them risks persisting session tokens to disk. Clone only what's publicly reachable.
- **A real-backend-dependent SPA** where the visible content is server/data-driven per session. Clone the shell + mock data; do not attempt to reproduce the backend.

## Scope Defaults

Clone exactly what's visible at the URL. Unless the user says otherwise:
- **Fidelity:** Pixel-perfect — exact colors, spacing, typography, animations
- **In scope:** Visual layout/styling, component structure and interactions, responsive design, mock data
- **Out of scope:** Real backend/DB, authentication, real-time features, SEO, accessibility audit
- **Customization:** None — pure emulation

User instructions override these defaults.

## Pre-Flight

1. **Browser automation is required.** Find an available browser MCP (Chrome, Playwright, Browserbase, Puppeteer…); prefer Chrome MCP. None detected → ask the user how to connect one. This skill cannot work without it. Confirm the MCP can **evaluate JS in page context** and **return/save bytes** — several extraction steps below depend on it; if it can't, say so before relying on those steps.
2. Parse `$ARGUMENTS` as one or more URLs. Normalize/validate each; fix invalid ones with the user. Verify each is reachable via the browser MCP.
3. **Stack check (hard gate).** This skill targets a **Next.js App Router + shadcn/ui + Tailwind** scaffold. Confirm `src/app/` and the scaffold exist and `npm run build` passes. If the project is a different stack (Vite/Astro/SvelteKit) or no scaffold is present, **tell the user and stop** — do not assume `src/app/layout.tsx`.
4. Create output dirs if missing: `docs/research/`, `docs/research/components/`, `docs/design-references/`, `scripts/` (plus per-site folders for multiple targets).
5. **Small-page escape hatch.** If the page has roughly 1–2 distinct sections, skip the worktree/parallel-dispatch machinery entirely — write the spec(s) and build inline, sequentially. Worktrees earn their overhead only at ~3+ independent sections.

## Guiding Principles

### 1. Completeness beats speed
Every builder must receive everything it needs: screenshot, exact CSS values, downloaded assets with local paths, real text, component structure. If a builder has to guess a color, size, or padding, extraction failed. Extract one more property rather than ship an incomplete brief.

### 2. Small tasks, perfect results
A builder told "build the entire features section" approximates and ships "close enough but wrong." A builder given one focused component with exact values nails it. **Complexity budget:** if a builder prompt exceeds ~150 lines of spec, the section is too big — split it. Mechanical rule; don't override with "but it's all related."

### 3. Real content, real assets — in every layer
Extract actual text, images, video, and inline SVG (as React components). A section that looks like one image is often layered — background photo/gradient, foreground UI PNG, overlay icon. Enumerate **all** visual sources in a container, not just `<img>`: hero photos, textures, gradient-clip masks, and sprite icons routinely live in CSS `background-image`, `mask-image`, and SVG `<use>`. Missing an overlay or a background layer makes the clone look empty even with correct layout.

### 4. Foundation first
Nothing builds until the foundation exists: global CSS with the target's design tokens, TypeScript types for content structures, global assets (fonts, favicons), and shared components. Sequential and non-negotiable. Everything after can be parallel.

### 5. Extract how it LOOKS and how it BEHAVES
A site is not a screenshot. For every element extract **appearance** (exact `getComputedStyle()`) AND **behavior**: what changes, what triggers it (exact scroll px / IntersectionObserver threshold / click / hover / time), the before and after CSS, and the transition (duration, easing, CSS vs JS vs `animation-timeline`). Watch for: scroll-triggered header changes, viewport-entry animations, `scroll-snap`, parallax, animated hovers, modal/accordion enter-exit, scroll progress, auto-cycling carousels, theme transitions between sections, **tab/pill content that switches**, and **scroll-driven tab/accordion switching** (IntersectionObserver, not clicks). Detect smooth-scroll libraries here (see Phase 1 → Global UI patterns).

### 6. Identify the interaction model BEFORE building
The most expensive mistake in cloning is building a click-based UI when the original is scroll-driven (or vice versa) — that's a rewrite, not a CSS tweak. Determine it deliberately:
1. **Don't click first.** Scroll slowly and watch whether things change on their own.
2. If they do → scroll-driven. Extract the mechanism (IntersectionObserver, `scroll-snap`, `position: sticky`, `animation-timeline`, JS scroll listeners).
3. If nothing changes on scroll → then test click/hover.
4. Record it explicitly in the spec: `INTERACTION MODEL: scroll-driven (IntersectionObserver)` etc.

### 7. Extract every state, not just the default
Tab bars show different cards per tab; headers differ at scroll 0 vs 100; cards have hover states. Capture all of them: click each tab and extract its content/images; capture computed styles at scroll 0 AND past the trigger, then diff to find exactly which properties change and record the transition + trigger threshold.

### 8. Spec files are the source of truth
Every component gets a spec file in `docs/research/components/` BEFORE any builder is dispatched — it's the contract between extraction and construction, and an auditable artifact. The builder receives the spec contents inline. No spec file → the builder guesses to fill gaps.

### 9. The build must always compile
Every builder verifies `npx tsc --noEmit` before finishing. After merges you verify `npm run build`. A broken build is never acceptable, even temporarily.

## Capture Hygiene (applies to all extraction)

Before any `getComputedStyle()` or screenshot: `await document.fonts.ready` (font-flash corrupts metrics) and let the page settle briefly — do **not** block on hard network-idle (it hangs on sites with sockets/long-poll). For scroll-state extraction, **disable smooth scroll** while measuring so positions are deterministic. Enumerate assets only **after** the full-page scroll has run (it hydrates lazy images for free).

## Phase 1: Reconnaissance

Navigate to the target with browser MCP.

### Screenshots
Full-page screenshots at desktop (1440px) and mobile (390px) → `docs/design-references/` with descriptive names. These are your master reference.

### Global extraction
- **Fonts** — Enumerate `document.fonts` (the live `FontFaceSet`, works cross-origin) as the primary source for families/weights/styles; supplement with `@font-face` scraping where same-origin stylesheets are readable. Configure in `layout.tsx` via `next/font/google` (Google) or `next/font/local`. For self-hosted faces, download the woff2 into `public/fonts/` and preserve variable-font axes. Heed the font-licensing caution above.
- **Colors** — When the site exposes a coherent `:root` custom-property palette, read `getComputedStyle(document.documentElement)` for `--*` props and use those as the **source of truth** (more accurate than sampling pixels). Still express them as shadcn tokens in `globals.css` (`background`/`foreground`/`primary`/`muted`…); add custom props only for colors that don't map.
- **Favicons & meta** — Download favicons, apple-touch-icons, OG images, webmanifest to `public/seo/`; update `layout.tsx` metadata.
- **Global UI patterns** — Identify site-wide CSS/JS: scrollbar hiding, page-level `scroll-snap`, global keyframes, backdrop filters, overlay gradients, and **smooth-scroll libraries** (Lenis → `.lenis`; Locomotive → `.locomotive-scroll`; or custom scroll containers). This is the canonical place smooth-scroll detection is recorded. Note any libraries to install.

### Mandatory interaction sweep
A dedicated pass after screenshots, before anything else — most behaviors are invisible in a static shot.
- **Scroll sweep:** scroll top→bottom slowly. Record header changes (+ trigger px), viewport-entry animations, auto-switching sidebars/tab indicators (+ mechanism), scroll-snap containers, and non-native scroll.
- **Click sweep:** click every button/tab/pill/link/card; record what changes. For tabs/pills click EACH and record per-state content.
- **Hover sweep:** hover buttons/cards/links/nav/images; record color/scale/shadow/underline/opacity changes.
- **Responsive sweep:** test 1440 / 768 / 390px; note which sections re-layout and at roughly which breakpoint.

Save to `docs/research/BEHAVIORS.md` — your behavior bible.

### Page topology
Map every section top→bottom with a working name. Record visual order, fixed/sticky overlays vs flow content, overall layout (scroll container, columns, z-index layers), inter-section dependencies, and each section's **interaction model**. Save as `docs/research/PAGE_TOPOLOGY.md` — your assembly blueprint.

## Phase 2: Foundation Build

Sequential; do it yourself (touches many files):
1. **Fonts** in `layout.tsx` to match the target.
2. **`globals.css`** with the target's tokens (from `:root` where available), spacing, keyframes, utilities, and global scroll behaviors (Lenis/smooth-scroll/body scroll-snap).
3. **TypeScript interfaces** in `src/types/` for observed content structures.
4. **SVG icons** — dedupe all inline `<svg>` into named React components in `src/components/icons.tsx` (name by function: `SearchIcon`, `ArrowRightIcon`, `LogoIcon`).
5. **Download assets** via a hardened `scripts/download-assets.mjs` (see below).
6. Verify `npm run build`.

### Asset discovery & download
Enumerate assets via browser MCP **after** the interaction sweep's scroll. For images read `img.currentSrc || img.src` (the variant the browser actually painted at the desktop capture viewport) — never raw `img.src` blindly — and **skip `data:` / blank / <1KB placeholders**, flagging them to scroll the element back into view and re-read. Also collect `<video>` sources/posters and the CSS `background-image`/`mask-image`/sprite URLs surfaced during per-section walks.

Download with a **hardened pipeline**, not a naive fetch-all:
- Realistic headers: `Referer` = site origin, a real browser User-Agent, image `Accept` headers, carried cookies.
- Validate each saved file's magic bytes / Content-Type. If an "image" is actually `text/html`, you saved a 403/bot-challenge page — retry or flag, don't ship it.
- Tolerate 403/404/CORS gracefully (log and continue; note misses for follow-up).
- Batch parallel (≈4 at a time); pause on a large-media budget rather than blindly pulling huge video.
- Preserve a meaningful directory structure under `public/`.

## Phase 3: Component Specification & Dispatch

The core loop. For each section (top→bottom): **extract → write spec → dispatch builders → merge**.

### File ownership (read before dispatching)
Shared files — `src/app/globals.css`, `src/app/layout.tsx`, `src/types/`, `src/components/icons.tsx` — are **foreman-owned and frozen** before dispatch. Builders **import only**; they must not edit shared files. If a builder needs a missing icon/token/type, it surfaces the request in its output and the foreman adds it. This is what keeps parallel worktree merges conflict-free.

### Ordering
Build shared/reused components and global/sticky overlays **first** (foundation tier), before the sections that consume them — never dispatch a consumer before its dependency is merged. Otherwise dispatch sections as you extract them. Don't fan out so wide that merges pile up faster than you can verify them.

### Step 1: Extract
Per section, via browser MCP: screenshot it in isolation; walk every element's computed styles (depth ≤4). During the walk also read `backgroundImage` (parse ALL `url()` layers), `mask-image`/`-webkit-mask-image`, and external SVG sprite `<use href>`, recording each URL **against the owning element** so the spec says where to re-apply it. For decorative things you can SEE but find no DOM/`<img>` source for (underline bars, list counters, quote marks, dividers), check `getComputedStyle(el, '::before'|'::after')` for `content`/`background-image` and record it as a real sub-element — but only on those flagged elements, don't blanket-walk every pseudo. Capture multi-state styles (both states, diffed). Extract real content (`textContent`, alt, aria, placeholder; click each tab for per-state content). Identify which downloaded assets and icon components the section uses. Assess complexity (distinct sub-components).

### Step 2: Write the spec file
`docs/research/components/<name>.spec.md` with: Overview (target file, screenshot, interaction model), DOM structure, Computed styles (exact per element), States & behaviors (trigger, state A/B, transition, implementation approach), Per-state content, Assets (with where each layer goes), Text content (verbatim), Responsive behavior (desktop/tablet/mobile + breakpoint). Fill every section or mark N/A.

### Step 3: Dispatch builders
Simple section (1–2 sub-components) → one builder. Complex (3+ distinct sub-components) → one builder per sub-component plus one wrapper builder (sub-components first). Each builder receives: the full spec contents inline (never "go read the file"), the section screenshot path, which shared components to import, the target file path, the responsive breakpoints, and the instruction to verify `npx tsc --noEmit`. Don't wait — dispatch, then extract the next section.

### Step 4: Verify, gate, merge
As builders return:
- **Verify before merging:** the owned file(s) exist and `npx tsc --noEmit` passes on the branch. Only green branches reach main.
- **Retry once, then quarantine:** if verification fails (or the builder never returned), re-dispatch ONCE with the failure noted (tighten/split the spec if it was a scope problem). Fails again → quarantine the section and move on; surface it at the end.
- **Build cadence:** run the full `npm run build` at the **end of each batch of merges** and once in Phase 4 — not per-merge. The foreman may make trivial mechanical fixes (import path, type name) inline.

### Resuming on a fresh context
Before dispatching anything new, reconstruct progress from disk: `docs/research/components/*.spec.md` = spec'd, git branches = built, `git log main` = merged, and check whether the component already exists in `src/`. Never re-dispatch work that's already on disk. (No separate manifest file is needed.)

## Phase 4: Page Assembly

Wire everything in `src/app/page.tsx`: import all sections, implement the page layout from the topology doc (scroll containers, columns, sticky, z-index), connect real content to props, implement page-level behaviors (scroll snap, scroll-driven animations, theme transitions, IntersectionObservers, smooth scroll). Verify `npm run build`.

## Phase 5: Visual QA Diff

Do NOT declare complete after assembly. Take side-by-side comparisons at 1440px and 390px and walk the page top→bottom with a **written per-section checklist**: spacing, type scale, color, layered assets present, and the extracted interaction actually fires. For each discrepancy: check the spec (was the value extracted right?) — re-extract and fix the spec if wrong, fix the component if the builder diverged. Test every interactive behavior (scroll, tabs, hovers, header transition, smooth scroll). (If you want a numeric aid, a section-level crop diff is fine — but keep QA as structured human comparison, not a build-blocking global pixel gate.) Only after this pass is the clone complete.

## Pre-Dispatch Checklist

The canonical, terse gate. Before dispatching ANY builder, verify:
- [ ] Spec file written with ALL sections filled (or N/A)
- [ ] Every CSS value from `getComputedStyle()`, not estimated
- [ ] Interaction model identified and recorded
- [ ] Every state's content + styles captured (tabs, scroll, hover)
- [ ] Scroll-driven trigger + before/after + transition recorded
- [ ] All visual sources identified — `<img>`, video, AND background-image/mask/sprite/overlays
- [ ] Responsive behavior documented (desktop + mobile minimum)
- [ ] Text verbatim from the site
- [ ] Builder prompt under ~150 lines (else split)

## What NOT to Do

- Don't get the interaction model wrong (click-based when it's scroll-driven) — determine it first (Principle 6).
- Don't enumerate `img.src` directly — read `img.currentSrc` after the scroll and reject `data:`/placeholder URLs, or you ship the LQIP/low-res fallback.
- Don't enumerate only `<img>`/`<video>` — hero photos, textures, gradient-clip masks, and sprite icons live in CSS `background-image`/`mask-image`/`<use>`.
- Don't extract only the default state, or miss overlay/layered images.
- Don't build HTML mockups of content that's actually video/Lottie/canvas — check first (see When NOT to Use).
- Don't approximate CSS classes — extract exact values.
- Don't let builders edit shared files, or dispatch a consumer before its dependency is merged.
- Don't dispatch a builder without a spec file, or reference external docs from a builder prompt (inline the spec).
- Don't build everything in one monolithic commit, or hand one agent too much scope.

## Completion

Report: sections built, components created, spec files written, assets downloaded, build status, visual-QA results, any quarantined sections, and any known gaps (e.g., canvas/WebGL stand-ins, substituted licensed fonts).
