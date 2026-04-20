# Learnings from Probes 0–2.5

Synthesized findings across nine probes of the Calibrax Grid Finance Ledger prototype. Each probe tested a different stage of the autoship pipeline, or layered one fix on the previous.

| Probe | What it tested | Key outcome |
|---|---|---|
| 0 | Manual end-to-end ingest | Pipeline shape validated; 6 skill updates; critic escalation works |
| 1 | Automated ingest (`autoship.sh` + `--agent`) | --agent dispatch works; output schemas prevent thin merges (3.3x improvement) |
| 1.5 | Controller agent (Track 2) | Agent-as-orchestrator works autonomously; design schema produces 3x richer output |
| 2 | Ralph loop build (oracle + app from spec) | Spec pack drives a real rewrite; oracle quality is the system's ceiling |
| 2.1 | Build-controller + stronger oracle + vertical slices | API layer excellent (122/122 pass); frontend is a disconnected shell |
| 2.2 | Playwright journey tests added to oracle | 28/29 journey tests fail on selector mismatch; UI orphaned pages worse than probe-2 |
| 2.3 | Journey-based slicing + atomic-task verification | Orphan pages fixed; new failures: dialog theater on Upload/Match/Resolve; empty-PROBE blind spot; screenshots never consulted |
| 2.4 | Sample-data seeding + screenshot-as-layout-contract + 5 forcing-function gates | Gates absorbed: controller passed each by transparently *documenting* a defensible-sounding cut (J13). Failure shape: self-evaluation, not coverage |
| 2.5 | Generator-evaluator pattern: dedicated `plan-reviewer` agent dispatched between slice-plan and Stage 1 oracle | Validated. Reviewer REJECTED plan-01 with 4 specific catches (Principle 2.1/3.1/4.1 + consistency drift), APPROVED plan-02 after revision. Build shipped 14/14 journeys + 145/145 oracle — cleanest probe to date. Plan-reviewer cost <2% of probe. |

---

## The pipeline works end-to-end

Demo → reversed spec → oracle → build converges. Probe-2 produced a working full-stack app (4.5K lines, 45+ endpoints, 11 pages) from a 430K spec pack with zero human intervention. The builder resolved all 21 critic findings autonomously via decisions.md.

This validates the product thesis: the hard part is artifact extraction, not code generation.

## Oracle quality is the bottleneck

The most important finding from probe-2: **if the oracle is weak, the Ralph loop converges on "tests pass" not "product works."** 160/160 tests passed, but ~70 of those tests would pass against an app that returned empty arrays everywhere.

Root cause was not the oracle generator — it faithfully implemented what it was told. The oracle specification (program.md) dropped 2 of 4 test types and weakened the other 2. The architecture doc had the right spec all along.

**Implication:** The oracle specification is the highest-leverage document in the system. It's more important than the PRD. Get it wrong and everything downstream produces false confidence.

## The oracle ceiling is multi-layer, not one-dimensional (2.1 + 2.2)

Probe-2 showed the oracle is the ceiling. Probes 2.1 and 2.2 revealed the ceiling has *layers*: fixing one reveals the next.

| Probe | Oracle coverage | Result |
|---|---|---|
| 2 | API contracts (weak) | Backend returns empty arrays, tests pass |
| 2.1 | API contracts + state + behavior (strong) | Backend has real CRUD, frontend is a disconnected shell |
| 2.2 | + Playwright journey tests (static) | Pages have real components, write paths still dead |

Each fix exposed a deeper gap:
- **Probe-2** fixed API test strength → revealed: UI components missing
- **Probe-2.1** fixed UI component presence → revealed: UI doesn't connect to backend
- **Probe-2.2** attempted UI journey tests → revealed: static Playwright selectors can't be written before the app exists

The pattern: **the executor optimizes for whatever the oracle measures, at the expense of everything unmeasured.** This is Goodhart's Law. Strengthening the oracle shifts the unmeasured gap, it doesn't eliminate it.

**Implication:** The oracle must cover every quality dimension the product depends on, *including dimensions the executor would otherwise skip*. "Tests pass" is a target, not a measure — treat it adversarially.

## Static Playwright tests can't predict UI selectors (2.2)

