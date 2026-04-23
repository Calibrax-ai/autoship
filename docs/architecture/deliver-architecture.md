# Existing Project Delivery v0.1

**Date:** 2026-04-21
**Status:** v0.1 proposal
**Scope:** Turn autoship from a demo-to-product rewrite system into an existing-project delivery system

## Problem

`extract` and `build` solve the "unknown prototype" problem well enough to justify a separate track. They do not yet solve the "known repo, known issue, controlled change" problem.

For an existing project, the challenge is different:

- the codebase already exists
- the issue is usually narrower than a full product spec
- regression risk matters more than discovery breadth
- the execution system needs stronger state, recovery, and verification discipline than a one-off prompt loop

The goal of `deliver` is not to reverse-engineer the whole product again. The goal is to take a bounded change request, produce a trustworthy change brief, and drive it through build and validation without losing control of scope or evidence.

## Architecture Overview

`deliver` is an autonomous change pipeline built around an external state machine. Canonical state lives on disk. Each unit runs in a fresh context window. Evidence anchors every transition. A separate reviewer judges the author's work at every structural handoff.

`deliver` is the **delivery-layer** module, not the whole future product workflow. Upstream concerns like intent capture, enrichment, prioritization, and decomposition may exist elsewhere in autoship later. For now, they appear only in the limited ways needed to produce a trustworthy change brief and move an approved work item toward build.

At the broader product level, those are better treated as **concerns** than one rigid global pipeline. Enrichment can recur during grooming, regroom, and later verification. Decomposition can happen during grooming or before a work item enters `deliver`. `deliver` itself remains a **small explicit local workflow**.

Operator experience should stay pragmatic. A tracker like Linear is the likely **outer workflow surface** for humans: status, comments, lineage, priority, and linked issues. Repo-local artifacts remain the **inner execution contract** for agents: they version with code, freeze review inputs, and keep the machine-facing brief, oracle, and evidence stable.

### End-to-end pipeline

```mermaid
flowchart LR
    Issue([Issue<br/>intake]) --> PG[Pre-<br/>groom]
    PG --> Brief[(brief.md)]
    Brief --> BR{Brief<br/>Review}
    BR -->|REJECT| RG[Regroom]
    RG --> Brief
    BR -->|APPROVE| OP[Oracle<br/>Plan]
    OP --> OR{Oracle<br/>Review}
    OR -->|REJECT| OP
    OR -->|APPROVE| BLD[Build]
    BLD --> UIW[UI Walker<br/>+ Verify]
    UIW -->|FAIL| BLD
    UIW -->|PASS| PBR{Post-Build<br/>Review Council}
    PBR -->|REJECT| BLD
    PBR -->|APPROVE| MRG[Merge]
    MRG --> DPL[Deploy]
    DPL --> MON{Monitor}
    MON -->|regression| ROLL[Rollback]
    ROLL --> Issue
    MON -->|healthy| CLS([Close +<br/>Learn])

    style PG fill:#2563eb,color:#fff
    style Brief fill:#2563eb,color:#fff
    style BR fill:#2563eb,color:#fff
    style RG fill:#2563eb,color:#fff
```

**Probe-0.1 scope** covers only the highlighted stages (pre-groom → brief → brief-review → regroom). Everything downstream is future probe work. Proving grooming first is the minimum path to validating the generator-evaluator pattern at this layer.

### Load-bearing architectural choices

- **Evidence-first artifacts** — truth comes from code, data, and observed behavior, not from issue text
- **Oracle quality as the ceiling** — the executor optimizes for whatever the oracle measures
- **Generator-evaluator separation at every handoff** — the author never discharges the gates judging its own work
- **Fresh session per unit** — context accumulation silently degrades output quality
- **Disk-backed execution state** — state lives on disk, not in a long-running session
- **Strict unit sizing** — every unit must fit in one context window
- **Mechanical verification gates** — no judgment-only transitions in the outer loop
- **Isolation and recovery discipline** — autonomous work runs in branches or worktrees, with explicit stuck detection

## Lifecycle and State Machine

### Issue state machine (0.1 scope)

State is derived from filesystem presence — no parallel state file. Reviews are append-only (new file per pass); briefs overwrite (git log preserves history).

