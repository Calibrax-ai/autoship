# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Repository Nature

autoship v0.1 is an **audit + deliver agent framework** for turning repo evidence and approved work into reviewed, executable delivery artifacts. Repo policy (`.autoship/standards.yaml`) is owned by the `autoship init` CLI, not the controller.

Extract has been retired from the live product. Its old implementation and research notes are archived under `docs/archive/extract/`; do not treat them as runnable product guidance.

## Start Here

**`autoship init`** handles setup. It scaffolds `.claude/agents/`, `.claude/skills/`, `.autoship/standards.yaml` (with high-confidence values inferred from repo evidence), and `.autoship/defaults.yaml`. Re-running on an existing `.autoship/` prints an advisory of fills and conflicts based on current evidence — it never modifies the file. Operators own `.autoship/standards.yaml` after first install (same shape as Claude Code's `/init` on an existing CLAUDE.md).

The controller handles three runtime modes: `audit`, `groom`, `deliver`. Invocation is trigger-first: pass flags or a natural-language prompt. No run-config file authoring is required.

- **`audit`** — `autoship audit --report-only` or `autoship audit --tracker=linear --approve`
- **`groom`** — `autoship groom FRD-162` or `autoship "get all Todo issues assigned to me and start grooming"`. Writes specs locally under `.autoship/issues/<id>/`; `--post` mirrors the final summary to Linear.
- **`deliver`** — `autoship deliver FRD-162` (the explicit human approval that promotes a reviewed spec into build), `autoship deliver FRD-162 --dry-run` (plan, no push/PR), `autoship deliver --unattended` (strict machine mode: only operates on issues in `states.build`, refuses fuzzy NL scope).
- **manual deliver fallback** — dispatch `deliver-pre-groomer` + `deliver-spec-reviewer` directly when you only need a spec and review.

Important boundaries:

- **No `.autoship/program.md`** — live autoship uses triggers, defaults, and standards. If a prompt asks autoship to use `program.md`, treat it as unsupported.
- **`.autoship/standards.yaml`** is repo-local policy: hosting, CI, observability, secrets, release expectations. Use `.env.example` as evidence of current repo shape, not as policy.
- **`.autoship/defaults.yaml`** is optional per-repo run defaults (v2 schema): exactly one source block (`deliver.linear` or `deliver.folder`); for Linear, `team_key` + optional `project` + `owner: me` + `states.groom` (default `["Todo"]`) + `states.build` (default `["Spec Ready"]`); plus `deliver.validation.commands`. PR defaults (draft, `origin`, detected default branch) are implicit. `deliver.confirm: true` (default) keeps the `[y/N]` prompt on query/batch runs; set to `false` to proceed immediately after the preview (per-run `--yes` is the one-shot override). Flags always win; `--report-only` and `--tracker=none` override audit stickies.
- **Deliver state-as-baton.** Deliver mirrors handoffs to Linear via two operator-created states beyond the universal set: `Spec Ready` (unstarted, between Todo and In Progress) signals "your turn — review the spec and run `autoship deliver <id>`"; `Needs Attention` (unstarted, parallel column) signals "your turn — autoship halted on a blocker." Default `--post: true` fires a state change + @mention comment per milestone; `--no-post` suppresses both. State transitions are best-effort: if a target state is missing, the comment still posts. Canonical Linear policy table lives in `.claude/agents/autoship-controller.md § Linear policy`.
- **`.claude/agents/autoship-controller.md`** holds the stable operating discipline, RunRequest contract, workflow-surface ownership, generator-evaluator separation, disk-backed state, and per-mode procedure.

## Key Files

- `bin/autoship.mjs` — native CLI: `init`, `audit`, `groom`, `deliver`, bare-prompt forwarding, and `interactive`. All non-init commands spawn `claude --agent autoship-controller` with the right prompt.
- `cli/init.mjs` — scaffolds live core agents/skills, `.autoship/standards.yaml`, and commented `.autoship/defaults.yaml`.
- `cli/infer-standards.mjs` — heuristic inference of standards.yaml fields from repo evidence (used by both `init` and `standards`).
- `.claude/agents/autoship-controller.md` — controller for audit, groom, and deliver.
- `.claude/agents/audit-auditor.md`, `.claude/agents/audit-reviewer.md` — generator-evaluator pair for readiness assessment and issue-candidate review.
- `.claude/agents/deliver-pre-groomer.md`, `.claude/agents/deliver-spec-reviewer.md` — generator-evaluator pair for issue grooming.
- `.claude/agents/deliver-oracle-writer.md`, `.claude/agents/deliver-implementation.md` — frozen-oracle and implementation workers for deliver.
- `.claude/skills/autoship-audit/` — audit protocol, assessment template, review rubric, and safe external exposure reference.
- `.claude/skills/deliver-grooming/` — deliver spec schema and review rubric.
- `.claude/skills/reviewing/` — shared reviewer discipline.
- `.claude/skills/blocker-escalation/` — blocker report template, category enum, and lint script.
- `docs/architecture/audit-architecture.md` — audit lifecycle and handoff boundary.
- `docs/architecture/audit-tracker-sync.md` — opt-in Linear audit issue sync, dedup, and regression detection.
- `docs/architecture/deliver-architecture.md` — deliver phase machine, state transitions, and approval boundaries.
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
npm pack --dry-run --json
```

Installer smoke:

```bash
rm -rf /tmp/autoship-smoke
mkdir /tmp/autoship-smoke
cd /tmp/autoship-smoke
git init
node /Users/shyangcalibrax/Documents/Projects/autoship/bin/autoship.mjs init
find .claude/agents -maxdepth 1 -name '*.md' | wc -l
find .claude/skills -mindepth 1 -maxdepth 1 -type d | wc -l
test -f .autoship/standards.yaml
test -f .autoship/defaults.yaml
test ! -e .autoship/program.md
```

Expected default install: 7 agents, 4 skills, standards/defaults present, no `program.md`.

Controller smoke:

```bash
claude --agent autoship-controller -p "audit --report-only"
```

Init advisory smoke (re-run on existing .autoship/):

```bash
node /Users/shyangcalibrax/Documents/Projects/autoship/bin/autoship.mjs init
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
