---
title: "Breakdown"
---

**Status:** v0.5.0 design · **Last updated:** 2026-04-29

## In plain English

Some issues are not single units of work. *"Modernize the dashboard UX,"* *"migrate every route to the new auth scheme,"* *"redesign Gridfin shell + 8 page surfaces"* — these are umbrellas. Trying to write one `spec.md` for them produces a crowded contract that's bad for execution and bad for review.

The right shape for an umbrella is a **breakdown** — a proposal that breaks the umbrella into bounded child issues with sizing, dependencies, and surfaced concerns. Reviewable as a unit. Approved as a unit.

In autoship's earlier shape, when grooming hit an umbrella, the controller produced a long Linear comment proposing slices and parked the issue in `Needs Attention`. The analysis was real intellectual work — but the only durable artifact was the comment + an ephemeral trigger.dev worktree. There was nothing the operator could approve concretely. There was nothing the next trigger run could re-enter from.

Breakdown fixes that shape. When grooming detects an umbrella, the pre-groomer writes a `decomposition.md` instead of a `spec.md`. A separate `deliver-decomposition-reviewer` judges it. The controller commits the artifact tree to a branch and opens a `[Breakdown]` draft PR. The operator reviews the PR like any other code review, then moves the parent issue to `Breakdown Approved` or runs `autoship create-issues <id>` to create the child issues in Linear.

The product promise is not "here is a breakdown table." The promise is **messy Linear issue -> reviewed work graph -> child issues created without clerical copying -> dependency-free slices start automatically**. The human approves boundaries; autoship performs the mechanical tracker mutation and starts only the first runnable layer.

Breakdown is **not a separate mode**. It is an outcome path within deliver grooming, auto-routed when umbrella shape is detected. Operators see the same trigger they always do (`Ready to Groom`); the controller decides whether the analysis becomes a spec, a breakdown, or a typed blocker.

## When this path triggers

The deliver-pre-groomer detects umbrella shape from the issue content and codebase evidence:

- **Multi-slice scope words.** Issue body uses "rework," "migrate every," "redesign across," "all routes," or similar bulk-application phrasing.
- **Multiple unrelated touchpoints.** Blast-radius mapping returns a high count of files with no shared module ancestor — e.g., 8 route files in different feature folders.
- **Aggregate line-count threshold.** The set of files that would change exceeds a sane single-spec budget (heuristic: > ~3000 LOC across the change set).
- **Existing pattern of decomposition.** Parent issue references prior child issues, or has a label like `umbrella` / `epic` / `decompose-me`.

Any one signal is enough. The pre-groomer outputs `decomposition.md` to the controller, which routes to `deliver-decomposition-reviewer` instead of `deliver-spec-reviewer`.

## `decomposition.md` schema

One file per umbrella issue. The internal file remains `.autoship/issues/<id>/decomposition.md` for compatibility, but human-facing copy calls it the breakdown. It mirrors the grounded, evidence-first posture of `spec.md`.

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
 stable `slice-id` field for idempotent create-issues.>

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

## Operator questions
<only questions that change execution. each question must be typed:
 blocking, defaulted, or slice-local. see Question discipline below.>
