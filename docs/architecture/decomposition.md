---
title: "Decomposition"
---

**Status:** v0.4.0 design · **Last updated:** 2026-04-29

## In plain English

Some issues are not single units of work. *"Modernize the dashboard UX,"* *"migrate every route to the new auth scheme,"* *"redesign Gridfin shell + 8 page surfaces"* — these are umbrellas. Trying to write one `spec.md` for them produces a crowded contract that's bad for execution and bad for review.

The right shape for an umbrella is a **decomposition** — a proposal that breaks the umbrella into bounded sub-issues with sizing, dependencies, and surfaced concerns. Reviewable as a unit. Approved as a unit.

In autoship's earlier shape, when grooming hit an umbrella, the controller produced a long Linear comment proposing slices and parked the issue in `Needs Attention`. The analysis was real intellectual work — but the only durable artifact was the comment + an ephemeral trigger.dev worktree. There was nothing the operator could approve concretely. There was nothing the next trigger run could re-enter from.

Decomposition fixes that shape. When grooming detects an umbrella, the pre-groomer writes a `decomposition.md` instead of a `spec.md`. A separate `deliver-decomposition-reviewer` judges it. The controller commits the artifact tree to a branch and opens a `[Decomposition]` draft PR. The operator reviews the PR like any other code review, then runs `autoship materialize <id>` to create the child sub-issues in Linear.

Decomposition is **not a separate mode**. It is an outcome path within deliver grooming, auto-routed when umbrella shape is detected. Operators see the same trigger they always do (`Ready for Autoship`); the controller decides whether the analysis becomes a spec, a decomposition, or a typed blocker.

## When this path triggers

The deliver-pre-groomer detects umbrella shape from the issue content and codebase evidence:

- **Multi-slice scope words.** Issue body uses "rework," "migrate every," "redesign across," "all routes," or similar bulk-application phrasing.
- **Multiple unrelated touchpoints.** Blast-radius mapping returns a high count of files with no shared module ancestor — e.g., 8 route files in different feature folders.
- **Aggregate line-count threshold.** The set of files that would change exceeds a sane single-spec budget (heuristic: > ~3000 LOC across the change set).
- **Existing pattern of decomposition.** Parent issue references prior child issues, or has a label like `umbrella` / `epic` / `decompose-me`.

Any one signal is enough. The pre-groomer outputs `decomposition.md` to the controller, which routes to `deliver-decomposition-reviewer` instead of `deliver-spec-reviewer`.

## Decomposition.md schema

One file per umbrella issue. Lives at `.autoship/issues/<id>/decomposition.md`. Mirrors the grounded, evidence-first posture of `spec.md`.

```
---
issue: FRD-161
issue-rev: <sha>
groomed-at: 2026-04-29T12:00:00Z
trigger: linear
type: decomposition
slice-count: <integer ≥ 2>
---

## Outcome
<one-line user-visible result of shipping the whole umbrella>

## Slices
<ordered list. one entry per child issue. each entry uses the
 stable `slice-id` field for idempotent materialize.>

### FRD-161a — <slice title>
slice-id: FRD-161a
**Scope:** <what this slice does, one sentence>
**Evidence:** <file paths, line counts, why this slice is bounded>
**Dependencies:** <other slice-ids that must complete first; or `none`>

### FRD-161b — <slice title>
slice-id: FRD-161b
...

## DAG
<ASCII or Mermaid showing slice ordering and dependencies>

## Surfaced concerns
<state lies, missing primitives, exclusions with rationale.
 the FRD-161 catch generalized: things the operator should know
 before approving the decomposition>

## Open questions
<for the operator. each question must be answerable yes/no
 or one-of-a-list, not free-form essay>
```

The `slice-id` is **stable** — once assigned, it does not change across re-grooming. The materialize step uses it to detect already-created children on retry.

## Decomposition-review rubric

`deliver-decomposition-reviewer` is a fresh-context agent that judges the decomposition without having authored it. Same generator-evaluator pattern as `deliver-spec-reviewer`. Verdict written to `.autoship/issues/<id>/reviews/decomposition-review-NN.md`.

Four checks (full criteria in `.claude/skills/deliver-grooming/references/decomposition-review-rubric.md`):

1. **Groundedness.** Are slices grounded in real codebase evidence (specific files, line counts, observable patterns), or are they speculative? A slice with no `file:line` citation is a smell. Surfaced concerns must reproduce — state lies and missing primitives must be greppable.
2. **Slice sizing.** Is any single slice obviously too big to be its own bounded change? Threshold is rubric-driven, not numeric: would a competent implementer expect to ship this in one bounded PR?
3. **Dependency correctness.** Does the DAG actually reflect the dependencies in the codebase? If Slice C uses primitives written in Slice B, the DAG should show that. False independence is a smell.
4. **Surfaced concerns load-bearing.** Are surfaced concerns things the operator needs to decide before slices dispatch? State lies, missing primitives, and explicit exclusions with rationale are load-bearing; "we should also think about telemetry someday" is not.

