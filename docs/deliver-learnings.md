# Deliver Learnings

Detailed learnings for the `deliver` track: issue grooming, brief review, regroom loops, and the first trustworthy-brief -> oracle -> build validation.

For cross-track synthesis, see [`learnings.md`](/Users/shyangcalibrax/Documents/Projects/autoship/docs/learnings.md).

| Probe | What it tested | Key outcome |
|---|---|---|
| 0.1 | Generator-evaluator at the grooming layer: `pre-groomer` + `brief-reviewer` on 4 real Linear issues (FRD-157, FRD-122, FRD-153, FRD-143) + build validation on FRD-157 | 3/4 briefs approved, regroom avg = 1.0. Pattern validated at the grooming layer. Invented-verdict signal exposed schema drift. Build validation ran end-to-end on one clean Bug: FRD-157 brief drove a single-pass Stage 2 build to 6/6 tests green (27 assertions), with no brief rewrites. |
| 0.2 | Spec revisions (notes field, file-existence check, decomposition step, binary-only verdict) + build validation replication on a Feature (FRD-122). Narrow; no new architecture; same manual operator loop. | Spec revisions landed and smell-checked. **Build validation** replicated on Feature: FRD-122 brief drove a single-pass Stage 2 build to 20/20 tests green (66 assertions).** Feature validation is stronger than Bug: more surface (role gate + activity-log loop + mapper branch), zero brief ambiguities, and the executor synthesized a non-blocking reviewer note (`clients.ts:31` precedent) into its implementation. |
| 0.3 | Build validation on a Refactor (REF-001: consolidate upload idempotency admission flow). Companion: FRD-143 regroom under the 0.2-revised spec to empirically test decomposition procedure + notes-field usage. | **Primary PASS.** REF-001 brief drove Stage 1 → Stage 2 to 12/12 tests green (55 assertions), zero test mutations, zero diffs outside the 3 expected files; full backend suite stayed at baseline. Build validation now proven on Bug + Feature + Refactor. **Companion PASS.** Pre-groomer returned `design-status: need-info` + decomposition on FRD-143; reviewer APPROVED with binary verdict + substantive notes, no invented middle labels. Spec revisions validated empirically. **Finding:** brief-reviewer's Groundedness check verifies cited tests *exist* but not that they *pass at baseline* — exposed when 6 "covering" tests were all failing at baseline; executor made a judgment call (harness repair) rather than STOP. |
| 0.4 | UI grooming-layer validation on FRD-161 (redesign-scope full-app revamp). 4 impeccable skills installed experimentally (`teach-impeccable` intentionally skipped). | **Phase 1 PASS.** Pre-groomer returned `design-status: need-info` + 8-sub-issue decomposition (161a design decision → 161b primitives → 161c shell → 161d-k per-function migrations, with 161d as tracer-bullet). Brief-reviewer APPROVED. Decomposition scales from 3-fork (FRD-143) to 8-sub-issue (FRD-161). **Finding:** pre-groomer produced opinionated UI decomposition with ZERO skill invocation — design judgment emerged from codebase inspection (LOC ranking, sidebar-taxonomy analysis, existing-component grep). Updates prior: `teach-impeccable` is NOT grooming-layer 80:20 lever; matters only for per-slice execution. **Phase 2 (UI build) deferred to 0.5.** Incident: `skills add` CLI corrupted worktree baseline files; restored via `git checkout`. Operator direction: surface skill content via dispatch prompts, not via project install. |
| 0.5 | UI build validation on FRD-162 (FRD-161b materialized from 0.4's decomposition) — `<Tabs>` + `<PageShell>` primitives. First end-to-end UI build through deliver pattern. Also first probe with Linear MCP integration for sub-issue creation + state transitions. | **PASS end-to-end.** Pre-groomer wrote implementable brief (8 ACs, 3-alt Design Rationale, 5 Failure Modes). Brief-reviewer APPROVED. Stage 1 wrote 286-line Playwright spec (10 test cases across AC3+AC4); required one-line harness fix for Playwright 1.59 semver drift but Stage 1 discipline held (zero source modifications). Stage 2 created `tabs.tsx` (143 LOC) + `page-shell.tsx` (41 LOC), extended `design-system.tsx` (+134 additive LOC). **12/12 tests green on first run, zero test mutations, impeccable detect clean, TypeScript clean.** Build validation now proven across Bug + Feature + Refactor + UI. **New finding: invented status value recurrent.** Pre-groomer emitted `design-status: drafted` (not enumerated); reviewer accepted. Third occurrence of invented values across probes — calibration candidate for systemic frontmatter-value validation. **Linear integration:** minimal first-probe form (one `save_issue` call, a few free-form comments, three state transitions) adequate — no labels, no templates needed. |

---

## Generator-evaluator generalizes to the grooming layer

Probe-2.5 validated the reviewer pattern at the planning layer. Probe-0.1 validated the same structural pattern one layer earlier:

- `pre-groomer` writes the brief
- `brief-reviewer` judges it
- operator sees the verdict
- regroom runs only on reject

Across four real issues, 3/4 briefs reached `ready-for-oracle` and average regroom count was 1.0.

**Implication:** author-judge separation is not specific to planning. It generalizes to grooming and likely to later delivery stages as well.

## The current spec was too happy-path-clean

The probe did not just surface agent drift. It surfaced a spec mismatch.

Observed reviewer verdicts included:

- `approve`
- `approve-with-notes`
- `needs-revision`
- `ready`
- `changes-requested`

The pre-groomer also invented `design-status: ready`, outside the stated schema.

The pattern was not one stable deviation. It was repeated invention around two missing channels:

- non-blocking observations
- "blocking but clearly actionable" outcomes

**Implication:** keep binary `APPROVED | REJECTED`, but add a `notes:` channel. Do not try to solve this by prompt-policing the reviewer more aggressively.

## Pre-groomer over-scopes Features instead of decomposing

FRD-143 exposed a specific tendency: when a Feature touched several surfaces, the pre-groomer defaulted toward a unified brief rather than stepping back and asking whether the issue should decompose.

The resulting brief was defensible, but not obviously the simplest reasonable shape.

**Implication:** decomposition needs to become procedural, not merely allowed by the schema. A scope-check step should happen before the brief is written.

## File-existence verification is a load-bearing pre-groom step

The same mistake happened twice in FRD-153:

- a file was labeled "Expected to create" even though it already existed
- regroom repeated the same class of mistake on a different file

Once the dispatch explicitly required checking file existence first, the loop converged.

**Implication:** this check belongs in the permanent `pre-groomer` instructions, not only in ad hoc dispatch scaffolding.

## Regroom works when the reviewer is specific

The regroom loop itself did not show structural instability. When the reviewer named concrete objections and constrained the next decision clearly, the regroom pass usually converged cleanly.

The one new defect introduced during regroom was caught on the next review cycle rather than causing oscillation.

**Implication:** invest in reviewer specificity. The weak point is vague review feedback, not the regroom mechanism itself.

## Operator-gated binary preserved stop/go discipline

During the probe, invented middle verdicts were overridden by the operator to keep the workflow binary. That preserved the structural property that the stage does not advance on soft approval.

This was useful as a probe backstop, but it is not the target architecture.

**Implication:** the durable fix is schema revision, not permanent human override at every review gate.

## Build validation — trustworthy brief drives clean execution on one clean Bug

FRD-157 is the strongest result in the deliver line so far.

The flow was intentionally split:

- **Stage 1** wrote only the oracle tests
- **Stage 2** modified only the implementation against frozen tests

Result:

- 6 tests green
- 27 assertions
- no brief rewrites
- no test rewrites
- no scope widening

The implementation matched the brief's Skeleton Position closely and only made one explicit judgment call for a flagged ambiguity.

**Implication:** a reviewer-approved brief can be a real execution contract, not just a planning artifact, at least for a narrow bug-shaped issue.

## Stage 1 / Stage 2 discipline is load-bearing here too

An initial collapsed dispatch would have let one executor write both the tests and the fix. That would have reproduced the same author-judge failure seen elsewhere in autoship.

The split matters because it makes test mutation itself a signal:

- if Stage 2 needs to change Stage 1's tests, something upstream is wrong

**Implication:** if `deliver` grows a controller, the controller must enforce this split mechanically.

## Early calibration candidates are already visible

Probe-0.1 surfaced several candidate rules worth preserving once the reviewer gets a formal calibration set:

1. Non-blocking findings should not create soft-approve verdicts; they belong in `notes:`.
2. Clear blocking findings with clear remediation still require `REJECTED`.
3. Blast-radius claims about "new files" need file-existence verification.
4. Concrete Example wording must match the evidence mode.
5. Slightly imprecise citations can be non-blocking if the underlying claim is true.
6. Feature briefs touching schema or migration surfaces must include the triggered conditional sections.

## Build validation generalizes to Feature shape (0.2, FRD-122)

Probe-0.1 validated build validation on one clean Bug. Probe-0.2's load-bearing test was whether the result holds for Feature-shaped work — where design judgment and blast radius are harder.

**Stage 1 (oracle).** One fresh `claude -p` session, instructed to modify ONLY `transactions.test.ts`. Preserved all 15 existing tests; added 5 new AC tests covering: AC1 (member role 403), AC2 (manager role 200 + `posted >= 1`), AC3 (admin role 200), AC4 (activity_log entries for flipped rows), AC6 (`GET /:id/history` returns non-`__deleted__` entries for `transaction.gl_post`). Also added a seeded `TXN-AP-002` AP PENDING_PAID row with `glPosted: false` for AC2's determinism, per the regroomed brief. Stage 1 outcome: 16 pass / 4 fail — the expected red state (AC3 trivially passes because admin has no gate to fail against yet; the other four ACs drive the real red). `transactions.ts` untouched.

**Stage 2 (build).** Separate fresh session, instructed to modify ONLY `transactions.ts` against the frozen tests. Outcome: 20 pass / 0 fail, 66 expect() calls. Code changes followed the brief's §Skeleton Position line-for-line:

- `requireRole` imported and inserted as positional middleware (matches `clients.ts:31` precedent — which was non-blocking suggestion in the review's notes, not the brief's primary citation; the executor synthesized the tighter pattern from the reviewer's observation)
- Per-id `logActivity(clientId, 'transaction.gl_post', 'transaction', id, userId, { postedAt })` loop over `RETURNING` ids (mirrors the restore-from-delete loop at lines 686-691)
- `toEditHistoryEntry` extended with a `transaction.gl_post` branch above the fallthrough, returning `field: 'gl_posted'` shape — prevents the silent `__deleted__` misrender the reviewer's E2 flagged during grooming
- One `postedAt` ISO captured before the loop so all rows in a batch share the same timestamp — minor convergence choice the executor noted

**No brief ambiguities required judgment** (unlike FRD-157 where AC3's status code was open). The brief's §Blast-Radius Manifest specified concrete line targets; the `field: 'gl_posted'` shape was suggested in the brief's AC6 verification text; the batch-level timestamp reuse was the only minor convergence call and it's defensible on semantics.

**Implication:** build validation generalizes beyond the simplest Bug shape. A Feature with new middleware usage + new activity-log attribution pattern + a per-surface mapper fix built cleanly in one pass from the brief + frozen oracle. The grooming-layer generator-evaluator pattern produces briefs that are empirically trustworthy for non-trivial downstream implementation, and the reviewer's non-blocking observations are usable by Stage 2 even without an explicit "act on notes" instruction.

**Data point count:** build validation now validated on 1 Bug + 1 Feature under the deliver pattern. Replication on a Refactor remains open for deliver-0.3 if a clean candidate appears.

## Build validation generalizes to Refactor shape (0.3, REF-001)

Probe-0.3 closed the third type-shape question. REF-001 consolidated the upload idempotency admission flow (duplicated across `extraction.ts` and `reconciliation.ts`) into one shared helper module under `backend/src/lib/upload-idempotency.ts`.

**Stage 1 (coverage gap-fill, all green against unmodified source).** Executor added 6 regression tests to `upload-idempotency.test.ts` locking in the brief's 7 observable invariants: bank mismatch / in-progress (existing tests only covered the extract side), three failed-400 persistence cases (invariant 6, missing entirely), and the soft-rollout warn-log shape (invariant 7). Final state: 12 pass / 0 fail / 55 expect() calls. Full backend suite: 240 pass / 7 fail / 1 skip — the 7 failures pre-existing at SHA 2edac08, unrelated to REF-001.

**Stage 2 (structural change only; frozen oracle).** Executor created the helper module (111 lines) with `admitUpload(...)` returning `{ kind: 'admitted', requestId } | { kind: 'short-circuit', response }` and `failWith400(c, requestId, payload)` returning `Response`. Route files shrank: extraction.ts 1302 → 1270 (−32), reconciliation.ts 1764 → 1733 (−31). 6 admission-ladder branch sites → 0 in routes; 3 failed-400 blocks → 3 one-line helper calls.

**Test mutation as signal worked.** Stage 2 had full opportunity to modify the frozen oracle to shortcut the refactor. Zero test modifications. Final test state was byte-identical to Stage 1 end state: 12 pass, 55 assertions. The full backend suite returned the same 7 pre-existing failures — no new regressions, no new failing test names in the REF-001 blast radius. `git status` showed exactly the 3 permitted files.

**Preservation-proof discipline surfaced a byte-level subtlety.** The executor chose to have `failWith400` call `c.json(...)` rather than raw `new Response(...)` because the latter would drop `charset=UTF-8` from the `content-type` header, breaking exact-body assertions in Stage 1 tests. That's the preservation discipline working at byte level — exactly the signal the Refactor pattern is designed to surface.

**Implication:** build validation now demonstrated across all three major type shapes. The grooming-layer generator-evaluator pattern produces briefs empirically trustworthy for non-trivial downstream implementation, across Bug (27 assertions), Feature (66 assertions), and Refactor (55 assertions) with end-to-end Stage 1/Stage 2 discipline preserved.

## Brief-reviewer Groundedness has a blind spot for Refactor briefs (0.3, REF-001)

The Stage 1 executor surfaced a finding the reviewer's three-check rubric does not currently catch:

The brief's Preservation Proof table listed 6 existing tests as "covering" 4 of 7 observable invariants. Those 6 tests *existed*, *imported the target routes*, and *looked structurally correct*. The brief-reviewer's Check 2 (Groundedness) verified exactly those three things. It approved the brief.

But all 6 tests were **failing at baseline SHA 2edac08**. The test harness set `orgId` via a custom middleware while `clientMiddleware` reads `workspaceId`; client rows were inserted with only the legacy `orgKey` field. Tests 400'd at the middleware chokepoint without ever exercising the idempotency code paths they claimed to cover. The preservation-proof table was semantically wrong: tests that look like they cover an invariant but don't execute against it are not coverage.

The executor chose harness-repair (in-test-file) rather than STOP, reasoning that the test file was explicitly in Stage 1 scope and the invariants themselves were correct. Stage 1 still landed clean (12/12 green, 55 assertions). But the finding is real.

**Calibration candidate for the brief-reviewer (not actioned in 0.3):** for Refactor briefs with `preservation-status: needs-coverage-first`, Groundedness should require running the cited tests at baseline — or equivalently, the pre-groomer should assert which cited tests currently pass (and only list those), forcing failing-at-baseline tests into the coverage-gap list where Stage 1 must repair or add them.

**Why not fix mid-probe:** deliver-0.3 was scoped to "prove generalization, not add architecture." Mid-probe spec revision would confound signal. If a second data point (future probe) confirms this gap is load-bearing, a targeted revision lands then.

## `design-status: need-info` is a legitimate approved terminal state (0.3, FRD-143 companion)

FRD-143 regroom under the 0.2-revised spec empirically tested the decomposition procedure. Result:

- Pre-groomer returned `design-status: need-info` and refused to produce a unified brief.
- Named three independent design forks with file-level evidence (data-model / enforcement-breadth / admin UX).
- Proposed decomposition into FRD-143a/b/c with dependency ordering.
- Brief-reviewer APPROVED the need-info brief without inventing a middle label. Reviewer reasoned: "Mechanically applying the standard Feature schema would force the pre-groomer to author answers to open questions that belong to the customer/operator — the opposite of the scope-discipline rule."

**Implication:** deliver now has three branch states for approved briefs:

- `verdict: APPROVED` + implementable brief → proceed to Stage 1.
- `verdict: APPROVED` + `design-status: need-info` → operator splits the issue per proposed decomposition, re-dispatches pre-groomer on each sub-issue; do NOT execute from the parent brief.
- `verdict: REJECTED` → pre-groomer regrooms.

This terminal state is emergent, not specced. Worth capturing in the brief-reviewer spec if a second data point confirms usefulness.

## UI build generalizes (0.5, FRD-162)

Probe-0.5 closed the UI-build type-shape question. FRD-162 (materialized from 0.4's FRD-161 decomposition as §FRD-161b) added `<Tabs>` and `<PageShell>` design-system primitives from zero.

**Stage 1 (Playwright E2E oracle, against unmodified source).** Executor wrote `app/e2e/tests/08-design-system.spec.ts` with 10 AC-bound tests (4 AC3 rendering/interaction, 6 AC4 keyboard navigation). Required a one-line fix to `playwright.config.ts` (Playwright 1.59 semver drift changed `storageState: undefined` semantics) — orchestrator-scope, not executor-scope. With harness fixed: 7 tests failed red (expected — demo sections and primitives don't exist yet), 5 tests passed (setup + tests that fell back to the existing styleguide tablist). Clean red signal. Stage 1 discipline held (zero source modifications by executor).

**Stage 2 (structural change only; frozen oracle).** Executor created `src/components/tabs.tsx` (143 LOC, single-component API with `items` array), `src/components/page-shell.tsx` (41 LOC, ReactNode slots), and extended `src/routes/_authed/design-system.tsx` (+134 additive LOC, two demo sections). Demo tab labels picked to avoid collision with existing styleguide labels (`Overview`/`Usage`/`Props` for Tabs, `Preview`/`Details` for PageShell). Tab-key focus-out via roving tabindex + `tabIndex={0}` on tabpanel — valid ARIA.

**Result.** 12/12 tests green on first run (2 setup + 10 AC tests), no retries, no flakiness. Zero test modifications. TypeScript clean. `impeccable detect` returns exit 0 (clean) on all three files. Zero hardcoded `rgba()` or hex color literals.

**Executor judgment overrode brief example.** Brief's concrete example used `colors`/`typography` as demo tab labels — those would have collided with the test's `getDemoTablist` filter excluding `Colors|Typography|Components|Motion`. Stage 2 correctly deviated. Healthy: examples are illustrative, not prescriptive.

**Data point count:** build validation now validated on 1 Bug + 1 Feature + 1 Refactor + 1 UI across four probes. All four major type shapes covered end-to-end with zero test mutations, preservation-proof discipline intact, and mechanical verification gates passing.

**Minimal Linear integration worked.** One `save_issue` MCP call to materialize the sub-issue, a few free-form comments at meaningful milestones, three state transitions (`Todo → In Progress → In Review → Done`). No labels needed. No comment templates needed. Operator-confirmed: the minimal first-probe form was adequate without formalization.

## Deliver open questions

1. ~~Does the `notes:` field revision eliminate invented verdicts without weakening stop/go discipline?~~ **Answered by 0.3.** Empirical test on both REF-001 and FRD-143: reviewer used binary verdict + `notes:` field correctly on both, no invented middle labels.
2. ~~Does explicit decomposition-reflex guidance materially improve pre-groomer scoping on cross-cutting Features?~~ **Answered by 0.3.** Pre-groomer returned `design-status: need-info` + proposed decomposition on FRD-143 where 0.1 had produced a unified over-scoped brief.
3. ~~Does build validation generalize from a Bug to a Feature, especially FRD-122?~~ **Answered by 0.2.** FRD-122 → 20/20 tests green, 66 assertions, single-pass Stage 2, zero brief ambiguities.
4. ~~Does build validation generalize to a Refactor shape?~~ **Answered by 0.3.** REF-001 → 12/12 tests green, 55 assertions, zero test mutations, zero diffs outside the 3 expected files.
5. ~~Does UI-functional testing fit the current deliver pattern, or does it require a different oracle shape?~~ **Answered by 0.5.** Playwright E2E works as oracle for UI; 12/12 green on first Stage 2 run. Mechanical `impeccable detect` as Stage 2 verification gate suffices for well-scoped UI additions. Harness stability (Playwright version semver drift) is a real operator-side concern but not a pattern concern.
6. When `deliver` expands beyond manual dispatch, which stage should gain a controller first: grooming only, or grooming plus build validation?
7. *From 0.3 D05 finding.* Does the brief-reviewer's Groundedness check need to verify that cited coverage tests actually pass at baseline, not just that they exist? *Single data point from REF-001; needs second confirmation before spec revision.*
8. *From 0.3 companion.* Should `design-status: need-info` + `verdict: APPROVED` be explicitly codified as a terminal state in the brief-reviewer spec, with a named next-action for the operator? *Two data points now — FRD-143 (0.3) + FRD-161 (0.4). Pattern stable; worth codifying.*
9. *Cross-repo.* All five probes ran against finance_backend_agent. Does the pattern generalize to a different codebase with different stack and conventions?
10. *New — from 0.5 D05 finding.* Third occurrence of pre-groomer emitting an invented status value (`design-status: drafted`) with reviewer accepting. This is recurrent enough to warrant systemic fix: enumerate valid frontmatter values (`design-status`, `reproduction-status`, `preservation-status`) and have brief-reviewer Check 1 reject non-enumerated values. Calibration candidate.
11. *New — from 0.4/0.5.* Skills installed via `skills add` CLI can corrupt baseline files in a project worktree (wiped `.agents/skills/composio` + `.github/workflows/deploy-backend.yml` in 0.4). For future probes needing skill content, surface excerpts via dispatch prompts rather than project-install.
12. *New — from 0.5.* Does the deliver pattern extend to a UI issue whose correctness DEPENDS on operator-committed design direction (FRD-161a-style decision brief)? 0.5's FRD-162 was deliberately direction-agnostic; harder cases remain untested.
