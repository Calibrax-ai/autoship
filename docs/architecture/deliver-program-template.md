# program.md — deliver-controller run contract (template)

**Purpose:** the run-scoped contract for one deliver-controller invocation. Tells the controller: which testbed, which issues, what approval mode, what to halt on.

Stable knowledge (how autoship works in general) lives in `teach-autoship.md`. This file is per-run: what THIS run should do.

Copy this template to your run dir (e.g., `autoship-deliver-0.6/program.md` or `finance_backend_agent/program.md` for real work), fill in the values, then dispatch the deliver-controller.

---

## Run identity

```yaml
run_id: <e.g., "deliver-0.6" or "frd-161d-bank-migration">
operator: <your name or handle>
started_at: <ISO timestamp>
mode: supervised | auto   # default: supervised for v0.1 controller
```

---

## Testbed

```yaml
testbed: /absolute/path/to/app/or/worktree
  # Either:
  #   /Users/you/Projects/some-repo (real repo, real branch)
  #   /Users/you/Projects/some-probe/app (worktree for probe work)
pinned_sha: <git SHA the run is anchored to>
git_branch: <current branch; 'detached' if worktree at SHA>
stack: <short description; e.g., "Bun + Hono + Drizzle + React 19 + Vite + Tailwind">
frontend_test_runner: <playwright-e2e | vitest | none>
backend_test_runner: <bun-test | jest | none>
```

---

## Issue source

Pick ONE of the three modes:

### Mode A — Linear MCP pull (team has Linear integration)

```yaml
issue_source: linear
linear:
  team: <team name, e.g., "Delivery">
  project: <project name, e.g., "Gridfin">
  eligible_states: [Todo, In Progress]   # only issues in these states are picked up
  eligible_labels: []                    # optional: only pick up issues with these labels
  max_concurrent: 1                      # how many issues to groom in parallel (start with 1)
  single_issue: FRD-162                  # optional: restrict to one specific issue for this run
```

### Mode B — Operator-prepopulated `issue.md` files

```yaml
issue_source: folder
folder:
  path: <testbed>/.autoship/issues/
  # Controller processes any <id>/issue.md that lacks a brief.md
  max_concurrent: 1
```

### Mode C — Single-issue run (simplest)

```yaml
issue_source: single
single:
  issue_id: FRD-162
  issue_md_path: <testbed>/.autoship/issues/FRD-162/issue.md
  # Controller processes exactly this one issue, no eligibility scanning
```

---

## Approval policy

```yaml
approval_mode: supervised   # supervised | auto

supervised_gates:
  - brief_approved_to_stage1   # halt after brief APPROVED, await operator continue
  - stage2_green_to_merge      # halt after Stage 2 green, await operator accept/merge

auto_gates: []   # in auto mode, specify which gates a reviewer-agent may auto-promote
                 # (not recommended until controller has matured; leave empty for 0.1 shape)
```

---

## Retry & halt policy

```yaml
max_regroom_cycles: 3       # halt with needs-human-input if brief rejected N+ times
max_stage2_retries: 2       # halt if Stage 2 fails against same Stage 1 tests N+ times
halt_on_stage1_unexpected: true   # halt if tests go wrong color for the type (Bug expecting red, Refactor expecting green)
```

---

## Linear policy

```yaml
linear_writes:
  state_transitions: true       # controller updates Linear state at phase boundaries
  comments: true                # controller posts ad-hoc comments at milestones
  labels: false                 # do not add labels in 0.1 controller shape
  sub_issue_creation: true      # controller creates Linear sub-issues from approved decompositions

state_map:
  # Which Linear state names correspond to controller's phase transitions.
  # Adjust per team's Linear workflow.
  on_pre_groom_dispatch: "In Progress"
  on_stage2_green: "In Review"
  on_operator_accept: "Done"

comments:
  post_on: [pre_groom_complete, brief_approved, brief_rejected, stage1_complete, stage2_complete, needs_human_input]
  format: free_form_prose       # no templates for 0.1; operator feedback calibrates later
```

---

## Testbed commands

```yaml
commands:
  # How the controller verifies work. Paths relative to testbed.
  typecheck: "cd frontend && bun run typecheck"
  backend_tests: "cd backend && bun test"
  frontend_e2e: "cd e2e && bun run test"
  lint: "cd frontend && bun run lint"

  # Optional UI-quality gate
  anti_pattern_detect: "impeccable detect frontend/src"
```

---

## Scope constraints

```yaml
scope:
  # Files / patterns the controller enforces as "must not change" across this run.
  must_not_change:
    - <any file the operator wants frozen, e.g., frontend/tailwind.config.ts>
    - <db schema files if migration isn't in scope>
```

---

## Stop conditions specific to this run

```yaml
stop_when:
  - needs_human_input
  - unrecoverable_environment_error
  - regroom_limit_reached
  - stage2_retry_limit_reached
  - supervised_gate                # halt at each supervised gate; operator resumes
  - no_more_eligible_issues
```

---

## Resume behavior

```yaml
resume:
  # On controller re-entry with the same program.md, which state to pick up from
  derive_from_filesystem: true     # recommended — matches disk-backed state discipline
  reuse_prior_linear_state: true   # do not rewind Linear state on resume
```

---

## Example: fill this in for FRD-162 ship

```yaml
run_id: "frd-162-ship"
operator: "cshyang"
started_at: "2026-04-22T20:30:00Z"
mode: supervised

testbed: /Users/shyangcalibrax/Documents/Projects/finance_backend_agent
pinned_sha: <current-main-sha>
git_branch: <feature-branch-name>
stack: "Bun + Hono + Drizzle + React 19 + Vite + Tailwind"
frontend_test_runner: playwright-e2e
backend_test_runner: bun-test

issue_source: single
single:
  issue_id: FRD-162
  issue_md_path: .autoship/issues/FRD-162/issue.md

approval_mode: supervised
supervised_gates:
  - brief_approved_to_stage1
  - stage2_green_to_merge

max_regroom_cycles: 3
max_stage2_retries: 2

linear_writes:
  state_transitions: true
  comments: true
  labels: false
  sub_issue_creation: false    # FRD-162 is a leaf; no children to create

commands:
  typecheck: "cd frontend && bun run typecheck"
  frontend_e2e: "cd e2e && bun run test"

scope:
  must_not_change:
    - frontend/tailwind.config.ts

stop_when:
  - needs_human_input
  - supervised_gate
  - no_more_eligible_issues
```

---

## Notes

- **`program.md` is ephemeral per run.** Commit it to the run dir (e.g., `autoship-deliver-0.6/`) so the controller can find it, but treat it as scratch. It's not part of autoship's stable knowledge.
- **Never add stable operating knowledge here.** Teach-autoship.md is the place for cross-run truth. If you find yourself repeating a policy in multiple `program.md` files, consider promoting it to teach-autoship.md.
- **Approval mode evolves as trust grows.** Start supervised. Watch how the controller performs. Only promote specific gates to auto after seeing several clean runs.
