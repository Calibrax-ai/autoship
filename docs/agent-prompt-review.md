> **STATUS: SUPERSEDED — kept as institutional memory of a wrong turn.**
>
> This review was authored 2026-04-17 to diagnose probe-2.8's silent journey drops as a coverage gap, and recommended adding three grep/diff forcing-function gates to `build-controller.md`. Those gates were implemented in commit `b6bb3e9` and within the same probe run, the controller passed them while *transparently* cutting J13 with a defensible-sounding rationale — reproducing probe-2.7's dialog-theater outcome under a politer label.
>
> The synthesis at `docs/harness-philosophy.md` (authored shortly after) names why: the gates were locally correct and structurally wrong. The build-controller authors AND discharges its own gates; any rationale-accepting gate, self-judged, can be discharged. Anthropic's harness design article: *"tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work."*
>
> The fix supersedes most of this document's recommendations: the slice-plan grep gate, oracle-coverage grep gate, and "delete coverage-vs-depth retrospective" item moved into the `plan-reviewer` agent (`.claude/agents/plan-reviewer.md`) calibrated by `docs/plan-reviewer-calibration.md`. The dialog-theater grep stayed (mechanical → grep), as recommended here.
>
> Kept verbatim because the `Considered and Deferred` convention in `CLAUDE.md` says don't bury wrong turns: future instances will hit the same "add a grep gate to fix coverage" intuition and need to see why it's locally rational and structurally insufficient.

# Agent Prompt Structure Review

## Verdict

**Surgical edits, not restructure.** Both documents are well-organized and correctly scoped — program.md as executor-readable spec, build-controller.md as controller system prompt. The probe-2.8 failure was not caused by structural chaos; it was caused by a specific, diagnosable gap: **there is no gate between slice-plan-written and oracle-dispatched.** The controller wrote a 12-slice plan for 15 journeys and nothing checked the count before the next stage consumed that plan. The single most leveraged change is to add one forcing-function gate — *"slice IDs in progress.txt must set-equal journey IDs in user-journeys.json"* — and move the "no catch-all slices" rule out of the slice-execution gate (build-controller.md:51) where it currently fires only *after* the damage is encoded, into a new slice-plan gate that fires *before* Stage 1 oracle work begins. Two other gaps deserve the same treatment (oracle endpoint-coverage; dialog-theater grep check). Together these three changes would have blocked every failure mode observed in probe-2.8.

## Findings by severity

### Load-bearing issues (cause failures like probe-2.8's)

#### 1. No gate between slice planning and Stage 1 oracle dispatch

build-controller.md:44–54 lists five gates — **Task, Stage 1 (oracle), Scaffold, Slice, Completion**. Slice *planning* happens in the section at lines 56–62 and has no gate attached. The text "Write the slice plan to `progress.txt` — one slice per journey" is a norm, not a check. In probe-2.8 the controller wrote 12 slices for 15 journeys and the flow proceeded to oracle generation unchallenged. This is the single highest-leverage hole.

Worse, the document explicitly argues against adding gates at build-controller.md:46 — *"You don't need four separate rules — you need the verifications to be meaningful."* That sentence is the philosophical claim that produced the failure. When the gate mental-model is "meaningful verifications," coverage gaps are invisible — every existing gate can be meaningful while a wholly un-gated step silently corrupts the rest of the pipeline. Coverage, not just depth, matters.

**Proposed rewrite — new gate added to the bullet list at build-controller.md:47–53:**

> **Slice plan** — the slice plan in `progress.txt` must set-equal the journeys in `artifacts/user-journeys.json`. Verification: `diff <(jq -r '.[].id' artifacts/user-journeys.json | sort) <(grep -oE '^S[0-9]+:' progress.txt | sed 's/://' | sort)` exits 0. If it fails, re-plan — do not dispatch to Stage 1. No silent journey drops; no bundled journeys.

And delete or soften build-controller.md:46 — the "you don't need four separate rules" line was load-bearing in producing this failure.

#### 2. "No catch-all slices" is in the wrong gate

build-controller.md:51 lists "No catch-all slices that bundle multiple journeys" as a criterion of the **Slice** gate — i.e., it fires when a slice is being executed and verified. By that point:

- the slice plan is committed to `progress.txt`
- the oracle has already been generated against the (wrong) slice shape
- the executor has already been dispatched with the bundled journey

Probe-2.8's bundled J13 into S02 ("upload-scan stub") at plan time. A slice-execution-time check cannot un-bundle it; it can only discover the mess after it is built. This rule belongs in the slice-plan gate above, where it is enforceable *before* commitment: "count(slices) == count(journeys) AND no slice description mentions more than one JNN id."

