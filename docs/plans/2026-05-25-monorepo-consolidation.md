---
title: "monorepo consolidation: autoship + autoship-runner"
---

**Status:** Plan · **Last updated:** 2026-05-25 · **Scope:** minimal merge (no architectural additions)

> **Goal.** Combine `autoship-project/autoship/` and `autoship-project/autoship-runner/` into a single workspaces-based monorepo at `autoship-project/autoship/`. Preserve git history of both. Preserve all live deploys (Trigger.dev project ref, Cloud Run service, npm publish target). Do NOT introduce new abstractions (adapter, model_tier, bash CLI) — those land as separate follow-up PRs in the consolidated repo. `autoship-pm-bot/` stays untouched in this phase; it migrates later as part of the grid-crew project.

## Why this plan exists

Today's `autoship-project/` has three repos with documented cross-cutting contracts (`CONTRACTS.md`). The runner and the CLI are the two tightest-coupled — they share the `runner_handoff` envelope, the `autoship/<id>` branch convention, and Linear state names. Merging them eliminates the silent-drift hazard between those two, with no behavior change.

The pm-bot is the third coupled surface but it's already destined for grid-crew (separate project). It keeps its constants duplicated during this phase; a CI test asserts they match the new monorepo. Drift hazard is closed when pm-bot migrates to grid-crew.

## Scope cut — what this plan does and does not

**Does:**
- Combine the two repos under one workspace
- Preserve git history (via `git subtree add`)
- Extract `CONTRACTS.md` surfaces 2+3 (branch convention, runner_handoff schema) into a new `packages/types/` package as compile-checked types
- Preserve npm publish target (`@cs-calibrax/autoship`), Trigger.dev project ref, Cloud Run service name
- Update CONTRACTS.md to reflect the new shape (some surfaces demoted to internal)

**Does NOT:**
- Introduce `packages/adapter/` (L2 abstraction — separate follow-up)
- Introduce `runners.yaml` reading in the controller (separate follow-up — runners.yaml is already scaffolded by init)
- Introduce `model_tier:` in agent frontmatter (separate follow-up)
- Migrate to bash CLI / curl install (`docs/plans/2026-05-19-bash-cli-design.md`, separate follow-up)
- Touch `autoship-pm-bot/` (deferred to grid-crew project)
- Add `packages/adapter` shared dispatch logic (deferred)
- Migrate the Cloud Run pm-bot service (untouched)

If any of those creep into this PR, stop and split.

## Pre-work (~30 min)

Before touching anything in `autoship-project/`:

