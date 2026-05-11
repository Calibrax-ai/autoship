# Spec Review Rubric

Use this rubric when `deliver-spec-reviewer` judges `spec.md`.

## Required inputs

- `.claude/skills/reviewing/SKILL.md`
- `.claude/skills/deliver-grooming/SKILL.md`
- `.claude/skills/deliver-grooming/assets/spec-template.md`
- injected `spec.md`
- injected issue body/comments
- injected testbed root

## Checks

### Check 1 - Well-formedness

Does the spec conform to `assets/spec-template.md`?

Verify all required frontmatter keys are present, including the type-specific status field. All seven universal sections must be populated with non-placeholder content. Blast-Radius must use four buckets. Outcome must be one line around 15 words. Type-specific sections required by `SKILL.md` Spec schema must be present and populated.

For Feature, check conditional subsections required by blast-radius shape: migrations in blast-radius -> Migration Plan; db/schema changes -> Schema Diff; queue/worker files created -> Failure Modes; existing API routes changed -> Backward Compatibility; runtime risk -> Constraints.

For Refactor, check all three Behavior Preservation subsections: What must be preserved, Preservation Proof, Structure Improvement.

A missing or placeholder required field is `FAIL`. An invented status value outside `SKILL.md` Status enums is `FAIL`.

### Check 2 - Groundedness

Is every claim grounded in observed output, cited code, or cited issue content?

Apply `SKILL.md` Groundedness criteria, universal plus the matching type section. Verification is **exhaustive, not sampled** — every `file:line` citation must be opened with `Read` and confirmed. Spot-checking is the failure mode this rubric exists to catch.

**Mandatory citation checklist.** Before writing the verdict body, enumerate every cited `file:line` reference in `spec.md` (Root Cause, Alternatives, Existing tests, Structure Improvement -> Before, Blast-Radius -> Expected to create / Expected to change, Concrete Example, Acceptance Criteria runnable commands). For each, open the file at the cited range with `Read` and emit a checklist line in the output's `## Citation verification checklist` section:

```
- <where in spec> → `<file:line-range>` — verified ✓ (<concrete readback of content>)
- <where in spec> → `<file:line-range>` — mismatch: <actual state>
- <where in spec> → `<file:line-range>` — missing: file does not exist at testbed SHA
- <Blast-Radius "Expected to create" entry> → glob check — does not exist ✓ / exists (mark FAIL)
```

A verdict without the checklist — or with fewer entries than the spec has citations — is invalid; the controller treats it as malformed and routes to regroom. Uniform "verified ✓" entries with no parenthetical readback are also invalid.

**Reading discipline:** read the cited range, not just the file. A claim "Root Cause: `orders.ts:47`" requires `Read(orders.ts, offset=47, limit=N)` and confirming the quoted snippet matches.

**Specific check rules:**

- For every file in Blast-Radius -> Expected to create, use `Glob` to confirm it does not already exist. Existing file labeled as new is `FAIL`.
- For Feature Alternatives, confirm each cited `file:line` exists and roughly matches the claimed pattern. Strawman rejections with no cited counter-example are `FAIL`.
- For Refactor executable behavior evidence, confirm each listed test/evidence file exists and imports, calls, or exercises the refactor target. If a refactor cites existing behavior tests but omits a runnable command that exercises them, `FAIL`.

Any unverifiable claim, mismatched citation, or hallucinated invariant is `FAIL`. Minor citation imprecision (line off by a few LOC) where the underlying claim still holds may PASS but goes in `## Notes (non-blocking observations)` with the corrected anchor.

### Check 3 - Scope sanity

Does the spec's scope match what was asked, without widening, deferring, or over-engineering?

Apply `SKILL.md` Scope sanity principles, universal plus the matching type section. Load-bearing checks:

- Feature: grep for simpler existing patterns that could solve the stated problem. If one exists and Design Rationale did not consider it, `FAIL`.
- Feature: if the spec is single-slice but the issue has multi-slice indicators, `FAIL`.
- Refactor: any hint of observable behavior drift is `FAIL`.
- Refactor: coverage-gap plan must name specific test files, test names, and behaviors.
- Refactor: typecheck, lint, route generation, and grep are supporting checks. They cannot be the only preservation proof when automatable behavior tests exist.
- Refactor: behavior preservation delegated to human review while executable repo-native tests/checks exist is `FAIL`.
- Hidden product judgment is a scope failure. If the body shows the groomer made a product call that a human might reasonably override (e.g. picked one of multiple plausible interpretations of user intent, decided who should have access, set a cap or threshold) and that call is not surfaced in `Assumptions`, `FAIL`. An empty `Assumptions` section on a Feature touching auth, money, customer data, or external egress is suspicious and warrants a closer read.

## Output format

```markdown
---
issue: <id>
review-of: spec.md
artifact-reviewed: spec.md
reviewed-at: <ISO timestamp>
reviewer-sha: <testbed SHA>
verdict: APPROVED | REJECTED
failed-checks: [<Well-formedness | Groundedness | Scope sanity; empty array when APPROVED>]
blocking-objection: null | "<highest-priority objection>"
---

# Spec Review NN - <ISO date>

## VERDICT: APPROVED | REJECTED

## Citation verification checklist

<exhaustive list of every cited file:line in spec.md, one line each, with verified/mismatch/missing status and a parenthetical naming what was actually read. Missing this section, or having fewer entries than the spec has citations, makes the verdict invalid — see Check 2.>

- <where in spec> → `<file:line-range>` — verified ✓ (<concrete content readback>)
- ...

## Check 1 - Well-formedness: PASS | FAIL
<one paragraph, citing specific sections or fields>

## Check 2 - Groundedness: PASS | FAIL
<one paragraph, citing specific claims and whether they verify>

## Check 3 - Scope sanity: PASS | FAIL
<one paragraph>

## Notes (non-blocking observations)
(none)

## Specific objections (only if REJECTED)
- <exact field/line and what must change>

## What the deliver-pre-groomer must do next (only if REJECTED)
- <specific regroom instruction>
```

The controller parses only the frontmatter fields for routing. The markdown body explains the verdict for humans.