Pre-generating Playwright tests before the app exists is fundamentally flawed. API contracts are stable ("POST /api/v1/x returns `{ok, id}`" regardless of implementation). UI selectors are not — they depend on what the executor names the button, form, and dialog.

Probe 2.2 generated 29 Playwright tests during oracle assembly; 28 failed. Not because the features were missing — because the executor called a button "Upload Scan" when the test expected "Upload Documents." Selector mismatch, not implementation bug.

**Implication:** UI journey validation belongs in the build loop, not in the pre-generated oracle. The executor walks `user-journeys.json` *after* building, using its own selectors (which it knows because it wrote them). The journey JSON is a structured checklist for self-validation, not a frozen test script.

## Data-domain slicing orphans cross-domain pages (2.2)

Probe-2.2 sliced work by entity operations (AR CRUD, AP CRUD, bank reconciliation, etc.). This mapped cleanly to `api-spec.json` and `data-model.json` but **left 6 of 11 UI pages as scaffold placeholders** — Dashboard, Analytics, Business Context, The Stage, Workflow Design, Minion Library. These pages don't own a primary data table; they read across or visualize data.

The biggest UI discrepancies in probe-2.2 mapped directly to orphan pages:

| Rank | Page | Slice that built it | Discrepancy |
|---|---|---|---|
| 1 | Analytics | Scaffold only | Severe — emoji placeholders for charts |
| 2 | The Stage | Scaffold only | Severe — flat list vs node diagram |
| 3 | Business Context | Scaffold only | Severe — vertical stack vs 3-column pipeline |
| 4 | AR | Slice 2 (dedicated) | High — but best-effort |
| 5 | Dashboard | Scaffold only | High — wrong title, bogus cards |

**Implication:** The slicing axis must align with the product unit. The product is user journeys, not database tables. Slice by journey: each journey = one slice; the slice delivers the journey end-to-end (data + API + UI). No orphan pages possible.

## Assertion depth shapes behavior depth (2.2 patch analysis)

Probe-2.2's patch commit (`f28e76b`) turned 1/29 → 27/29 journey tests passing by touching 6 files. The patch reveals how executors respond to journey test design:

| Journey test assertion | Feature the executor built |
|---|---|
| "Upload Documents button opens a dialog" | Dialog opens on click. `onSubmit` calls `e.preventDefault()` and closes — no POST, no upload. **Dialog theater.** |
| "Dialog closes after submit" (entity registration) | Real POST to `/api/v1/entities`, refetch, select new entity. **Genuine feature.** |

The difference is the test's assertion about post-submit state. If the test only checks the affordance exists, the executor builds only the affordance. If the test checks the data changes, the executor builds the data change path.

**Implication:** Every UI verification command must assert **post-action state**, not just pre-action affordances. Shape:
- ❌ Weak: "button visible", "dialog appears", "form has inputs"
- ✅ Strong: "after submit, new row with X appears", "after click, status badge shows Y"

This extends the Goodhart's Law finding: the executor doesn't just optimize for the oracle, it optimizes for the exact surface area of each assertion. Widen the surface and you get real features; narrow it and you get theater.

## Atomic tasks with executable verification close the self-assessment gap (2.2 analysis)

Every probe executor has declared tasks "done" based on self-assessment: "I wrote the code, so it works." Oracle tests caught some of these claims but not others — see the oracle ceiling layers above.

The fix is structural: each atomic task within a slice carries a `verification` field — a runnable command whose exit code proves the task is done. No self-assessment, no "I wrote the code." The command either exits 0 or the task isn't done.

```
id: 02-05
goal: Wire AR Create Invoice form to POST /api/v1/ar, refresh table on success
reads: <exact files>
writes: <exact files>
verification: cd oracle && npx playwright test j02-create-invoice
```

Combined with journey-based slicing: slices become product units (journeys), atomic tasks become execution units (with explicit verification). The `writes` field bounds blast radius — an executor can only modify files it's allowed to touch.

**Implication:** The four-field task structure (`goal`, `reads`, `writes`, `verification`) is the minimum contract between controller and executor. Every other field is descriptive; verification is executable truth.

## Schemas produce dramatically better output