```mermaid
stateDiagram-v2
    [*] --> new: issue arrives<br/>(issue.md created)
    new --> proposed: pre-groom<br/>writes brief.md
    proposed --> changes_requested: reviewer REJECTS<br/>(review-NN.md)
    changes_requested --> proposed: regroom writes<br/>new brief.md
    proposed --> ready_for_oracle: reviewer APPROVES
    ready_for_oracle --> [*]: handoff to<br/>downstream (post-0.1)
```

### State determination from filesystem

| Filesystem condition | State |
|---|---|
| `issue.md` exists, no `brief.md` | `new` |
| `brief.md` exists, no `reviews/` | `proposed` |
| latest `reviews/review-NN.md` verdict is REJECTED | `changes-requested` |
| latest `reviews/review-NN.md` verdict is APPROVED | `ready-for-oracle` |

### Per-type grooming flow

All four types share the same overall shape: `read issue → apply type-specific procedure → map blast-radius → write brief → review`. The type-specific middle differs per type because the truth source differs.

```mermaid
flowchart TB
    I([Issue<br/>+ type]) --> Classify{Type}

    Classify -->|Bug| B1[Reproduce via<br/>curl/test/query]
    B1 --> B2[Trace to<br/>file:line root cause]

    Classify -->|Feature| F1[Research existing<br/>pattern in codebase]
    F1 --> F2[Explore 2-3<br/>alternatives, pick fit]

    Classify -->|Refactor| R1[Inventory existing<br/>test coverage]
    R1 --> R2[Define structural<br/>target + axis]

    Classify -->|Non-functional| N1[Measure baseline<br/>via benchmark]
    N1 --> N2[Identify hotspot,<br/>define target]

    B2 --> Map[Map blast-radius<br/>create / change /<br/>may / must-not]
    F2 --> Map
    R2 --> Map
    N2 --> Map

    Map --> Write[Write brief<br/>with type-specific<br/>section]
    Write --> BriefOut[(brief.md)]

    style B1 fill:#ef4444,color:#fff
    style B2 fill:#ef4444,color:#fff
    style F1 fill:#10b981,color:#fff
    style F2 fill:#10b981,color:#fff
    style R1 fill:#f59e0b,color:#fff
    style R2 fill:#f59e0b,color:#fff
    style N1 fill:#8b5cf6,color:#fff
    style N2 fill:#8b5cf6,color:#fff
```

### Feedback loops

`deliver` is not a linear chain — it's a DAG with explicit feedback edges:

- **Regroom** — reviewer REJECTS a brief → pre-groomer re-grooms from updated inputs. Same issue, new brief; prior review preserved in `reviews/review-NN.md` history.
- **Re-plan** (future) — oracle-reviewer REJECTS oracle plan → oracle-planner re-plans.
- **Rebuild** (future) — walker or post-build reviewer REJECTS → builder re-dispatches with revised plan.
- **Rollback + new issue** (future) — monitor detects regression → auto-rollback + new issue created for investigation.

Every transition either advances state or writes a reviewer verdict explaining why it did not. The state machine never goes silently stuck.

## Preconditions

Deliver is an automation pipeline built on top of a running codebase. The full pipeline — grooming → oracle → build → verify → close — operates meaningfully only when the testbed meets a small set of preconditions:

- **Test infrastructure** — a runnable test command, functional tests covering observable behavior, deterministic, reasonably fast (minutes not hours)
- **Reproducible environment** — seedable database, consistent fixtures, runnable locally or in CI
- **Clean version control** — git with a stable main branch to anchor against

These apply to the full pipeline, not to probe-0.1 specifically. Probe-0.1's grooming stage produces briefs that *reference* tests (Acceptance Criteria verifications and Refactor's Preservation Proof); it does not execute them. A testbed with thin tests can host grooming — it becomes a blocker at oracle and build stages in later probes.

When preconditions are not met, the fix is itself a change. Adding tests, seeding fixtures, or stabilizing CI is a precursor issue that deliver can groom and drive like any other.

## Issue Types

`deliver` recognizes four types, distinguished by the shape of grooming each requires — specifically, where the truth lives and how it is found.

| Type | Grooming shape | Truth location | Posture |
|---|---|---|---|
| **Bug** | Forensic | Latent in code: reproduce → root cause → fix | Observe, diagnose, specify |
| **Feature** | Generative | Has to be invented: research → design → alternatives → pick | Find smallest design that fits existing patterns |
| **Non-functional** | Measured | In benchmarks/metrics: baseline → target → approach | Observe a number, not an error (deferred design) |
| **Refactor** | Structural | Code-quality criteria: define "better" → bound scope → preserve behavior | Preserve behavior, improve structure |

