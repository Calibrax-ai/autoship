# autoship v0.1 — Controller Design

One-page design for the first shipable controller. Scope is deliberately narrow: automate the 4-phase ingest protocol validated in probe 01. Oracle-assembly, review, and build come in later versions.

## Scope

**In:** `./autoship.sh ingest` (full ingest, end-to-end) and `./autoship.sh status` (reads progress.txt). The `npx autoship` wrapper comes with packaging in a later version — for v0.1, direct bash invocation.

**Out (deferred to later versions):** `review`, `generate-tests`, `build`, `init`, retry/self-healing, E2B sandbox, multi-run parallelism, CLI polish.

## Process architecture

Controller runs on the host as a single bash script. Executors run via `claude -p` subprocesses, one per phase step. The prototype runs inside Docker compose (trusted local isolation).

```
host/
  autoship.sh (bash state machine)
    │
    ├── spawns ──► claude -p "$(cat prompt.md)"   (executor subprocess)
    │                 │
    │                 └── has access to: prototype/ (ro), artifacts/ (rw), .autoship/runs/{ts}/ (rw)
    │
    └── shells out ──► docker compose             (prototype stack)
```

The controller reads/writes the artifact tree and progress.txt natively on host. Only the prototype is sandboxed — the controller and executors are trusted processes.

**Why bash, not Agent SDK, for v0.1.** The four probe prompts are long but static; prompt composition is trivial (cat a template, substitute a few paths). State between phases is linear. Parallel fan-out is `& wait`. Progress tracking is sed on a markdown file. Bash expresses all of this cleanly in ~150 lines. Agent SDK's typed layer doesn't buy anything for this shape — it would add days of scaffolding and a dependency we'd have to maintain. Port to Agent SDK when oracle-assembly or the build loop genuinely need structured JSON threading between phases, not before. "Earn complexity with specific pain."

## State machine

```
  BOOT ──► FANOUT ──► RECONCILE ──► CRITIC ──► DONE
    │         │           │            │
    └─ fail ──┴─ fail ────┴─ fail ─────┴─► FAILED
```

Machine state lives in **marker files**, not `progress.txt`:
- `.autoship/current-run` — text file holding the active run id (for resume).
- `.autoship/runs/<run-id>/state/phase_<name>.done` — touch-file written only after *artifact verification passes* for that phase. Subprocess exit code alone does not produce a marker.
- `.autoship/runs/<run-id>/started_at` — ISO timestamp captured at run creation.

**A phase is complete iff its `phase_<name>.done` marker exists.** That's the only source of truth the controller consults. `progress.txt` is rendered from these markers whenever the controller wants to show a status view; it is never parsed to decide what to do next.

**Resume semantics:**
- On restart, if `.autoship/current-run` points at an existing run dir, resume it. Else start new.
- Rerun the first incomplete phase from the top. No partial resume within a phase.
- Completed phases (markers present) are skipped entirely, reusing prior outputs.
- Before re-entering an incomplete phase, clear that phase's owned outputs so the attempt starts clean. Never touch prior-phase outputs.

**Artifact-validated completion (important).** `claude -p` can exit nonzero *after* writing complete artifacts (e.g., the session hits a rate limit and the final summary message is replaced by an error). The controller records the exit-code anomaly in `decisions.log` but marks the phase complete if every expected artifact exists and is non-empty. This is the lesson from probe-1.

**Non-success CRITIC verdicts** (escalate-to-human, rerun-probes) still produce `phase_critic.done` because the report was written. The verdict itself is the critic's deliverable; the controller does NOT auto-rerun or auto-escalate in v0.1.

## Phase execution

| Phase | Mechanism | Claude spawns |
|---|---|---|
| BOOT | Pure bash: runtime detection, env check, `docker compose up -d --wait`, boot-report.json write | 0 |
| FANOUT | Four backgrounded `claude --agent <role>` calls. `wait` per pid (never dies on first nonzero exit). | 4 (parallel) |
| RECONCILE | One `claude --agent reconciler` call reading probe outputs only | 1 |
| CRITIC | One `claude --agent critic` call reading merged artifacts only | 1 |

For each spawn, bash runs `claude --agent "$role" --add-dir "$PROJECT_DIR" -p "$(run_context)"` from `$AUTOSHIP_ROOT` (for agent discovery). The `-p` prompt provides dynamic paths (Skill, Prototype, Artifacts, Boot report). Agent definitions in `.claude/agents/` provide static identity (role instructions, tool restrictions, maxTurns) as system-prompt-level context — not user-message injection. `env -u CLAUDECODE` strips the nesting guard. After all spawns complete, `verify_artifacts <phase>` decides whether to `mark_done <phase>`.

**Screenshot policy.** `artifacts/screenshots/` from `ui-walker` are best-effort evidence, not a hard-gated phase-completion requirement. They are useful for auditability and later visual reference, but the reconciler treats them as optional reference only. Phase 1 completion is gated on the core structured artifacts (`user-journeys.json`, `api-spec.observed.json`, `api-spec.declared.json`, `data-model.declared.json`, `data-model.actual.json`, `external-contracts.json`, `design.md`), not on screenshot capture succeeding in the current environment.

