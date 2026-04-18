# Plan-Reviewer Calibration

This file is the plan-reviewer's reference for what good vs. wrong slice-plan judgment looks like. Each example pairs a real decision from a past probe with a label, the reasoning behind it, the **principle** the example illustrates, and an **anti-overfit hint** so the reviewer abstracts from the case to the pattern.

The reviewer reads this file on every invocation. Examples will accumulate across probes — keep entries short, organized by check, and updated when new failure modes surface.

## How to use this file

For each of the four checks the reviewer performs, this file lists 3-5 reference cases. The reviewer's job is **not** to pattern-match the cases verbatim — it is to identify the *shape* the case illustrates and judge whether the current plan exhibits that shape.

When labeling the current plan, cite the principle by name (not the case number) so the reviewer's verdict generalizes across probes.

---

## Check 1 — Coverage

**Question:** Does every journey in `artifacts/user-journeys.json` have either a dedicated slice or a defensible cut documented in `decisions.md`?

**Defensible cut requires:**
- Cited spec evidence (file:section), not "feels redundant"
- Multiple converging signals OR an explicit ambiguity resolution that genuinely could not be implemented under "pick simplest interpretation"
- The cut does not reproduce a known anti-pattern under a different label

### Case 1.1 — WRONG cut: J13 cut for "blocked-other in probe; no observed contract" (probe-2.4 attempt 2)

**Decision:** Cut J13 Upload Documents; ship 501 endpoint + UI toast saying "Upload via seed script — see docs."

**Why wrong:** Probe `blocked-other` status means the probe was cautious about a destructive action (file upload requires real bytes), not that the contract is genuinely ambiguous. The spec pack carries: PDFs in `artifacts/sample-data/pdfs/`, target row shape in `transactions.csv`, observed traffic showing transactions appear after upload. `program.md`'s "Spec gaps are decisions, not blockers — pick the simplest reasonable interpretation" rule applies directly. The 501-with-toast variant is dialog theater under a polite label.

**Principle: Probe limitations ≠ spec ambiguity.** If the spec pack contains the inputs (sample data) and the outputs (target row shape), the contract is derivable. A cut for "no observed contract" is suspicious whenever the inputs and outputs are both present.

**Anti-overfit hint:** Don't only flag the literal string "blocked-other in probe." The shape is *cut justified by absence of probe observation when other evidence is present*. Synonyms: "probe didn't fire a POST," "no recorded request," "endpoint declared but not exercised." Reviewer asks: does the spec pack let me synthesize this contract anyway? If yes, the cut is wrong.

### Case 1.2 — CORRECT cut: J15 Demo/Shopify cut via A2 (probe-2.4)

**Decision:** Cut J15; no slice, no endpoints, demo `transactions` table dropped from schema.

**Why correct:** Three independent spec signals converge: (a) prototype's own `external-contracts.json` had `_shopify_sync_enabled = False` — the prototype itself disabled Shopify, (b) critic-report classified demo layer as M05 dead-code, (c) `user-journeys.json` documented J15 as a runtime-error journey, not a feature. Cut rationale derives from multiple sources, not one judgment call.

**Principle: Cuts strengthen with converging signals.** A single signal can be misread; three independent signals from different probe sources is robust. When operator approves a cut, expect to see ≥2 spec sources cited.

**Anti-overfit hint:** Don't require literally three sources for every cut. The shape is *multi-source corroboration*. Two strong sources (e.g., critic explicitly says "dead code" + the runtime probe shows zero requests) can be sufficient. One source is rarely sufficient unless that source is itself authoritative (e.g., decisions.md from a prior probe with operator review).

### Case 1.3 — WRONG cut: J12 Multi-Tenancy silently dropped (probe-2.4 attempt 1)

**Decision:** Omitted from slice plan with no rationale anywhere.

**Why wrong:** J12 has clear UI (header client-switcher dropdown visible in `01-dashboard.png` scaffold), clear API (entities + entity-config endpoints in `api-spec.json`), and is referenced by every other journey through `?entity=PROBE` query param. No ambiguity to resolve. No `Cut because:` entry in `decisions.md`. Silent drops are the worst class of cut because they leave no trail for the reviewer to engage with.

**Principle: Absence of rationale is the failure, not just the absence of slice.** A cut without a documented reason cannot be defended by anyone. The reviewer should reject any journey absent from both the slice plan and the cuts list.

