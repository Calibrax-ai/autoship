---
title: "monorepo consolidation: autoship + autoship-runner"
---

**Status:** Plan · **Last updated:** 2026-05-25 · **Scope:** minimal merge (no types extraction, no architectural additions)

> **Goal.** Combine `autoship-project/autoship/` and `autoship-project/autoship-runner/` into a single workspaces-based monorepo at `autoship-project/autoship/`. Preserve git history of both. Preserve all live deploys (Trigger.dev project ref, Cloud Run service, npm publish target). Do NOT introduce new abstractions (adapter, model_tier, bash CLI, shared types) — those land as separate follow-up PRs in the consolidated repo. `autoship-pm-bot/` stays untouched in this phase; it migrates later as part of the grid-crew project.

## Why this plan exists

Today's `autoship-project/` has three repos with documented cross-cutting contracts (`CONTRACTS.md`). The runner and the CLI are the two tightest-coupled — they share the `runner_handoff` envelope, the `autoship/<id>` branch convention, and Linear state names. Merging them eliminates the silent-drift hazard between those two, with no behavior change.

The pm-bot is the third coupled surface but it's already destined for grid-crew (separate project). It keeps its constants duplicated during this phase; a CI test asserts they match the new monorepo. Drift hazard is closed when pm-bot migrates to grid-crew.

## Scope cut — what this plan does and does not

**Does:**
- Combine the two repos under one workspace
- Preserve git history (via `git subtree add`)
- Preserve npm publish target (`@cs-calibrax/autoship`), Trigger.dev project ref, Cloud Run service name
- Each package remains independently buildable — no workspace deps between packages in this phase

