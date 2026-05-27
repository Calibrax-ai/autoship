# autoship monorepo

Two packages, one workspace.

- **`packages/core/`** — `@cs-calibrax/autoship`, the published CLI + Claude Code agents and skills. See [`packages/core/README.md`](packages/core/README.md).
- **`packages/runner/`** — `autoship-runner`, the private Trigger.dev / Cloud Run service that handles Linear-triggered runs. See [`packages/runner/README.md`](packages/runner/README.md).

## Install (end users)

```bash
# Recommended (v0.6.0+):
curl -fsSL https://raw.githubusercontent.com/Calibrax-ai/autoship/main/install.sh | bash

# Legacy npm path (still supported):
npx @cs-calibrax/autoship init
```

After install, `cd` into a git repo and run `autoship init`. This installs the autoship agents and skills into that repo. No knowledge of the monorepo is needed to use autoship — only contributors need the monorepo shape.

## Develop (contributors)

```bash
npm install        # hoists workspace deps to monorepo root
npm test           # runs tests in every workspace that defines `test`
npm run typecheck  # same, for typecheck
```

Per-package commands (publish, deploy, dev) live in each package's own scripts.

## Docs

Per-package architecture and operating discipline live inside each package's `docs/` and `CLAUDE.md`. Plans (including the consolidation plan and follow-ups) currently live at [`packages/core/docs/plans/`](packages/core/docs/plans/) — a follow-up will lift repo-wide plans to a top-level `docs/` directory.

## History

The monorepo was consolidated on 2026-05-25 from two repos:
- `Calibrax-ai/autoship` → `packages/core/` (full history preserved via `git mv`)
- `Calibrax-ai/autoship-runner` → `packages/runner/` (history squashed via `git subtree add --squash`; full history remains at the archived GitHub repo)

Plan: [`packages/core/docs/plans/2026-05-25-monorepo-consolidation.md`](packages/core/docs/plans/2026-05-25-monorepo-consolidation.md).