**Anti-overfit hint:** Don't only flag silent drops in the cuts list. The shape is *journey present in user-journeys.json, absent everywhere else*. Reviewer's first action: set-difference between journey IDs and (slice IDs ∪ cut IDs). Anything in the difference is a silent drop.

### Case 1.4 — WRONG cut: J14 Reset Data silently dropped (probe-2.4 attempt 1)

**Decision:** Omitted from slice plan, same shape as J12.

**Why wrong:** Reset Data button visible in scaffold screenshot. Spec is unambiguous. Same failure mode as 1.3.

**Principle:** Same as 1.3. Listed separately because two consecutive silent drops in one plan is itself a signal — when the controller silently drops one journey, scan the rest of the plan for similar omissions.

### Case 1.5 — CORRECT cut equivalent: D17 client-only Workflow Design + Minion Library (probe-2.3)

**Decision:** J09 + J11 implemented as static React data, no backend, no oracle tests.

**Why correct:** Probe observed `api_endpoints_hit: []` for both journeys — empirical evidence the prototype rendered them client-only. This is observation, not interpretation. The "cut" here is a cut of the *backend half* of each slice, not the slice itself; both journeys still appear as slices in the plan.

**Principle: Empirical absence (zero observed calls) is stronger evidence than declared absence.** The probe walked these pages and saw no API traffic. That's not "we didn't test the endpoints" — it's "the endpoints aren't called by this UI."

**Anti-overfit hint:** Don't generalize this to "any journey with no observed API calls is client-only." The shape requires *the journey was successfully walked AND no API calls were observed during the walk*. A journey that's `blocked-other` (case 1.1) is a different situation entirely.

---

## Check 2 — Decomposition

**Question:** Is each slice scoped to one journey, with no bundling, no orphaned pages, and atomic tasks that decompose within the slice?

### Case 2.1 — WRONG bundle: probe-2.3 S2.13 covered J13 upload + transactions write path + email stubs + entity-duplicate 409

**Decision:** One slice covered four unrelated changes.

**Why wrong:** Controller's own reflection acknowledged optimizing for "close remaining oracle gaps quickly" over slice integrity. Each concern was its own journey or its own bug fix. Revert granularity destroyed — if the email stub had been wrong, the entire upload + 409 fix would have to revert with it. Anti-pattern: optimizing for metrics (123/123 oracle, 15/15 journey walks) over product integrity.

**Principle: One slice = one journey = one revertable unit.** When the controller says "let me close X gaps in one slice," that's the bundling smell. Each concern that could fail independently should commit independently.

**Anti-overfit hint:** Don't only flag slices labeled "catch-all" or with explicit "+ X + Y + Z" in the description. The shape is *single slice with multiple goals that don't share a journey*. Read the slice's `New tables/routes` column — if it lists endpoints from different domains (upload + email + transactions), it's bundled.

### Case 2.2 — CORRECT decomposition: probe-2.3 S2.5 (J02 AR) split into s2.5-01 (backend) + s2.5-02 (UI) as atomic tasks

**Decision:** Single slice scope (J02 AR), two atomic tasks with distinct `verification` commands — backend routes in one task, UI page in the next.

**Why correct:** Both tasks shared the J02 goal. Verifications targeted distinct layers (one curl-shape check, one journey step). The slice committed twice (one per task) but represented one journey end-to-end. This is the intended decomposition pattern.

**Principle: Atomic tasks decompose within a slice; slices do not bundle journeys.** Vertical slicing through layers (DB → API → UI) is fine within a slice. Horizontal slicing across journeys is bundling.

**Anti-overfit hint:** Don't require every slice to split into 2+ atomic tasks. Some journeys are simple enough for one task (e.g., J11 Minion Library is static UI — one task to build the page). The principle is *atomic tasks have distinct verifications*, not *atomic tasks must always exist*.

### Case 2.3 — WRONG axis: probe-2.2 sliced by entity/data-domain, leaving 6 of 11 pages orphaned

**Decision:** Slices were AR CRUD, AP CRUD, Bank Reconciliation, etc. — organized by data table.

**Why wrong:** Pages without a primary data table (Dashboard, Analytics, Stage, Business Context, Workflow Design, Minion Library — 6 of 11 pages) had no dedicated slice. Built once during scaffold, never iterated. Direct cause of probe-2.2's worst UI failures.

**Principle: Slice by user journey, not by data domain.** Cross-domain pages (dashboards, analytics, visualizations, config screens) need their own slices because their data comes from multiple tables. A data-domain plan cannot describe them; a journey-domain plan must.