**Does NOT:**
- Extract `CONTRACTS.md` surfaces into `packages/types/` (deferred — introduces a workspace dep that breaks the current Docker build context. See follow-up #1.)
- Introduce `packages/adapter/` (L2 abstraction — separate follow-up)
- Introduce `runners.yaml` reading in the controller (separate follow-up — runners.yaml is already scaffolded by init)
- Introduce `model_tier:` in agent frontmatter (separate follow-up)
- Migrate to bash CLI / curl install (`docs/plans/2026-05-19-bash-cli-design.md`, separate follow-up)
- Touch `autoship-pm-bot/` (deferred to grid-crew project)
- Migrate the Cloud Run pm-bot service (untouched)

If any of those creep into this PR, stop and split.

## Pre-work (~30 min)

Before touching anything in `autoship-project/`:

1. **Snapshot live deploy state.** Run `gcloud run services describe autoship-pm-bot --region asia-southeast1 --format yaml > /tmp/cloudrun-snapshot.yaml` and `trigger.dev project info > /tmp/trigger-snapshot.json` (or equivalent). Verify: webhook URLs, secrets, project refs, env vars. Saving for rollback reference.
2. **Verify clean state in both repos.** `cd autoship && git status` (should be clean — no uncommitted changes). Same for `autoship-runner`. If dirty: commit or stash before proceeding.
3. **Verify no in-flight Linear/Trigger.dev runs.** Check Trigger.dev dashboard for running tasks. If any: wait for completion or note that the consolidation may interrupt them.
4. **Check deploy dashboard paths.** Note Trigger.dev's configured project root (will need to change to `packages/runner/`). Same for Vercel if used. Record the values for the post-merge update.
5. **Create a working branch in autoship.** `cd autoship && git checkout -b feature/consolidate-runner-monorepo`.

**Verification:** `git status` shows clean tree on the new branch.

## Phase 1: workspace scaffold (~1 hr)

The destination shape:

```
autoship/                           # this repo, post-consolidation
├── packages/
│   ├── core/                       # everything currently at autoship/ root
│   │   ├── bin/autoship.mjs
│   │   ├── cli/
│   │   ├── .claude/
│   │   ├── templates/
│   │   ├── docs/architecture/
│   │   └── package.json            # name: @cs-calibrax/autoship (unchanged)
│   └── runner/                     # was autoship-project/autoship-runner/
│       ├── src/
│       ├── api/
│       ├── trigger.config.ts
│       ├── Dockerfile
│       ├── vercel.json
│       └── package.json            # name: autoship-runner (unchanged, private)
├── docs/
│   ├── architecture/               # repo-wide architecture docs
│   └── plans/                      # plan docs (this file, etc.)
├── package.json                    # root: workspace config only
├── CLAUDE.md                       # repo-wide
└── README.md
```

### Tasks

1. **Choose workspace tool.** Recommendation: `npm workspaces` (zero new tools — autoship already uses npm). If a future need pushes toward pnpm/turborepo, that's a separate PR. Verification: `npm --version` >= 10.
2. **Move current `autoship/` files into `packages/core/`.**
   - `mkdir -p packages/core`
   - `git mv bin cli .claude templates docs/architecture site README.md CLAUDE.md package.json package-lock.json .gitignore packages/core/`
   - Use `git mv` per top-level entry as listed.
   - Skip `node_modules/`, `dist/`, `.git/`. They regenerate.
3. **Create root `package.json` with workspaces declaration.**
   ```json
   {
     "name": "autoship-monorepo",
     "private": true,
     "workspaces": ["packages/*"],
     "scripts": {
       "build": "npm run build --workspaces --if-present",
       "test": "npm run test --workspaces --if-present",
       "typecheck": "npm run typecheck --workspaces --if-present"
     }
   }
   ```
4. **Create root `.gitignore`** with workspace-aware entries (`node_modules/` in any package, `dist/`, `.trigger/`, etc.).
5. **Verify packages/core/ still functions standalone.** `cd packages/core && node bin/autoship.mjs init --help` should print help. `npm pack --dry-run` should produce a tarball with the same files as before the move.

**Verification:** `npm pack --dry-run --workspace=packages/core` produces a tarball with the same file count as v0.5.15 had.

## Phase 2: subtree-merge autoship-runner (~1 hr)

Use `git subtree add` to bring autoship-runner's history into the monorepo under `packages/runner/`.

### Tasks

6. **Add autoship-runner as a remote and fetch.**
   ```bash
   cd autoship  # current monorepo working dir
   git remote add runner-source ../autoship-runner
   git fetch runner-source
   ```
7. **Subtree merge into `packages/runner/`.**
   ```bash
   git subtree add --prefix=packages/runner runner-source main --squash
   ```
   `--squash` keeps the commit history compact; drop it if you want full per-commit history (larger graph, more reflog churn). For minimal-merge, prefer `--squash`.
8. **Remove the remote** (it was only needed for the subtree add).
   ```bash
   git remote remove runner-source
   ```
9. **Verify packages/runner/ contents.** `ls packages/runner/` should show: `src/`, `api/`, `trigger.config.ts`, `Dockerfile`, `Makefile`, `vercel.json`, `package.json`, etc. Match against the original `autoship-runner/` directory listing.

**Verification:** `diff -rq autoship-project/autoship-runner packages/runner --exclude=node_modules --exclude=.git --exclude=.trigger --exclude=runs` returns no output (modulo expected misses).

## Phase 3: deploy preservation (~1 hr)

Make sure the live services keep working. Each package builds in isolation (no cross-package workspace deps in this PR), so deploys are a path update only.

### Tasks

10. **npm publish dry-run for packages/core.**
    - `cd packages/core && npm pack --dry-run --json | jq '.files | length'`
    - Compare file count to v0.5.15. Should match (we moved files, didn't add or remove).
    - Verify `files:` field in package.json still resolves correctly relative to `packages/core/`.
11. **Trigger.dev deploy verification.**
    - `cd packages/runner && trigger info` (or equivalent) — verify project ref unchanged.
    - **Update Trigger.dev dashboard:** project root path from repo root → `packages/runner/`. Without this update, deploys triggered from the dashboard will fail to find `trigger.config.ts`.
    - `trigger deploy --dry-run` if Trigger.dev supports it; otherwise confirm config files at correct paths.
12. **Cloud Run / Vercel verification.**
    - `packages/runner/Dockerfile` likely has `COPY . .` — verify it still works with `packages/runner/` as build context. Since this PR has no workspace deps, the Dockerfile is unchanged.
    - `vercel.json` similarly — verify root paths still resolve. **Update Vercel project settings if it specifies a root directory** (point to `packages/runner/`).
13. **pm-bot impact check.**
    - pm-bot lives in `autoship-project/autoship-pm-bot/` (untouched by this PR).
    - It reads `runner_handoff` schema by string parsing (no import dependency on autoship-runner).
    - It reads branch convention by regex (no import dependency on autoship).
    - **No code change needed in pm-bot** for this phase. Drift hazard remains until pm-bot migrates to grid-crew.

**Verification:**
- npm pack file count matches v0.5.15
- Trigger.dev config resolves at `packages/runner/trigger.config.ts`
- Dockerfile builds from `packages/runner/` context (`docker build -t test packages/runner/`)

## Phase 4: cleanup (~30 min)

### Tasks

14. **Delete the original `autoship-runner/` directory.**
    - `cd ..` (out of monorepo)
    - `rm -rf autoship-runner` (preserves nothing local since git history is now in the monorepo via subtree)
    - If autoship-runner has its own remote GitHub repo: archive it on GitHub (don't delete — keeps history accessible) and point its README at the new monorepo location.
15. **Update root `README.md`** with the new monorepo shape: brief description of each package, install instructions per package, link to docs.
16. **Update root `CLAUDE.md`** to point to per-package CLAUDE.md files (today packages/core/CLAUDE.md is the operator-facing one).
17. **Commit the consolidation as one coherent commit** (or sequence: scaffold → subtree merge → deploy verify → cleanup, if you want reviewable chunks).

**Verification:**
- `git log --oneline -10` shows the consolidation chain
- `npm install` from monorepo root succeeds, hoists deps correctly
- `npm run typecheck` from root passes for all workspaces
- `npm run test` from root passes for all workspaces

## Post-merge follow-ups (separate PRs, in priority order)

These were deliberately excluded from this PR. Each is independent and can land when convenient:

1. **packages/types extraction** — pull `CONTRACTS.md` surfaces 2+3 (runner_handoff schema, branch convention, Linear state constants) into a `packages/types/` package as compile-checked types. Adds workspace dep to runner; **requires Dockerfile rewrite** (build from monorepo root, multi-stage copy of types). ~1-2 days including Docker test. The reason this is its own PR: it changes how the runner is built, not just where it lives.
2. **packages/adapter** — extract the L2 dispatch logic (read runners.yaml, resolve model_tier, spawn agent). Today implicit in autoship-controller prompt + autoship-runner's `runner/autoship.ts`. ~1 week.
3. **model_tier abstraction** — replace `model: "opus[1m]"` in agent frontmatter with `model_tier: high`; runners.yaml provides the tier→model map. ~2 days.
4. **bash CLI (v0.7.0)** — per `docs/plans/2026-05-19-bash-cli-design.md`. ~1 week.
5. **standards-inferrer agent** — push standards.yaml inference out of `packages/core/cli/infer-standards.mjs` into a new agent. ~3-4 days (couples with bash CLI work).
6. **pm-bot migration to grid-crew** — separate project, separate plan. Read CONTRACTS.md surface 1 from `packages/types` after migration; close the drift hazard.

## Risks and rollback

- **Trigger.dev deploy breaks after path move.** Mitigation: dashboard project-root update in Phase 3; rollback is `git reset --hard` to pre-consolidation on the feature branch.
- **Vercel deploy breaks after path move.** Same shape as above — dashboard root-directory update in Phase 3.
- **npm pack file shape diverges from v0.5.15.** Mitigation: file-count compare in Phase 3. Should be impossible if we only `git mv` (no add/remove), but cheap to verify.
- **Subtree merge produces unexpected history conflicts.** Mitigation: `--squash` collapses runner history into one commit; conflicts are rare with `--squash`. If full history needed, omit `--squash` but expect a larger graph.
- **pm-bot silently breaks because its CONTRACTS assumptions drifted.** Won't happen in this PR (no contract changes); will need attention during pm-bot's grid-crew migration.
- **Docker workspace-dep break.** Won't happen in this PR — packages/types is deferred, so no workspace deps cross packages. Will need attention in follow-up #1.

## Calendar estimate

**~3-4 hours for one focused engineer** if no deploy surprises. Allocate a buffer for the dashboard updates. **Half day realistic.**

## Open question for the operator

- **Workspace tool**: npm workspaces (zero new tools) vs pnpm (faster installs, better hoisting) vs yarn berry (PnP, more disruptive). Default plan assumes **npm workspaces**. Override if you want pnpm — adds ~30 min for `pnpm-workspace.yaml` and config tweaks but doesn't change the merge logic.
- **Subtree squash**: `--squash` (one commit for runner's history) vs no squash (full history). Default plan assumes **--squash** — simpler graph; runner's commit history is internal plumbing and the agent prompts (the IP) live in `packages/core/` with their own preserved history.

Both default choices are reversible if you want to revisit later.
