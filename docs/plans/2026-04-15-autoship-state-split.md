# Autoship State Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify autoship ingest by separating machine state from handoff/log state, while keeping build as the true Ralph loop and preserving the current 4-phase ingest flow.

**Architecture:** Ingest keeps its existing phase order (`boot -> fan-out -> reconcile -> critic`), but stops using `progress.txt` as the controller's state engine. Machine state moves to explicit runtime files under `.autoship/`, while `progress.txt` becomes a readable status and handoff log. Prompt contracts become more Ralph-like by putting the durable role contract in `SKILL.md` and using minimal role wrappers only if still needed.

**Tech Stack:** Bash, Markdown, Claude CLI prompts, filesystem state under `.autoship/`

---

### Task 1: Lock the intended semantics in the docs

**Files:**
- Modify: `docs/2026-04-14-architecture.md`
- Modify: `docs/v01-controller-design.md`
- Reference: `CLAUDE.md`
- Test: manual doc consistency review

**Step 1: Update the architecture doc to separate workflow types**

Edit `docs/2026-04-14-architecture.md` so the lifecycle is framed as:
- `ingest` = bounded synthesis step
- `review` = acceptance gate
- `generate-tests` = bounded oracle synthesis step
- `build` = Ralph loop

Add wording that only `build` is the true Ralph loop. Keep the current 4-step lifecycle; do not introduce new stage vocabulary.

**Step 2: Update the architecture doc's progress/state language**

Replace any wording that implies `progress.txt` is the controller's machine state during ingest. Keep `progress.txt` as the readable living status file, but state explicitly:
- ingest machine state lives in runtime files under `.autoship/`
- build uses `progress.txt` as agent handoff/work state
- run folders remain forensic records, not the primary control plane

**Step 3: Update the v0.1 controller doc**

Edit `docs/v01-controller-design.md` to match the intended simplified controller:
- `progress.txt` is status/handoff
- explicit machine state files drive resume
- phase reruns are coarse-grained
- prompt role contract lives primarily in `SKILL.md`, not duplicated in large wrappers

**Step 4: Manual review**

Read these files in order and confirm they do not contradict each other:
- `CLAUDE.md`
- `docs/2026-04-14-architecture.md`
- `docs/v01-controller-design.md`

Expected result: the repo describes one coherent model for ingest state, build loop state, and prompt ownership.

**Step 5: Commit**

Current workspace is not a git workspace, so skip commit here. If this is later moved into git, use:

```bash
git add docs/2026-04-14-architecture.md docs/v01-controller-design.md
git commit -m "docs: split autoship machine state from progress log"
```

### Task 2: Define the new runtime state model

**Files:**
- Modify: `docs/v01-controller-design.md`
- Modify: `docs/2026-04-14-architecture.md`
- Modify: `autoship.sh`
- Test: `bash -n autoship.sh`

**Step 1: Pick the smallest explicit state shape**

Document and implement only these machine-state files for ingest:
- `.autoship/current-run`
- `.autoship/runs/<run-id>/state/phase_boot.done`
- `.autoship/runs/<run-id>/state/phase_fanout.done`
- `.autoship/runs/<run-id>/state/phase_reconcile.done`
- `.autoship/runs/<run-id>/state/phase_critic.done`
- `.autoship/runs/<run-id>/started_at`

Do not add a JSON state machine unless marker files prove insufficient.

**Step 2: Define resume semantics**

Document and implement this rule:
- on restart, resume the current run
- rerun the first incomplete phase from the top
- do not attempt partial resume within a phase
- completed phases are reused

**Step 3: Define phase output cleanup policy**

For each phase, specify which outputs are safe to delete before rerun:
- boot: `boot-report.json`
- fan-out: probe-owned phase 1 artifacts
- reconcile: merged artifacts
- critic: `critic-report.md`

The controller should clear incomplete phase-owned outputs before rerunning that phase. Do not clear completed prior-phase outputs.

**Step 4: Syntax check**

Run:

```bash
bash -n autoship.sh
```

Expected: no output, exit code 0.

**Step 5: Commit**

If under git later:

```bash
git add autoship.sh docs/v01-controller-design.md docs/2026-04-14-architecture.md
git commit -m "refactor: use explicit ingest state files"
```

### Task 3: Simplify `progress.txt` into a handoff/status file

**Files:**
- Modify: `autoship.sh`
- Modify: `docs/2026-04-14-architecture.md`
- Modify: `docs/v01-controller-design.md`
- Test: `bash autoship.sh status`

**Step 1: Define a stable schema**

Keep `progress.txt` readable and consistent across steps. For ingest, include only:
- run id
- overall state
- started time
- current step
- completed phases
- blockers
- next action
- run detail path

Do not encode fine-grained controller logic in markdown markers beyond simple status display.

**Step 2: Make controller writes one-way and simple**

Change the controller so it rewrites `progress.txt` from runtime state instead of editing checkboxes in place with `awk`/regex surgery.

**Step 3: Keep build semantics intact**

Do not redesign build's use of `progress.txt` in this task. The docs should explicitly say:
- ingest uses `progress.txt` for status/handoff
- build uses it for Ralph-style task/blocker handoff

That keeps one human-facing file without forcing one machine-state implementation everywhere.

**Step 4: Status check**

Run:

```bash
bash autoship.sh status
```