```

The `slice-id` is **stable** — once assigned, it does not change across re-grooming. The create-issues step uses it to detect already-created children on retry.

## Breakdown-review rubric

`deliver-decomposition-reviewer` is a fresh-context agent that judges the breakdown without having authored it. Same generator-evaluator pattern as `deliver-spec-reviewer`. Verdict written to `.autoship/issues/<id>/reviews/decomposition-review-NN.md`.

Five checks (full criteria in `.claude/skills/deliver-grooming/references/decomposition-review-rubric.md`):

1. **Groundedness.** Are slices grounded in real codebase evidence (specific files, line counts, observable patterns), or are they speculative? A slice with no `file:line` citation is a smell. Surfaced concerns must reproduce — state lies and missing primitives must be greppable.
2. **Slice sizing.** Is any single slice obviously too big to be its own bounded change? Threshold is rubric-driven, not numeric: would a competent implementer expect to ship this in one bounded PR?
3. **Dependency correctness.** Does the DAG actually reflect the dependencies in the codebase? If Slice C uses primitives written in Slice B, the DAG should show that. False independence is a smell.
4. **Surfaced concerns load-bearing.** Are surfaced concerns things the operator needs to decide before slices dispatch? State lies, missing primitives, and explicit exclusions with rationale are load-bearing; "we should also think about telemetry someday" is not.
5. **Question discipline.** Does every open question change execution, carry a type, and have a safe materialization posture? `blocking` questions must be answered before approval. `defaulted` questions must state the default autoship will use if the operator does nothing. `slice-local` questions must name the child slice that will inherit the question.

Verdict: APPROVED or REJECTED with specific objections. REJECTED sends the pre-groomer back to rewrite the decomposition, same loop shape as spec REJECT.

## Question discipline

Questions exist to reduce execution risk, not to start a discussion loop. Each question in `decomposition.md` must be one of:

| Type | Meaning | Create-issues behavior |
|---|---|---|
| `blocking` | The answer changes slice boundaries, dependency order, or whether child issue creation is valid. | Must be answered in `decomposition.md` before reviewer approval. If still unresolved at create-issues time, create no children and halt. |
| `defaulted` | The answer would tune the plan, but autoship has a stated safe default. | Create-issues may proceed using the default unless the operator amended the artifact. |
| `slice-local` | The answer belongs to one child issue and does not change the parent breakdown. | Create-issues copies the question into the named child issue body. |

An APPROVED breakdown should be actionable. That means it has **no unresolved `blocking` questions**. If the only remaining questions are `defaulted` or `slice-local`, the Linear comment must not say "block create-issues"; it should say "defaults will be used unless amended" or "deferred to child slices."

If it affects execution, it must land in the artifact. PR comments are a good discussion surface, but `decomposition.md` is the source of truth the controller reads.

## State + label conventions

Two orthogonal axes:

- **State** answers: *what should happen next?* (baton transfer)
- **Label** answers: *what kind of autoship thing is this?* (artifact filtering)

For the breakdown outcome:

- **State:** `Breakdown Proposed` — operator-created Linear state. Means "review the breakdown PR; if it is acceptable, move the issue to `Breakdown Approved` or run `autoship create-issues <id>`."
- **Labels on the PR:** `autoship` (top-level autoship-authored filter) + `autoship:breakdown` (artifact kind).

The four recommended operator-created states each carry one distinct "what happens next" meaning:

| State | Baton |
|---|---|
| `Ready to Groom` | Agent may analyze this issue and, if bounded/clear, build it |
| `Breakdown Proposed` | Review the breakdown PR |
| `Breakdown Approved` | Create child issues and start dependency-free slices |
| `Needs Attention` | Autoship halted on a real blocker, your turn to unblock |

Missing-state degrades gracefully: if `Breakdown Proposed` is absent in the workspace, the controller still posts the comment and falls back to a no-op state change. Optional supervised installs may also keep `Spec Ready`, but it is not part of the default remote happy path.

## Branch + PR conventions

- **Branch:** `autoship/<issue-id>` (e.g., `autoship/FRD-161`). Issue-scoped, not run-scoped. Same branch reused across re-runs.
- **Commit mode:** **append** on rerun. Iteration history is evidence — the PR commit log is the trajectory.
- **Force-push** is reserved for intentional rebase or repair, flagged in the commit message (`autoship: rebase ...`).
- **PR title:** `[Breakdown] FRD-NNN: <issue title>`.
- **PR labels:** `autoship`, `autoship:breakdown`.
- **PR closure:** **only after successful child issue creation** (all slices created). Partial create-issues → leave PR open with status comment listing what was created and what's pending.

The artifact-only PR is intentionally not merged in 0.5.0 — its job is decision capture and amendment surface, not code change. Closed-with-link-to-children PRs are sufficient archive for V1.

## Create-issues contract

`autoship create-issues <issue-id>` is the explicit human consent that promotes a reviewed breakdown into Linear child issues. `autoship materialize <issue-id>` remains a compatibility alias. In remote magic mode, moving the parent issue to `Breakdown Approved` is the state-triggered consent for the same action — same shape as `Ready to Groom` for automatic groom/build.

### Source of truth

- Read **latest commit on `autoship/<id>` branch**.
- The breakdown is the `decomposition.md` from that commit; manifest is `manifest.json` from that commit.
- If the operator amended the breakdown after review, that amendment is tacit approval — V1 does not separately track "reviewed sha vs latest sha." (Future: `manifest.decomposition_sha256` + `manifest.reviewed_sha256` matched before create-issues.)
- Before creating children, scan `Operator questions`. If any question is `type: blocking` and not explicitly answered, halt before mutation, leave the PR open, and post the missing question ids. Do not create a partial child set for a known-invalid plan.

### Per-slice idempotent

For each slice in `decomposition.md`:

1. **Check whether child issue already exists.** Query Linear for issues parented to `<id>` (parent-link query first). For each candidate, match by `slice-id` extracted from the child body's `Slice: <slice-id>` line, falling back to title prefix `[<slice-id>]`.
2. **If exists:** skip. Increment `created_already` counter for the run summary.
3. **If missing:** create. Use the slice fields from `decomposition.md` to populate title, body, parent-link. Copy relevant `slice-local` questions into that child's body. For `defaulted` questions, copy the selected default into the child body only when it affects that slice.

Created child issue body:

```
[short slice scope from decomposition.md, copied verbatim]

