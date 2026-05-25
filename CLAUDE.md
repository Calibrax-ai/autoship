# CLAUDE.md

This is the **monorepo root** CLAUDE.md. Two packages live here:

- **`packages/core/`** — the published autoship CLI + Claude Code agents and skills.
  Operator-facing guidance: read [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md).

- **`packages/runner/`** — the private Trigger.dev / Cloud Run remote runner.
  Operator-facing guidance: read [`packages/runner/AGENTS.md`](packages/runner/AGENTS.md).

When working on a task, `cd` into the relevant package first and treat its CLAUDE.md / AGENTS.md as the source of truth. Cross-package work (consolidation, shared contracts) is rare; when it happens, plans live under [`packages/core/docs/plans/`](packages/core/docs/plans/) for now (a follow-up will lift repo-wide plans to a top-level `docs/`).

## Workspace commands

From monorepo root:

```bash
npm install        # hoists deps across packages
npm test           # runs tests in every workspace that defines `test`
npm run typecheck  # same, for typecheck
```

Per-package commands (`npm publish` for core, `trigger deploy` for runner, etc.) live in each package's scripts and should be run from inside that package.

## Repo shape

```
autoship/                       # monorepo root
├── packages/
│   ├── core/                   # @cs-calibrax/autoship (published)
│   └── runner/                 # autoship-runner (private)
├── package.json                # workspaces declaration only
└── package-lock.json           # hoisted root lockfile
```

## Cross-package contracts (not yet enforced in code)

Per `docs/plans/2026-05-25-monorepo-consolidation.md`, the runner_handoff schema and `autoship/<id>` branch convention remain duplicated as prose + per-package code in this phase. A follow-up PR (`packages/types/`) will turn them into compile-checked shared types; until then, treat the CONTRACTS document in the archived autoship-runner repo as canonical and keep both packages in sync manually.
