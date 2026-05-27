# YapayZekaLab 4-Agent Deploy Gate

## Non-Negotiable Rule

No deploy, release verdict, production change, or launch-readiness decision is valid unless it passes this gate.

## Gate Order

1. Agent 1 - QA/UAT Agent reviews user-facing behavior, browser flows, mobile/desktop, console/network errors, and UAT evidence.
2. Agent 2 - Backend/API/Billing Agent reviews API behavior, database effects, balance, usage records, payments, webhooks, and admin effects.
3. Agent 3 - Security/Visual/Release Agent reviews auth, admin exposure, secrets, payment bypass risk, visual lock, rollback and release risk.
4. At least 2 of the first 3 agents must approve before Agent 4 can be consulted.
5. Agent 4 - End-to-End Integrity Guard reviews the full system from start to finish and decides whether the action can break the site, theme, structure, production behavior, billing/payment, security, rollback, or launch readiness.
6. Even if the first 3 agents approve, the decision is blocked if Agent 4 rejects or cannot review.

## Blocked State

If real agent spawning/review is unavailable because of capacity, tooling, or task-queue limits, the action must be recorded as:

`BLOCKED_BY_AGENT_CAPACITY`

Do not silently replace this with simulated approval.

## Current Enforcement Note

On 2026-05-27, native sub-agent spawn returned `agent thread limit reached`. Ruflo registry showed existing YapayZekaLab agents, but task auto-assignment reported no usable pending task consumer. Until real agent votes are available, further deploy/release decisions are blocked.
