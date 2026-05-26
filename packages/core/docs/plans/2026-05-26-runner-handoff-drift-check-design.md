---
title: "runner_handoff contract drift check"
---

**Status:** Design · **Date:** 2026-05-26 · **Scope:** ~half day, single PR

> **Goal.** Add a CI check that catches when someone adds a field to `autoshipRunPayloadSchema` (runner) without updating the corresponding prose in `autoship-controller.md` (core). Cheapest reliable closure of the drift hazard documented as Surface 3 in `autoship-project/CONTRACTS.md`.

## Why this design exists

This was originally framed as "extract `packages/types/`" (follow-up #1 of the monorepo consolidation plan). On re-examination the underlying drift hazard sits on a TS↔markdown seam, not TS↔TS — so a shared TypeScript types package doesn't solve it. The actual consumer of the runner's JSON envelope is the autoship-controller agent prompt, which is markdown prose read by Claude.

A heavier "single source of truth" design (JSON Schema embedded in prose, or generated prose-from-zod) is possible but costs 2-3 days for a hazard that has had zero documented incidents. CI drift detection matches the actual drift rate and stays cheap.

If grid-crew kickoff later needs a real shared contract format, this CI check is ~50 lines and is easily replaced.

## Mechanism

1. Read `packages/runner/src/types.ts`. Regex-extract the top-level field names declared in `autoshipRunPayloadSchema` (the zod schema is plain `z.object({...})` with no funky composition — regex is robust enough for this surface).
2. Read `packages/core/.claude/agents/autoship-controller.md`.
3. For each zod field name, assert it appears at least once in backticks (e.g., `` `issueId` ``) in the markdown.
4. Fail with a clear message naming the missing field(s).

**One-directional by design:** asserts `zod ⊆ markdown`. The reverse direction (markdown mentions a field that doesn't exist in zod) is a rarer failure mode and is deferred. YAGNI.

## Files

| File | Purpose | Approx size |
|---|---|---|
| `packages/runner/scripts/check-runner-handoff-contract.mjs` | The drift check itself. Plain Node.js (no TS, no extra deps) | ~50 lines |
| `.github/workflows/check-contracts.yml` | Runs the check on PR touching the two seam files | ~30 lines |

## Workflow trigger

```yaml
on:
  pull_request:
    paths:
      - 'packages/runner/src/types.ts'
      - 'packages/core/.claude/agents/autoship-controller.md'
      - 'packages/runner/scripts/check-runner-handoff-contract.mjs'
      - '.github/workflows/check-contracts.yml'
  push:
    branches: [main]
    paths: <same>
```

Path-filtered to avoid noise on unrelated PRs.

## Out of scope

- **Surface 1 (Linear state names):** operator-owned in Linear UI — not a code drift problem.
- **Surface 2 (branch convention `autoship/<id>`):** stable forever; revisit if it breaks.
- **Nested field paths** (`repo.fullName`, `linear.eventId`): top-level only first.
- **`packages/types/` extraction:** explicitly deferred; revisit on grid-crew kickoff with a real third consumer.
- **Reverse direction check** (markdown ⊆ zod): rarer failure mode; add if seen.

## Verification

- Run the script locally against current `main` — should pass (current types and prose are in sync).
- Manually edit `types.ts` to add a `fakeNewField`. Re-run script. Should fail with a clear message naming `fakeNewField`.
- Push to a branch, open PR, confirm workflow fires and reports the failure correctly.
- Revert the synthetic change, confirm workflow goes green.

## Replacement criteria (when to upgrade to a heavier solution)

Throw this away and switch to JSON-Schema-as-single-source when ANY of:
- Drift is caught by this script more than once per sprint (signal of high real drift rate)
- Grid-crew kickoff happens and needs to consume runner_handoff
- We add a third TS consumer of the schema for any reason
