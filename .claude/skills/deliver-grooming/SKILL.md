---
name: deliver-grooming
description: Use during autoship's deliver track when a Linear/GitHub issue must become a reviewed executable brief for a Bug, Feature, or Refactor.
---

# Deliver Grooming

## Overview

Deliver grooming is the step between "a human filed an issue" and "an executor has a contract to build against." Its output is a single `brief.md` per issue, judged by a fresh-context reviewer before oracle assembly begins.

The skill is shared by a generator-evaluator pair:

- **deliver-pre-groomer** — drafts the brief. Evidence-first across all types.
- **deliver-brief-reviewer** — skeptical judge. Three checks: well-formedness, groundedness, scope sanity. Binding verdict.

Agents cannot discharge their own work. A deliver-pre-groomer that both wrote and approved would drift into a lower-friction standard. That's why the pair is structural.

## When to use

Use this skill when:

- The controller (or manual operator) has an incoming deliver-track issue and needs a reviewed brief before oracle assembly.
- A prior review returned REJECTED and the deliver-pre-groomer is regrooming.

Do not use when:

- The issue is still being triaged for type/scope (pre-pre-groom triage is an operator decision).
- The brief has been approved and oracle assembly is now in progress. Different skill territory.

## Type postures

The dispatch names the type. Posture, anti-patterns, and per-type procedure follow.

### Bug — forensic

Every claim grounded in observed output, grep'd code, or cited issue content. Find the root cause — do not stop at the symptom. The brief covers exactly the reported bug; no adjacent fixes.

### Feature — generative

Evidence-first for features means evidence from codebase patterns, not runtime error output. Find the smallest design that solves the stated problem by following existing patterns. Novelty is a cost; fit is a feature. The brief covers the stated problem, not its adjacent imaginable extensions.

### Refactor — conservational

Preserve observable behavior. Improve structure (coupling, readability, testability, complexity, performance, security) without changing what the code does externally. Tests are the contract — what existing tests cover defines what is preserved; what they don't cover must be filled by regression tests before the refactor lands.

## Status enums (strict)

Each type has one status field in frontmatter. Values are strictly enumerated — no other labels are valid outputs:

- `reproduction-status: confirmed | cannot-reproduce | need-info` (Bug)
- `design-status: drafted | need-info` (Feature)
- `preservation-status: ready | needs-coverage-first | need-info` (Refactor)

Do not invent `ready`, `proposed`, `in-progress`, `draft`, or any other label. If none of the enumerated values fit, use `need-info` and explain what is missing.

## Brief schema

The full brief template, including frontmatter, all universal sections, and type-specific sections, lives at `assets/brief-template.md`. The deliver-pre-groomer fills it; the reviewer checks conformance against it.

Universal sections (all types): Outcome, Acceptance Criteria, Scope Fence, Rabbit-Hole Patches, Blast-Radius Manifest, Skeleton Position, Concrete Example. Optional: Failure Modes.

Type-specific sections:

- **Bug** — Reproduction Steps, Root Cause
- **Feature** — Design Rationale (with Alternatives, Picked + Reason; conditional subsections based on blast-radius characteristics)
- **Refactor** — Behavior Preservation (What must be preserved, Preservation Proof, Structure Improvement); Design Rationale is optional

## Feature scope classification

Before drafting a Feature brief, classify scope:

- **Single-slice** — one coherent unit of work with a clear acceptance boundary. Surfaces either co-located in one file/module, or fan out across surfaces that share one enforcement chokepoint (middleware, single handler).
- **Multi-slice** — genuinely independent surfaces whose correctness can only be verified separately, OR open questions that resolve differently per surface. Indicators live in the issue, not in the projected brief: multiple "Requested outcomes" that don't share a skeleton; open questions that branch the design tree (e.g., "per-user vs per-team vs role+entity") such that the fork drives different file sets.

If multi-slice: do not draft a unified brief. Output `design-status: need-info` with:

- **Proposed decomposition** — named sub-issues (e.g., `FRD-143a data model`, `FRD-143b enforcement`) with one-line scopes
- **Why it can't be single-sliced** — rationale citing the issue's open questions or independent surfaces
- **What each sub-issue would cover** — enough detail for the operator to split and re-dispatch

The operator splits on Linear and re-dispatches per sub-issue. Do not groom multi-slice issues as one.

## Groundedness criteria

A brief is ungrounded if any claim lacks traceable evidence. These are the criteria the reviewer uses on Check 2:

### Universal

- Acceptance Criteria verifications are runnable commands (specific test names, specific curl calls) — not "run the relevant tests."
- Blast-Radius → `Expected to change` is grep-verifiable as touched by the reported problem (imports, callers, or direct surface).
- Never-touch list names specific files or clear glob patterns — not vague domains.
- **Every file listed under "Expected to create" must actually not exist.** Co-located test files (e.g., `inbox.test.ts` next to `inbox.ts`) almost always already exist. Existing files labeled "new" is ungrounded about repo state. This is a file-existence check the deliver-pre-groomer runs during blast-radius mapping and the reviewer re-verifies.

