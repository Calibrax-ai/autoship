---
title: "Extract"
---

**Status:** optional legacy/research module · **Last updated:** 2026-04-24

Extract is no longer the default autoship surface. Core autoship now installs audit + deliver; extract remains available with `autoship init --with-extract` for demo reconstruction and research runs.

## In plain English

Someone built a half-working demo of an idea. It worked just enough to demo. Now you want it in production — maintainable, tested, real.

Rewriting it by hand is expensive and slow. Asking an AI to *"just rewrite this"* produces code that looks right but misses what the demo was trying to do.

**Extract** takes that demo and produces three things:

- A readable specification of what the demo was *trying* to do (not what the code happens to do)
- A generated test suite that pins that intent
- A production-candidate rebuild of the app, verified against those tests

A human reviews the specification before any rewriting starts. If the spec is wrong, everything downstream is wrong — so that's where the human attention goes.

> **The rest of this page is engineering detail.** Leadership readers can stop here and head to the [System overview](/architecture/system-overview/) or [What we've learned](/learnings/).
>
> **Key terms used below.** **Reversed spec** / **artifacts** — the bundle of documents extracted from the demo (requirements, API shape, data model, user journeys, design direction). **Oracle** — the generated test suite that judges whether a rewrite matches the spec. **Ralph loop** — the iterative build loop: a fresh agent session reads the spec + a progress file each iteration, implements one slice, and commits only if the tests are green. **Tracer bullet slice** — a thin end-to-end vertical (one route, one screen, one test) that proves the path works before other slices reuse its conventions.

## Problem

The input app usually works just enough to demonstrate value, but it is not a maintainable product. The codebase often contains:

- inline prompts mixed with UI logic
- implicit state and hidden coupling
- no backend contracts
- no durable schema design
- no tests
- no clear distinction between intended behavior and accidental prototype behavior

The hard part is not just *"rewrite the code."* The hard part is turning a messy demo into a reliable set of *artifacts* (specifications, tests, schemas) that an implementation loop can converge against.

## Product Thesis

v1 optimizes for this workflow:

```
vibe-coded demo → reversed spec artifacts → generated tests → Ralph loop → production candidate
```

The reversed artifacts are the anchor. The generated tests are the oracle. The frontend and backend rewrites are outputs of those artifacts, not direct translations of the original implementation.

## What v1 Is

A **demo-to-production-candidate rewrite system** for LLM-powered workflow apps.

Typical inputs: AI accounting tools, marketing content generation, internal ops copilots, report generation and document analysis apps.

Typical outputs: a reversed spec, generated test suite, clean frontend, production backend, and a run report describing assumptions, decisions, and escalations.

## What v1 Is Not

- a guarantee that the original demo was correct
- a full production-hardening platform
- a generic autonomous software factory
- a replacement for later security review, observability, or compliance

The correct claim is "production candidate," not "fully production-ready."

## Key Terms

**Artifacts** are the structured outputs the system carries between steps. They capture inferred intent, constraints, and assumptions. Artifacts describe.

**Oracles** are the evaluative mechanisms — the generated tests. They produce pass, fail, or escalation signals. Oracles judge.

**The external-state convergence loop** is the underlying execution pattern autoship inherits. It was coined in coding contexts as the Ralph loop by [Geoffrey Huntley](https://ghuntley.com/loop/) ([snarktank/ralph](https://github.com/snarktank/ralph)) and independently derived in ML research by Karpathy as [autoresearch](https://github.com/karpathy/autoresearch). Two fields, same structural pattern — which is why we're describing it as a pattern, not a Ralph-specific trick.

Both systems share five structural traits:

1. **Fresh context per iteration.** No long-running session. State persists externally, not in the model's memory.
2. **Declarative goal state.** The spec describes the end, not the steps. The loop picks the next step each iteration.
3. **External persistence for state.** A progress file + git history (or experiment log) is the loop's memory. Nothing lives only in LLM context.
4. **External feedback signal.** Accept or reject is driven by machine-verifiable checks — tests pass/fail, metrics improve/regress, or other bounded feedback. Not writer self-judgment.
5. **Single-writer, single-process.** One agent, one workspace, one action per iteration. Multi-agent fan-out is rejected by both precedents as non-deterministic coordination chaos.

autoship's instantiation for demo-to-production:

| Dimension | Ralph (coding) | autoresearch (ML) | autoship |
|---|---|---|---|
| Goal artifact | PRD | research prompt | reversed spec (`artifacts/`) |
| Progress file | `progress.txt` | experiment log | `.autoship/progress.txt` |
| Feedback signal | typecheck, tests, lint | metrics (loss, accuracy) | oracle tests + feedback loops |
| Accept/reject | commit if green | keep if metric improves | commit if current-slice checks green + controller validates |
| Exit condition | `<promise>COMPLETE</promise>` or cap | metric plateau or cap | all required tests green + no blocker, or cap |

When this document refers to "the Ralph loop," it means autoship's instantiation of this pattern for the backend build step. Future refinement passes (coverage, lint, duplication, entropy) are the same pattern with different feedback signals.

**Skills** are reusable execution playbooks that guide how an agent performs a task. The controller assigns skills to sessions based on the task type. Skills are not first-class architecture objects — they improve execution quality but do not define product intent.

## The Four Steps

### Step 1 — Ingest and Reverse Spec

The controller reads the demo repo and produces the artifact set (see Artifact Model below). This is LLM-powered: the controller extracts product intent, API surface, data model, user flows, design direction, and external dependencies from the codebase.

The reversed spec is a reconstruction, not ground truth. Low-confidence inferences should be stated explicitly.

**Task ordering in the PRD.** The PRD's task list follows the [tracer bullet](https://skills.sh/oakoss/agent-skills/tracer-bullets) pattern — each slice is a thin **end-to-end functional slice**, not backend-only and not full frontend design. A slice cuts through: route → handler → persistence → tests → **minimal UI needed to exercise the path**. Enough to prove the vertical path is real (one real screen, one real form, stable selectors, API wiring); explicitly not full UI polish or visual fidelity.

The phased structure is:

1. **Scaffold (single-shot).** Global shell, nav, design system, routing. Built once before any slice. Uses `design.md` + `user-journeys.json` for structure.
2. **Slice 1 (heaviest).** One core entity, its CRUD endpoints, plus minimal UI for its journey. Establishes project structure, auth, DB access, error handling, test conventions, and UI conventions that subsequent slices reuse.
3. **Slices 2–N.** One feature each, ordered by data model dependencies (User before Post, Post before Comment). Each slice carries only the UI needed to complete its journey test.
4. **Cross-cutting slice.** Middleware, shared validation, integration-level checks.
5. **Polish pass.** Dedicated visual consistency, design system compliance, responsive behavior. Separate oracle (not the backend test suite).

This split reflects a key observation: **backend work has one judge (behavioral correctness); frontend work has two targets (functional correctness and visual quality).** Mixing visual quality into a Ralph loop oracle makes the loop non-deterministic and derailable. The slice loop judges functional correctness (tests green, journey completes). The polish pass handles visual quality separately.

### Step 2 — Human Review

The human reviews the artifact set. They are asked to validate:

- who the product is for
- core workflows and user journeys
- high-impact actions and data sensitivity
- major assumptions the system made

This is a lightweight acceptance gate, not a full technical review. If the human cannot validate a section meaningfully, it remains marked as an assumption and may be escalated later if it blocks implementation.

After review, the artifacts are the contract. Everything downstream works from them.

### Step 3 — Generate Tests

The controller reads the approved artifacts and generates a test suite — the oracle. Tests are generated from the reversed spec, not from the original implementation. The goal is executable fidelity to reconstructed product intent.

Test types:

- **Contract tests** — API shapes, validation rules, auth expectations, response contracts
- **Behavior tests** — business logic fixtures, deterministic checks for LLM-mediated workflows
- **State tests** — DB writes, session changes, job state transitions, side effects
- **Journey tests** — Playwright scripts for core user flows from `user-journeys.json`

Journey test selectors (element IDs, button labels) can only be finalized after the frontend exists. The controller runs a selector-binding pass after the frontend rewrite — a mechanical step, not a second human gate.
Playwright journey tests are the highest-value user-facing QA signal in the system, but they are noisier than unit or contract checks. They belong in the oracle for the slices they cover; browser-agent walkthroughs and side-by-side UI comparison stay supplementary.

### Step 4 — Build (Ralph Loop)

The controller spawns headless Claude Code sessions in a Ralph loop. Each iteration:

1. Fresh session reads `@artifacts/prd.md @artifacts/api-spec.json @.autoship/progress.txt`. The controller adds `@artifacts/data-model.json`, `@artifacts/design.md`, or `@artifacts/external-contracts.json` only when the current slice needs them.
2. Picks the next incomplete task (highest priority first — architectural decisions and core abstractions before standard features, polish last)
3. Implements it
4. Runs the current slice's required feedback loops before committing. **Block commits unless the current slice's required checks pass.** Full-suite green is reserved for final completion. If the session can't get the slice green, it updates `progress.txt` with the blocker and exits.

   | Feedback loop | What it catches |
   |---|---|
   | TypeScript types | Type mismatches, missing props |
   | Unit tests | Broken logic, regressions |
   | Playwright journey tests | Full-stack user flow regressions for the current slice |
   | Agent-browser / visual QA (supplementary) | Missing affordances, obvious layout breakage, dead screens |
   | ESLint / linting | Code style, potential bugs |
   | Pre-commit hooks | Blocks bad commits entirely |
5. Commits if green
6. Updates `progress.txt`
7. Exits; controller validates progress against test results and git before spawning next iteration

**Build phases.** The Ralph loop runs over the slice sequence defined in Step 1:

- **Scaffold (single-shot, pre-loop).** One Claude Code session generates the global shell — layout, nav, design system, routing — from `prd.md` + `design.md` + `user-journeys.json`. Not iterative. The controller validates it compiles and renders. Bounded retry (2–3 attempts) if it fails.
- **Slice iterations (Ralph loop).** Each iteration implements one end-to-end slice: backend + minimal UI + journey test for that slice. Standard Ralph mechanics — read artifacts + progress, implement, run feedback loops, commit if green, update progress.
- **Polish pass (single-shot, post-loop).** After all slices are green and journey tests pass, a dedicated session handles visual consistency, design system compliance, and responsive behavior. Different oracle: screenshot regression against goldens captured after Slice 1, design system lint, accessibility checks. Not the behavioral test suite.

**Frontend oracle — functional vs visual.** The slice loop judges functional correctness: does the UI exist, does it have the right selectors, does the journey test pass. Playwright is not perfectly deterministic, but it is still the best end-to-end behavioral oracle for real user journeys, so it remains part of the blocking slice gate. Visual quality (spacing, fonts, responsive variation) is handled in the polish pass with a different oracle — bounded supplementary UI comparison, not the primary stop condition. UI comparison is good for catching obvious structural regressions (missing components, broken layout, dead screens); it's bad as a main oracle because it overfits to pixels instead of behavior.

**Affordance presence check.** Before starting the backend loop for a slice, the controller verifies that the minimal UI generated in that slice contains every element the journey test will reference (button labels, form fields, navigation targets). Deterministic check against the DOM. If missing, bounded retry of the slice's UI generation with the missing-elements list as context. This prevents "all backend tests pass but the journey fails at test time because a button is missing" — the failure mode a visual oracle would have been used to catch.

**How the loop stops:**

- **Complete:** session finds no remaining tasks and outputs a completion signal (`<promise>COMPLETE</promise>`). Controller verifies independently.
- **Iteration cap:** controller enforces a configurable limit (typically 5–50 depending on scope). Prevents runaway cost.
- **Stall:** controller detects the same task failing across multiple iterations. Escalates with the specific blocker.
- **Escalation:** session encounters a problem that requires changing the spec, the tests, or a human decision. It notes the blocker in `progress.txt` and exits rather than guessing.

**HITL vs AFK mode:** both are supported. HITL mode runs one iteration at a time — the human reviews between iterations, refining the prompt and catching issues early. AFK mode loops with iteration caps. HITL is recommended for first runs on a new project to build confidence in the prompt and artifacts before going autonomous.

**What `progress.txt` should contain:** not just a checklist. Each entry should include: completed task with PRD reference, architectural decisions made during that iteration, files modified, any blockers encountered, and notes for the next iteration. This gives the next fresh session real context rather than forcing expensive repo exploration.

**"Your instructions compete with your codebase."** Once code exists in the repo, the agent follows observed patterns more than written instructions. This makes the first tracer bullet slice critical — if it sets bad patterns, every subsequent iteration amplifies them. The first slice should be reviewed carefully (HITL mode recommended for it).

**Done** means: all required tests green across the full suite and no unresolved blocker.

## Artifact Model

Six files, each separate because it serves a different consumer at a different time:

| File | What it contains | Read by |
|---|---|---|
| `prd.md` | Core spec: requirements, decisions, resolved assumptions, LLM prompts | Every Ralph iteration |
| `api-spec.json` | Structured endpoints: method, path, request/response schemas, auth | Every Ralph iteration + test gen |
| `data-model.json` | Entities, fields, types, relationships, constraints | On-demand when iteration touches persistence |
| `design.md` | Structural direction: component decomposition, screen hierarchy | Frontend rewrite + on-demand |
| `user-journeys.json` | Step-by-step user flows with expected state transitions | Test generation step only |
| `external-contracts.json` | Third-party API request/response shapes | On-demand for integration tasks |

Plus `progress.txt` (Ralph state) and `tests/` (generated oracle).

**Why separate files instead of one big PRD:** context management. The controller selects which files each spawned session reads based on the task. A backend endpoint iteration doesn't need 300 lines of frontend component hierarchy. An integration task needs the external contracts; a CRUD task doesn't. Separate files let each session read only what's relevant, keeping context focused.

**What got merged into `prd.md`:** assumptions (resolved into decisions during review), data model context for simple projects (for complex projects with 10+ entities, `data-model.json` earns its file), and design decisions that affect all tasks.

## Folder Structure

Four concerns, four locations:

```
project/
  prototype/                     # INPUT — snapshot of original demo, read-only
    ...original demo files...

  artifacts/                     # SPEC — reversed spec, sessions read never write
    prd.md                       #   core spec: requirements, decisions, prompts
    api-spec.json                #   structured endpoints
    data-model.json              #   schema, entities, relationships
    design.md                    #   structural direction (linked from PRD)
    user-journeys.json           #   test generation input
    external-contracts.json      #   third-party API shapes

  app/                           # OUTPUT — the product, sessions write here
    package.json                 #   monorepo root
    frontend/
      src/
      package.json
    backend/
      src/
      tests-oracle/              #   generated contract, behavior, state tests
      package.json
    e2e/                         #   generated Playwright journey tests (full stack)
    playwright.config.ts

  .autoship/                     # RUNTIME — machine state, human status, per-run forensics
    config.json                  #   budgets, stack target, iteration limits
    progress.txt                 #   HUMAN status view — derived from state during ingest/review/generate-tests, agent handoff during build
    boot-report.json             #   live service wiring (current boot's detected runtime, services, public URL)
    current-run                  #   text file holding active run id (for resume)
    run-log.jsonl                #   tick-by-tick build iteration events (one line per iter)
    report.md                    #   final run report
    runs/                        #   per-run forensic records for phased operations
      2026-04-15T12-21-ingest/   #     one folder per invocation of ingest/generate-tests/etc.
        state/                   #     MACHINE state — marker files drive controller decisions
          phase_boot.done        #       touch-file written only after artifact verification passes
          phase_fanout.done
          phase_reconcile.done
          phase_critic.done
        started_at               #     ISO timestamp of run start
        prompts/                 #     rendered prompts sent to each subagent (forensic)
        logs/                    #     each subagent's response/stdout (forensic)
        decisions.log            #     append-only forensic trail (phase transitions, exit anomalies)
```

**The principle:** everything outside `app/` is input or runtime state. `app/` is the output. The folder tree makes the guardrail visible — sessions write inside `app/` and update `.autoship/progress.txt`. Everything else is read-only for sessions unless the controller explicitly opens a revision step.

**Controller protocol lives in code, not in files.** There is no per-run "dispatch plan" artifact. The controller's source encodes the default protocol (e.g., "ingest runs boot → fan-out → reconcile → critique"); runtime deviations from that default (e.g., "no frontend detected, skipped extract-ui-walker") are appended to `decisions.log`. If you want to know what the controller *intends* to do, read the controller. If you want to know what it *did* this run, read the run folder's `prompts/` + `logs/` + `decisions.log`.

**`progress.txt` is the single human-readable status file across the whole lifecycle.** It answers "what's happening right now?" regardless of which step is active. Its shape and *role* adapt per step:

- **Ingest / review / generate-tests** (bounded synthesis steps): `progress.txt` is a **derived status view**. The controller's machine state lives in explicit marker files (`.autoship/runs/<run-id>/state/phase_*.done`). `progress.txt` is rendered from that state each call — never edited in place, never read to decide what runs next. It exists for humans (`./autoship.sh status`) and for the controller to show a clean picture.
- **Build** (the true Ralph loop): `progress.txt` is **agent handoff state**. Fresh Claude Code sessions read it each iteration to know where they are, and they write back completed tasks, decisions, files modified, and blockers. This is Ralph's original pattern — the file is the loop's memory.

Only `build` is the true Ralph loop. Ingest is a short, bounded pipeline; review is an acceptance gate; generate-tests is a bounded oracle-synthesis step; build is the one iterative feedback loop. Using one file name for "human-readable status" across all four steps is a UX choice, not a claim that they share the same state model. Controller resume-after-crash during ingest reads the marker files, not `progress.txt`.

**Oracle test placement:** backend-specific tests (contract, behavior, state) live in `app/backend/tests-oracle/` where vitest finds them naturally. Journey tests (Playwright e2e) live in `app/e2e/` because they run against the full stack. Both directories carry the same guardrail: sessions must not edit them.

## The Controller

The controller is an **Agent SDK application** — a program that uses LLM calls for judgment and spawns Claude Code sessions for execution.

**LLM-powered decisions (controller AI judgment):**

- Extract the reversed spec from the demo codebase
- Generate the test suite from the approved artifacts
- Evaluate stall conditions: is the Ralph loop stuck? Is this a code problem, a test problem, or a spec problem?
- Decide whether to continue, retry with adjusted context, open a revision step, or escalate
- Independent quality check on output (independent from the writing session — the controller didn't write the code, so it evaluates without self-confirmation bias)

**Deterministic orchestration:**

- Spawn headless Claude Code sessions with focused context per task
- Enforce budgets: token spend, wall clock, iteration count
- Validate progress between iterations: read `progress.txt`, check git for actual commits, run tests independently to verify the session's claims. Don't trust the session's self-report — verify it against test results.
- Route to next step once evidence is clear: continue, retry with adjusted context, open a revision step, or escalate

**Artifact guardrail:** Claude Code sessions should not edit artifacts or tests unless the controller explicitly opens a revision step. The session writes application code and updates `progress.txt`. If the session encounters a problem that requires changing the spec or tests, it escalates — it does not silently revise the contract it's building against.

**Skill assignment:** The controller assigns skills to each session based on the task. An extract build session gets the `extract-build` skill plus an explicit active surface (`oracle`, `backend`, or `frontend`) so the session reads the right per-surface reference. Skills are reusable execution playbooks — they carry workflow logic, quality gates, and task-specific guidance that improves how the session performs.

## Agents in this module

Extract runs nine specialized agents across two phases: **ingest** (producing the reversed spec) and **build** (producing the production candidate). The controller dispatches them; each receives a fresh context window loaded with exactly the inputs it needs.

### Ingest phase

Four probes run in parallel to describe the demo from different angles, then two synthesis agents merge and judge the result.

| Agent | Role | Runs |
|---|---|---|
| **extract-ui-walker** | Drives the running demo in a browser. Discovers user journeys, observed API behavior, and design patterns that only surface under real interaction. | In parallel with the other probes |
| **extract-static** | Extracts the declared API contract and data model from source code via static analysis. | In parallel with the other probes |
| **extract-data** | Introspects the live database to describe actual state. Catches where the code's claims and the data's reality disagree. | In parallel with the other probes |
| **extract-external** | Catalogs external dependencies and third-party APIs from source analysis. | In parallel with the other probes |
| **extract-reconciler** | Merges the four probe outputs into a unified specification (the `artifacts/` pack). Resolves conflicts explicitly. | After all four probes |
| **extract-critic** | Judges whether the merged artifacts are sufficient, self-consistent, and usable for build. A fresh-context reviewer that didn't participate in ingest — no skin in the author's work. | After extract-reconciler |

### Build phase

Once ingest produces an approved spec, build decomposes it into vertical slices and iterates through them.

| Agent | Role | Notes |
|---|---|---|
| **extract-build-controller** | Dispatches per-slice executors, runs feedback loops (types, tests, journey tests), and owns the commit cadence. | Optional extract-specific orchestrator; not installed in the core package by default. |
| **extract-plan-reviewer** | A fresh-context skeptic dispatched between the slice plan and the first line of code. Must approve before any slice's Stage 1 runs. | Introduced in probe 2.5 as the structural fix for the self-evaluation failure that recurred across probes 2.2–2.4. |

### Top-level orchestration

| Agent | Role |
|---|---|
| **autoship-controller** | Mode-aware top-level agent. Keeps extract-ingest compatibility while audit/deliver use trigger-first RunRequests, then dispatches the appropriate phase-level agents. |

Each agent's fresh context is the load-bearing property. A stale context window accumulates tool-call artifacts, half-remembered assumptions, and reasoning exhaust — all of which silently degrade output quality. Every handoff in extract is a context reset, not a continuation.

## Executor Mode Options

The execution loop has a natural progression. Each option solves a specific failure mode of the one before it. v1 ships Option A; the others are the roadmap.

### Option A — Single Ralph Loop (Ship this: "Can we converge?")

One Claude Code session per iteration owns implementation. Prove the core thesis: reversed spec + tests + one loop = production candidate.

**Strengths:** simplest orchestration, lowest cost, clear ownership, easiest debugging.
**Weaknesses:** one reasoning path can get stuck, no second opinion, may overfit to weak tests.

### Option B — Ralph + Critic (Next: "Can we trust the output?")

**Trigger:** Option A converges but output quality is inconsistent — code passes tests but the spec itself has gaps, or the session writes workarounds that technically pass but miss intent.

One session writes code. A critic session evaluates the output — not just "does the code match the spec" but "is the spec sufficient?" The critic identifies where the reversed spec is weak, where test coverage has gaps, where assumptions turned out wrong. It proposes spec and test improvements, not just code feedback.

**Purpose:** The biggest risk in autoship is not bad code but a bad spec. If the reversed spec missed an edge case, Option A will happily converge on wrong code that passes wrong tests. A critic that questions the spec is more valuable than a reviewer that only checks code.

**Strengths:** catches spec gaps and test-gaming, improves artifacts over time, independent from the writing session.
**Weaknesses:** higher cost, critic may over-correct, requires clear protocol for when spec changes are accepted.

### Option C — Parallel Slices (Scale: "Can we go faster?")

**Trigger:** The loop + critic work reliably but are too slow for large apps (15+ entities, 30+ endpoints).

Multiple independent Ralph loops run in parallel on separate tracer bullet slices — User CRUD and Post CRUD building simultaneously. The controller orchestrates dependency ordering and merging. Only works when slices are truly independent (which tracer bullet decomposition is designed to produce).

**Purpose:** Scaling. A 30-endpoint backend that takes 30 sequential iterations could run as 5 parallel streams of 6 iterations each.

**Strengths:** faster wall-clock time, natural fit with tracer bullet slicing.
**Weaknesses:** merge conflicts, shared state assumptions between slices, harder debugging.

### Option D — Self-Correcting Loop (Future: "Can we reduce human intervention?")

**Trigger:** The loop works but escalates too often — humans keep getting pulled back in.

When evidence suggests the spec or tests are wrong (e.g., 3 consecutive sessions fail on the same test), the controller proposes a revision rather than just escalating. The human still approves the revision, but the controller does the diagnostic work and presents a concrete fix.

**Purpose:** Automates what the critic identifies manually in Option B. Moves from "human fixes" to "human approves fixes."

**Strengths:** fewer escalations, faster iteration on spec problems, captures the critic's improvement loop.
**Weaknesses:** risk of auto-correcting in the wrong direction, requires high trust in the controller's judgment.

### Recommendation

Ship Option A. The unproven part is not agent coordination — it's whether the reversed spec and tests are strong enough for the loop to converge.

The progression is earned, not planned:

- A fails on quality → upgrade to B (critic catches spec gaps)
- B is too slow → upgrade to C (parallel execution)
- C escalates too much → upgrade to D (self-correction)

Don't build the next option until the current one proves its failure mode.

## Recommended v1 Stack

- **Frontend:** TypeScript app regenerated by Claude Code
- **Backend:** Hono
- **Runtime:** Bun
- **ORM:** Drizzle
- **Database:** Postgres
- **Tests:** Vitest + Playwright

One stack removes complexity in four places: scaffolding, test generation targets, loop configuration, and runtime assumptions. FastAPI support comes later.

## Delivery Shape

### Planned Installation Modes

The original extract product design assumed two workspace modes. Current CLI support is narrower: `autoship init --with-extract` installs the optional extract agents/skills into the current repo. The workspace-rewrite behavior below is retained as product design, not current CLI behavior.

**Mode A — In place (default).** The demo repo is being replaced by the production candidate.

```bash
$ cd ~/projects/my-demo-repo
$ npx autoship init --with-extract
```

What it does: detects existing files, moves them into `prototype/`, scaffolds `artifacts/`, `app/`, `.autoship/`, and commits the reorganization. Preserves git history, remote, and branches. Reversible with `git reset --hard HEAD~1` if the user bails.

**Mode B — Separate workspace (`--from`).** The demo stays alive as its own repo (e.g., for continued prototyping) while autoship produces a separate production workspace.

```bash
$ cd ~/projects
$ npx autoship init --with-extract --from ./my-demo-repo ./my-production-app
```

What it does: creates a new workspace at `./my-production-app`, copies the demo into `prototype/` as a read-only snapshot, scaffolds the rest. Demo repo stays untouched.

### Choosing the Mode

| Team trajectory | Recommended mode |
|---|---|
| Prototype is being replaced, nobody iterates on it further | In place (Mode A) |
| Prototype stays alive as a scratchpad for continued prototyping | Separate (`--from`) |
| Reference-only; prototype is just historical context | Either works; in place is simpler |

The most common early state is "prototype as living scratchpad." In that case, keep it in its own repo with `--from` so autoship's folder structure doesn't pollute the fast-iteration workspace.

### Daily Commands

```bash
$ npx autoship ingest                 # Step 1: extract reversed spec from prototype/
$ npx autoship review                  # Step 2: human reviews artifacts/
$ npx autoship generate-tests          # Step 3: generate oracle tests
$ npx autoship build                   # Step 4: Ralph loop until done
$ npx autoship status                  # progress, blockers, report
```

`build` internally spawns Claude Code sessions — first a frontend rewrite pass, then the backend Ralph loop. `status` shows iteration count, test results, and any escalated blockers.

### Re-initialization

Running `npx autoship init --with-extract` on a workspace that's already initialized fails with an explicit error. Use the extract-specific reingest path to refresh artifacts from an updated prototype once that command exists; until then, re-run extract in a fresh workspace. Separate command, separate intent.

## Why This Architecture

This architecture accepts three realities:

1. The user often does not understand the internals of the vibe-coded app well enough to validate a full technical plan.
2. Claude Code is already strong at local code generation and iterative repair.
3. The missing product value is not "write code." It is "turn a messy demo into reliable artifacts that make code generation converge."

The product owns the artifact pipeline. Claude Code owns execution.

## Non-Goals for v1

- multi-runtime backend support
- unattended CI-first autonomous runs
- production hardening beyond opinionated defaults
- full compliance/security certification
- support for every app category
- preserving original frontend appearance

## Considered and Deferred

Earlier iterations explored ideas that were cut. Kept here to prevent re-derivation.

### Trace-diff oracle with corpus splits

Captured I/O traces from the demo, used byte-diff as the stop condition. **Cut because:** traces freeze stochastic behavior as "ground truth," memorization attacks are trivially gameable, demos encode bugs we don't want to preserve. Replaced by the spec-as-anchor + tests-as-oracle approach.

### L0/L1 containerize / shell around unchanged logic

**Cut because:** Claude Code already does both in roughly one shot.

### Executor mode picker heuristic

Three pluggable strategies with complexity-based auto-selection. **Cut because:** picking between modes is a research project. Ralph alone proves the loop.

### Adversarial LLM reviewer as QC layer

Second LLM with canary injection and structured rejection checklists. **Cut because:** primarily defended against the now-removed trace oracle.

### Determinism audit as a distinct stage

Static + dynamic analysis of nondeterminism sources. **Cut because:** dropped with the trace-diff approach.

### Whole-pipeline regression after every unit port

Swapped each ported unit into the containerized original. **Cut because:** under the spec-as-anchor design, the test suite is the regression harness.

### Production hardening as part of this loop

**Cut because:** productionization applies to any codebase. Bundling it here conflates two products.

### Screenshot comparison against demo visuals

**Cut because:** demo UI is usually ugly. Pixel-matching is fidelity to the wrong target.

### Agent-browser as the primary loop oracle

**Cut because:** browser-agent judgment is too soft to be the main judge of record. Kept only as supplementary QA at loop time (missing affordances, obvious layout breakage, dead screens) and as synthesis-time help for Playwright generation.

### Heavy stage model (DEFINE/PLAN/BUILD/VERIFY/REVIEW/SHIP)

v1 exploration defined a 6-stage vocabulary with backward transitions and controller routing logic. **Simplified to 4 steps** because the stage model added formalism without changing what the system actually does. The 4 steps (ingest, review, generate tests, build) describe the same flow without the overhead. If the system later needs complex routing (e.g., automatic spec revision when tests reveal a broken assumption), the stage model can be reintroduced from the v1 doc.

### 3-tier skill model

v1 exploration organized skills into domain, engineering, and decomposition tiers with a mapping table. **Simplified because** skills are consumed at session level — the controller assigns them, the session follows them. The tier taxonomy didn't change how skills are used.

### Formal mutable/protected surfaces

v1 exploration defined explicit categories of what the execution agent may and may not edit. **Simplified to a guardrail rule** in the controller section: sessions don't edit artifacts or tests unless the controller opens a revision step. Same protection, less framework.

### Per-run dispatch-plan files

Discovered during probe 01 when a `phase1-dispatch-plan.md` was generated to externalize the controller's decisions for advisor review. **Cut because:** the controller's source code is the authoritative protocol. A per-run plan file would be a second source of truth that could drift from code, and it encodes decisions that are already implicit in the controller's default behavior. Forensic needs are served by the per-run `prompts/`, `logs/`, and `decisions.log` under `.autoship/runs/{ts}/`, which record what *actually executed* rather than what was *planned*.

## Immediate Next Experiment

Before building the full tool, run one manual end-to-end probe:

1. Pick one real vibe-coded LLM app
2. Extract the artifact set manually or semi-manually
3. Generate a test suite from the artifacts
4. Use Claude Code locally to rewrite the frontend
5. Use Claude Code locally in a Ralph loop for the backend
6. Record where the process fails

Measure:

- How much of the reversed spec had to be invented
- Whether the generated tests were actually useful as an oracle
- Whether the frontend rewrite from the spec is straightforward
- Whether the backend Ralph loop converges without constant human rescue
- What escalations occur most often

If this experiment fails, the architecture should be revised before building product scaffolding around it.
