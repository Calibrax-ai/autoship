# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Nature

autoship v0.1 is a **bash orchestrator + agent definitions** that automates a 4-phase ingest protocol (boot → fanout → reconcile → critic). The controller (`autoship.sh`) spawns Claude agents via `claude --agent <role> -p` and tracks state with marker files.

## Start Here

Use autoship in one of two modes:

- **`extract` today** — operational via `autoship.sh ingest ...` or the existing `controller` agent in extract-ingest mode.
- **`deliver` today** — operational in two shapes:
  - **controller-backed phase 3 runtime** through draft PR: `claude --agent controller -p "deliver"` from the testbed root (reads `.autoship/program.md`)
  - **manual fallback** via `pre-groomer` + `brief-reviewer` dispatched directly

Important boundary:

- **`teach-autoship.md`** and **`program.md`** are **controller-only** artifacts.
- You do **not** need them for the manual `deliver` fallback.
- The checked-in `.claude/agents/controller.md` is mode-aware for `extract ingest` and `deliver` through draft PR.

## Key Files

- `autoship.sh` — the controller (single-file state machine, ~240 lines)
- `.claude/agents/` — agent definitions:
  - **Ingest probes** (Phase 1): ui-walker, static, data, external
  - **Ingest synthesis**: reconciler, critic
  - **Orchestration**: controller — one top-level controller role. Supports extract-ingest and deliver-through-draft-PR today. Track/mode comes from `program.md`, not a separate agent file. `build-controller` is a transitional extract-specific orchestrator; collapsing into `controller` is deferred until observed value.
  - **Build review**: plan-reviewer — fresh-context skeptic dispatched between slice-plan and Stage 1 oracle (probe-2.5 onward)
  - **Deliver grooming**: pre-groomer, brief-reviewer — generator-evaluator pair for issue grooming (probes 0.1 onward). Used directly in manual fallback and dispatched by `controller` in deliver phase-3 mode.
  - **Deliver build**: stage1-executor, stage2-executor — frozen-oracle and implementation workers for deliver phase 3. Controller owns worktree/branch/PR; workers own only code/test writes plus stage artifacts.
- `skills/reverse-spec-extraction/SKILL.md` — authoritative protocol, output schemas, role contracts
- `teach-autoship.md` — controller-only stable operating knowledge shared by the controller across modes. Read by the controller before consulting its per-run `program.md`. Contains generator-evaluator discipline, workflow-surface ownership, per-mode phase machines, stop conditions, NEVER STOP posture.
- `docs/architecture/deliver-program-template.md` — reference shape for the per-repo `.autoship/program.md` the controller reads in deliver mode. Commit one to each testbed; manual fallback does not need it.
- `docs/architecture/extract-architecture.md` — canonical architecture proposal for the `extract` track.
- `docs/architecture/autoship-extract-proposal.html` — HTML presentation of the `extract` architecture. **Must be kept in sync with the extract architecture doc.**
- `docs/architecture/deliver-architecture.md` — architecture proposal for the `deliver` track.
- `docs/architecture/autoship-deliver-proposal.html` — HTML presentation of the `deliver` architecture. **Must be kept in sync with the deliver architecture doc.**
- `docs/learnings.md` — cross-track synthesis. Updated after each probe completes.
- `docs/extract-learnings.md` — detailed learnings for the `extract` track.
- `docs/deliver-learnings.md` — detailed learnings for the `deliver` track.
- `docs/harness-philosophy.md` — synthesis on prompt + tools + artifacts design. Reads Anthropic's harness-design article and applies to autoship. Source of the generator-evaluator pattern + mechanical-vs-judgment dividing rule.
- `docs/plan-reviewer-calibration.md` — labeled few-shot cases the plan-reviewer scores against. Operator overrides become new cases; calibration grows over time.
- `docs/archive/agent-prompt-review.md` — superseded review (kept as institutional memory of the "add more grep gates" wrong turn). The supersede note at the top explains why; the body explains what.
- `skills/` — five autoship-specific skill packs that the product will ship. They are deliverables, not skills for operating on this repo.

## Running the Ingest

The ingest (`autoship.sh ingest <project-dir>`) takes 30-60 minutes (4 parallel agent spawns + reconciler + critic). The Bash tool has a **hard 10-minute timeout cap** — you cannot run ingest in foreground.