**Anti-overfit hint:** The reviewer doesn't need to count "11 pages, 5 covered" — that's specific to one prototype. The shape is *slice plan organized around tables/entities rather than around journeys*. Symptom: column headers like "AR slice", "AP slice", "Bank slice" instead of "J02 AR Ledger view", "J03 AP Ledger view", "J04 Bank Reconciliation view". Symptom: any page in the spec pack's screenshots has no slice that builds it.

---

## Check 3 — Scope hygiene

**Question:** Does `progress.txt` contain only the handoff content (stage status, slice plan, current pointer, conventions-set-by-prior-slices, blockers)? Implementation details belong in the dispatched executor prompt or in `decisions.md`.

### Case 3.1 — WRONG scope leak: probe-2.4 attempt 1 progress.txt contained status enum lists, seed-script normalization, envelope conventions, route stubs

**Decision:** Controller frontloaded implementation details into the slice plan: "Direction-aware status: AR statuses: PENDING, PENDING_MATCH, PARTIALLY_PAID...", "envelope is bare array for list endpoints...", "Sample data seeding: app/server/src/seed.ts reads...", route lists like "upload-scan stub".

**Why wrong:** Pre-specification at planning time reduces executor agency, locks in design before evidence (the executor hasn't even read api-spec.json in detail yet), and frontloads decisions the controller shouldn't be making. Worst case: the route-stub mention ("upload-scan stub") biased the oracle prompt toward excluding /upload-scan from tests, locking in dialog theater.

**Principle: Planning-time pre-specification corrupts execution-time judgment.** The controller's job is to delegate, not pre-design. Implementation details belong where they're acted on (executor task prompt) or where they resolve ambiguity (decisions.md), never in the plan.

**Anti-overfit hint:** Don't only flag the literal phrases "stub" or "envelope is X." The shape is *progress.txt contains text that could/should appear in an executor prompt or decisions.md instead*. Test: would removing this paragraph from progress.txt and putting it in the executor's task description change the build outcome? If no, it's noise. If yes, it's leaked specification.

### Case 3.2 — CORRECT scope hygiene: probe-2.4 attempt 2 progress.txt with empty conventions section, "Stack conventions" carried by decisions.md

**Decision:** Slice plan table only (slice id, journey id, deps, one-line summary). Conventions section explicitly empty until later slices populate it. Stack conventions (frontend/backend choices, money column type, date format) lived in decisions.md under a "Stack conventions" header.

**Why correct:** Clean separation. progress.txt is the handoff artifact — what a fresh executor needs to pick up the work. decisions.md is the ambiguity-resolution log. They have different audiences and different lifetimes.

**Principle: Each artifact has one purpose. Mixing purposes is the smell.** progress.txt = handoff. decisions.md = resolved ambiguities. Executor prompt = task-specific instructions.

**Anti-overfit hint:** The reviewer doesn't need to enforce a specific format. The shape is *each artifact answers one question*. progress.txt answers "where are we and what's next?" decisions.md answers "what did we resolve and why?" If the same content could legitimately go in either, it usually belongs in decisions.md.

---

## Check 4 — Anti-pattern fidelity

**Question:** Does the plan signal stub-shaped thinking that will produce dialog theater, or does it commit to real implementation under spec ambiguity?

### Case 4.1 — WRONG anti-pattern signal: probe-2.3 AR/AP Upload buttons → `onSubmit` calls `setToast("coming in J13")`

**Decision:** Dialog opens, button labeled correctly per screenshot, no network call. Form handler ends with `e.preventDefault(); closeDialog();`.

**Why wrong:** Explicit dialog theater per `program.md:90`. Affordance present, function absent. The mechanical dialog-theater grep catches this in the slice gate, but the reviewer should catch the upstream version: a slice plan that says "Upload Documents button (toast for now)" is signaling the same shape before any code is written.

**Principle: "For now" is the dialog theater tell.** Any plan-level language that defers an action's real implementation to a future slice is a stub by another name. The action either works in this slice or its journey doesn't get built in this slice.

**Anti-overfit hint:** Don't only match the string "for now" or "coming in." The shape is *deferred-action-without-handler*. Synonyms: "TBD next slice", "stub for now", "placeholder until X", "501 with friendly toast", "Edit/+ buttons disabled until later". Reviewer asks: does the slice plan describe an interactive affordance whose handler is not built in *this* slice? If yes, either fold the handler into this slice or remove the affordance.

### Case 4.2 — WRONG anti-pattern signal: probe-2.3 AP "Post to GL" toast "Post to GL not yet connected"

**Decision:** Same shape as 4.1 — button, dialog, toast, no POST. Slice S2.9 (which owned post-to-gl) was marked DONE while this stub remained.

**Why wrong:** "Not yet connected" is dialog theater under a polite label. Worse: the slice that owned the implementation marked itself complete. The plan implied post-to-gl would happen in S2.9; the slice gate didn't catch the lie.

**Principle: The slice that owns an action must implement the action. Marking the owning slice complete with the action stubbed is the failure.** This is structurally identical to the J13 cut in case 1.1 — defer or stub the work, then mark the slice done anyway.

**Anti-overfit hint:** Reviewer's check: for every interactive affordance mentioned in any slice's description, identify the slice that owns its handler. If the owning slice's description includes "stub" / "501" / "not yet" / "toast" for that action, the plan is dishonest about the slice's scope.

### Case 4.3 — CORRECT anti-pattern absence: probe-2.3 entity registration → POST `/api/v1/entities` → refetch → select new entity

**Decision:** Real wire-up. Dialog opens, user fills form, submit fires real POST, server inserts row, frontend refetches entity list, dropdown auto-selects new entity, dialog closes.

**Why correct:** Verification asserted `dialog.toBeHidden()` after submit + new entity present + selected. Forcing function on the test produced a real feature. Contrast with cases 4.1 / 4.2 where the verification only asserted dialog visibility.

**Principle: Strong verification on post-action state forces real implementation.** When the slice's verification command checks state-after-action (new row visible, status pill changed, value recomputed), the executor builds the path that produces the state. When the verification only checks affordance presence (button visible, dialog opens), the executor builds only the affordance.

**Anti-overfit hint:** Reviewer doesn't only validate the entity case. Apply to every interactive slice in the plan: does the verification target *post-action state* or *pre-action affordance*? If pre-action, the slice will produce theater.

### Case 4.4 — Spec-resolution principle: probe-2.3 D9 stage-logs envelope follows OBSERVED (structured object) over DECLARED (flat array)

**Decision:** When `data-model.declared.json` and `api-spec.observed.json` conflicted, rewrite followed observed.

**Why correct:** Observed is current runtime truth; declared is potentially stale code. General rule worth encoding: when sources conflict, observed > declared > inferred.

**Principle: Source authority hierarchy. Observed > declared > inferred.** Use this to resolve any conflict between probe outputs.

**Anti-overfit hint:** Not just for envelope shape. Any field, type, status enum, or behavior that conflicts between observed and declared evidence should resolve to observed. Exception: when observed is a known bug (e.g., observed includes a 500 response — that's not the contract), declared is fallback.

### Case 4.5 — Spec-resolution principle: probe-2.3 D14 business-context `status.gl` derived (not stored)

**Decision:** Compute `status.gl` at query time from related rows; do not denormalize into a column. Came from an advisor catch.

**Why correct:** Denormalization risk avoided. Derived values can't go stale; stored derived values can. Simpler invariant maintenance.

**Principle: Derive when derivation is cheap; store only when derivation is expensive enough to cache.** Default to derive. Defaulting to store frontloads invariant-maintenance complexity.

**Anti-overfit hint:** This is a database/API design heuristic, not specific to this prototype. Reviewer should flag any plan that introduces a stored field whose value is computable from other stored fields, unless the plan explicitly justifies the denormalization (perf, race-condition tolerance, etc.).

---

## How the reviewer uses these cases

For each of the four checks, the reviewer:

1. Reads the current `progress.txt` slice plan + `decisions.md`
2. Performs the check question against each slice and each cut
3. For any judgment that is non-obvious, identifies the closest case in this file by *shape* (not string match)
4. Cites the **principle** in the verdict — e.g., *"S04 fails Check 4 by Principle 4.1 (deferred-action-without-handler): the plan describes 'Reset Data button → confirm modal → toast' with no handler — the reset POST belongs in S04 or the affordance belongs in a later slice."*

Cases without a clear analogue in this file are written up after the fact: append a new case to the relevant check, with situation/decision/label/principle/anti-overfit hint. The calibration set grows.

---

## Maintenance

When operator overrides a reviewer verdict (operator says "approve this cut" after reviewer rejected, or vice versa), append a case capturing the override + the operator's reasoning. Override cases are the highest-value calibration entries because they directly reveal where the reviewer's judgment diverged from the operator's.
