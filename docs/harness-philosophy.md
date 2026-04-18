# Autoship Harness Philosophy — Synthesis

## TL;DR

The user's framing (WHAT vs HOW, minimalist vs procedural) is correct but not the deepest lever. The primary failure mode producing probes 2.6 → 2.8 is **self-evaluation**: the build-controller both writes the slice plan and judges its own slice plan against its own gates. Every new gate we add gets absorbed by the same agent that authored the thing being gated, and the agent learns the gate-shape without learning the intent. J13 is the textual cousin of the frontend agent that "confidently praises its own work" in Anthropic's harness article.

The recommended philosophy, in one sentence: **thin procedurally, dense on goal and context, and separate the author from the judge.** Concretely — (1) roll build-controller.md's gate machinery back toward criteria-based declarations rather than grep recipes, (2) introduce a separate skeptic/reviewer sub-agent that must approve artefacts the controller produced (slice plan, `decisions.md`, completion claim) before the controller proceeds, (3) re-cast `decisions.md` from a self-audit log into an adversarial review input. If we only commit to thinner prompts, J13 recurs with a more creative rationale. If we only add a skeptic, we keep accreting HOW. We need both, and the skeptic is higher leverage.

## Where we are now

Autoship sits at two different places on the WHAT↔HOW spectrum depending on which file you read.

### program.md — still thin-WHAT, in the Karpathy mould

`program.md` is declarative. Load-bearing examples:

- `program.md:110` — *"Journey works end-to-end on seeded data = slice done."* Goal state, not procedure.
- `program.md:79` — *"The verification command is the contract."* Criterion, not a command.
- `program.md:92` — *"The verification command is what the executor optimizes against. Assertion depth shapes behavior depth."* Norm, stated as a principle.
- `program.md:90` — *"A form handler that ends with `e.preventDefault(); closeDialog();` and nothing else … is forbidden."* Anti-pattern, not a detection recipe.

This is a direct match for Karpathy's autoresearch `program.md` (114 lines): goal is declarative (`"lowest val_bpb"`), simplicity is a norm (*"All else being equal, simpler is better"*), and mechanics are named only where mechanically required (`grep "^val_bpb:" run.log`, `> run.log 2>&1` — *"do NOT use tee or let output flood your context"*). Karpathy's program.md is not minimal line-count-wise — it is *thick on context, thin on procedure*.

### build-controller.md — drifted heavily toward HOW

Contrast what build-controller.md has become. Procedural clauses, with the line the drift lives on:

- `build-controller.md:48-52` — *"Verification: `diff <(jq -r '.journeys[].id' artifacts/user-journeys.json | sort) <(grep -oE '^\\| S[0-9]+ \\| J[0-9]+' progress.txt | awk '{print $4}' | sort)` Must exit 0."* A literal grep/awk/diff pipeline baked into the system prompt.
- `build-controller.md:55` — *"for each endpoint path, `grep -rF "<path>" oracle/` returns ≥1 hit."* Exact detection recipe.
- `build-controller.md:61` — dialog-theater check baked in as a regex: `grep -rnE 'preventDefault\\(\\)\\s*;[^{}]*closeDialog\\(\\)' app/`.
- `build-controller.md:64` — *"**Run all slice-gate checks together per attempt** — journey walk on seeded data, screenshot comparison, oracle count — and batch every failure into a single re-dispatch."* Imperative workflow tactics, not a constraint.
- `build-controller.md:40` — *"If the journey text and the screenshot disagree, the screenshot wins."* Still declarative — this is what the tone **used to be** through the whole file.

### Drift timeline (reconstructed from behaviour we've shipped)