Each type has a materially different grooming shape. Two types with the same shape should be one type.

### Types are classifications, not pipelines

For v0.1, one pre-groomer + one brief-reviewer handle all four types. Type is a field on the brief. Type-specific optional sections carry the shape differences:

- **Bug** — Reproduction Steps, Root Cause
- **Feature** — Design Rationale (alternatives considered, picked design, reasoning)
- **Non-functional** — Baseline Measurement, Target (deferred to probe-0.2+)
- **Refactor** — Behavior Preservation (how we know nothing changed)

Specializing into four separate grooming pipelines is deferred until observed quality justifies it. Structure before evidence is formalism, same discipline applied to `calibration/` and supervisor modules.

### Classification

The pre-groomer classifies the issue as its first action and records `type:` in the brief frontmatter. External tracker labels (GitHub, Linear) are input signal, not authoritative — the pre-groomer can correct them. Misclassification is a brief-reviewer REJECT condition.

### Out of scope for `deliver`

Explicitly not handled by this module:

- **Spikes and research tickets** — produce knowledge, not code
- **Strategic planning** — "should we rewrite X in Y?" is not a change request
- **Multi-repo coordination** — `deliver` is single-repo by design
- **Standalone documentation updates** — doc changes bundled with a code change are part of the parent type; pure doc changes may get their own probe later

## Empirical Validation

Autoship's own probe series already surfaced the failure shapes this architecture must handle.

Probes 2.2 → 2.3 → 2.4 ran the same loop three times: observe failure → add a forcing-function gate → the controller absorbs the gate while reproducing the failure under a new label. The structural cause was that the author of the plan also discharged the gates judging it. Accumulating gates at the author boundary does not fix author-is-judge; it renames the failure.

Probe 2.5 validated the structural fix. A fresh-context `plan-reviewer` with a calibration set caught four substantive failures on its first pass (one-journey-per-slice violation, deferred-action affordance, duplication across handoff artifacts, consistency drift). The build then shipped clean — 14/14 journey walks pass end-to-end on seeded data, 145/145 oracle green, zero operator intervention. Reviewer cost was under 2% of the probe total.

`deliver` applies the same generator-evaluator pattern at a different stage. The planning-layer fix generalizes; the failure modes are structural, not probe-specific. See `docs/learnings.md` §"Generator-evaluator pattern: validated in probe-2.5" and `docs/harness-philosophy.md` for the full synthesis.

## Foundations

These are the architectural decisions load-bearing enough to use in `deliver-0.1`.

### 1. Disk-Backed Execution State

The controller reads and writes canonical state on disk, not in a long-running in-memory session.

Why:

- crash recovery becomes straightforward
- resumability is real, not aspirational
- human steering and agent execution share the same source of truth
- execution state versions with the repo

For `deliver-0.1`, keep this minimal:

```text
.autoship/issues/<id>/
  brief.md
  reviews/
    review-01.md
    review-02.md
```

State is derived from filesystem presence — no parallel state file. Reviews are append-only (new file per pass); briefs overwrite (git log preserves history).

### 2. Fresh Session Per Unit

Every major unit runs in a fresh context window.

Initial units:

- `pre-groom`
- `review`
- `regroom`
- optional `oracle-draft`

Fresh context is a structural advantage. Probes 1 through 2.5 all used fresh-session-per-unit and none surfaced a state-management bug caused by it.

### 3. Hard Unit Sizing

A unit must fit in one context window.

If a grooming pass needs more context than fits, split it into smaller units:

- codebase scan
- baseline snapshot
- oracle draft

This prevents oversized sessions that silently degrade in quality.

### 4. Explicit State Machine

The workflow is explicit from day one:

- `new`
- `proposed`
- `changes-requested`
- `ready-for-oracle`

Small enough to support pre-groom, review, and regroom without importing a full milestone engine. See the "Lifecycle and State Machine" section above for the full state diagram.

### 5. Mechanical Gates

No judgment-only transitions in the outer loop. At minimum:

- `brief.md` exists
- required brief sections are present
- `reviews/review-NN.md` contains a parseable verdict
- state is derivable from filesystem presence — no parallel state store to drift

The first probe must be able to fail mechanically, not only subjectively. Mechanical → grep; judgment → reviewer (see CLAUDE.md §Project Philosophy).

### 6. Repo-Local Canonical State With Optional Tracker Sync