Verdict: APPROVED or REJECTED with specific objections. REJECTED sends the pre-groomer back to rewrite the decomposition, same loop shape as spec REJECT.

## State + label conventions

Two orthogonal axes:

- **State** answers: *what should happen next?* (baton transfer)
- **Label** answers: *what kind of autoship thing is this?* (artifact filtering)

For the decomposition outcome:

- **State:** `Decomposition Proposed` — new operator-created Linear state, position parallel to `Spec Ready`. Means "review the proposal, then run `autoship materialize <id>`." Distinct from `Needs Attention` (which means "unblock me") and from `Spec Ready` (which means "buildable spec, your turn to dispatch build").
- **Labels on the PR:** `autoship` (top-level autoship-authored filter) + `autoship:decomposition` (artifact kind).

The four operator-created states each carry one distinct "what happens next" meaning:

| State | Baton |
|---|---|
| `Ready for Autoship` | Agent please pick this up (remote automation consent) |
| `Spec Ready` | Spec is buildable, your turn to dispatch build |
| `Decomposition Proposed` | Decomposition is proposed, your turn to review and run `autoship materialize <id>` |
| `Needs Attention` | Autoship halted on a real blocker, your turn to unblock |

Missing-state degrades gracefully: if `Decomposition Proposed` is absent in the workspace, the controller still posts the comment and falls back to a no-op state change — same pattern as today's `Spec Ready` fallback.

## Branch + PR conventions

- **Branch:** `autoship/<issue-id>` (e.g., `autoship/FRD-161`). Issue-scoped, not run-scoped. Same branch reused across re-runs.
- **Commit mode:** **append** on rerun. Iteration history is evidence — the PR commit log is the trajectory.
- **Force-push** is reserved for intentional rebase or repair, flagged in the commit message (`autoship: rebase ...`).
- **PR title:** `[Decomposition] FRD-NNN: <issue title>`.
- **PR labels:** `autoship`, `autoship:decomposition`.
- **PR closure:** **only after a successful `materialize`** (all slices created). Partial materialize → leave PR open with status comment listing what was created and what's pending.

The artifact-only PR is intentionally not merged in 0.4.0 — its job is decision capture and amendment surface, not code change. Closed-with-link-to-children PRs are sufficient archive for V1.

## Materialize V1 contract

`autoship materialize <issue-id>` is the explicit human consent that promotes a reviewed decomposition into Linear sub-issues. Running the verb *is* the consent — same shape as `autoship deliver <id>` for build.

### Source of truth

- Read **latest commit on `autoship/<id>` branch**.
- Decomposition is the `decomposition.md` from that commit; manifest is `manifest.json` from that commit.
- If the operator amended the decomposition after review, that amendment is tacit approval — V1 does not separately track "reviewed sha vs latest sha." (Future: `manifest.decomposition_sha256` + `manifest.reviewed_sha256` matched before materialize, but not 0.4.0.)

### Per-slice idempotent

For each slice in `decomposition.md`:

1. **Check whether child issue already exists.** Query Linear for issues parented to `<id>` (parent-link query first). For each candidate, match by `slice-id` extracted from the child body's `Slice: <slice-id>` line, falling back to title prefix `[<slice-id>]`.
2. **If exists:** skip. Increment `created_already` counter for the run summary.
3. **If missing:** create. Use the slice fields from `decomposition.md` to populate title, body, parent-link.

Created child issue body:

```
[short slice scope from decomposition.md, copied verbatim]

---
Parent: FRD-161
Slice: FRD-161c
Source decomposition: <PR url> @ <commit sha>
```

Created child issue title: `[<slice-id>] <slice title>` (e.g., `[FRD-161c] Shell / sidebar redesign`).

### Partial failure handling

If Linear rate-limits, errors, or otherwise fails mid-batch:

- **Do not roll back created children.** Roll-back creates more risk than it removes.
- **Leave the `[Decomposition]` PR open** with a status comment:
  ```
  Materialize partial: created N of M, pending P, error: <message>.
  Re-run `autoship materialize <id>` to resume; existing children will be skipped.
  ```
- **Parent state on retryable failures (rate limits, transient network):** stays `Decomposition Proposed`. The retry path is implicit — operator re-runs the verb.
- **Parent state on real blockers (auth missing, malformed decomposition):** transitions to `Needs Attention`. Operator must fix before retrying.

Retrying materialize re-enters per-slice idempotent flow and skips already-created children. Repeat until all slices are created.

### Full success

When all slices are created on a single materialize run (or across retries), the controller:

1. Posts a final summary comment to Linear and on the `[Decomposition]` PR listing all created child links.
2. Closes the `[Decomposition]` PR (no merge) with the summary comment as the close message.
3. Transitions the parent issue to a `Decomposed` label or umbrella convention if the team uses one (best-effort; no new state required for V1).
4. Branch can stay or be auto-deleted by the operator's GitHub policy — the closed PR + commit SHA in child issue bodies is sufficient archive.

### What materialize does NOT do