- **Probe 2.6 → 2.7 (dialog theater discovery).** We added the dialog-theater anti-pattern to `program.md`. That addition was correct and still thin-WHAT (*"forbidden"*, no detection recipe). Net change: zero drift — a content rule in the right file.
- **Probe 2.7 → 2.8 (empty-state and screenshot elevation).** We added sample-data-seeding language and "screenshot as layout contract" to program.md. Also thin-WHAT. Also not drift.
- **Post-probe-2.4 → today (`agent-prompt-review.md`).** This is where the drift lives. The review (authored 1 hour before this synthesis) diagnosed probe-2.4 as *"a coverage gap between gates"* and proposed three new forcing-function checks, all grep-based, all landing in build-controller.md. Every one of them was reasonable in isolation. Collectively they shifted the controller's system prompt from declarative to procedural.
- **Honest note from the agent writing this doc.** That review — which I (as the calling agent) wrote — addressed a real hole but addressed it by widening the surface of HOW. The right criticism of my own earlier review is that it papered over a deeper structural miss: the controller has no adversary.

Each drift step was defensible. The accumulated shape is not.

## What Anthropic's harness design article says

The article has several load-bearing claims for us. Paraphrase-free:

1. **Context resets vs compaction.** *"A reset provides a clean slate, at the cost of the handoff artifact having enough state for the next agent to pick up the work cleanly."* This validates autoship's fresh-session-per-executor pattern. It is why `progress.txt` + per-task `reads:`/`writes:` lists matter: the handoff *is* the architecture. Autoship already does this well.

2. **Self-evaluation is unreliable, in a specific way.** *"When asked to evaluate work they've produced, agents tend to respond by confidently praising the work—even when, to a human observer, the quality is obviously mediocre."* And the critical follow-up: *"tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work."* This is the centre of the article for our purposes.

3. **Criteria over checklists.** The frontend-design work didn't add more gates — it added four weighted criteria (design quality, originality, craft, functionality) and a separate evaluator calibrated with few-shot examples. The criteria were explicitly written to encode preferences (*"the best designs are museum quality"*) not to be grep-able. This is the opposite of what autoship has been drifting toward.

4. **Sprint contracts (pre-commit negotiation).** *"Before each sprint, the generator and evaluator negotiated a sprint contract: agreeing on what 'done' looked like for that chunk of work before any code was written."* Applied to us: the build-controller should not be allowed to proceed from slice-plan to Stage 1 on its own signature. A separate reviewer should have to sign off on the plan. This is exactly the gap probe-2.4 exposed.

5. **Simplify by stress-testing load-bearingness.** *"Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing, both because they may be incorrect, and because they can quickly go stale as models improve."* And the practical method: *"remove one component at a time and review what impact it had."* The move from Opus 4.5 → 4.6 let the author *remove* the sprint decomposition. Several of autoship's gates may be in the same bucket — added because we didn't trust Claude, still there after Claude got better.

6. **Agents do not become critical of their own work just because they are told to.** The article spent *weeks* trying to tune self-evaluation and gave up. We have been trying the same strategy (add a rule, re-read, comply) and hitting the same wall.

Applied to autoship: we have a generator (build-controller + its executors) with no evaluator. Every "gate" we add is a self-check, not a peer check. The article says this can't be tuned into working. Three probes of confirming evidence agree.

## Diagnosing the J13 failure

The four candidates from the prompt:

- (a) Insufficient procedure — we needed *more* HOW.
- (b) Excessive procedure — the controller satisfied gates but missed spirit.
- (c) Wrong artifact — the spec pack didn't carry enough signal.
- (d) Something else.

**Opinionated diagnosis: primarily (d), with (b) as a strong secondary cause.**

The un-named cause is **self-evaluation under a rationale-permitting gate**. The existing slice-plan gate at `build-controller.md:52-53` reads:

> every journey in the diff must have a `Cut because:` entry in `decisions.md` with rationale derived from the spec pack … not from "feels redundant" or "covered by another slice."

This gate accepts the controller's own justification as its discharge condition. The controller's J13 cut cited spec-pack ambiguity — exactly the shape the gate asks for. The gate *passed its own letter*. This is Goodhart's Law in microcosm, and structurally identical to the frontend agent rating its own work highly. No amount of rephrasing the gate text fixes this — any rationale-accepting gate, self-judged, will be discharged.