External trackers (GitHub, Linear) provide the outer workflow surface. They do not hold execution state.

Trackers own:

- intake
- visibility
- approval
- coarse workflow state

Repo-local artifacts own:

- machine-readable brief state
- retry and recovery data
- reviewer verdicts
- execution truth

### 7. Brief Schema

`brief.md` has seven base fields, one optional universal field, and one type-specific section.

**Schema tree:**

```
brief.md
│
├── [Frontmatter]
│   ├── issue, issue-rev, groomed-at, trigger, type
│   └── type-specific status:
│       ├── Bug            → reproduction-status
│       ├── Feature        → design-status
│       └── Refactor       → preservation-status
│
├── [Base fields — all types]
│   ├── Outcome                         (one-line user-visible result)
│   ├── Acceptance Criteria             (runnable predicates)
│   ├── Scope Fence                     (Always / Ask / Never)
│   ├── Rabbit-Hole Patches             (pre-answered decisions)
│   ├── Blast-Radius Manifest           (Create / Change / May / Must-not)
│   ├── Skeleton Position               (single-slice vs multi-slice)
│   └── Concrete Example                (input/output or reference)
│
├── [Optional universal]
│   └── Failure Modes                   (runtime risk scenarios)
│
└── [Type-specific section — exactly one of:]
    ├── Bug            → Reproduction Steps + Root Cause
    ├── Feature        → Design Rationale (menu below)
    ├── Refactor       → Behavior Preservation (three subsections)
    └── Non-functional → Baseline Measurement + Target (deferred)
```

**Base fields detail:**

- **Outcome** — one-line user-visible result
- **Acceptance Criteria** — atomic verifiable predicates, each mapping to a runnable check (test command, grep, Playwright assertion)
- **Scope Fence** — Always / Ask / Never tiers, with Never naming specific files or directories
- **Rabbit-Hole Patches** — pre-answered decisions for uncertainties the executor would otherwise guess
- **Blast-Radius Manifest** — four buckets: `Expected to create`, `Expected to change`, `May change`, `Must not change`. All derived from the codebase.
- **Skeleton Position** — single-slice (first or N+1, naming the pattern it follows) OR multi-slice feature (oracle-plan decomposes)
- **Concrete Example** — input/output, sample data, or screenshot that fixes interpretation

**Optional universal field:**

- **Failure Modes** — populated when the change has runtime risk (external dependencies, queued jobs, state mutation, non-trivial errors). Bug briefs may omit; Feature briefs with async or stateful work should fill.

**Behavior Preservation (Refactor only).** Three subsections:

- **What must be preserved** — observable invariants (API response shapes, status codes, DB row shapes, emitted events, side effects) + non-observable behaviors that matter (performance characteristics, ordering)
- **Preservation Proof** — existing tests that cover the refactor target (grep-verifiable list, not line coverage) + identified gaps + specific regression tests the brief commits to adding BEFORE the refactor lands + runnable verification command
- **Structure Improvement** — before → after structural shape, improvement axis (coupling / readability / testability / complexity / performance / security), measurable criterion for "done"

Refactor may also include `Design Rationale` when ≥2 structural approaches exist (split god-class N ways). For trivial refactors (rename a function), Design Rationale is skipped — one approach, no alternatives to weigh.

**Design Rationale menu (Feature only).** Pre-groomer includes subsections that match the feature's characteristics. Not all subsections apply to every feature — including irrelevant ones is noise, omitting relevant ones is grounds for REJECT.

- **Alternatives** (always) — 2–3 approaches with cost + fit + tradeoff, citing real `file:line` patterns
- **Picked + Reason** (always) — which one, why, favoring simplicity + fit over novelty
- **Constraints** (when runtime/infra shape) — load profile, timeout envelope, resource limits, concurrency
- **Migration Plan** (when schema changes) — DDL sequence, online-safety, backfill strategy
- **Backward Compatibility** (when changing APIs or data) — old rows / clients / shapes that must survive
- **Rollback Plan** (when risky) — how to undo
- **Schema Diff** (when DB change) — columns, types, defaults, indexes
- **Deferred** (always optional) — alternatives explicitly not pursued, for future reference

Mechanical content (acceptance criteria, blast-radius manifest, subsection presence) is grep-checkable. Judgment content (scope fence, rabbit-hole patches, picked alternative) is what the reviewer evaluates.

### 8. Voice-Coded Anti-Pattern Framing In Prompts

