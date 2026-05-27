# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Repository Nature

autoship v0.1 is an **audit + deliver agent framework** for turning repo evidence and approved work into reviewed, executable delivery artifacts. Repo policy (`.autoship/standards.yaml`) is owned by the `autoship init` CLI, not the controller.

Extract has been retired from the live product. Its old implementation and research notes are archived under `docs/archive/extract/`; do not treat them as runnable product guidance.

## Start Here

**`autoship init`** handles setup. It scaffolds `.claude/agents/`, `.claude/skills/`, `.autoship/standards.yaml` (with high-confidence values inferred from repo evidence), and `.autoship/defaults.yaml`. Re-running on an existing `.autoship/` prints an advisory of fills and conflicts based on current evidence — it never modifies the file. Operators own `.autoship/standards.yaml` after first install (same shape as Claude Code's `/init` on an existing CLAUDE.md).

The controller handles runtime verbs: `audit`, `groom`, `deliver`, `create-issues` (`materialize` compatibility alias). Invocation is trigger-first: pass flags or a natural-language prompt. No run-config file authoring is required.

- **`audit`** — `autoship audit --report-only` or `autoship audit --tracker=linear --approve`
- **`groom`** — `autoship groom FRD-162` or `autoship "get all Todo issues assigned to me and start grooming"`. Writes specs locally under `.autoship/issues/<id>/`; `--post` mirrors the final summary to Linear. For umbrella-shaped issues, grooming produces `decomposition.md` instead of `spec.md` and routes to `deliver-decomposition-reviewer`.
- **`deliver`** — `autoship deliver FRD-162` (the explicit human approval that promotes a reviewed spec into build), `autoship deliver FRD-162 --dry-run` (plan, no push/PR), `autoship deliver --unattended` (strict machine mode: only operates on issues in `states.build`, refuses fuzzy NL scope).
- **`create-issues`** — `autoship create-issues FRD-161` (or compatibility alias `autoship materialize FRD-161`). Reads an approved breakdown from `decomposition.md` on the latest `autoship/<id>` branch and creates Linear child issues per the V1 contract (per-slice idempotent, partial-failure-tolerant, closes the `[Breakdown]` PR on full success). It refuses unresolved `blocking` questions, applies `defaulted` questions, copies `slice-local` questions into child issues, and moves dependency-free children to `Run Agent`. The verb invocation or `Breakdown Approved` state transition is the explicit consent for tracker mutation.
- **manual deliver fallback** — dispatch `deliver-pre-groomer` + `deliver-spec-reviewer` (or `deliver-decomposition-reviewer` for umbrella outcomes) directly when you only need a spec/decomposition and review.

Important boundaries:

- **No `.autoship/program.md`** — live autoship uses triggers, defaults, and standards. If a prompt asks autoship to use `program.md`, treat it as unsupported.
- **`.autoship/standards.yaml`** is repo-local policy: hosting, CI, observability, secrets, release expectations. Use `.env.example` as evidence of current repo shape, not as policy.
- **`.autoship/defaults.yaml`** is optional per-repo *overrides* (v3 schema, 0.3.0+): autoship infers source, scope, and validation from repo evidence at runtime; `defaults.yaml` exists for explicit overrides only. Schema (all blocks optional): exactly one source block (`deliver.linear` or `deliver.folder`); for Linear, `team_key` + optional `project` + `owner: me` + `states.groom` (default `["Todo"]`) + optional supervised `states.build` (default `["Spec Ready"]` only when strict build mode is requested); `deliver.validation.commands` to lock down a specific gate. PR defaults (draft, `origin`, detected default branch) are implicit. `deliver.confirm: false` (default) makes query/batch runs proceed immediately after the preview; set to `true` to require a `[y/N]` pause (per-run `--yes` is the one-shot opposite). Flags always win; `--report-only` and `--tracker=none` override audit stickies.
- **Runtime inference** (0.3.0+): when source/scope/validation are missing from `defaults.yaml`, the controller infers them from repo evidence (`linear auth list` + `.autoship/issues/`, `linear team list`, `package.json`/`Makefile`/`pyproject.toml`/`Cargo.toml`). Each inference is announced at run start and logged structurally to `.autoship/runs/<run-id>/inferences.jsonl` per the schema in `docs/architecture/decision-log.md`. Real ambiguity (multi-team workspace, no detectable test infra) halts the run with a `kind: halt-on-ambiguity` record. `--unattended` mode gates inference paths — strict config-as-truth for machine runs.
- **Deliver state-as-baton.** Deliver mirrors handoffs to Linear only when posting is enabled. Local runs are local-first; pass `--post` to emit state changes + @mention comments, and remote runners may pass `--post` as policy. Recommended remote states are `Run Agent` (agent may analyze and, if clear, build), `Breakdown Proposed` (review the breakdown PR), `Breakdown Approved` (create child issues and start dependency-free slices), and `Needs Attention` (human unblock). `Spec Ready` remains optional supervised compatibility, not the default remote path. State and label are orthogonal axes (state = baton; label = artifact kind). State transitions are best-effort: if a target state is missing, the comment still posts. Canonical Linear policy table lives in `.claude/agents/autoship-controller.md § Linear policy`.
- **`.claude/agents/autoship-controller.md`** holds the stable operating discipline, RunRequest contract, workflow-surface ownership, generator-evaluator separation, disk-backed state, and per-mode procedure.

## Key Files

- `bin/autoship` — bash CLI entry point (Phase 1 of v0.7.0 migration). Handles `audit`, `groom`, `deliver`, `create-issues`, `materialize`, `interactive`, and bare-prompt forwarding via a 3-line `claude --agent autoship-controller` dispatch. Pure bash — no Node.js needed for these verbs. Delegates `init` to `bin/autoship.mjs` (transitional; Phase 3 replaces init with bash too).
- `bin/autoship.mjs` — transitional: still owns the `init` verb. Will be replaced in Phase 3 of the bash CLI migration. Non-init dispatch was moved to `bin/autoship` in v0.7.0 Phase 1.
- `cli/init.mjs` — scaffolds live core agents/skills, `.autoship/standards.yaml`, and commented `.autoship/defaults.yaml`.
- `cli/infer-standards.mjs` — heuristic inference of standards.yaml fields from repo evidence (used by both `init` and `standards`).
- `.claude/agents/autoship-controller.md` — controller for audit, groom, and deliver.
- `.claude/agents/audit-auditor.md`, `.claude/agents/audit-reviewer.md` — generator-evaluator pair for readiness assessment and issue-candidate review.
- `.claude/agents/deliver-pre-groomer.md`, `.claude/agents/deliver-spec-reviewer.md` — generator-evaluator pair for bounded-issue grooming.
- `.claude/agents/deliver-decomposition-reviewer.md` — fresh-context judge of `decomposition.md` for umbrella issues (auto-routed from grooming when umbrella shape is detected).
- `.claude/agents/deliver-oracle-writer.md`, `.claude/agents/deliver-oracle-reviewer.md` — generator-evaluator pair for the frozen oracle artifact.
- `.claude/agents/deliver-implementation.md` — implementation worker for deliver.
- `.claude/agents/ui-walker.md` — runtime UI journey executor for deliver verification; dispatched after `deliver-implementation` when the oracle declares `ui_journeys`. Observes; does not judge. Outputs evidence pack to `.autoship/issues/<id>/ui-walker/`.
- `.claude/skills/autoship-audit/` — audit protocol, assessment template, review rubric, and safe external exposure reference.
- `.claude/skills/deliver-grooming/` — deliver spec schema and review rubric.
- `.claude/skills/reviewing/` — shared reviewer discipline.
- `.claude/skills/blocker-escalation/` — blocker report template, category enum, and lint script.
- `.claude/skills/ui-walking/` — oracle-anchored UI journey execution: posture, journey lifecycle, evidence rubric, failure taxonomy. Consumed by `ui-walker`.
- `.claude/skills/test-driven-development/` — vendored from [obra/superpowers](https://github.com/obra/superpowers) (MIT). RED-GREEN-REFACTOR discipline; autoship-anchored to the frozen oracle. Consumed by `deliver-implementation`.
- `.claude/skills/systematic-debugging/` — vendored from obra/superpowers (MIT). 4-phase root-cause discipline; autoship-anchored to `deliver-pre-groomer`'s Bug reproduction phase and `reproduction-status` output enum.
- `.claude/skills/receiving-code-review/` — vendored from obra/superpowers (MIT). Discipline for worker re-dispatch with REJECTED-verdict objections; push-back routes through `blocker-escalation`, not direct rebuttal.
- `docs/architecture/audit-architecture.md` — audit lifecycle and handoff boundary.
- `docs/architecture/audit-tracker-sync.md` — opt-in Linear audit issue sync, dedup, and regression detection.
- `docs/architecture/deliver-architecture.md` — deliver phase machine, state transitions, and approval boundaries.
- `docs/architecture/decision-log.md` — `inferences.jsonl` schema, append discipline, and how operators read the runtime inference trail.
- `docs/architecture/decomposition.md` — umbrella-issue breakdown lifecycle, typed question schema, breakdown-review rubric, and the `create-issues` contract (0.5.0).
- `docs/architecture/system-overview.md` — top-level live system shape.
- `docs/learnings.md`, `docs/deliver-learnings.md` — current learnings.
- `docs/archive/extract/` — retired extract implementation and research archive.
- `site/` — Starlight documentation site. Content is sourced from `docs/` via symlink `site/src/content/docs -> ../../../docs`.

## Operating Model

Autoship keeps a clear split between outer workflow surfaces and inner execution artifacts.

- **Outer workflow surface**: Linear/GitHub/Slack/future UI for human-visible state, approval, comments, priority, and lineage.
- **Inner execution contract**: repo-local specs, oracle artifacts, reviews, evidence, run-local state, and validation outputs.

Workers produce artifacts and structured results. The controller owns tracker mutations and state transitions. Workers do not write to Linear or GitHub directly.

Generator-evaluator separation is load-bearing:

- audit-auditor writes; audit-reviewer judges.
- deliver-pre-groomer writes; deliver-spec-reviewer judges.
- deliver-oracle-writer writes the frozen test contract; deliver-implementation must satisfy it without mutating it.
- controller-owned verification checks the final implementation before PR creation.

Mechanical checks belong in the controller. Judgment belongs in reviewers.

## Common Commands

Framework checks:

```bash
node --check cli/init.mjs
node --check bin/autoship.mjs
shellcheck bin/autoship
test/bash-dispatch.sh                    # bash vs .mjs dispatch parity
npm pack --dry-run --json
```

Installer smoke (from monorepo root):

```bash
rm -rf /tmp/autoship-smoke
mkdir /tmp/autoship-smoke
cd /tmp/autoship-smoke
git init
/path/to/autoship/packages/core/bin/autoship init
find .claude/agents -maxdepth 1 -name '*.md' | wc -l
find .claude/skills -mindepth 1 -maxdepth 1 -type d | wc -l
test -f .autoship/standards.yaml
test -f .autoship/defaults.yaml
test ! -e .autoship/program.md
```

Expected default install: 10 agents, 8 skills, standards/defaults present, no `program.md`.

Controller smoke:

```bash
claude --agent autoship-controller -p "audit --report-only"
# Or, via the bash CLI:
AUTOSHIP_PRINT=1 bin/autoship audit --report-only    # echo the resolved command
bin/autoship audit --report-only                      # run it
```

Init advisory smoke (re-run on existing .autoship/):

```bash
/path/to/autoship/packages/core/bin/autoship init
```

## Editing Conventions

- Keep the live product surface small. New behavior should strengthen standards, audit, or deliver.
- Do not reintroduce `program.md` as live config. Use prompt flags, `.autoship/defaults.yaml`, and `.autoship/standards.yaml`.
- Keep stable framework knowledge in agent/skill files; keep per-run intent in `RunRequest` and run artifacts.
- Add files only when they remove real ambiguity or preserve evidence that would otherwise be lost.
- Update docs and CLI guidance together when changing invocation shape.
- Archived extract material is historical. Move useful lessons into live docs only when they directly improve audit or deliver.

## References Already Reviewed

These shaped the design. Future instances can assume they are known unless verifying specifics.

- [ghuntley.com/loop/](https://ghuntley.com/loop/) — Ralph loop, coined by Geoffrey Huntley.
- [snarktank/ralph](https://github.com/snarktank/ralph) — reference implementation for coding.
- [karpathy/autoresearch](https://github.com/karpathy/autoresearch) — same external-state convergence loop, independently derived for ML research.
- [skills.sh/oakoss/agent-skills/tracer-bullets](https://skills.sh/oakoss/agent-skills/tracer-bullets) — vertical slices through all layers.
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) — general-purpose engineering skill vocabulary.