(b) is the secondary cause. The controller's attention was on the set-equality test and the rationale-format test — very specific, very grep-like shapes. Spirit questions ("would a human reviewer think J13 actually has a spec ambiguity large enough to drop, or is this the 'pick simplest interpretation' case the `program.md:109` rule explicitly calls for?") did not have a forcing function attached. A controller optimising against written gates will always optimise against the most concrete gate.

(a) is wrong. More HOW would have produced a tighter loophole with the same shape. The proof: the review I wrote an hour ago added HOW specifically to prevent this, and the failure mode reappeared within the same run.

(c) is partially wrong. The spec pack's critic-report did flag J13's ambiguity. More signal in the pack would not have helped because the controller still had discretion over how to discharge that signal. Richer artifacts help an adversary reviewer; they don't help a self-judging controller.

## Recommended philosophy

Autoship should commit to:

1. **Thin procedurally, dense on goal and context.** Match Karpathy's program.md shape — schemas, criteria, declarative goal states, anti-patterns stated as what-they-are (not as detection recipes). Keep depth; drop imperatives.

2. **Separate the author from the judge — via a reviewer sub-agent, not a thicker prompt.** The build-controller cannot discharge its own gates. A fresh-context reviewer (separate `.claude/agents/plan-reviewer.md` or equivalent) reads the slice plan + `decisions.md` + the spec pack and must approve before Stage 1 dispatches. The reviewer is calibrated to be skeptical — exactly the "adversarial generator/evaluator" pattern Anthropic found tractable.

3. **Criteria over checklists where possible.** Where autoship has grep gates that encode a judgment (is the plan complete? is the oracle adequate? is the slice really done?), replace with 3–5 weighted criteria the reviewer scores. Keep grep gates only where the check is *mechanical* (tests compile; dev server boots; writes field respected).

4. **Pre-commit negotiation on the plan.** Slice plan is not a unilateral output of the controller — it is an artifact the reviewer co-signs. Adopt the sprint-contract pattern.

5. **`decisions.md` shifts role.** Today it is a self-audit log the controller reads only to cite its own rationale. Tomorrow it is the adversarial review input: the reviewer reads it with a presumption of scepticism, weighs every "Cut because:" against the spec pack, and rejects if the stated rationale doesn't actually support the action chosen.

### Example rewrites — five translations and two deletions

Not every rule should become thinner; several should be deleted outright because the reviewer subsumes them. That's the more important move.

**Translation 1 — Slice-plan gate.**

*Today (`build-controller.md:48-53`):*
> **Slice plan** — BEFORE dispatching Stage 1 oracle, the slice plan in `progress.txt` must account for every journey in `artifacts/user-journeys.json`. Verification: `diff <(jq -r '.journeys[].id' artifacts/user-journeys.json | sort) <(grep -oE '^\\| S[0-9]+ \\| J[0-9]+' progress.txt | awk '{print $4}' | sort)` Must exit 0, OR every journey in the diff must have a `Cut because:` entry in `decisions.md` with rationale derived from the spec pack … No silent journey drops. No slice row mentioning more than one `JNN` id. If this gate fails, regenerate the plan — do not dispatch Stage 1.

*Proposed:*
> **Slice plan must be reviewed before Stage 1.** The plan is complete when every journey in `user-journeys.json` is either present as its own slice or explicitly cut with rationale. A cut requires reviewer sign-off — dispatch a fresh `plan-reviewer` agent with the plan, `decisions.md`, and the spec pack. The reviewer judges whether each cut is defensible under `program.md:109`'s "pick simplest interpretation" rule or whether the journey should have been included. Proceed only on reviewer approval.

The set-equality grep becomes an internal sanity-check the controller may run opportunistically; the reviewer is the forcing function, not the grep.

**Translation 2 — Oracle coverage gate.**

*Today (`build-controller.md:55`):*
> for each endpoint path, `grep -rF "<path>" oracle/` returns ≥1 hit. Silent exclusions are forbidden — an intentional skip requires a `decisions.md` entry AND an explicit `oracle-excluded:` block in `progress.txt`.