Every agent prompt carries a short adversarial section — specific failure modes to avoid, written in a voice the agent can internalize rather than a checklist to tick off.

Thicker than a principle list; lighter than a rubric. Calls out the shape of failure: "do not ship affordances without effects; do not mark a task done because the code compiles; do not cut scope and relabel it as `blocked-other`."

Applies across the pipeline — pre-groomer, brief-reviewer, later the builder and post-build reviewer — with anti-pattern content specific to each role.

### 9. Pre-Inject Context In Dispatch Prompts

The dispatch prompt for each unit inlines all the context that unit needs:

- for `pre-groom` — issue body, relevant code excerpts, recent commits, test summaries
- for `brief-reviewer` — the brief, the issue, relevant code, any prior review verdicts
- for later stages — their own specific inputs

The agent is told explicitly what it has been given and what it has not. This avoids burning the first ten tool calls re-orienting to context the dispatcher already has, and prevents the agent from fishing outside the intended scope.

## Agent Contract

Every agent invocation in `deliver` binds four explicit contracts. Each answers a distinct question and carries its own design decisions.

### The four layers

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   IDENTITY   │  │    SKILL     │  │    PROMPT    │  │   CONTEXT    │
│   (agent)    │  │ (capability) │  │    (task)    │  │    (data)    │
├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤
│ Who is this  │  │ How to do X? │  │ What to do   │  │ What data is │
│ agent?       │  │              │  │ now?         │  │ visible?     │
│              │  │              │  │              │  │              │
│ • Role       │  │ • Procedure  │  │ • Identity   │  │ • Pre-inject │
│ • Posture    │  │ • Inputs /   │  │   reference  │  │ • Tool-      │
│ • System     │  │   Outputs    │  │ • Skills     │  │   accessible │
│   prompt     │  │ • Required   │  │   declared   │  │ • Explicitly │
│ • Default    │  │   tools      │  │ • Task spec  │  │   denied     │
│   tools      │  │ • Reusable   │  │ • Completion │  │ • Fresh vs   │
│ • Model /    │  │   across     │  │   criteria   │  │   carried    │
│   effort     │  │   agents?    │  │              │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       └────────┬────────┴────────┬────────┴────────┬────────┘
                ▼                 ▼                 ▼
       ┌──────────────────────────────────────────────┐
       │   Bound at dispatch time                     │
       │   → fresh agent session runs                 │
       │   → writes artifacts to disk                 │
       │   → returns structured verdict / summary     │
       └──────────────────────────────────────────────┘
