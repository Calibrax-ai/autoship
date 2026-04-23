# teach-autoship.md

**Purpose:** Stable operating knowledge shared by every autoship controller (extract, deliver, and future tracks). Changes slowly. Controllers read this before consulting their per-run `program.md`.

This file is **what autoship is** — philosophy, roles, and non-negotiable discipline. The per-run `program.md` is **what this specific run should do** — testbed, scope, approval mode, stop conditions.

This file is **controller-only**. Manual worker dispatch (`pre-groomer`, `brief-reviewer`) does not require it.

This file is the *durable* layer. Worker contracts, per-track phase machines, and deliver-specific comment/state policy live in their authoritative files and are referenced from here — never restated. Restating them would guarantee drift.

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

State lives on disk at known paths, not in a long-running session's memory.

Deliver now has canonically derivable local runtime states:

- `issue.md` exists, no `brief.md` → `new`
- `brief.md` exists, no `reviews/` → `proposed`
- latest review verdict REJECTED → `changes-requested`
- latest review verdict APPROVED → `ready-for-oracle`
- `stage1.md` exists, no `stage2.md` → `oracle-written`
- `stage2.md` exists, no `pr.md` → `built`
- `pr.md` exists → `in-review`

No parallel `state.json` is required. The runtime artifacts are the state machine.

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
- `needs-human-input` + reason (from any worker that hits a blocking ambiguity; the reason is a filled blocker report per the `blocker-escalation` skill — `skills/blocker-escalation/assets/blocker-report-template.md`, lint-checked by `skills/blocker-escalation/scripts/validate-blocker.py`)

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

For future `audit` mode, the same ownership rule applies:
- `auditor` may propose issue candidates inside the audit artifact
- `audit-reviewer` may approve or reject that artifact
- only the controller may create the approved issues in Linear / GitHub
- default creation state is `Backlog`, not `Grooming`

Per-track comment, label, and state-transition policy (deliver defaults, extract-ingest thresholds, audit approval flow, etc.) is tuned per run in the testbed's `.autoship/program.md`, not here. If you find yourself wanting to put a specific transition rule in this file, it probably belongs in the program instead.

---

## Worker contracts

Leaf worker roles, the artifacts each one writes, and the structured results each one returns are defined in `.claude/agents/*.md` — one file per role (`pre-groomer.md`, `brief-reviewer.md`, `stage1-executor.md`, `stage2-executor.md`, plus the ingest probes under extract). Those files are the source of truth; do not restate their contracts here.

The invariants that apply uniformly across all workers are stated above: workers own their artifacts, return structured results to the controller, and never mutate Linear or other external systems directly (§7).

---

## Issue lifecycle

The deliver-mode state machine (derivable local runtime states, Linear transitions, stage transitions, the `Ready → Building` human-promotion boundary) is defined in `docs/architecture/deliver-architecture.md`. The extract track's phase machine is defined in `docs/architecture/extract-architecture.md`.

The invariant that matters at *this* layer is §4: state is derived from runtime artifacts; there is no parallel state file. If you find yourself reaching for a state variable that isn't a file on disk, stop.

---

## Stop conditions

Per-issue terminal outcomes in deliver:

1. **`Ready`** — grooming + review succeeded and the brief is build-worthy.
2. **`needs-human-input`** — the reviewed outcome or build execution hit a typed blocker.
3. **`draft-pr`** — build + validation succeeded and the controller opened a draft PR.

Those are **issue terminal states**, not run terminal states.

The controller halts the whole run only when:

1. **Unrecoverable environment error** — testbed path invalid, tracker integration unavailable for the selected source, credentials missing, or another global failure blocks all further work.
2. **End of eligible work** — no more issues match `program.md`'s eligibility criteria.

Anything else: **do not stop**. In deliver mode, park per-issue blockers at `needs-human-input`, respect `Ready` as the human approval boundary, and continue to the next eligible issue.

---

## NEVER STOP posture

The controller runs autonomously. Do not pause. Do not ask "should I continue?" The operator may be asleep.

Continue until a run-level stop condition above fires. When a stop condition fires, the controller writes the reason, sets the right Linear state + comment, then exits cleanly with a machine-readable exit code so the operator can resume later.

Resumption: on restart, the controller reads filesystem state of each eligible issue, resumes from where it left off. No operator hand-holding needed.

---

## Cross-track notes

Autoship uses **one top-level controller** role. Track (extract vs deliver vs future audit) is a mode — selected by the per-run `program.md` or invocation argument — not a separate agent. The controller's responsibilities are identical across tracks: read run contract, pick eligible work, dispatch workers, collect structured results, update outer workflow, stop on typed conditions. Only the phase-machine shape differs per track, and those shapes are defined in `docs/architecture/extract-architecture.md`, `docs/architecture/deliver-architecture.md`, and (planned) `docs/architecture/audit-architecture.md`.

Audit mode specifically does *not* continue directly into implementation. Its job is to decide what work should exist, not to spend build compute on it in the same run. Once issues exist in `Backlog`, normal `deliver` policy applies.

---

## Anti-patterns (explicit rejections)

- **Agents writing to Linear** — breaks workflow-surface ownership; see §7.
- **Callbacks from workers triggering next workers** — breaks fresh-context discipline and controller single-writer invariant; workers return structured results, controllers decide next step.
- **Controller judging artifacts** — controller is mechanical; if the check requires judgment, dispatch a reviewer.
- **Silent state transitions** — every transition leaves an artifact (brief, review, comment, state change). Never advance state without visible evidence.
- **Wide context windows** — fresh context per unit; do not let sessions accumulate 100+ tool calls before completing a single decision.
- **Restating worker contracts or phase machines here** — this file drifts the moment another file is updated and this one isn't. Point, don't duplicate.

---

## References

- `docs/architecture/system-overview.md` — top-level concern map
- `docs/architecture/extract-architecture.md` — extract track phase machines in detail
- `docs/architecture/deliver-architecture.md` — deliver track phase machine, state transitions, approval boundaries
- `docs/architecture/deliver-program-template.md` — shape of the per-repo `program.md` (comment/state policy lives here, per run)
- `docs/harness-philosophy.md` — generator-evaluator pattern + mechanical-vs-judgment dividing rule
- `docs/learnings.md` — cross-track empirical findings
- `.claude/agents/*.md` — authoritative worker contracts (inputs, outputs, structured results, forbidden actions)
- `.claude/agents/controller.md` — controller agent definition (mode-aware; extract-ingest + deliver today)
- `skills/blocker-escalation/` — blocker report template, category enum, lint script