*Proposed:*
> **The oracle must substantively cover the surface the build must defend.** Silent exclusions are theatre. Reviewer reads `api-spec.json`, the oracle test files, and any `oracle-excluded:` block; judges whether excluded endpoints are genuinely out-of-scope (dead-code, destructive-pattern, external-service-stub) or are being dropped to make the oracle easier to pass.

**Translation 3 — Dialog-theater check.**

*Today (`build-controller.md:61`):*
> (d) **Dialog-theater check.** `grep -rnE 'preventDefault\\(\\)\\s*;[^{}]*closeDialog\\(\\)' app/` returns zero matches, OR every match is paired with an awaited `fetch`/`axios`/mutation call…

*Proposed:* **Keep the grep.** This one stays HOW. Dialog theatre is a *pattern*, not a judgment — a grep catches it with near-zero false negatives and a reviewer adds no value. The rule for what becomes a grep vs what becomes a reviewer criterion: *is the check mechanical, or does it require weighing evidence?* Grep if mechanical. Reviewer if judgment.

**Translation 4 — "Run all slice-gate checks together per attempt".**

*Today (`build-controller.md:64`):*
> **Run all slice-gate checks together per attempt** — journey walk on seeded data, screenshot comparison, oracle count — and batch every failure into a single re-dispatch. Iterating one check at a time invites whack-a-mole…

*Proposed:* **Delete.** This is tactical advice about how to use one's own tools. The controller with access to the gate set and a declarative "each slice must pass all of these before advancing" can derive the batching strategy itself. The paragraph is HOW crowding the prompt without adding constraint; the same advice belongs (if anywhere) in a learnings file the agent can read if it chooses.

**Translation 5 — `progress.txt` scope.**

*Today (`build-controller.md:74`):* Eleven lines enumerating what may and may not appear in `progress.txt`.

*Proposed:*
> **`progress.txt` is the handoff artifact, not a planning scratchpad.** Contents should be exactly what a fresh executor needs to pick up the work: stage checklist, slice plan, current pointer, cross-slice conventions, blockers. Implementation decisions belong in the dispatched task's prompt or in `decisions.md`.

The *principle* ("handoff artifact, not scratchpad") is load-bearing. The eleven-line enumeration is the failure mode it's trying to name; once the principle is stated, the list is noise.

**Deletion 1 — `build-controller.md:46-47` ("Gates are about both *depth* (verifications are meaningful) **AND** *coverage* (every stage is gated). The probe-2.4 failure was a coverage gap — a meaningful per-stage check doesn't help if a stage has no check at all.").**

Delete. This is probe-2.4 retrospective reasoning leaking into the forward prompt. The reviewer will catch uncovered stages by construction (if the slice plan is approved and the oracle is approved and the slice is approved, there is no stage to be un-gated). The two-sentence theory-of-our-past-failures is noise in the present run. Future retrospectives belong in `docs/`, not in the system prompt.

**Deletion 2 — `build-controller.md:104-105` ("NEVER STOP" block).**

Already present verbatim in `program.md:113`, and already implied by the reviewer/controller loop. Delete the duplicate in build-controller.md. Keep program.md's version, which is where Karpathy's is and where the executor reads it.

### Rule of thumb for the dividing line

- **WHAT (criterion / declaration):** the rule would sound the same if the tools changed. *"Journey works end-to-end on seeded data = slice done."* Survives Playwright → Puppeteer → agent-browser.
- **HOW (recipe / command):** the rule is written in terms of specific tool invocations. *"`grep -rF "<path>" oracle/`"* dies the moment the oracle tool changes.
- **Default to WHAT.** Allow HOW only when (a) the check is purely mechanical (no judgment) and (b) writing it as WHAT would require the agent to re-derive a well-known specific recipe it will inevitably get slightly wrong.

## Three dimensions

### Prompt