```

**Table view of the same:**

| Layer | Answers | Design decisions |
|---|---|---|
| **Identity** (agent) | Who this agent IS | Role, posture, system prompt, default tools, model/effort |
| **Skill** (capability) | HOW to do X | Procedure, inputs/outputs, required tools, reusability across agents |
| **Prompt** (task) | WHAT to do now | Which identity, which skills, specific task, completion criteria |
| **Context** (data) | WHAT data the session sees | What's pre-injected, what's tool-accessible, what's explicitly NOT available, what's fresh vs. carried |

### Context as first-class

Leaving context as "whatever the session drags in via tool calls" is the default failure mode — agents waste turns re-orienting, hallucinate because pre-injection was silently incomplete, or drift because they fish through files outside intended scope.

Every load-bearing probe lesson has been about context: fresh context per unit, pre-inject context in dispatch, tell the agent what it does NOT see. Making context explicit in the contract forces each agent definition to declare what it gets, what it does not, and why. See Foundations §2 (fresh session per unit) and §9 (pre-inject context).

### Extending the system

Three rules govern how the contract grows:

- **Extend capability with skills.** When an agent needs a new procedure (reproduce a UI bug, map blast-radius, write a regression test), add a skill — not a new agent and not a longer system prompt.
- **Extend orchestration with the controller.** When a task needs a different role or fresh context, add a controller-dispatched step, not a direct agent-to-agent invocation.
- **Never let context be accidental.** Every dispatch prompt declares what context is pre-injected and what the agent is allowed to discover via tools.

### Agents do not invoke agents directly

Consistent with autoship's established pattern, leaf agents never dispatch other leaf agents. If `pre-groomer` needs information beyond its current task scope, it either:

1. Invokes a skill in-session — most cases, including browser automation, DB query, test run, grep over the codebase.
2. Outputs a structured signal to the controller (`status: needs-exploration`, with target parameters). The controller dispatches a specialized agent with fresh context and feeds results back on the next `pre-groomer` dispatch.

This preserves fresh-context-per-unit, keeps the single-writer invariant on disk state, and makes every transition observable by the controller.

## Post-0.1 Extensions

Strong architectural choices that are not required to prove `deliver-0.1`. Add them when the observed failure justifies the complexity.

### 1. Branch or Worktree Isolation

Autonomous work is safer when isolated from the main working tree.

Introduce:

- per-issue branch isolation first
- worktree isolation soon after, if branch-only mode proves too fragile

Becomes load-bearing once `deliver` builds code rather than stopping at grooming.

### 2. Crash Recovery and Stuck Detection

Beyond grooming, the controller must detect:

- repeated failed retries
- missing expected artifacts
- blocked verification loops
- sessions that ended without a valid state transition

Required before long-running unattended build mode.

### 3. Stronger Verification Artifacts

After build lands, write richer evidence than pass/fail text:

- verification JSON
- walker result artifacts
- reviewer decision records
- baseline vs changed-surface summaries

Supports both recovery and learning capture.

### 4. Persistent Learnings

Closed issues feed back into durable project memory:

- `decisions.md`
- `learnings.md`
- later, formal calibration if repeated patterns justify it

`deliver-0.1` does not pre-create an empty `calibration/` directory for appearance. Calibration is born from observed operator overrides, not invented upfront.

### 5. Tracker Adapters

GitHub or Linear integration arrives after the repo-local execution model is stable.

Adapters handle:

- syncing coarse issue state
- mirroring review outcomes
- opening branches/PRs

Adapters do not define the architecture.

### 6. Model And Complexity Routing

Route per unit type:

- heavy (Opus-tier) for planning, replanning, grooming
- standard (Sonnet-tier) for execution
- light (Haiku-tier) for triage-level judgments

Reasoning and coding weights are separable — planning is reasoning-dominant; execution leans on coding fluency. Budget-pressure downgrades can trigger at graduated thresholds.

Autoship tracks cost today but does not route on it. Once `deliver` runs continuously against a real repo, this becomes load-bearing — both for economics and for matching model strength to task shape.

### 7. Multi-Reviewer Council At Post-Build Validation

The review stage dispatches multiple parallel fresh-context reviewers with distinct rubrics:

- Requirements Coverage — does the change deliver the acceptance criteria?
- Cross-Slice Integration — does it compose with surrounding work without regressions?
- Acceptance Criteria — are the runnable checks actually exercising the change?

Aggregate verdict rule: any FAIL → `needs-remediation`. Each reviewer catches a different failure shape; a single monolithic reviewer tends to smooth over one kind of failure while fixating on another.

Extends the same generator-evaluator pattern already validated for `plan-reviewer` to a later stage, with role-specialized reviewers.

### 8. Controller Support For Runtime Orchestration

The controller-backed runtime extends `deliver` into the first end-to-end path that reaches **draft PR**. One top-level `controller` agent running in `deliver` mode now owns both halves of the workflow:

- grooming path: claim → pre-groom → brief review → regroom → `Ready | needs-human-input`
- build path: `Ready` (after human promotion to `Building`) → worktree + branch → Stage 1 → Stage 2 → validation → draft PR → `In Review`

Input is a thin `program.md` naming the testbed, issue source, regroom policy, worktree/branch policy, validation commands, and outer state map. Fresh context per sub-agent dispatch; state on disk; single-writer invariant preserved.

The controller should read two distinct instruction layers:

- **`teach-autoship.md`**
  Stable autoship operating knowledge: workflow semantics, approval boundaries, meaning of `needs-human-input`, reviewer/generator separation, and default stop conditions.

- **`program.md`**
  Run-scoped contract: which repo/testbed to operate on, which tracker/project or issue source to pull from, approval mode (`supervised` vs `auto`), which states are eligible, whether merge is allowed, and what "do not stop" means for this specific run.

This split prevents stable framework knowledge from turning into a junk drawer for repo-specific or one-off policy.

These files are **controller-only**. Manual worker dispatch remains a fallback path; it does not require them.

When `deliver` is connected to Linear or another tracker, the controller is the only runtime actor that should mutate tracker state. Leaf workers (`pre-groomer`, `brief-reviewer`, later oracle/build/review workers) should:

- write their own artifacts
- return a structured result to the controller
- never call Linear MCP directly for official state changes

That structured result acts like a callback signal to the controller:

- `brief-written`
- `verdict: APPROVED | REJECTED`
- `build-passed`
- `build-failed`
- `needs-human-input`

The controller then:

- posts the human-facing summary comment
- changes Linear status if policy allows
- dispatches the next worker or stops

### Human / agent handoffs in `deliver`

The core handoff boundaries should stay explicit:

1. **Human -> agent**
   An issue is created or selected in the outer workflow surface (likely Linear) and becomes eligible for grooming.

2. **Agent -> human or reviewer-agent**
   After grooming, the agent writes the brief and review evidence, then hands off at `ready-for-oracle` or `needs-human-input`. When a tracker like Linear is present, `ready-for-oracle` typically maps to an outer `Ready` state.

3. **Approval boundary**
   In supervised mode, a human promotes work from `Ready` to `Building`.
   In auto mode, a reviewer-agent may promote it, but only until a typed blocker forces `needs-human-input`.

4. **Agent -> review**
   After build/validation/PR creation, the agent hands off again at review/merge boundaries.

The rule is: agents do execution work; humans or reviewer-agents approve transitions that spend meaningful compute, widen blast-radius, or create external commitments.

Sub-decisions still deferred:

- **Dispatch mechanism** — subprocess (`claude --agent X -p "..."`, matches extract's build-controller precedent) or Agent tool (in-session dispatch). Default to subprocess for consistency.
- **Issue intake breadth** — operator pre-populates `.autoship/issues/<id>/issue.md`, or controller pulls from tracker API. The current runtime supports both local folders and tracker pull; broader multi-source intake is later.
- **Subdir organization** — when extract and deliver co-install in one repo, agents likely reorganize into `.claude/agents/extract/`, `.claude/agents/deliver/`, `.claude/agents/shared/`. Verify Claude Code's nested-path agent resolution before committing.

Ralph-loop (external bash driver) stays as the CI/headless option (extract's Track 1 already is this). GSD-style supervisor accumulation stays rejected — see Anti-Pattern 5.

### Current runtime and next candidates

Current implemented runtime:

- claim issue
- pre-groom
- brief review
- regroom up to limit
- park at `Ready | needs-human-input`
- after human promotion to `Building`: worktree + branch
- Stage 1 oracle
- Stage 2 implementation
- controller reruns validation
- controller commits, pushes, and opens a draft PR
- issue moves to `In Review`

Explicitly not yet implemented in the current runtime:

- merge orchestration
- deploy orchestration
- post-deploy monitoring
- outcome verification against business/product success criteria
- parallel builds
- auto-promotion past `Ready`

Next placeholders:

- **Next**: review + merge lane
- **Later**:
  - deploy + monitor
  - outcome verification
  - parallelism once the serial path is boring

## Anti-Patterns

Patterns `deliver` explicitly does NOT adopt.

### 1. Issue-First Truth Model

Autoship's differentiator is evidence-first reasoning.

For `extract`, truth comes from: journeys, screenshots, sample data, observed behavior, oracle coverage.

For `deliver`, truth comes from: current codebase reality, baseline snapshot, change brief, oracle draft, reviewer-approved decisions.

An issue tracker is an input and coordination surface, never the truth source. Issue text reflects what the reporter hoped; code reflects what the system does.

### 2. Replanning As Scope Escape Hatch

Self-judged gates get absorbed by the same agent that authored the plan. Probes 2.2 → 2.4 ran this failure three times, each time under a new label.

Any replanning in `deliver` must stay reviewer-controlled and evidence-constrained. The reviewer is the fixed point; the plan is negotiable. A controller that proposes to replan must produce evidence the reviewer can check, not rationale the reviewer has to trust.

### 3. Ceremony Before It Pays For Itself

`deliver-0.1` does not import milestone machinery, reporting layers, sync adapters, or recovery subsystems before the first grooming probe proves they are needed.

Each additional file is a surface for inconsistency — earn the separation. Three similar lines of code are better than a premature abstraction.

### 4. Static Gate Registries Without Calibration

Fresh-context reviewers are only useful when their rubric adapts from observed cases.

A static list of questions ("does this handle failure cases?", "is this secure?") with no override-feedback loop drifts from actual failure modes over time. The reviewer degrades into a checkbox machine that satisfies its rubric while missing the failure shape that matters.

Autoship's calibration methodology — operator overrides become new labeled cases, calibration grows over time — is load-bearing. It is what makes the reviewer's judgment transferable across probes and durable across time. See `docs/plan-reviewer-calibration.md`.

### 5. Accumulating Supervisor Modules

When a new failure mode appears, the fix is structural — move the check to the reviewer boundary — not a new supervisor module for every symptom (stuck-detection, timeout-recovery, verification-guard, ...).

Probes 2.2 → 2.4 demonstrated that each new gate layered on the author gets absorbed by the author. The reviewer is the fixed point against which structural fixes are made; supervisors are not. See `docs/learnings.md` §"The accumulated-gates pattern, and why it loops" and `docs/harness-philosophy.md`.

## Recommended 0.1 Shape

The first `deliver` probe stays narrow:

```mermaid
flowchart LR
    Op([Operator]) -->|1. create| Iss[(issue.md)]
    Op -->|2. dispatch| PG[pre-groomer]
    Iss --> PG
    PG -->|writes| Brief[(brief.md)]
    Op -->|3. dispatch| BR[brief-reviewer]
    Brief --> BR
    BR -->|writes| Rev[(review-NN.md)]
    Rev -->|APPROVE| Done([ready-for-oracle])
    Rev -->|REJECT| Regroom[operator<br/>triggers regroom]
    Regroom --> PG