[defaulted decisions that affect this slice, if any]
[slice-local questions assigned to this slice, if any]

---
Parent: FRD-161
Slice: FRD-161c
Source decomposition: <PR url> @ <commit sha>
```

Created child issue title: `[<slice-id>] <slice title>` (e.g., `[FRD-161c] Shell / sidebar redesign`).

### Partial failure handling

If Linear rate-limits, errors, or otherwise fails mid-batch:

- **Do not roll back created children.** Roll-back creates more risk than it removes.
- **Leave the `[Breakdown]` PR open** with a status comment:
  ```
  Child issue creation partial: created N of M, pending P, error: <message>.
  Re-run `autoship create-issues <id>` to resume; existing children will be skipped.
  ```
- **Parent state on retryable failures (rate limits, transient network):** stays `Breakdown Proposed`. The retry path is implicit — operator re-runs the verb or moves back to `Breakdown Approved` after fixing the retryable cause.
- **Parent state on real blockers (auth missing, malformed decomposition):** transitions to `Needs Attention`. Operator must fix before retrying.

Retrying create-issues re-enters per-slice idempotent flow and skips already-created children. Repeat until all slices are created.

### Full success

When all slices are created on a single create-issues run (or across retries), the controller:

1. Moves dependency-free children to `Ready to Groom`.
2. Leaves dependent children in `Todo` / workspace default with dependency links and a comment naming the blocking slice(s).
3. Posts a final summary comment to Linear and on the `[Breakdown]` PR listing all created child links, how many were started, and how many are waiting on dependencies.
4. Closes the `[Breakdown]` PR (no merge) with the summary comment as the close message.
5. Transitions the parent issue to a `Decomposed` label or umbrella convention if the team uses one (best-effort; no new state required for V1).
4. Branch can stay or be auto-deleted by the operator's GitHub policy — the closed PR + commit SHA in child issue bodies is sufficient archive.

### What create-issues does not do

- **No issue closure of the parent.** Parent stays open; the team's umbrella convention decides when to close.
- **No inline build of children.** Dependency-free children are started by moving them to `Ready to Groom`; each child runs as its own issue-scoped job. Dependent children wait in `Todo` / workspace default until dependencies complete.
- **No PR merge.** PR closes without merging in V1. Revisit if artifact retention becomes important.
- **No PR-comment approval.** `/autoship approve` remains deferred; Linear state or CLI verb is the approval surface.

## Operator workflow

After the `[Breakdown]` PR opens:

1. **Read the PR.** GitHub renders `decomposition.md`. Inline comments work like any code review.
2. **Amend if needed.** Comment inline on slice boundaries or answer typed questions. Before execution, the final answer must be reflected in `decomposition.md` by direct edit or by re-running grooming to incorporate amendments. Decomposition-reviewer re-judges.
3. **Approve by acting.** Move the Linear parent issue to `Breakdown Approved`, or run `autoship create-issues <id>` from any terminal where autoship CLI is installed. The state transition or verb invocation is the explicit consent.
4. **Watch the run.** The run reports per-slice progress (`creating FRD-161a... done`, `creating FRD-161b... done`). On full success, the PR closes with the summary and dependency-free children move to `Ready to Groom`; on partial failure, the PR stays open with the status comment.
5. **Optionally retry on partial failure.** Re-run `autoship create-issues <id>` or move back to `Breakdown Approved`; existing children skip, missing ones create.

## How operators read decomposition artifacts

Expected workflows:

1. **Routine review** — *"autoship proposed a breakdown for FRD-161; what's it suggesting?"* Open the `[Breakdown]` PR. Read `decomposition.md` rendered by GitHub. Read the latest `decomposition-review-NN.md` for the reviewer's verdict. Comment inline on anything you want to amend.

2. **Amendment cycle** — *"the third slice is too big; split it."* Add an inline comment. Optionally trigger re-grooming (which appends a new commit revising the decomposition). Re-review.

3. **Approve and create issues** — *"approved; create the children."* Move the parent issue to `Breakdown Approved` or run `autoship create-issues <id>`. Watch progress. Closed PR + linked children + first runnable layer started = done.

4. **Audit after the fact** — *"why did we land on this slice boundary instead of that one?"* The PR commit history shows iteration. The decomposition-review verdicts show what the reviewer flagged each pass.

## Relationship to other artifacts

| Artifact | Role | Frozen? |
|---|---|---|
| `decomposition.md` | The breakdown proposal: slices, DAG, surfaced concerns, open questions | Append-revised on re-grooming |
| `reviews/decomposition-review-NN.md` | Decomposition-reviewer verdicts, one per pass | Append-only (one new file per pass) |
| `manifest.json` | Per-issue execution ledger; phase = `breakdown_proposed` for breakdown runs, `decomposed` post-create-issues | Frozen on write |
| `inferences.jsonl` | Structured run-time inference trail (existing 0.3.0 artifact) | Append-only |
| `decisions.log` | Prose run-time log (existing) | Append-only |

`decomposition.md` and `spec.md` are mutually exclusive for a given issue: an umbrella produces a breakdown; a bounded change produces a spec. The same pre-groomer writes whichever one fits, and the controller routes to the appropriate reviewer.

## What is explicitly out of scope (deferred)

- **`manifest.decomposition_sha256` + `reviewed_sha256` matched before create-issues.** V1 trusts "latest commit on branch is approved." Future versions can require explicit review-state matching.
- **Auto-merge of the `[Breakdown]` PR.** V1 closes without merge. Revisit if artifact retention requires merge.
- **PR-comment approval (`/autoship approve`).** Linear-state-driven approval is V1; PR-comment approval is UX polish that requires GitHub webhook infrastructure.
- **Recursive decomposition.** A child issue that turns out to also be an umbrella triggers decomposition of its own (next run); we do not multi-level decompose in a single artifact.
- **State-lie detection generalized.** The FRD-161 catch (Linear says Done, code says no) lives inline in surfaced concerns today. Promoting it to a first-class controller capability — pre-flight evidence checks against tracker state for any "depends-on Done issue X" claim — is a future improvement.

## Substrate dependencies

Decomposition builds on substrate that already shipped:

- **Spec-first PR pattern** (0.3.0) — the artifact-PR-as-execution-envelope is reused directly; only the artifact contents change for the decomposition path.
- **Runner handoff envelope** (0.3.1) — detects "is this a remote run?" via the `runner_handoff` presence on the RunRequest. PR creation is gated on this for non-buildable outcomes.
- **Decision log** (0.3.0) — `inferences.jsonl` captures *why* the controller chose decomposition for this issue (which umbrella signal fired). Audit trail comes free.
- **State-as-baton** (0.3.1) — evolves into the action-based `Ready to Groom` / `Breakdown Proposed` / `Breakdown Approved` / `Needs Attention` flow; the pattern is unchanged.

The 0.5.0 contract is "every remote meaningful-analysis outcome persists as a draft PR" plus "breakdown is one such outcome with typed questions, its own reviewer, and a create-issues path that turns an approved work graph into child Linear issues." The substrate makes the magic moment cheap: the operator approves boundaries; autoship handles clerical breakdown and starts only the dependency-free first layer.