Expected:
- if no run exists, prints a clear "no run" message
- if a run exists, prints the current handoff/status view

**Step 5: Commit**

If under git later:

```bash
git add autoship.sh docs/2026-04-14-architecture.md docs/v01-controller-design.md
git commit -m "refactor: make progress.txt a handoff log"
```

### Task 4: Move role contracts into the skill and shrink prompt wrappers

**Files:**
- Modify: `skills/reverse-spec-extraction/SKILL.md`
- Modify: `skills/reverse-spec-extraction/prompts/ui-walker.md`
- Modify: `skills/reverse-spec-extraction/prompts/static.md`
- Modify: `skills/reverse-spec-extraction/prompts/data.md`
- Modify: `skills/reverse-spec-extraction/prompts/external.md`
- Modify: `skills/reverse-spec-extraction/prompts/reconciler.md`
- Modify: `skills/reverse-spec-extraction/prompts/critic.md`
- Modify: `docs/v01-controller-design.md`
- Test: manual prompt review

**Step 1: Expand `SKILL.md` with rerun-aware role contracts**

For each role, add concise but explicit rules:
- owned outputs
- allowed inputs
- forbidden inputs
- rerun behavior
- overwrite vs continue guidance
- what summary to leave behind

Keep this at the role-contract level, not tool-by-tool instructions.

**Step 2: Shrink prompt wrappers**

Reduce each prompt file to a minimal wrapper that says, in effect:
- who you are
- read `SKILL.md`
- read `boot-report.json` if applicable
- inspect existing owned outputs first
- continue or regenerate according to the skill rules

Avoid duplicating the full output schema in both places if `SKILL.md` already states it.

**Step 3: Add rerun semantics**

For every worker prompt, specify that reruns are normal:
- inspect owned outputs
- classify them as usable/stale/partial/missing
- choose `regenerate`, `continue`, or `leave-as-is`
- state the chosen strategy in the summary

**Step 4: Manual prompt review**

Read:
- `skills/reverse-spec-extraction/SKILL.md`
- one probe prompt
- `reconciler.md`
- `critic.md`

Expected: role responsibilities are clear without large duplicated prompt bodies.

**Step 5: Commit**

If under git later:

```bash
git add skills/reverse-spec-extraction/SKILL.md skills/reverse-spec-extraction/prompts/*.md docs/v01-controller-design.md
git commit -m "refactor: move role contracts into reverse-spec skill"
```

### Task 5: Simplify the controller implementation to match the new model

**Files:**
- Modify: `autoship.sh`
- Test: `bash -n autoship.sh`
- Test: `bash autoship.sh version`
- Test: `bash autoship.sh status`

**Step 1: Remove markdown-driven machine state**

Delete or replace:
- `mark_phase`
- `phase_status`
- any logic that parses phase completion from `progress.txt`

Replace with helpers that inspect explicit runtime files.

**Step 2: Keep the 4-phase orchestration**

Preserve:
- `phase_boot`
- `phase_fanout`
- `phase_reconcile`
- `phase_critic`
- serial phase ordering

Do not collapse phases into a generic loop unless the implementation becomes simpler in practice.

**Step 3: Preserve only essential boot behavior**

Keep:
- runtime detection
- docker-only v0.1 enforcement
- env-file existence check
- `docker compose up -d --build --wait`
- shared boot report

Trim or simplify only if a boot-report field is not actually needed by workers.

**Step 4: Stop truncating useful forensic logs on resume**

Do not clobber `decisions.log` for an existing run. Appending is preferred so resume behavior is observable.

**Step 5: Run basic CLI checks**

Run:

```bash
bash -n autoship.sh
bash autoship.sh version
bash autoship.sh status
```

Expected:
- syntax clean
- version prints
- status works without a run

**Step 6: Commit**

If under git later:

```bash
git add autoship.sh
git commit -m "refactor: simplify autoship ingest controller"
```

### Task 6: Verify the new model against the intended Ralph boundary

**Files:**
- Reference: `docs/2026-04-14-architecture.md`
- Reference: `CLAUDE.md`
- Reference: `docs/v01-controller-design.md`
- Test: manual architecture review

**Step 1: Check the boundary statement**

Confirm the docs now clearly say:
- ingest is not the Ralph loop
- build is the Ralph loop
- ingest still uses external durable state
- `progress.txt` is readable handoff/state context, not the ingest controller's primary machine state

**Step 2: Check for overreach**

Reject any change that accidentally:
- allows build sessions to mutate artifacts or tests
- removes the human review gate
- folds visual polish into the behavioral oracle
- introduces a more complex routing model than the current 4-step lifecycle

**Step 3: Record open questions**

If unresolved after implementation, document them instead of coding around them:
- should prompt wrappers be removed entirely or kept as tiny role launchers?
- should ingest have one `state.json` in the future, or are marker files enough?
- should `generate-tests` get its own structured machine state, or can it remain bounded and stateless for now?

**Step 4: Final review**

Expected result: autoship is simpler in the controller, closer to newer Ralph in its state/log split, and still faithful to the current product architecture.

**Step 5: Commit**

If under git later:

```bash
git add docs/2026-04-14-architecture.md docs/v01-controller-design.md CLAUDE.md docs/plans/2026-04-15-autoship-state-split.md
git commit -m "docs: finalize autoship state model simplification"
```