### Bug

- `Reproduction Steps` quotes actual command + actual output, not a hypothetical. If `reproduction-status: confirmed`, there must be real command output.
- `Root Cause` cites a specific `file:line`. The line content must match the quoted snippet.
- If `reproduction-status` is `cannot-reproduce` or `need-info`, Reproduction Steps explains what is missing. A populated Root Cause despite unproven reproduction is ungrounded.

### Feature

- **Alternatives** cite real `file:line` patterns that exist and roughly match the claimed pattern.
- **Alternatives are not strawman** — each option has a plausible cost estimate + fit analysis. An option rejected with "not how we do things here" without a cited counter-example is ungrounded.
- **Picked + Reason** references concrete codebase evidence, not generic principles. "Simpler" is not a reason; "fits the pattern at `orders.ts:47`" is.

### Refactor

- **Existing tests list** — each listed test file exists and imports or calls the refactor target. Files that exist but do not exercise the target are ungrounded.
- **Observable invariants** in "What must be preserved" reference real behaviors — endpoint names, table names, event types that exist in the codebase.
- **Structure Improvement → Before** cites the real current structure. Named files/functions/classes exist as described.
- **Coverage gaps** are specific behaviors + specific regression tests to add (file + test name), not "add tests as needed."
- If `preservation-status: needs-coverage-first`, Coverage gaps names specific tests; the brief is approvable only if those tests are specific enough to execute against.

## Scope sanity principles

### Universal (any one is a scope failure)

- Always-touch list includes files unrelated to the reported symptom/request (widening).
- Never-touch list is vague rather than specific.
- Rabbit-Hole Patches punt decisions the deliver-pre-groomer should have made ("TBD — reviewer decides").
- Acceptance Criteria include targets beyond the issue ("while we're here, also fix X").

### Bug

- Skeleton Position claims first-slice when the testbed clearly has existing patterns to follow.

### Feature

- **Picked alternative must be the simplest reasonable.** Over-engineering (generic abstraction for a single use case, novel machinery when existing patterns exist) is a scope failure.
- **Substantially simpler alternative check.** If a simpler pattern exists in the codebase and Design Rationale did not consider it, the brief has failed scope sanity.
- **Multi-slice features acknowledge their shape.** A multi-slice feature pretending to be single-slice is a scope failure.

### Refactor

- **No observable behavior changes.** API responses, DB shapes, emitted events, or any externally observable behavior must not drift. Any AC or Structure Improvement description implying behavior change is a scope failure. This is the load-bearing check for Refactor — the most common way refactor briefs fail.
- **Improvement target is concrete and measurable**, not vague. "Reduce coupling" alone fails; "Extract auth logic into `src/auth/` (currently in `routes/*.ts`)" passes.
- **No while-we're-here additions.** Scope matches the stated structural change; scope creep into behavior improvements or adjacent refactors is a failure.
- **Coverage-gap plan is specific.** Named test files + test names + behaviors they cover.

## Anti-patterns

### Universal

Other grooming systems produce briefs that look complete until the executor discovers they are half-specified or pointed at the wrong problem. The deliver-pre-groomer does not ship such a brief. The reviewer does not approve one.

### Bug

No brief without observed reproduction. No "Root Cause" as speculation — find the `file:line`. No scope widening beyond the bug. No stub fix disguised as a root-cause fix. No brief marked ready while any acceptance criterion lacks a runnable check.

### Feature

No brief without a cited existing pattern — or, if truly new territory, an explicit "no existing pattern" decision in Design Rationale. No strawman alternatives. No machinery for imagined future requirements — deferred options live in the Deferred subsection. No pretending a multi-slice feature is single-slice. No novel abstractions when existing patterns solve the problem.

### Refactor

No brief that changes observable behavior, even in "harmless" ways. No partial refactor — either it completes or does not start. No while-we're-here feature additions. No vague improvement targets. No commitment to a refactor before coverage exists for what must be preserved — if gaps exist, the brief commits to specific regression tests BEFORE the structural change.

## Evidence discipline

- Reproduction is a tool call that returns output, not a hypothesis.
- Design is grounded in the codebase, not in general principles.
- Coverage is grep-inventoried from tests that actually exist.
- File-existence is verified with an available file-listing tool (`Glob` for reviewers), not assumed.
- The brief specifies WHAT must change and WHERE, never HOW.

## Hard rules

- The deliver-pre-groomer writes exactly one file: the injected brief path. No source code, tests, migrations, or config changes.
- The deliver-brief-reviewer writes exactly one file: its verdict at the injected review path. Read-only otherwise.
- No destructive commands.
- Reviewer verdicts are strictly binary: `APPROVED` or `REJECTED`. Blocking → REJECTED with specific objections. Non-blocking → APPROVED with observations in a `notes:` field. No intermediate labels.
- Reviewer default is REJECT; approval requires positive evidence on every check.
