---
title: "Audit · Tracker sync"
---

**Status:** scaffolded · **Last updated:** 2026-04-27 · **Applies when:** `tracker != none`

This is the opt-in tracker-integration layer for `audit`. The default `audit` flow does not use it — `assessment.md` plus `review.md` are the canonical artifacts for the markdown-first path. This document only matters when an operator configures `tracker: linear` and runs with `create_issues: true` (or `false` for a planned-only preview).

The audit core (lifecycle, evidence discipline, verdict thresholds, agents) lives in [`audit-architecture.md`](./audit-architecture.md). Read that first.

## Why opt in

For team-scale orgs, the audit assessment needs to land where humans triage. Linear is the workflow surface; without sync, audit findings live in markdown that never enters the team backlog. For solo / greenfield projects, this entire layer is unnecessary friction — the markdown-first path is already enough.

## Tracker scope (v1)

Linear-only. `tracker: github` blocks with a clear unsupported-tracker message until a GitHub sync contract exists.

## Prior context fetch

When the controller resolves a RunRequest with a configured tracker, it fetches two slices of prior context (one MCP read each) before dispatching the auditor and writes them to `<run-dir>/prior-issues.json`:

1. All open issues in the configured team/project, lightweight fields only (`id`, `identifier`, `url`, `title`, `labels`, `state`, `body_summary`, `created_at`). Catches manual duplicates created by humans, not just audit-sourced ones.
2. Closed issues labeled `source:autoship-audit` from the last 180 days. Covers regression detection.

Closed manually-created issues are out of scope for v1.

Both the auditor and the reviewer receive the path to this file in their dispatch.

## Annotation vocabulary

When prior-issues.json is present, every issue candidate in `assessment.md` carries `prior-issue-status` plus `prior-issue-reasoning`:

- `new` — no semantic match against any prior issue
- `duplicate-of-open: <identifier>` — same gap as an open issue (audit-sourced or manual)
- `related-to: <identifier>` — distinct but connected (open or closed)
- `closed-match: <identifier>` — same gap as a closed issue within the 180-day window; the gap is currently present, signaling a regression

The annotation only controls tracker write behavior. The finding still appears in `assessment.md` regardless of dup status. Verdict, severity, and checklist counts are unaffected.

When `tracker: none`, these fields are omitted entirely — neither the auditor writes them nor the reviewer expects them.

## Reviewer Check 6

When prior-issues.json is present, the audit-reviewer's existing five checks gain a sixth: **tracker-sync annotation correctness**. Validates per candidate that the cited identifier exists in `prior-issues.json`, the reasoning is concrete (not vague), and the dup / related / closed-match judgments are sound. Includes a false-`new` sweep — for every candidate marked `new`, the reviewer scans `prior-issues.json` for obvious matches the auditor missed. Check 6 FAIL → `REJECTED` overall.

When prior-issues.json is absent, Check 6 is omitted from `review.md` entirely.

## Mechanical dispatch

After APPROVED, the controller iterates approved candidates serially:

| annotation | priority | controller action |
|---|---|---|
| `new` | any | create issue with label `source:autoship-audit` and a body footer carrying the run id |
| `duplicate-of-open` | P0 | post one re-confirmation comment on the existing issue |
| `duplicate-of-open` | P1 / P2 | record-only (no Linear write) |
| `related-to` | any | create new issue + create `related` relation to the cited issue |
| `closed-match` | any | create new issue with a regression callout in the body + create `related` relation to the cited closed issue |

`create_issues: false` (the default report-only mode) records `action: "planned"` for every candidate with no Linear writes — useful as a preview of what the sync would do.

## `tracker-sync.json`

Every candidate produces exactly one record with:

- `action`: `planned | created | linked-existing | commented-existing | failed`
- `reason`: `create_issues=false | duplicate-open | p0-reconfirmed | related | closed-match | mcp-error`
- `result`: depends on action
  - `created` — `{ id, identifier, url }`
  - `commented-existing` — `{ existing_identifier, comment_id }`
  - `linked-existing` — `{ existing_identifier }`
  - `planned` — `{ planned_action }`
  - `failed` — `{ error }`

Final run status: `tracker-sync-partial` if any record is `failed`; else `tracker-sync-complete`.

## Failure and resume

Each MCP write failure is recorded as `action: "failed"`; the controller continues with the next candidate. Re-invocation reads `tracker-sync.json`, retries failed records, skips completed ones. Issues closed between fetch and sync are not specially handled — Linear allows commenting on closed issues, so the comment attempt either succeeds or surfaces as a generic failure.
