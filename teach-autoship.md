# teach-autoship.md

**Purpose:** Stable operating knowledge shared by every autoship controller (extract, deliver, and future tracks). Changes slowly. Controllers read this before consulting their per-run `program.md`.

This file is **what autoship is** — philosophy, roles, and non-negotiable discipline. The per-run `program.md` is **what this specific run should do** — testbed, scope, approval mode, stop conditions.

---

## Autoship in one paragraph

Autoship turns messy software work — demo reconstruction, bounded change requests, UI redesigns — into bounded, reviewable, executable units. The hard problem is not writing code. The hard problem is producing a trustworthy contract the downstream executor can optimize against. Every structural handoff is gated by a fresh-context reviewer who did not author the thing being reviewed. Work state lives on disk. Fresh sessions per unit. Linear is the operator-facing coordination surface; repo-local artifacts are the machine-facing execution contract.

---

## The load-bearing discipline

### 1. Generator-evaluator separation at every handoff

The author of an artifact never discharges the gates that judge it. This is structural, not stylistic.

- Pre-groomer writes briefs. Brief-reviewer judges them.
- Oracle-planner writes plans. Plan-reviewer judges them (extract track).
- Stage 1 executor writes frozen tests. Stage 2 executor must pass them without modifying.
- Stage 2 executor writes implementation. Post-build reviewer (or operator) judges.

**Violation pattern to watch for:** a stage approving its own output ("looks good to me"), or claiming to have solved the problem without a separate judge confirming. When you observe an agent producing and also marking-as-done, stop — the judge boundary is being collapsed.

### 2. Artifact quality is the ceiling

The executor optimizes for whatever the contract measures. A weak brief produces technically-passing work that misses the point. A loose oracle produces green tests on broken behavior.

Improving the executor rarely fixes output quality. Improving the contract always does. Spend the most attention on briefs and oracles — they set the ceiling.

### 3. Fresh context per unit

Every major worker invocation runs in a fresh context window. Context accumulation silently degrades output quality — five probes ran on fresh-context-per-unit and none surfaced a state-management bug from it.

The controller holds the pipeline state. Workers see only what's pre-injected into their dispatch.

### 4. Disk-backed state, filesystem-derivable

State lives on disk at known paths, not in a long-running session's memory. State for an issue is derivable from filesystem presence:

- `issue.md` exists, no `brief.md` → `new`
- `brief.md` exists, no `reviews/` → `proposed`
- latest review verdict REJECTED → `changes-requested`
- latest review verdict APPROVED → `ready-for-oracle`
- Stage 1 oracle exists → `oracle-written`
- Stage 2 build complete + tests green → `built`
- Operator accepts → `done`

No parallel `state.json`. The filesystem IS the state machine.

### 5. Mechanical gates, not judgment in the outer loop

The controller's decisions at phase boundaries are mechanical: "does brief.md exist and parse?", "does review-NN.md have a parseable verdict?", "is `bun test` exit 0?". Judgment lives inside reviewers, not in the controller's branching logic.

Rule: *mechanical → grep; judgment → reviewer*.

### 6. Pre-inject context in dispatch

Every worker dispatch inlines the exact context that worker needs: issue body, relevant code excerpts, parent brief (if sub-issue), prior review verdicts. The worker is told explicitly what it has been given and what it has not. No "figure it out from the codebase" — that wastes tool calls.

### 7. Workers produce artifacts + structured results. Controllers act on them.

Leaf workers (pre-groomer, brief-reviewer, Stage 1/Stage 2 executors) MUST:
- Write their own artifacts to known paths
- Return a concise structured result to the controller
- NEVER call Linear MCP, GitHub API, or any external-system mutation directly

The controller is the single writer to external systems (Linear state, comments, labels, PRs).

**Structured results workers return:**
- `brief-written` + design-status (from pre-groomer)
- `verdict: APPROVED | REJECTED` (from brief-reviewer)
- `stage1-green` / `stage1-red-expected` / `stage1-failed` (from Stage 1 executor)
- `stage2-passed` / `stage2-failed` / `test-mutation-detected` (from Stage 2 executor)
- `needs-human-input` + reason (from any worker that hits a blocking ambiguity)