**Method:**
1. Start ingest with `run_in_background: true` (bypasses the 10-min cap):
   ```
   Bash(command: "./autoship.sh ingest /path/to/project 2>&1", run_in_background: true)
   ```
2. Read the run ID: `cat <project>/.autoship/current-run`
3. Monitor progress with the Monitor tool watching `decisions.log`:
   ```
   Monitor(
     command: 'DECISIONS="<project>/.autoship/runs/<run-id>/decisions.log"; tail -F "$DECISIONS" 2>/dev/null | grep -E --line-buffered "phase=|role=|ERROR|exit="',
     timeout_ms: 3000000,
     persistent: false
   )
   ```
4. After completion, check artifacts and `progress.txt` for results.

**Do NOT** run ingest in foreground Bash — it will be killed at 10 minutes mid-fanout.

### Track 2: controller.md Agent (interactive/autonomous)

The controller agent IS the orchestrator — no bash wrapper. Follows karpathy/autoresearch's program.md pattern: thin instructions, the agent figures out mechanics.

```
claude --agent controller --add-dir /path/to/project -p "ingest /path/to/project"
```

Same state model as Track 1 (marker files, artifacts, agent definitions). Both tracks coexist — use Track 1 for CI/headless, Track 2 for interactive/autonomous runs.

### Deliver phase 3 runtime

The controller drives deliver work from backlog to draft PR. The whole contract lives in `.autoship/program.md` at the testbed root — one checked-in file per repo.

From the testbed root:

```
claude --agent controller -p "deliver"              # resume whatever's in flight
claude --agent controller -p "deliver FRD-162"      # restrict this run to one issue
```

The controller reads `program.md`, finds eligible work, and drives each issue through groom → review → `Ready` → (human promotes to `Building`) → Stage 1 → Stage 2 → validate → commit → push → draft PR → `In Review`.

Current scope is intentionally narrow: Linear-first backlog + build pickup from `Building`, local runtime mirror under `.autoship/issues/<id>/`, serial only, draft PR yes (merge no).

See `docs/architecture/deliver-program-template.md` for the `program.md` shape.

## Running the Build (probe-2.5 onward)

The build-controller dispatches the per-slice executors. Per-probe directories live one level up at `/Users/shyangcalibrax/Documents/Projects/autoship-probe-<N.M>/`. Each probe carries its own `program.md`, `decisions.md`, `progress.txt`, `artifacts/`, and per-slice `app/` + `oracle/`.

```
claude --agent build-controller \
  --add-dir /path/to/probe-N.M \
  --add-dir /Users/shyangcalibrax/Documents/Projects/autoship \
  -p "build /path/to/probe-N.M"
```

The second `--add-dir` to the autoship repo is required so the build-controller can dispatch the `plan-reviewer` agent with access to `docs/plan-reviewer-calibration.md`.

**Conflict warning:** all probes share the same Postgres container (`autoship-pg` on `:5432`), the same dev-server ports (3001, 5173), and the same `/tmp/oracle-prompt.txt`. Do not run two probes simultaneously without isolating ports + DB + Docker container name.

## Probe renaming (2026-04-18)

Probes were renamed from 2.5/2.6/2.7/2.8/2.9 → 2.1/2.2/2.3/2.4/2.5 for consistency. Git commit messages reference the old numbers and are not rewritten. Mapping:

| Old | New | What it tested |
|---|---|---|
| probe-2.5 | probe-2.1 | Build-controller + stronger oracle + vertical slices |
| probe-2.6 | probe-2.2 | Playwright journey tests added to oracle |
| probe-2.7 | probe-2.3 | Journey-based slicing + atomic-task verification |
| probe-2.8 | probe-2.4 | Sample-data + screenshot-as-layout-contract + forcing-function gates |
| probe-2.9 | probe-2.5 | plan-reviewer agent (generator-evaluator pattern) |

Claude Code session history for the old probe dirs lives under `~/.claude/projects/-Users-shyangcalibrax-Documents-Projects-autoship-probe-2-{5,6,7,8,9}/` — these are not renamed; they remain as historical reference.

## Project Philosophy