- **No issue closure of the parent.** Parent stays open; the team's umbrella convention decides when to close.
- **No automatic dispatch of children.** Children stay in `Backlog` (or whatever default state Linear assigns) until the operator transitions them to `Ready for Autoship` individually.
- **No PR merge.** PR closes without merging in V1. Revisit if artifact retention becomes important.
- **No state lookup for `Decomposition Approved`.** That state pair (and its state-trigger automation) is deferred. V1 is CLI-verb-only.

## Operator workflow

After the `[Decomposition]` PR opens:

1. **Read the PR.** GitHub renders `decomposition.md`. Inline comments work like any code review.
2. **Amend if needed.** Comment inline on slice boundaries; the operator can re-run grooming to incorporate amendments (the controller appends a new commit). Decomposition-reviewer re-judges.
3. **Approve by acting.** Run `autoship materialize <id>` from any terminal where autoship CLI is installed. The verb invocation is the explicit consent.
4. **Watch the run.** The verb prints per-slice progress (`creating FRD-161a... done`, `creating FRD-161b... done`). On full success, the PR closes with the summary; on partial failure, the PR stays open with the status comment.
5. **Optionally retry on partial failure.** Re-run `autoship materialize <id>`; existing children skip, missing ones create.

## How operators read decomposition artifacts

Expected workflows:

1. **Routine review** — *"autoship proposed a decomposition for FRD-161; what's it suggesting?"* Open the `[Decomposition]` PR. Read `decomposition.md` rendered by GitHub. Read the latest `decomposition-review-NN.md` for the reviewer's verdict. Comment inline on anything you want to amend.

2. **Amendment cycle** — *"the third slice is too big; split it."* Add an inline comment. Optionally trigger re-grooming (which appends a new commit revising the decomposition). Re-review.

3. **Approve and materialize** — *"approved; create the children."* Run `autoship materialize <id>`. Watch progress. Closed PR + linked children = done.

4. **Audit after the fact** — *"why did we land on this slice boundary instead of that one?"* The PR commit history shows iteration. The decomposition-review verdicts show what the reviewer flagged each pass.

## Relationship to other artifacts

| Artifact | Role | Frozen? |
|---|---|---|
| `decomposition.md` | The proposal: slices, DAG, surfaced concerns, open questions | Append-revised on re-grooming |
| `reviews/decomposition-review-NN.md` | Decomposition-reviewer verdicts, one per pass | Append-only (one new file per pass) |
| `manifest.json` | Per-issue execution ledger; phase = `decomposition_proposed` for decomposition runs, `decomposed` post-materialize | Frozen on write |
| `inferences.jsonl` | Structured run-time inference trail (existing 0.3.0 artifact) | Append-only |
| `decisions.log` | Prose run-time log (existing) | Append-only |

`decomposition.md` and `spec.md` are mutually exclusive for a given issue: an umbrella produces a decomposition; a bounded change produces a spec. The same pre-groomer writes whichever one fits, and the controller routes to the appropriate reviewer.

## What is explicitly out of scope (deferred)

- **`Decomposition Approved` paired consent state + state-trigger materialize.** V1 is CLI-verb-only. State-trigger automation (transition parent to `Decomposition Approved` → controller wakes and materializes) is a follow-on once V1 is in production.
- **`manifest.decomposition_sha256` + `reviewed_sha256` matched before materialize.** V1 trusts "latest commit on branch is approved." Future versions can require explicit review-state matching.
- **Auto-merge of the `[Decomposition]` PR.** V1 closes without merge. Revisit if artifact retention requires merge.
- **PR-comment approval (`/autoship approve`).** Linear-state-driven approval is V1; PR-comment approval is UX polish that requires GitHub webhook infrastructure.
- **Recursive decomposition.** A child issue that turns out to also be an umbrella triggers decomposition of its own (next run); we do not multi-level decompose in a single artifact.
- **State-lie detection generalized.** The FRD-161 catch (Linear says Done, code says no) lives inline in surfaced concerns today. Promoting it to a first-class controller capability — pre-flight evidence checks against tracker state for any "depends-on Done issue X" claim — is a future improvement.

## Substrate dependencies

Decomposition builds on substrate that already shipped:

- **Spec-first PR pattern** (0.3.0) — the artifact-PR-as-execution-envelope is reused directly; only the artifact contents change for the decomposition path.
- **Runner handoff envelope** (0.3.1) — detects "is this a remote run?" via the `runner_handoff` presence on the RunRequest. PR creation is gated on this for non-buildable outcomes.
- **Decision log** (0.3.0) — `inferences.jsonl` captures *why* the controller chose decomposition for this issue (which umbrella signal fired). Audit trail comes free.
- **State-as-baton** (0.3.1) — adds one new state (`Decomposition Proposed`) to the existing four-state set; the pattern is unchanged.

The 0.4.0 contract is "every remote meaningful-analysis outcome persists as a draft PR" plus "decomposition is one such outcome with its own template + reviewer + materialize verb." The substrate makes both cheap.