1. **Snapshot live deploy state.** Run `gcloud run services describe autoship-pm-bot --region asia-southeast1 --format yaml > /tmp/cloudrun-snapshot.yaml` and `trigger.dev project info > /tmp/trigger-snapshot.json` (or equivalent). Verify: webhook URLs, secrets, project refs, env vars. Saving for rollback reference.
2. **Verify clean state in both repos.** `cd autoship && git status` (should be clean — no uncommitted changes). Same for `autoship-runner`. If dirty: commit or stash before proceeding.
3. **Verify no in-flight Linear/Trigger.dev runs.** Check Trigger.dev dashboard for running tasks. If any: wait for completion or note that the consolidation may interrupt them.
4. **Create a working branch in autoship.** `cd autoship && git checkout -b feature/consolidate-runner-monorepo`.

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
│   ├── runner/                     # was autoship-project/autoship-runner/
│   │   ├── src/
│   │   ├── api/
│   │   ├── trigger.config.ts
│   │   ├── Dockerfile
│   │   ├── vercel.json
│   │   └── package.json            # name: autoship-runner (unchanged, private)
│   └── types/                      # NEW — extracted from CONTRACTS.md
│       ├── src/
│       │   ├── runner-handoff.ts   # AutoshipRunPayload zod schema (moved from runner)
│       │   ├── branch-convention.ts# autoship/<id> regex + writer
│       │   └── linear-states.ts    # state name constants
│       └── package.json            # name: @autoship/types (private)
├── docs/
│   ├── architecture/               # repo-wide architecture docs (current `autoship/docs/architecture/`)
│   └── plans/                      # plan docs (this file, etc.)
├── package.json                    # root: workspace config only
├── pnpm-workspace.yaml             # or npm workspaces if you prefer
├── CLAUDE.md                       # repo-wide, points to per-package CLAUDE.md if added later
└── README.md
```

### Tasks

1. **Choose workspace tool.** Recommendation: `npm workspaces` (zero new tools — autoship already uses npm). If a future need pushes toward pnpm/turborepo, that's a separate PR. Verification: `npm --version` >= 10.
2. **Move current `autoship/` files into a temp staging dir, then to `packages/core/`.**
   - `mkdir -p packages/core`
   - `git mv bin cli .claude templates docs/architecture site README.md CLAUDE.md package.json package-lock.json .gitignore packages/core/`
   - Wait — `git mv` of directories with many files is slow; use `git mv` per top-level entry as listed.
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

## Phase 3: extract shared types (~2 hrs)

CONTRACTS.md surfaces 2 and 3 become TS code in `packages/types/`.

### Tasks

10. **Create `packages/types/` package skeleton.**
    - `mkdir -p packages/types/src`
    - `packages/types/package.json` with name `@autoship/types`, version `0.1.0`, private: true, main: `src/index.ts`, types declarations
    - `packages/types/tsconfig.json` extending root config
11. **Move `runner_handoff` schema from runner to types.**
    - Today: `packages/runner/src/types.ts` defines `AutoshipRunPayload` zod schema
    - Move to: `packages/types/src/runner-handoff.ts`
    - Re-export from `packages/types/src/index.ts`
    - Update `packages/runner/src/*.ts` imports: `from "../types.js"` → `from "@autoship/types"`
    - Add `@autoship/types` to `packages/runner/package.json` dependencies as a workspace dep: `"@autoship/types": "workspace:*"`
12. **Codify branch convention as a TS export.**
    - Create `packages/types/src/branch-convention.ts` with:
      - `BRANCH_PATTERN = /^autoship\/([A-Z]{2,}-\d+)$/` (the regex consumers use)
      - `buildBranchName(issueId: string): string` (the writer pattern controller uses — for docs reference, not for replacing the controller's prose)
      - `extractIssueIdFromBranch(branch: string): string | null` (the consumer helper pm-bot uses)
    - Re-export from `index.ts`
    - Document the prose contract (today in CONTRACTS.md) as a JSDoc comment
13. **Codify Linear state names as constants.**
    - Create `packages/types/src/linear-states.ts` with:
      - `AUTOSHIP_STATES` const object: `{ runAgent: "Run Agent", breakdownProposed: "Breakdown Proposed", breakdownApproved: "Breakdown Approved", needsAttention: "Needs Attention" }` (controller-written states)
      - `AUTOSHIP_TRIGGER_STATES` const object: `{ auto: "Run Agent", createIssues: "Breakdown Approved", build: "Spec Ready" }` (states that trigger runner) — names match runner's env-var defaults
    - Re-export from `index.ts`
    - These are the **default** names; runner env vars (`AUTOSHIP_LINEAR_AUTO_STATE` etc.) still override at runtime. Constants are the documented defaults + the contract surface name pm-bot will consume.
14. **Update CONTRACTS.md.** Demote surfaces 2 and 3 to "internal — see `packages/types/`." Keep surface 1 (Linear state names) as-is since it's still operator-config-driven, but note the default constants live in `packages/types`.

**Verification:**
- `npm run typecheck --workspace=packages/types`
- `npm run typecheck --workspace=packages/runner` (validates the import refactor)
- `npm test --workspace=packages/runner` (existing tests pass with new import paths)

## Phase 4: deploy preservation (~1 hr)

Make sure the live services keep working.

### Tasks

15. **npm publish dry-run for packages/core.**
    - `cd packages/core && npm pack --dry-run --json | jq '.files | length'`
    - Compare file count to v0.5.15. Should match (we moved files, didn't add or remove).
    - Verify `files:` field in package.json still resolves correctly relative to `packages/core/`.
16. **Trigger.dev deploy verification.**
    - `cd packages/runner && trigger info` (or equivalent) — verify project ref unchanged.
    - `trigger deploy --dry-run` if Trigger.dev supports it; otherwise just confirm config files at correct paths.
17. **Cloud Run / Vercel verification.**
    - The runner's `Dockerfile` may reference paths assuming repo root. Verify `Dockerfile` works from `packages/runner/` context. If it does `COPY . .`, that's fine. If it references parent paths, adjust.
    - `vercel.json` similarly — verify root paths still resolve under workspace structure.
18. **pm-bot impact check.**
    - pm-bot lives in `autoship-project/autoship-pm-bot/` (untouched by this PR).
    - It currently reads `runner_handoff` schema by string parsing (no import dependency on autoship-runner).
    - It reads branch convention by regex (no import dependency on autoship).
    - **No code change needed in pm-bot** for this phase. Drift hazard remains until pm-bot migrates to grid-crew.

**Verification:**
- npm pack file count matches v0.5.15
- Trigger.dev config resolves at `packages/runner/trigger.config.ts`
- Dockerfile builds from `packages/runner/` context (`docker build -t test packages/runner/`)

## Phase 5: cleanup (~30 min)

### Tasks

19. **Delete the original `autoship-runner/` directory.**
    - `cd ..` (out of monorepo)
    - `rm -rf autoship-runner` (preserves nothing local since git history is now in the monorepo via subtree)
    - If autoship-runner has its own remote GitHub repo: archive it on GitHub (don't delete — keeps history accessible) and point its README at the new monorepo location.
20. **Update root `README.md`** with the new monorepo shape: brief description of each package, install instructions per package, link to docs.
21. **Update root `CLAUDE.md`** to point to per-package CLAUDE.md files if any (today packages/core/CLAUDE.md is the operator-facing one).
22. **Commit the consolidation as one coherent commit** (or sequence: scaffold → subtree merge → types extract → deploy verify → cleanup, if you want reviewable chunks).

**Verification:**
- `git log --oneline -10` shows the consolidation chain
- `npm install` from monorepo root succeeds, hoists deps correctly
- `npm run typecheck` from root passes for all workspaces
- `npm run test` from root passes for all workspaces

## Post-merge follow-ups (separate PRs, in priority order)

These were deliberately excluded from this PR. Each is independent and can land when convenient:

1. **packages/adapter** — extract the L2 dispatch logic (read runners.yaml, resolve model_tier, spawn agent). Today implicit in autoship-controller prompt + autoship-runner's `runner/autoship.ts`. ~1 week.
2. **model_tier abstraction** — replace `model: "opus[1m]"` in agent frontmatter with `model_tier: high`; runners.yaml provides the tier→model map. ~2 days.
3. **bash CLI (v0.7.0)** — per `docs/plans/2026-05-19-bash-cli-design.md`. ~1 week.
4. **standards-inferrer agent** — push standards.yaml inference out of `packages/core/cli/infer-standards.mjs` into a new agent. ~3-4 days (couples with bash CLI work).
5. **pm-bot migration to grid-crew** — separate project, separate plan. Read CONTRACTS.md surface 1 from `packages/types` after migration; close the drift hazard.

## Risks and rollback

- **Trigger.dev deploy breaks after path move.** Mitigation: verify in Phase 4 before committing the cleanup. If it breaks, rollback is `git reset --hard` to the pre-consolidation commit on the feature branch.
- **npm pack file shape diverges from v0.5.15.** Mitigation: file-count compare in Phase 4. Should be impossible if we only `git mv` (no add/remove), but cheap to verify.
- **Subtree merge produces unexpected history conflicts.** Mitigation: `--squash` collapses runner history into one commit; conflicts are rare with `--squash`. If full history needed, omit `--squash` but expect a larger graph.
- **pm-bot silently breaks because its CONTRACTS assumptions drifted.** Won't happen in this PR (no contract changes); will need attention during pm-bot's grid-crew migration.

## Calendar estimate

**~1 working day for one focused engineer** if no deploy surprises. Allocate a buffer day for the deploy verification dance. **2 days realistic.**

## Open question for the operator

- **Workspace tool**: npm workspaces (zero new tools) vs pnpm (faster installs, better hoisting) vs yarn berry (PnP, more disruptive). Default plan assumes **npm workspaces**. Override if you want pnpm — adds ~30 min for `pnpm-workspace.yaml` and config tweaks but doesn't change the merge logic.
- **Subtree squash**: `--squash` (one commit for runner's history) vs no squash (full history). Default plan assumes **--squash** — simpler graph; runner's commit history is internal plumbing and the agent prompts (the IP) live in `packages/core/` with their own preserved history.

Both default choices are reversible if you want to revisit later.