- **The hard part is artifact extraction, not code generation.** The product value is in turning a messy demo into a reliable spec, not in writing code. Claude Code is already strong at implementation.
- **Don't add structure before the experiment proves it's needed.** The architecture has been simplified from an over-engineered earlier version. Resist reintroducing stage vocabularies, skill tier taxonomies, routing state machines, or other formalism unless a concrete observed problem demands it.
- **Every additional file is a surface for inconsistency — earn your separation.** Artifacts get their own file only when the structured format produces measurably better code generation AND inlining would make the PRD too long.
- **The Ralph loop's power is simplicity — resist complicating the execution plane.** The controller is where complexity lives. Sessions should see a focused PRD + progress.txt + their specific artifacts.
- **Controller is independent from the writing session**, not "unbiased" in an absolute sense. It shares blind spots with the system that generated the tests — honest framing matters.
- **Don't accumulate gates as the default fix-for-failures.** Probes 2.6 → 2.7 → 2.8 ran the same loop three times: observe failure → add forcing-function gate → controller absorbs the gate (passes its letter while reproducing the failure under a more creative label) → new failure shape. The structural fix is to separate the author from the judge (generator-evaluator pattern, `plan-reviewer` agent, calibration set), not to add more gates. When you observe a failure mode, first ask: *is this caused by gate coverage, or by self-evaluation?* If the controller authored AND discharged the gate, the answer is usually self-evaluation. See `docs/harness-philosophy.md`.
- **Mechanical → grep; judgment → reviewer.** The dividing rule for what kind of check belongs where. If the rule sounds the same when the tools change ("journey works end-to-end on seeded data = slice done"), it's a criterion the reviewer judges. If it's written in terms of specific tool invocations (`grep -rE 'preventDefault\(\)\s*;[^{}]*closeDialog\(\)' app/`), it's a recipe the controller runs. Default to judgment via reviewer; allow recipes only when the check is purely pattern-matching with no contextual evidence-weighing required.

## Editing Conventions

- **The `Considered and Deferred` appendix is institutional memory.** When a new direction is rejected or simplified, document it there with a `Cut because:` reason. Do not remove existing entries — they prevent future instances from re-proposing cut ideas.
- **Executor Mode Options (A–D) are a roadmap, not alternatives.** Each option solves a failure mode of the one before it (A: converge → B: critic → C: parallel → D: self-correct). Don't promote later options without a concrete reason.
- **Options sections belong at the architectural level, not the tactical level.** Surface trade-off analysis for agent topology, decomposition strategy, executor modes. For stack picks (framework, ORM, runtime), a one-line pick list is enough — no comparison table.
- **When editing the extract architecture doc, update the HTML proposal in the same pass.** They drift quickly otherwise.

## Key References Already Reviewed

These shaped the design — future instances can assume these are known, don't re-fetch unless verifying specifics.

**The external-state convergence loop** — autoship's execution pattern is an instance of a structural pattern that independently emerged in two fields (coding and ML research). The convergence itself is evidence the pattern is sound, which is why autoship frames it as "the pattern" and Ralph as "coding's instantiation":
- [ghuntley.com/loop/](https://ghuntley.com/loop/) — Ralph loop, coined by Geoffrey Huntley
- [snarktank/ralph](https://github.com/snarktank/ralph) — reference implementation for coding
- [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — same structure, derived independently for ML research
- Shared structural traits: fresh context per iteration, declarative goal state, external state persistence, deterministic feedback, single-writer single-process. Multi-agent fan-out is rejected by both precedents.

**Ralph practical setup** — [aihero.dev/getting-started-with-ralph](https://www.aihero.dev/getting-started-with-ralph) and [aihero.dev/tips-for-ai-coding-with-ralph-wiggum](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum) cover feedback loops (typecheck, tests, lint, Playwright, pre-commit hooks), progress file contents, stop mechanics (`<promise>COMPLETE</promise>` signal, iteration caps, stall detection, escalation), HITL vs AFK modes, and priority ordering (architectural decisions first, polish last).

**Tracer bullets decomposition** — [skills.sh/oakoss/agent-skills/tracer-bullets](https://skills.sh/oakoss/agent-skills/tracer-bullets). Vertical slices through all layers, first slice sets conventions. Baked into PRD task ordering, not formal infrastructure.

**Engineering skill library** — [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). 20 general-purpose skills across DEFINE/PLAN/BUILD/VERIFY/REVIEW/SHIP phases — the vocabulary convergence is not accidental. These are the "Tier 2" engineering skills that would attach under autoship's domain skills.