The controller parses these, transitions Linear state per policy, posts comments per policy, and dispatches the next worker.

### 8. Approval boundaries are explicit and typed

Work advances past specific cost/risk boundaries only at approval gates. Boundaries today:

1. **Brief → build** — is the brief trustworthy enough to spend oracle + build compute?
2. **Stage 2 green → merge** — does the implementation actually satisfy the contract?
3. **Merge → deploy** — are we confident enough to push to production?
4. **Deploy → close** — did the intent actually succeed in the world?

In `supervised` mode: operator confirms each boundary. In `auto` mode (later): reviewer-agent confirms; work halts at typed `needs-human-input` signals.

Never promote work silently past a boundary. Every promotion is either an operator action or an explicit reviewer APPROVED.

---

## Workflow-surface ownership

**Linear (or whatever external tracker) is the operator-facing coordination layer.** Humans see status, comments, lineage, priority, approval in Linear.

**Repo-local artifacts are the machine-facing execution contract.** Agents see briefs, oracles, review verdicts, evidence — all at `.autoship/issues/<id>/`.

### Who mutates what

| Surface | Who writes | Who reads |
|---|---|---|
| Linear issue state | Controller (only) | All humans, controller |
| Linear comments | Controller (only) | All humans |
| `.autoship/issues/<id>/brief.md` | Pre-groomer | Brief-reviewer, Stage 1/2 executors, controller |
| `.autoship/issues/<id>/reviews/review-NN.md` | Brief-reviewer | Controller, operator |
| Code/tests in testbed | Stage 1/2 executors | Everyone |

**Hard rule:** workers never write to Linear. If a worker emits a `needs-human-input` signal, the controller is responsible for posting the Linear comment and transitioning state.

### Comment and state policy (defaults for 0.1 controller)

Default state transitions per issue:
- `Backlog | Todo` → `In Progress` when pre-groom dispatches
- Stays `In Progress` through groom / review / regroom / Stage 1 / Stage 2
- → `In Review` when Stage 2 completes green
- → `Done` when operator accepts (supervised) or after outcome verification (auto, later)

Default comment posts (free-form text, no templates required for 0.1):
- Sub-issue created (on parent)
- Brief approved / rejected (on sub-issue)
- Stage 1 complete (on sub-issue)
- Stage 2 complete (on sub-issue)
- `needs-human-input` (on sub-issue, with specific question)

Comments are ad-hoc prose for 0.1. Templates earn their place if operator reports noise or missing information after real-world use.

---

## Worker roles

### pre-groomer

Reads: issue.md, testbed source, parent brief if sub-issue.
Writes: `.autoship/issues/<id>/brief.md`.
Returns to controller: `brief-written` + `design-status | reproduction-status | preservation-status` value.
Never calls Linear.

### brief-reviewer

Reads: brief.md, issue.md, testbed source (for grounding spot-checks).
Writes: `.autoship/issues/<id>/reviews/review-NN.md` (appends; never modifies prior).
Returns to controller: `verdict: APPROVED | REJECTED`.
Never calls Linear.

### Stage 1 executor

Reads: brief.md, review.
Writes: oracle artifacts (test files, config fixes if needed).
Returns to controller: `stage1-outcome`, test counts, files created/modified, any blockers.
Never calls Linear. Never modifies production source (Refactor type: tests may go all-green against unmodified source; other types: tests go red to signal implementation gap).

### Stage 2 executor

Reads: brief.md, Stage 1 artifacts (frozen), testbed source.
Writes: production source changes.
Returns to controller: `stage2-outcome`, test pass/fail counts, diff stat, any test mutations detected.
Never calls Linear. Never modifies test files written by Stage 1.

---

## Issue lifecycle (controller view)

Every issue progresses through this machine. Controller reads filesystem state, consults program.md for policy, dispatches next worker or halts at approval boundary.