## Agent definitions

Agent definitions live in `.claude/agents/*.md` (Claude Code's native convention). Each is a thin wrapper (~35 lines) with YAML frontmatter (tool restrictions, maxTurns, permissionMode) and a Markdown body (role identity, mandatory reads, hard rules restated for emphasis, rerun pointer). The authoritative role contract (owned outputs, allowed/forbidden inputs, rerun semantics, summary format) lives in `SKILL.md` §Role Contracts.

**Why `.claude/agents/`, not `skills/.../prompts/`.** Agent files get system-prompt-level authority (identity, not request), declarative tool restrictions via frontmatter, and compatibility with both the bash runner (`--agent`) and interactive Claude Code sessions (Track 2). `envsubst` template rendering is eliminated — dynamic paths are passed via `-p`.

## Progress.txt format

A **derived view**, never parsed by the controller. `render_progress()` reads the marker files and writes `progress.txt` from scratch each call — no in-place editing, no awk surgery. Schema stays minimal:

```
# autoship / ingest (run 2026-04-15T12-21-ingest)
state: running
started: 2026-04-15T12:21:03Z
current: fanout

phases:
- [x] boot
- [~] fanout
- [ ] reconcile
- [ ] critic

run detail: .autoship/runs/2026-04-15T12-21-ingest/
decisions:  .autoship/runs/2026-04-15T12-21-ingest/decisions.log
```

`[x]` means the phase's `phase_*.done` marker exists; `[~]` means the current (in-progress) phase; `[ ]` means pending. Forensic detail lives in the run folder — `progress.txt` stays cheap to read.

## Codebase layout

Minimal. No new top-level directories.

```
autoship/
  autoship.sh                          # the runner (one file, ~240 lines)
  .claude/
    agents/                            # agent definitions (Claude Code native)
      ui-walker.md
      static.md
      data.md
      external.md
      reconciler.md
      critic.md
  skills/
    reverse-spec-extraction/
      SKILL.md                         # authoritative protocol + output schemas
    backend-rewrite-loop/SKILL.md
    blocker-escalation/SKILL.md
    frontend-regeneration/SKILL.md
    oracle-assembly/SKILL.md
  docs/
    2026-04-14-architecture.md
    autoship-proposal.html
    v01-controller-design.md           # this doc
```

**Why `.claude/agents/`, not `skills/.../prompts/`.** Agent files are Claude Code native — they get system-prompt authority, declarative tool restrictions via YAML frontmatter, and work with both the bash runner (`--agent`) and interactive sessions. Other skills (oracle-assembly, backend-rewrite-loop) will add their own agents to the same directory. The runner doesn't need `envsubst` or a template rendering step.

**Why one file, not four phase files.** Four `.sh` files for a linear 4-phase state machine is over-modularized. The whole flow is ~150 lines; phases are functions inside `autoship.sh`. The runner reads `.autoship/progress.txt` to know the last-completed phase and resumes via a `case` jump — three lines of bash, not a multi-file orchestration layer.

**No `program.md`.** The protocol is encoded twice already (once in `SKILL.md` as the human/LLM-facing spec, once in `autoship.sh` as the executable orchestrator). A third instruction file (`program.md`) would create drift between it and the bash — the same second-source-of-truth problem we just cut with per-run dispatch plans. `SKILL.md` describes *what* the protocol does; `autoship.sh` *is* the protocol as executable code. That's the boundary.

## Stack decisions (tactical, one-line)

- Shell: **bash** (assume modern bash 4+ or zsh-compat)
- Executor: **`claude --agent <role> -p`** (CLI's non-interactive mode with agent identity; `--add-dir` for project access, `env -u CLAUDECODE` for nesting guard)
- JSON parsing (when needed): **`jq`**
- Sandbox driver (v0.1): **shell-out to `docker compose`**, wrapped in a small helper function so v0.2 can swap in E2B without rewiring the state machine
- Testing: **manual re-run against the probe 01 prototype** for v0.1. Formal test harness comes with v0.2.

## Non-goals

- No web UI, no daemon, no scheduling.
- No authentication; v0.1 assumes local use only.
- No cross-run parallelism (one ingest run at a time per project dir).
- No retry. Failed run = human inspects, re-invokes.
- No oracle/build wiring — those come later.

## Exit criteria for v0.1

1. Running `./autoship.sh ingest` against the probe 01 prototype produces the same 8 artifacts we generated by hand in ~30 min wall time with no manual intervention beyond boot-env setup.
2. Running it against a different prototype (probe 02 fixture) produces a new, correct artifact set without controller code changes.
3. Killing the controller mid-phase and restarting resumes from the next phase with no duplicated subagent spawns.
4. `./autoship.sh status` shows a current, accurate picture during and after a run.

If 1–3 pass, v0.1 is done. v0.2 adds oracle-assembly.
