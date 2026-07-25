# YapayZekaLab Current-State Audit Implementation Plan

> **For agentic workers:** Use parallel read-only investigators for independent evidence domains. Only the controller may merge findings into the final report. No deploy, commit, database mutation, browser login, or production write is authorized by this plan.

**Goal:** Reconstruct the freshest evidence-backed state of YapayZekaLab from local code, Claude work, Markdown decisions, production VPS/DB, public APIs, and the already-open Chrome session, then save one durable current-state report.

**Architecture:** Treat archive notes, the authoritative local repository, production files/database, public HTTP responses, and browser-visible state as separate evidence layers. Capture timestamps and source paths for each claim, mark conflicts and stale material explicitly, and only promote a claim to current truth when a fresher primary source supports it.

**Tech Stack:** Git, ripgrep/find, SSH, systemd, PostgreSQL read-only queries, curl, agent-browser attached to the existing Chrome session, Chronicle, Markdown.

---

### Task 1: Establish Workspace Truth

**Files:**
- Read: `/Users/ufuk/yzapi/CLAUDE.md`
- Read: `/Users/ufuk/yzapi/.git/`
- Create: `/Users/ufuk/yzapi/docs/research/2026-07-16-yapayzekalab-current-state.md`

- [ ] Record the actual repo root, branch, HEAD, remotes, dirty files, and missing/moved archive path.
- [ ] Keep `/Users/ufuk/yzapi`, `yzapi-vps:/opt/turkapiprojesi`, and iCloud/archive workspaces separate.
- [ ] Preserve all pre-existing dirty and untracked files without modification.

### Task 2: Inventory Claude and Markdown Evidence

**Files:**
- Read: all relevant `*.md` and `CLAUDE.md` files under `/Users/ufuk`, excluding dependency/cache/vendor trees.
- Read: `/Users/ufuk/yzapi/.claude/worktrees/`
- Read: current Claude/Codex history and Chronicle evidence where available.

- [ ] Build a machine-generated path inventory with modification times, sizes, hashes, and relevance classes.
- [ ] Read every high-relevance document and extract decisions, completed work, pending work, contradictions, and dates.
- [ ] Mark duplicate, historical, archive-only, and superseded documents rather than treating all notes as current.

### Task 3: Reconstruct Code and Decision History

**Files:**
- Read: `/Users/ufuk/yzapi` Git history and current diff.
- Read: related `/Users/ufuk/yzapi-*` repositories and Claude worktrees.

- [ ] Map recent commits and current uncommitted changes to product capabilities and operational intent.
- [ ] Identify work present only locally, only in alternate worktrees, only in production, or in all layers.
- [ ] Cross-check high-risk routing, billing, package, migration, model-catalog, and admin decisions against source code.

### Task 4: Verify Production and Public APIs

**Files:**
- Read remotely: `yzapi-vps:/opt/turkapiprojesi` without mutation.
- Read publicly: `https://yapayzekalab.org/` and first-party API/status endpoints.

- [ ] Capture service status, deploy marker, source hashes, migration ceiling, process/build timestamps, and recent error summaries.
- [ ] Run only non-sensitive aggregate/configuration queries; never print secret values, keys, cookies, or tokens.
- [ ] Compare `/health`, `/status`, `/api/models`, `/v1/models`, provider/catalog counts, and customer-visible surfaces.

### Task 5: Inspect Existing Chrome Session

**Files:**
- Read only: already-open Chrome tabs and authenticated admin/customer surfaces.

- [ ] Attach to the existing Chrome instance; do not launch a new Chrome process or CDP port.
- [ ] Inspect relevant open tabs, opening new tabs only inside that same Chrome session when necessary.
- [ ] Record browser-visible truth separately from HTTP, DB, and local-code truth.

### Task 6: Write the Durable Current-State Report

**Files:**
- Create: `/Users/ufuk/yzapi/docs/research/2026-07-16-yapayzekalab-current-state.md`
- Preserve: `/Users/ufuk/yzapi/docs/research/2026-07-16-yapayzekalab-live-first-party-research.md`

- [ ] Include an executive snapshot, source map, recent work timeline, current architecture, live topology, product/site inventory, operational decisions, unresolved risks, and next-action roadmap.
- [ ] Cite local files by absolute path and live sources by URL/remote command category.
- [ ] Label every claim as confirmed current, historical, inferred, conflicting, or unverified.

### Task 7: Cross-Validate Before Completion

**Files:**
- Verify: `/Users/ufuk/yzapi/docs/research/2026-07-16-yapayzekalab-current-state.md`

- [ ] Run a second-agent evidence review for omissions, stale claims, contradictions, and accidental secret leakage.
- [ ] Re-run freshness checks for Git, VPS service, HTTP endpoints, and report source inventory.
- [ ] Confirm no product file, production state, database row, browser account, commit, or deployment was changed.