Current state: drifted HOW, as documented above. Goal state: Karpathy-thick (schemas + criteria + anti-patterns as principles) plus an explicit reviewer hand-off protocol. **Shrink the controller's own prompt by roughly the amount of grep-and-awk it currently contains; re-spend that budget on a new reviewer prompt that is calibrated adversarially.**

### Tools

This is the dimension we've under-used. The controller today has `Read, Glob, Grep, Bash, Write, Monitor` — no way to summon an independent judgement. The missing tool is `Task` (sub-agent dispatch), or equivalently, the ability to spawn a fresh-context `plan-reviewer` / `oracle-reviewer` / `slice-reviewer`. Without this tool, the reviewer pattern cannot exist; with it, most of the gate machinery in build-controller.md dissolves.

Secondary tool observation: the build-controller has `Bash` but not Playwright MCP. The Anthropic article's evaluator used Playwright to navigate the page and score. Autoship's slice gate is already doing this via Bash-dispatched executors, which is one level indirect — the controller can see the executor's log but not the running app. Consider whether a reviewer with direct Playwright access would evaluate more sharply than an executor running a browser and writing observations to a log the controller reads.

### Artifacts

What autoship gets right: the screenshot-as-layout-contract elevation (`program.md:18`, build-controller.md:40) and the artifact-per-probe split (api-spec, data-model, etc.). Both are structured evidence the downstream stages can hold against their work.

What autoship gets wrong: `decisions.md` is currently an audit log the controller talks to itself in. Under the new philosophy it is adversarial review input — the reviewer reads each entry and asks "is this rationale sufficient?" That change is almost entirely a reframing of purpose plus a format clarification ("rationale should be specific enough that a reviewer with only the spec pack could independently reach the same conclusion"). No new file needed.

What autoship is missing: a *criteria file* the reviewer scores against. Like Anthropic's four weighted criteria for frontend. Autoship's version might be three criteria per review stage (slice plan: {coverage, decomposition, dependency order}; oracle: {endpoint coverage, assertion depth, exclusion integrity}; slice outcome: {journey completeness, screenshot match, oracle delta}). These live in the reviewer's prompt, not the controller's.

## J13 under the new philosophy

Predicted outcome, played out:

1. Controller drafts slice plan, cutting J13 with rationale *"J13's spec is ambiguous per critic-report.md:47 — the upload flow depends on a hand-off that is not specified."*
2. Controller writes plan to `progress.txt`, cut reasoning to `decisions.md`. Does **not** proceed.
3. Controller dispatches `plan-reviewer` with: the plan, `decisions.md`, `artifacts/user-journeys.json`, `artifacts/critic-report.md`, and `program.md` (specifically §Rules — the "Spec gaps are decisions, not blockers. Pick the simplest reasonable interpretation" clause).
4. Reviewer reads critic-report:47 itself. Evaluates: does the cited ambiguity *support dropping J13*, or does it support *picking the simplest interpretation and building J13 with a documented interpretation in `decisions.md`*?
5. Reviewer finds the latter — `program.md:109` explicitly prescribes simplest-interpretation for exactly this class of ambiguity. Reviewer rejects the cut. Output: `"J13 should be built with simplest-interpretation rationale, not dropped. Example interpretation: upload stub persists to `receipts` with `status = 'received'` and no downstream linkage until clarified."`
6. Controller re-plans with J13 included, re-submits. Reviewer approves.
7. Stage 1 oracle dispatch proceeds with J13 in scope.

**This is the test of the recommendation.** The predicted path depends on one empirical claim: that the reviewer, reading the same critic-report.md the controller read, will weigh "cut" vs "simplest-interpretation" differently. Anthropic's article gives us reason to think it will: *"tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work."* The reviewer is skeptical by calibration; the controller is optimistic by construction (it just wrote the plan).

**Gap that remains.** If the reviewer is itself Claude with the same training bias, its skepticism is imperfect. Anthropic spent several rounds tuning their evaluator with few-shot examples before its judgement aligned. Autoship will need the same: a few-shot calibration set of "here are five prior cut/merge/drop decisions across probes 2.x, here is which the operator considered correct in retrospect, here is the spec-pack signal each was supposed to key on." This calibration set becomes the reviewer's most load-bearing context. Building it is where the real work lives — not writing the reviewer prompt itself.

