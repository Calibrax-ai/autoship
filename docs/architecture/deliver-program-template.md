---
title: "program.md — deliver run contract"
---

**Purpose:** the run contract the controller reads on every deliver invocation. Declares: which Linear project to work against, which issues are eligible, how to validate a build, and where to ship the draft PR.

**Location:** `.autoship/program.md` at the root of the testbed repo. Commit it — the whole team shares the run contract.

Stable knowledge (how autoship works in general) lives in `teach-autoship.md`. This file is per-repo: what THIS repo's deliver runs should do.

## Contract shape

```yaml
mode: deliver

# Where issues come from.
issue_source: linear | single | folder

# Linear source (recommended)
linear:
  team: <team name, e.g. "Delivery">
  project: <project name, e.g. "Gridfin">
  grooming_states: [Backlog, Todo]     # states eligible for grooming
  build_states: [Building]              # states eligible for build
  eligible_labels: []                   # optional filter
  max_concurrent: 1                     # deliver is serial today; keep at 1

# Grooming control
max_regroom_cycles: 3

# Per-issue worktree + branch
worktree:
  root: .autoship/worktrees
  branch_prefix: "autoship/"

# Commands the controller reruns after Stage 2 before committing
validation:
  commands:
    - "bun test"
    - "bun run typecheck"

# Draft PR policy — deliver ends at draft. Merging happens in your normal code-review workflow.
pr:
  remote: origin
  draft: true
  base_branch: main

# Linear write policy
linear_writes:
  state_transitions: true
  comments: true
  labels: false
  sub_issue_creation: false

# Linear state mapping (adjust for your team's Linear workflow)
state_map:
  on_claim: "Grooming"
  on_ready: "Ready"
  on_build_start: "Building"
  on_draft_pr: "In Review"
  on_needs_human_input: "needs-human-input"
```

## Alternative sources

### Single issue

```yaml
issue_source: single
single:
  issue_id: FRD-162
```

### Operator-prepared folders

```yaml
issue_source: folder
folder:
  path: .autoship/issues/
```

## Worked example (finance_backend_agent)

```yaml
mode: deliver

issue_source: linear
linear:
  team: Delivery
  project: Gridfin
  grooming_states: [Backlog, Todo]
  build_states: [Building]

max_regroom_cycles: 3

worktree:
  root: .autoship/worktrees
  branch_prefix: "autoship/"

validation:
  commands:
    - "bun test"
    - "bun run typecheck"

pr:
  remote: origin
  draft: true
  base_branch: main

linear_writes:
  state_transitions: true
  comments: true
  labels: false
  sub_issue_creation: false

state_map:
  on_claim: "Grooming"
  on_ready: "Ready"
  on_build_start: "Building"
  on_draft_pr: "In Review"
  on_needs_human_input: "needs-human-input"
```

## Notes

- **Scope:** the controller drives groom → review → Stage 1 → Stage 2 → validate → commit → push → draft PR. Merging, deploying, and issue closure happen in your normal code-review workflow. Do not add merge or deploy policy here.
- **`mode: deliver` is fixed.** Omit it and the controller rejects the contract.
- **Per-dev overrides** can live at `.autoship/local.md` (gitignored). Not required; add only when a developer needs to override team defaults.
- **Invocation:** from the testbed root, `claude --agent controller -p "deliver"` to resume in-flight work, or `claude --agent controller -p "deliver FRD-162"` to restrict to one issue.