#### 3. Dialog-theater rule is stated as prose, not as a detection criterion

program.md:90 is *almost* grep-ready already:

> A form handler that ends with `e.preventDefault(); closeDialog();` and nothing else — no network request, no state mutation — is forbidden.

But no gate runs that grep. The executor reads the rule, the controller reads the rule, and neither has a forcing function that scans the written code for the pattern. The controller's current slice gate (build-controller.md:51) relies on a journey walk observing the network tab — which catches dialog theater *if* the journey walk exercises that affordance and *if* the walker notices the missing POST. The cheaper and more deterministic check is a grep on committed handler files.

**Proposed rewrite — add to the Slice gate at build-controller.md:51 (after the screenshot-comparison sub-bullet):**

> (d) **Dialog-theater check.** `grep -rnE 'preventDefault\(\)\s*;[^{}]*closeDialog\(\)' app/src/` must return zero matches, OR every match must be paired with an awaited `fetch`/`axios`/mutation call within the same handler body. If violations exist, re-dispatch with the match list and the `program.md:90` anti-pattern quoted.

This turns the anti-pattern from a norm into a forcing function. The executor still optimizes for it semantically; the controller no longer has to rely on that optimization.

#### 4. Nothing forbids silent oracle-test exclusions

Neither document says "every endpoint in `api-spec.json` must appear in at least one oracle test." program.md:29–33 describes *what kinds* of tests to generate (contract/state/behavior), not *coverage requirements*. The Stage 1 gate at build-controller.md:50 only requires tests to "compile and run (and fail)." An oracle that silently omits `/api/v1/scan` passes this gate.

**Proposed rewrite — strengthen the Stage 1 gate at build-controller.md:50:**

> **Stage 1 (oracle)** — all Vitest tests compile and run (they must fail — no app yet). AND every endpoint in `artifacts/api-spec.json` appears in at least one test-file's assertion target. Verification: for each endpoint path in `api-spec.json`, `grep -rF "<path>" oracle/` must return at least one hit. Exclusions require a written justification in `decisions.md` and an explicit `oracle-excluded: [<paths>]` line in `progress.txt` — silent exclusions are forbidden.

#### 5. Progress.txt scope is undefined, so it absorbs anything

Neither document specifies what `progress.txt` should and should not contain. program.md:102 says "Update `progress.txt` with the journey ID and any conventions set for subsequent slices." build-controller.md:62 says "Write the slice plan to `progress.txt`." Nothing says what *not* to put there. Probe-2.8's controller filled it with status enum lists, seed-script column normalizations, API envelope conventions, route stubs — which are all implementation details the executor should decide, not the controller should pre-specify.

**Proposed rewrite — add to build-controller.md, after the slice-planning block (~line 62):**

> **`progress.txt` scope.** Contents are limited to: (a) slice plan (one line per slice, `Sxx: journey-id — one-line goal`), (b) current slice pointer, (c) slice-level conventions that later slices must reuse (e.g., "DB reset pattern: drop + migrate + seed before each walk"), (d) blocker notes. It is **not** the place for: status enum values, column names, API envelope shapes, route stubs, or any implementation-level decision. Those belong in the executor's dispatched task or in `decisions.md` when they close a spec ambiguity.

### Structural issues (fix or live with)

#### 6. Slice structure is duplicated between the two files — and is starting to drift

program.md:50–104 ("Stage 2: Build Loop") and build-controller.md:56–90 ("SLICE PLANNING" + "ATOMIC TASKS WITHIN A SLICE") restate the same content:

- "Slices are organized by user journey" — program.md:51, build-controller.md:58
- "Each journey is one slice" — program.md:51, build-controller.md:58
- The atomic-task four-field structure — program.md:71–77, build-controller.md:70–76
- "Decompose until each task has a single executable verification" — program.md:81, build-controller.md:78

This is not yet a problem — the two versions agree today — but two copies of the same rule will drift. The cleanest split that preserves the two files' distinct audiences:

- **program.md** owns *content rules and schemas* (what a slice is, what an atomic task is, what verification must prove). Executors read this.
- **build-controller.md** owns *orchestration mechanics and gates* (when to dispatch, what to check, what to do on failure). Only the controller reads this.

build-controller.md:56–76 should reference program.md sections instead of restating them. E.g., replace the atomic-task block at build-controller.md:68–76 with: *"Atomic tasks have the four-field structure defined in `program.md` §Atomic tasks within a slice. Embed those four fields verbatim in the dispatched executor prompt."*

#### 7. Ordering: the MANDATORY READ is strong but the gate list is buried

