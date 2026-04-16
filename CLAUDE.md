# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Nature

autoship v0.1 is a **bash orchestrator + agent definitions** that automates a 4-phase ingest protocol (boot → fanout → reconcile → critic). The controller (`autoship.sh`) spawns Claude agents via `claude --agent <role> -p` and tracks state with marker files.

## Key Files

- `autoship.sh` — the controller (single-file state machine, ~240 lines)
- `.claude/agents/` — 6 agent definitions (ui-walker, static, data, external, reconciler, critic)
- `skills/reverse-spec-extraction/SKILL.md` — authoritative protocol, output schemas, role contracts
- `docs/v01-controller-design.md` — controller design doc
- `docs/2026-04-14-architecture.md` — canonical architecture proposal. Source of truth for design changes.
- `docs/autoship-proposal.html` — HTML presentation of the architecture. **Must be kept in sync with the architecture doc.**
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

## Project Philosophy

- **The hard part is artifact extraction, not code generation.** The product value is in turning a messy demo into a reliable spec, not in writing code. Claude Code is already strong at implementation.
- **Don't add structure before the experiment proves it's needed.** The architecture has been simplified from an over-engineered earlier version. Resist reintroducing stage vocabularies, skill tier taxonomies, routing state machines, or other formalism unless a concrete observed problem demands it.
- **Every additional file is a surface for inconsistency — earn your separation.** Artifacts get their own file only when the structured format produces measurably better code generation AND inlining would make the PRD too long.
- **The Ralph loop's power is simplicity — resist complicating the execution plane.** The controller is where complexity lives. Sessions should see a focused PRD + progress.txt + their specific artifacts.
- **Controller is independent from the writing session**, not "unbiased" in an absolute sense. It shares blind spots with the system that generated the tests — honest framing matters.

## Editing Conventions

- **The `Considered and Deferred` appendix is institutional memory.** When a new direction is rejected or simplified, document it there with a `Cut because:` reason. Do not remove existing entries — they prevent future instances from re-proposing cut ideas.
- **Executor Mode Options (A–D) are a roadmap, not alternatives.** Each option solves a failure mode of the one before it (A: converge → B: critic → C: parallel → D: self-correct). Don't promote later options without a concrete reason.
- **Options sections belong at the architectural level, not the tactical level.** Surface trade-off analysis for agent topology, decomposition strategy, executor modes. For stack picks (framework, ORM, runtime), a one-line pick list is enough — no comparison table.
- **When editing the architecture doc, update the HTML proposal in the same pass.** They drift quickly otherwise.

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