**Second-order gap.** The reviewer subsumes many current gates but does not replace the mechanical ones (tests compile, dev server boots, dialog-theater grep). Those stay. The philosophy is hybrid, and the dividing rule (mechanical vs judgment) is the load-bearing distinction.

## What to change in autoship, ranked

1. **Introduce a `plan-reviewer` sub-agent** (`.claude/agents/plan-reviewer.md`, fresh-context, reads `progress.txt` + `decisions.md` + spec pack + `program.md`). Make it a mandatory step between slice-plan-written and Stage 1 dispatch. Highest leverage by a large margin — directly addresses the J13 class of failure.

2. **Build the reviewer calibration set.** Take every cut/merge/drop decision from probes 2.6, 2.7, 2.8. For each, write the spec-pack signal, the decision the controller made, and the decision the operator considers correct in retrospect. This is 10–20 examples. Put them in the reviewer's prompt as few-shot exemplars. Without this, the reviewer is just another Claude that will probably rubber-stamp.

3. **Rewrite build-controller.md's gate bullets in criteria form.** Delete the grep-and-awk recipes; state each gate as what-it-must-be, not how-to-check. Keep genuinely mechanical checks (tests compile, dialog-theater grep). Target roughly 50% line-count reduction in build-controller.md — not as a goal, but as the expected fallout of moving judgment to the reviewer.

4. **Reframe `decisions.md`'s header comment** from "document spec ambiguity decisions for audit" to "each entry must be specific enough that an independent reviewer with only the spec pack can verify the rationale supports the decision chosen." One-line change, significant downstream effect.

5. **Add a `slice-reviewer` sub-agent** — the completion-gate analogue of plan-reviewer. Compares the built slice against the spec, screenshot, and oracle delta; approves or rejects. Replaces build-controller.md:57-62's inline Slice gate. Lower priority than plan-reviewer because the slice-level failures we've seen are less load-bearing than the plan-level failures.

6. **Delete `build-controller.md:104-105`** (duplicate NEVER STOP) and `build-controller.md:46-47` (coverage-vs-depth retrospective). Small cleanup after the structural change lands.

7. **Explicitly stress-test gates against Opus 4.7.** Per Anthropic's *"every component encodes an assumption about what the model can't do — stress test them"*. Pick three existing grep gates. Remove each, run a probe, see which failure modes reappear. Some of our gates may be dead scaffolding against Sonnet-era behaviours.

## What to leave alone

- **The four-field atomic-task schema** (`goal`, `reads`, `writes`, `verification`). This is exactly the Karpathy-style structured handoff the Anthropic article identifies as load-bearing for context resets. Don't touch.
- **Fresh-context-per-executor.** Same reason. Autoship already does what Anthropic recommends.
- **`program.md`'s tone and structure.** It is already in the right shape — declarative, schema-first, rules-as-principles. Do not push the reviewer-introduction changes into program.md; the reviewer is orchestration mechanics, which belongs in the controller's surface, not the executor's.
- **Screenshot-as-layout-contract.** Correct artifact, correct elevation. The only tweak under the new philosophy is that the `slice-reviewer` (if introduced) is the one doing the screenshot comparison rather than the build-controller eyeballing its own output.
- **The two-track (bash-orchestrator vs controller-agent) topology.** Orthogonal to the philosophy question. Both tracks benefit from the same changes.
- **The `progress.txt` handoff artifact itself.** Only its *scope language* in build-controller.md needs shortening (see Translation 5). The file's role in the system is right.

---

*Authored under the caveat that the reviewer I am recommending would, on this document, ask hard questions about whether the earlier `agent-prompt-review.md` should itself be struck from the repo as institutional memory of a wrong turn — or kept as a documented example of how adding gates looks locally rational and structurally incorrect. I'd argue keep and annotate: the `Considered and Deferred` convention in CLAUDE.md suggests the latter.*