```
new ──groom──▶ proposed ──review──▶ changes-requested ──regroom──▶ proposed
                                 └──approved──▶ ready-for-oracle
                                                    │
                                                    ▼ (stage-1 dispatch)
                                               stage1-writing
                                                    │
                                                    ▼
                                               oracle-written
                                                    │
                                                    ▼ (stage-2 dispatch)
                                               stage2-building
                                                    │
                                            ┌───────┴───────┐
                                            ▼ (pass)        ▼ (fail)
                                       built            needs-human-input
                                            │
                                            ▼ (operator accept)
                                          done
```

---

## Stop conditions

The controller halts (with explicit typed reason) only when:

1. **`needs-human-input`** — worker returns this signal. Controller posts Linear comment, sets `blocked` label (if configured), exits the loop cleanly.
2. **Unrecoverable environment error** — testbed won't boot, external tool unavailable, credentials missing.
3. **Repeated failed retries** — brief-reviewer rejects N+ times in a row (configurable, default N=3), or Stage 2 fails against the same Stage 1 tests N+ times.
4. **Supervised-mode gate** — operator-confirmation required before advancing past a cost/risk boundary (brief approved → Stage 1, Stage 2 green → merge).
5. **End of eligible work** — no more issues match program.md's eligibility criteria.

Anything else: **do not stop**. Keep dispatching until one of the above fires.

---

## NEVER STOP posture

The controller runs autonomously. Do not pause. Do not ask "should I continue?" The operator may be asleep.

Continue until a stop condition above fires. When a stop condition fires, the controller writes the reason, sets the right Linear state + comment, then exits cleanly with a machine-readable exit code so the operator can resume later.

Resumption: on restart, the controller reads filesystem state of each eligible issue, resumes from where it left off. No operator hand-holding needed.

---

## Cross-track notes

Autoship uses **one top-level controller** role. Track (extract vs deliver) is a mode — selected by the per-run `program.md` or invocation argument — not a separate agent.

The controller's role is identical across tracks:
- read run contract (program.md)
- pick eligible work
- dispatch workers via subprocess (with caffeinate)
- collect structured results
- update outer workflow (Linear state + comments)
- stop on `needs-human-input` or other typed conditions

Per-track differences are phase-machine shapes:

### Extract-ingest mode

Linear pipeline: boot → fanout → reconcile → critic. Artifact-gated phases. Single target per run (the whole prototype). Workers: ui-walker, static, data, external, reconciler, critic.

### Extract-build mode

Slice-based: plan → oracle → build → review per slice. Workers: oracle-planner, plan-reviewer, builder, post-build reviewer.

### Deliver mode

Per-issue state machine: groom → review → stage1 → stage2 → verify. State-machine-gated per issue. Multiple issues may be at different phases concurrently. Workers: pre-groomer, brief-reviewer, stage1 executor, stage2 executor.

**Current state:** the existing `.claude/agents/controller.md` is extract-ingest-shaped. Extending it to a mode-aware controller (or adding deliver-mode support) is earned when operator wants to run deliver work through the controller rather than manual dispatch. Until then, deliver work continues via manual operator dispatch of pre-groomer + brief-reviewer (the pattern validated across probes 0.1–0.5).

---

## Anti-patterns (explicit rejections)

- **Agents writing to Linear** — breaks workflow-surface ownership; see §7.
- **Callbacks from workers triggering next workers** — breaks fresh-context discipline and controller single-writer invariant; workers return structured results, controllers decide next step.
- **Controller judging artifacts** — controller is mechanical; if the check requires judgment, dispatch a reviewer.
- **Silent state transitions** — every transition leaves an artifact (brief, review, comment, state change). Never advance state without visible evidence.
- **Wide context windows** — fresh context per unit; do not let sessions accumulate 100+ tool calls before completing a single decision.

---

## References

- `docs/architecture/system-overview.md` — top-level concern map
- `docs/architecture/deliver-architecture.md` — deliver track in detail
- `docs/architecture/extract-architecture.md` — extract track in detail
- `docs/harness-philosophy.md` — generator-evaluator pattern + mechanical-vs-judgment dividing rule
- `docs/learnings.md` — cross-track empirical findings
- `.claude/agents/controller.md` — extract track controller (reference implementation)
- `.claude/agents/build-controller.md` — extract track build-stage controller