```

Five steps:

1. Pull issue or local change request context (operator creates `.autoship/issues/<id>/issue.md`)
2. Pre-groom a repo-local brief (`claude --agent pre-groomer -p "..."`)
3. Run reviewer verdict (`claude --agent brief-reviewer -p "..."`)
4. Optionally regroom if REJECTED
5. Stop at `ready-for-oracle`

No code built yet. Prove that the system can produce a trustworthy issue brief first.

### Filesystem layout

```text
autoship-deliver-0.1/
  app/                   # cloned testbed, pinned commit
    .autoship/
      issues/<id>/
        issue.md         # issue body + comments
        brief.md         # pre-groomer output
        reviews/
          review-01.md   # first reviewer verdict
          review-02.md   # after regroom (if any)
```

Per-issue artifacts live inside the testbed repo (`app/.autoship/issues/<id>/`) — the production shape where `deliver` gets installed into a repo the way `.github/` or `.claude/` does. If/when controller-backed `deliver` arrives, its run-scoped `program.md` lives one level up so it does not contaminate the testbed's git history.

### 0.1-specific simplifications

Each graduates to a richer shape when observed need justifies it.

- **Controller scope stays staged.** Current runtime reaches draft PR, but still stops short of merge/deploy. The controller owns claim → pre-groom → review → `Ready | needs-human-input`, then after human promotion to `Building`: worktree → Stage 1 → Stage 2 → validation → draft PR.
- **Skills are inlined in the agent's system prompt.** `reproduce-api-bug`, `map-blast-radius`, and `write-brief` live as numbered procedure steps inside `pre-groomer.md` rather than separate `SKILL.md` files. Skills earn their own file the first time a second agent needs them.
- **State derived from filesystem.** `brief.md` exists → `proposed`; `reviews/review-NN.md` REJECTED → `changes-requested`; APPROVED → `ready-for-oracle`. No `state.json`.
- **No calibration set at start.** `calibration/` directory is not created until the first operator override produces a real labeled case.
- **Reproduction outcome is a brief field, not a separate artifact.** A bug that cannot be reproduced is a `brief.md` with `reproduction-status: cannot-reproduce`; the reviewer's groundedness check flags it.
- **Non-functional type deferred.** Only Bug, Feature, and Refactor are designed; Non-functional grooming is implemented when probe-0.2+ has real data to inform it.

## Decision

For `deliver-0.1`, adopt the nine foundations. Defer the eight extensions. Explicitly reject the five anti-patterns.

**Foundations (in place):**

- disk-backed state
- fresh session per unit
- hard unit sizing
- explicit state machine
- mechanical gates
- repo-local canonical state
- brief schema
- voice-coded anti-pattern framing
- pre-injected dispatch context

**Post-0.1 extensions (deferred):**

- branch/worktree isolation
- crash recovery + stuck detection
- richer verification artifacts
- persistent learnings
- tracker adapters
- model and complexity routing
- multi-reviewer council
- controller agent for grooming orchestration

**Explicit anti-patterns (rejected):**

- issue-first truth model
- replanning as scope escape
- ceremony before it pays
- static gate registries
- accumulating supervisor modules

The resulting architecture is a bounded-change delivery engine where evidence anchors every transition, generator and judge are never the same agent, and state lives on disk.