build-controller.md opens well — line 10 states the role, line 12 points at program.md as authoritative, line 14 onward is setup. But **GATES AND VALIDATION** starts at line 44, after SETUP and EXECUTOR DISPATCH. Given that gate coverage is the document's load-bearing content and the probe-2.8 failure was a gate gap, the gate list should move up — ideally right after the MANDATORY READ pointer and before any dispatch mechanics. The controller's first mental model should be *"here is the set of things that must be checked, in order."*

Anthropic's own prompting guidance is consistent with this: *"important rules get lost in the noise"* if CLAUDE.md is long, and emphasis works ("IMPORTANT"/"YOU MUST"). The gates are the load-bearing rules; put them where attention is highest.

#### 8. Anti-patterns in program.md are strong but un-indexed

program.md has anti-patterns scattered inline — "dialog theater" at line 90, "empty-state verifications produce a deeper theater" at line 85, "HTML string matching for affordance checks" at line 38, "tests where `return c.json([])` would pass" at line 39, "No catch-all slices" at line 112. Each is good; collectively they are hard to enforce because no single list exists for the controller to scan. Consider a short `## Anti-patterns (forcing checks)` section near the end of program.md that lists each with its detection command — even for ones the controller cannot yet check automatically, having them in one place surfaces the question "which of these has a grep check wired up?"

### Cosmetic / tighten

#### 9. Two sentences that earn their keep being deleted

- build-controller.md:46 — *"You don't need four separate rules — you need the verifications to be meaningful."* Load-bearing in the wrong direction. Cut.
- build-controller.md:98 — the anti-poll instruction at line 34 is already clear. The repeated "Do NOT poll, sleep, or use `until` loops" at line 36 is defensive but fine; leave it.

#### 10. Screenshot-contract language is duplicated

program.md:18 and build-controller.md:40 both explain "screenshot wins over journey text." The rule is identical. Keep program.md's version (the executor reads it); shorten build-controller.md:40 to one sentence referencing program.md.

#### 11. "NEVER STOP" appears twice in build-controller.md

Lines 93 and implicitly echoed in line 54 ("don't burn iterations on a frozen signal … continue with other journeys"). The message is right; one location is enough. Keep line 54 (it has the qualifying logic — move on *with* logged blocker) and shorten line 93 to a pointer.

## Proposed restructure (if warranted)

Not warranted as a full restructure. The four-part surgical edit:

1. **Add a Slice-Plan gate** to the bullet list at build-controller.md:47–53. Set-equality check on slice IDs vs journey IDs. This is the single highest-leverage change.

2. **Move "no catch-all slices"** (currently build-controller.md:51, inside the Slice gate) into the new Slice-Plan gate. The check belongs before the oracle is generated, not after.

3. **Add two forcing-function checks** to existing gates: dialog-theater grep to the Slice gate (build-controller.md:51), endpoint-coverage check to the Stage 1 oracle gate (build-controller.md:50).

4. **Scope `progress.txt`**: add a ~4-line "scope" block after build-controller.md:62 explicitly excluding implementation details.

Optional follow-ups (lower leverage, cleaner prose):

5. Delete build-controller.md:46 ("you don't need four separate rules"). It licenses the failure.
6. Move the GATES AND VALIDATION section up to right after MANDATORY READ.
7. Deduplicate the slice-structure and atomic-task blocks between the two files — have build-controller.md reference program.md instead of restating.

## What should NOT change

- **The MANDATORY READ pattern** at build-controller.md:12. Pointing the controller at program.md as the authoritative rulebook is correct — do not inline program.md into build-controller.md.

- **The two-file split itself.** program.md = executor-facing spec; build-controller.md = controller system prompt. This is the right topology. The duplication is fixable without merging.

- **program.md's thin-instruction tone.** It follows the Karpathy/autoresearch `program.md` pattern — declarative, schema-first, lets the executor figure out mechanics. Resist the urge to add procedural steps to it; mechanics belong in build-controller.md.

- **The gate *mental model***, just not the gate *coverage*. The "verification command exits 0 = passes" contract (build-controller.md:46, program.md:79) is correct. The problem is coverage gaps between gates, not the gate definition itself.

- **The per-slice screenshot contract.** program.md:18 and build-controller.md:40 correctly elevate the PNG as authoritative over journey text. This is exactly the right shape — a contract that the executor can consult before building and the controller can compare after building.

- **The "NEVER STOP" with blocker-log escape hatch** (build-controller.md:54). The refinement that says "if stalled on the same failure set with no new information, log a blocker and continue with other journeys" is exactly the right pressure valve. Do not remove it for the sake of absolutism.