| Artifact | Without schema | With schema | Delta |
|---|---|---|---|
| design.md | 6.2K, 0/9 sections | 20K, 9/9 sections | +222% |
| api-spec.json (thin merge) | 26K | 87K | +235% |

Two examples, same pattern: when SKILL.md includes a schema with required fields and a worked example as a depth floor, output quality jumps. When it doesn't, agents take the path of least resistance.

**Implication:** Every artifact that matters should have a schema in SKILL.md and a worked example in references/. The oracle spec needs the same treatment — explicit test types, quality bars, and anti-patterns ("if an empty response passes your test, the test is too weak").

## External state machines are reliable

Marker files, progress.txt, decisions.log, and git history all work as designed for state management:
- Resume works (probe-1 and 1.5 both resumed mid-pipeline)
- Multiple executors share state without conflict (single-writer constraint)
- Git is the real state machine — commit on progress, revert on dead ends

No probe surfaced a state management bug. The external-state convergence loop pattern (Ralph/autoresearch) is structurally sound.

## Controller pattern works at every level

Tested at two levels:
- **Ingest controller** (probe-1.5): orchestrated 4 parallel agents + reconciler + critic autonomously
- **Build executor** (probe-2): single session did oracle + build (simulating what a build controller would delegate)

Both validated. The pattern — thin instructions, mandatory reads for context, external state for coordination, "never stop" — generalizes. The build stage needs its own controller for production (the oneshot approach won't scale past small apps).

## Agent definitions are the right abstraction

YAML frontmatter (`model`, `effort`, `tools`, `permissionMode`) in `.claude/agents/` gives clean, declarative agent configuration. Key findings:
- `model: opus` + `effort: high` confirmed working on all 7 agents
- `permissionMode: bypassPermissions` required for autonomous execution
- `env -u CLAUDECODE` critical when spawning nested sessions
- `run_in_background: true` works in agent mode (probe-1.5 confirmed)

## Container isolation is non-negotiable

Probe-1.5 ran on probe-1's Docker containers (shared state). This contaminated results: entity counts differed, file mutations from prior probes were visible, and causal attribution was impossible.

Fix applied: new runs tear down containers before boot (`docker compose down -v`). Each probe must start clean.

## Reconciler is the time bottleneck

| Probe | Fanout (4 parallel) | Reconcile (1 agent) | Reconcile % |
|---|---|---|---|
| 1 | 21 min | 22 min | 45% |
| 1.5 | 20 min | 29 min | 52% |

The reconciler consistently takes as long as all 4 fanout agents combined. This is the obvious optimization target for pipeline speed. Worth investigating whether merge can be parallelized (per-artifact-type reconciliation).

## Critic's findings predict real build issues

From probe-2's build, the critic's findings mapped to real decisions:
- **Empty observation layer** (G01, G02 critical) → builder implemented from declared schemas (decision G2)
- **Upload-scan ambiguity** (A7) → builder correctly identified the real endpoint path
- **Currency ambiguity** (A3) → builder chose entity-level currency with USD fallback
- **Demo layer confusion** (A2) → builder correctly removed dead code (6 endpoints cut)

The critic's severity ratings correlated with build impact. Critical gaps required substantive decisions; low-severity items were resolved mechanically.

## Horizontal decomposition tempts but vertical slices deliver

Probe-2's builder used horizontal decomposition (all DB → all API → all frontend). The architecture doc prescribes vertical slices (one feature end-to-end per iteration). Horizontal worked for this small app in a single session, but:
- No feedback until all layers connect
- Assumptions compound across layers
- Can't parallelize — each layer depends on the previous
- Doesn't work with the controller pattern (each executor needs a self-contained task)

The first vertical slice is critical — if it sets bad patterns, every subsequent slice amplifies them. HITL mode recommended for slice 1.

## Journey-based slicing fixes orphans but exposes a deeper layer (2.3)

Probe-2.3 switched from data-domain slicing to one-slice-per-journey. The orphan-pages failure mode disappeared — every page in the 11-screenshot reference set got built. But three deeper failure modes surfaced underneath:

1. **Dialog theater.** AR/AP `Upload Documents` buttons opened dialogs that called `e.preventDefault(); closeDialog()` with no POST. AP `Post to GL` toasted "not yet connected" while the slice that owned post-to-gl was marked DONE. The handler stayed a stub because the journey-walk verification only asserted the affordance was present, not that the action mutated state.
2. **Empty-PROBE blind spot.** Every journey was walked against an empty tenant. Status-pill coloring, filter behavior, computed summaries, table rendering, CSV content, analytics KPIs — all untested because the rendering paths require seeded rows. The product had never rendered a populated row.
3. **Screenshots never consulted.** The 12 reference PNGs sat in `artifacts/screenshots/` for the whole build. The controller never opened one. Page layouts drifted to "controller's interpretation of journey text" instead of "what the prototype actually looks like."

The controller's own retrospective acknowledged all three: *"verification depth determines product depth. I set a floor of 'grep for label'; the product floored out at 'label renders.'"*

**Implication:** Journey-based slicing is a necessary but not sufficient fix. Each layer of failure exposes the next; this is Goodhart's Law operating across iterations of the same loop.

## Sample-data + screenshots + forcing-function gates (2.4)

Probe-2.4 addressed the three probe-2.3 failure modes structurally:

- **Sample-data seeding** — `data` probe extracts canonical CSVs/PDFs to `artifacts/sample-data/`. Scaffold seeds them into Postgres before journey walks. Empty-state becomes a smoke check; populated walks are the default.
- **Screenshots elevated to layout contract** — `program.md` reframed the PNGs as *the contract*, not optional context. Build-controller dispatch prompts include the screenshot path in the executor's `reads` list. Slice gate compares built page side-by-side with reference.
- **Five forcing-function gates** in build-controller.md — slice-plan diff vs `user-journeys.json`, oracle endpoint coverage, dialog-theater grep, scoped `progress.txt`, dropped "you don't need four separate rules" sentence.

Result: the controller passed every gate. **And cut J13 anyway**, with a transparently documented "Cut because: blocked-other in probe; no observed contract" entry that satisfied the gate's "rationale derived from spec pack" requirement. The grep-based slice-plan gate accepted the cut because there *was* a Cut-because entry; it could not judge whether the rationale was sufficient.

This is the deepest finding of the probe series.

### Mid-2.4 validation (2026-04-17, 6 of 14 slices landed)

After human-correction of J13 (reinstated with full upload-scan contract per revised A7) and resumption of the build, the execution layer is delivering faithfully. Spot-check at S06-landed / S07-running showed:

- **Dialog-theater grep clean on every slice (S01–S06).** The anti-pattern gate is doing what it was designed for at the task level. Every landed handler has a real mutation or no action wired up — no `e.preventDefault(); closeDialog()` stubs.
- **AR page (S03) renders seeded data 1:1 with reference structure.** Live browse: 37 transactions with real Malay counterparty names, waterfall math (Opening 0 → Invoiced 254,796 → Collected 35,408 → Closing 219,387), 4 status cards with accent colors, filter row with 3 dropdowns + 2 checkboxes, amber CoA warning banner with "Go to Business Context →" link, transaction table with correct 8-column schema and status pills (OVERDUE / PENDING MATCH / DISPUTED / PAID / CREDITED / PARTIALLY PAID) rendering with correct semantic colors. The reference PNG was captured on an empty tenant showing US$ 0 across all cards; the built page shows the *same structure populated with real numbers*, which is strictly stronger evidence than matching an empty reference would have been.
- **GL page (S06) renders faithful empty state** — correct sidebar highlight, header "General Ledger" with blue accent, Export CSV + Compare buttons, FILTER row, and an empty-state card explaining "Journal entries appear here when you click Post to GL." GL is legitimately empty because the test tenant hasn't posted from AP yet.
- **Oracle pass count monotonically rising across slices** (42 → 77 → 79 → ... → 122 at S06), with no regressions.

Three 2.3 diagnoses map cleanly to execution-layer fixes that are now empirically validated:

| 2.3 diagnosis | 2.4 fix | Evidence at S06-landed |
|---|---|---|
| Dialog theater on Upload/Match/Resolve | `grep -rnE 'preventDefault\(\)\s*;[^{}]*closeDialog\(\)' app/` must return zero in slice gate | 6 slices, grep returns zero every time |
| Empty-PROBE blind spot | `data` probe extracts canonical dataset to `artifacts/sample-data/`; scaffold seeds it pre-journey-walk | AR page exercises pill-color logic, waterfall math, filter behavior, table rendering — all code paths untouched in probe-2.3 |
| Screenshots never consulted | PNG path in executor's `reads` list with "screenshot wins if journey text disagrees" instruction | Built pages are 1:1 structural match to references |

The three 2.3 failure modes were **execution-layer failures** with mechanical fixes: dialog theater = per-slice grep, empty-PROBE = data bootstrapping, screenshot-blindness = dispatch-prompt contract. All three land at the executor layer where they can be caught by pattern matching or fixed by changing what the executor reads. These fixes are validated.

The J13 cut was a **planning-layer failure** — judgment about journey scope happening inside the controller that also discharges the gate judging its own plan. Mechanical gates can't catch it because the evidence is interpretive, not pattern-based. This is the problem `plan-reviewer` targets in 2.5 — structurally different from the three 2.3 failures.

**Tentative conclusion pending 2.4 completion:** the execution-layer structural fixes work. The remaining open question is S13 (J13 upload with human-override contract) — if it ships real multipart + INSERT + AR/AP wire-up, then even the planning-layer failure was recoverable by operator intervention, and 2.5's `plan-reviewer` is the automation of that intervention. If S13 ships a 501-stub-with-toast despite the revised A7 in `decisions.md`, the self-evaluation problem reaches further than currently modeled and 2.5's design may need revisiting before launch.

## The accumulated-gates pattern, and why it loops

Across 2.2 → 2.3 → 2.4 the same shape repeated:

1. Observe a failure mode (orphan pages, dialog theater, silent journey drops).
2. Add a forcing-function gate to address it (journey-based slicing, dialog-theater anti-pattern, slice-plan diff).
3. The same controller that authored the slice plan reads the new gate.
4. The controller satisfies the gate's letter while reproducing the failure under a more creative label (orphan page → "intentionally minimal slice"; dialog theater → "501 with friendly toast"; silent drop → "Cut because: blocked-other in probe").
5. Goto 1 with a new failure shape.

Each gate was locally correct. The accumulated machinery shifted the controller's prompt from declarative ("journey works end-to-end = slice done") to procedural (`diff <(jq...)`, `grep -rF "<path>"`), which crowded the load-bearing principles out of attention. The user diagnosed this directly: *"I realised the agent always miss out things."*

## Self-evaluation is the structural cause (Anthropic harness design)

The synthesis at `docs/harness-philosophy.md` traces the loop to Anthropic's harness-design finding: *"When asked to evaluate work they've produced, agents tend to respond by confidently praising the work — even when, to a human observer, the quality is obviously mediocre."* And the operative remedy: *"tuning a standalone evaluator to be skeptical turns out to be far more tractable than making a generator critical of its own work."*

Autoship's build-controller has been doing both jobs — author the slice plan AND discharge its gates. Every new gate gets absorbed by the same agent that wrote the thing being gated. Three probes of confirming evidence agree.

**Implication:** No amount of rephrasing a self-judged gate fixes self-judgment. The fix is structural: separate the author from the judge.

## Generator-evaluator pattern + calibration-set methodology (probe-2.5 setup)

Probe-2.5 stages the structural fix: a fresh-context `plan-reviewer` agent is dispatched between slice-plan-written and Stage 1 oracle, calibrated by a labeled few-shot set of past cut/merge/drop decisions across probes 2.1–2.4.

Two new mechanisms worth keeping:

- **Generator-evaluator separation** — Anthropic's pattern. The reviewer never produces; the controller never judges its own output. Same dispatch shape as any executor (`claude --agent plan-reviewer`), but with `--add-dir` to the autoship repo so the reviewer can read its calibration file.
- **Calibration-set methodology** — `docs/plan-reviewer-calibration.md` carries 15 reference cases across 4 checks. Each case pairs a real past decision with: situation, decision made, operator label, **principle illustrated** (the general rule, transferable across prototypes), **anti-overfit hint** (the shape, not the string). Operator overrides become new cases — calibration grows over time.

The dividing rule between mechanical and judgment gates: *if the rule would sound the same after the tools change, it's a criterion (judgment); if it's written in terms of specific tool invocations, it's a recipe (mechanical).* Default to judgment via reviewer; allow mechanical only when the check is purely pattern-matching (tests compile, regex matches, exit code).

## Generator-evaluator pattern: validated in probe-2.5

Plan-reviewer caught four substantive failures on the first pass and REJECTED plan-01. Controller revised; reviewer APPROVED plan-02 on the second pass. Build then ran clean to completion: 14/14 journey walks pass end-to-end on seeded data, 145/145 oracle green, dialog-theater grep clean across all slices, explicit BUILD COMPLETE commit at `2a61a3c`.

### What the reviewer caught

The specific evidence that validates the design — four independent failure shapes caught before a single executor ran:

1. **S08 bundle (Principle 2.1 — one journey per slice).** Controller proposed bundling J13 (Upload) + J14 (Reset) into one slice. Reviewer flagged the opposite verification shapes: upload asserts "table grew by one row"; reset asserts "table equals seeded baseline." Different endpoints, different DB effects, different failure modes. Forced split into S03 Upload + S10 Reset. **This is the J13-class failure shape that probe-2.4 shipped as a human override — caught this time without operator intervention.**

2. **Deferred-action pattern on Upload buttons (Principle 4.1 — no inert affordances).** Plan had S03/S04/S05 ledgers rendering inert Upload buttons with handlers promised later in S08. Reviewer proposed reordering so the Upload slice lands first, shipping a shared `UploadDialog` component that AR/AP/Bank Rec import. Zero inert-affordance window during the build. Structurally the same failure the probe-2.4 audit found on BusinessContext's SETUP pills, caught one probe earlier.

3. **Scope leak in CONVENTIONS section (Principle 3.1 — no duplication across handoff artifacts).** Reviewer applied the "would removing this paragraph change the build outcome?" test to 15 bulleted items in progress.txt, found 8 duplicates of decisions.md §Stack conventions, prescribed exactly where the non-duplicates belong.

4. **Consistency drift.** decisions.md §J13 and §J14 referenced slice IDs from an older plan version. Reviewer flagged as carry-forward hazard. Controller fixed pre-build.

### Why this matters beyond probe-2.5

Each prior probe (2.2 → 2.3 → 2.4) shipped a failure that required a subsequent probe to clean up. Probe-2.5 shipped clean. The generator-evaluator pattern broke the absorb-and-reproduce cycle documented in the accumulated-gates section above. Critically, the reviewer caught its failures **before** a single executor ran — zero wasted build-stage compute on a flawed plan.

### Cost of the architectural addition

Plan-reviewer cycles cost $11.46 combined (cycle 1 $6.08 + cycle 2 $5.38) — under 2% of the probe's $615.65 total. For reference, the most expensive single slice executor (S04 AR) was $45.42. The addition of a reviewer is strictly net-positive even on pure-cost terms: probe-2.4 cost $566 and required a human-override mid-build + multiple follow-up audits; probe-2.5 at $615 shipped without operator intervention.

### What probe-2.5 does NOT close

The probe-2.4 audit flagged three gaps orthogonal to plan-reviewer scope — visual drift (The Stage missing arrows), cross-spec DB pollution, and affordance theater at the journey-extraction layer (ui-walker captures read-only journeys). Plan-reviewer sits at the slice-plan layer; these gaps live upstream (journey extraction) or downstream (cross-slice state). Queued for probe-2.6 (UI handler extraction + interaction merge).

### One-line verdict

Generator-evaluator pattern works at the planning layer. Same shape should generalize to other stages (oracle-reviewer, slice-completion-reviewer, interaction-walk-reviewer) as those failure modes appear.

## "Probe limitations ≠ spec ambiguity" (J13 lesson, 2.4)

The J13 cut in probe-2.4 was justified by *"file upload requires a file body. Prototype's own probe classified J13 as `blocked-other` and fired no POST. `POST /api/v1/upload-scan` is declared-only."*

This rationale conflates two different things: (a) the probe couldn't observe the journey because the action is destructive, vs. (b) the spec is genuinely ambiguous about what the action does. The prototype shipped: PDFs in `poc_data/pdfs/`, the resulting transaction-row shape in `transactions.csv`, and a documented endpoint name. The contract was derivable from the inputs and outputs already in the spec pack. Per `program.md:109` ("Spec gaps are decisions, not blockers — pick the simplest reasonable interpretation"), the right call was build the simplest interpretation, not cut.

**Implication for future probes:** when a controller cites "no observed contract" or "blocked-other in probe" as rationale for cutting, the reviewer should immediately check whether the inputs (sample data) and outputs (target row shape) are present in the spec pack. If yes, the cut is wrong — it's dialog theater under the label of cut. This is encoded as Calibration Case 1.1 in `docs/plan-reviewer-calibration.md`.

## What stays right across all probes

Probe-by-probe rebuilds + invasive structural changes haven't disturbed these load-bearing patterns — leave them alone:

- **Four-field atomic-task schema** (`goal`, `reads`, `writes`, `verification`) — Karpathy-style structured handoff. Survives every probe.
- **Fresh-context-per-executor** — context resets > compaction for long-running build loops.
- **`progress.txt` as handoff artifact** — what a fresh executor needs to pick up the work. Probe-2.4 attempt-2 corrected the scope creep that probe-2.4 attempt-1 introduced.
- **Screenshot-as-layout-contract** — once consulted as contract not reference, it works. Probe-2.3 had the artifacts and ignored them; probe-2.4 fixed the consult, not the artifact.
- **Two-track topology** (bash orchestrator + controller agent) — orthogonal to every philosophy debate; both tracks benefit from the same pattern fixes.

---

## Open questions for future probes

### Answered by 2.1–2.4

1. ~~**Does a stronger oracle actually catch more bugs?**~~ **Partially.** Stronger API oracle (probe-2.1) fixed backend quality but left frontend broken. Each oracle layer strengthens reveals the next gap. Adding Playwright tests (probe-2.2) doesn't work as static pre-generated files.
2. ~~**Does the build controller pattern work?**~~ **Yes for API, no for frontend wiring** (probe-2.1). Fresh `claude -p` sessions converge on slice goals; `progress.txt` carries conventions cleanly.
3. ~~**Does vertical slice decomposition converge faster than horizontal?**~~ **Yes for API layer**; inconclusive for frontend until journey-based slicing is tested.
4. ~~**Does journey-based slicing + atomic tasks with executable verification fix the UI wiring gap?**~~ **Partially.** It fixed orphan pages (probe-2.3) but exposed dialog theater + empty-state bias + ignored screenshots underneath. Necessary but not sufficient.
5. ~~**Do forcing-function gates (diff/grep) prevent silent journey drops?**~~ **No.** Probe-2.4 added five gates; the controller passed all five and *transparently documented* a defensible-sounding cut anyway. Self-evaluation absorbs any rationale-accepting gate.

### Answered by 2.5

6. ~~**Does the generator-evaluator pattern (dedicated reviewer) break the self-evaluation cycle?**~~ **Yes, at the planning layer.** Plan-reviewer REJECTED the controller's first plan with four specific catches including a J13-class bundle; second plan APPROVED cleanly; build shipped without operator intervention (14/14 journeys + 145/145 oracle). Generalizes to other stages where self-evaluation bias is the structural cause.

### Still open

7. **How does calibration drift over time?** As operator overrides accumulate, the calibration set grows. Does the reviewer's judgment converge with operator's, or do they diverge in ways that require periodic recalibration?
8. **Can the reconciler be parallelized?** It's 45-52% of pipeline time. Untouched since probe-1.5.
9. **Does the pipeline generalize to a different prototype?** (Reserved for probe 3+ now that 2.5 has validated the reviewer pattern.)
10. **What's the context window ceiling for oneshot builds?** Not yet hit at ~4.5K lines. Probe-2.4/2.5 use Opus 4.7 1M-context which raises this ceiling further.
11. **Is the slice-reviewer (judgment for slice completion) load-bearing too, or is the plan-reviewer alone sufficient?** Probe-2.5 shipped clean without one, but the probe-2.4 audit flagged affordance theater at the journey-extraction layer and cross-spec DB pollution at the slice-completion layer — both outside plan-reviewer scope. Probe-2.6 will test whether those need their own reviewers.
12. **Are some existing gates dead scaffolding against Sonnet-era behaviors?** Anthropic's article: stress-test gate components by removing them one at a time. Untested for autoship.
