# Audit Assessment Review Rubric

Use this rubric when `audit-reviewer` judges `assessment.md`.

## Required inputs

- `.claude/skills/reviewing/SKILL.md`
- `.claude/skills/autoship-audit/SKILL.md`
- `.claude/skills/autoship-audit/assets/assessment-template.md`
- `.claude/skills/autoship-audit/references/external-exposure.md` when external exposure is enabled
- injected `assessment.md`
- `.autoship/standards.yaml` when present

## Checks

### Check 1 - Well-formedness

Does the assessment conform to `assets/assessment-template.md`?

Required frontmatter keys must be present, including `external-url` and `external-exposure`. Required sections must be present, including External exposure findings. Every required checklist row from the skill must be present. Every issue candidate must populate all nine fields from the Issue-candidate contract. Missing, renamed, collapsed, or placeholder checklist rows are `FAIL`.

### Check 2 - Groundedness

Every `PASS` / `FAIL` claim must cite concrete evidence. Checklist summary uses only `PASS`, `FAIL`, or `UNVERIFIED`.

If `.autoship/standards.yaml` exists, stack-sensitive recommendations must reflect it. If the repo lacks a standard and evidence does not constrain the path, the gap is `decision-required`, not an invented standard. `.env.example` is evidence, not policy.

Pay special attention to external production exposure, security basics, tenant isolation, role/RBAC boundaries, background jobs/queues/webhooks, and performance/scalability. A `PASS` on one of these rows requires positive evidence that the surface is production-ready or concrete evidence that the surface does not apply. Omitted searches or vague statements like "not relevant" are `FAIL`.

### Check 3 - Verdict correctness

Does the top-level verdict follow `SKILL.md` Verdict thresholds?

A verdict looser than the evidence supports is `FAIL`. Any `P0` or launch-critical `UNVERIFIED` must be `do-not-ship`. `ship` requires no `P0`, no `P1`, and no launch-critical `UNVERIFIED`.

### Check 4 - Issue-candidate quality

Candidates must be bounded, not vague epics. Unrelated fixes must not be collapsed together. `execution-ready` is valid only when standards or current repo shape constrain the implementation path. `decision-required` is required when the capability gap is real but the implementation path is not chosen. If a candidate would force `deliver` to invent the platform choice, this check is `FAIL`.

### Check 5 - External probe safety

If `external-exposure: enabled`, the assessment must show that probes stayed within `references/external-exposure.md`:

- only configured URL / same-origin paths
- default methods limited to `GET`, `HEAD`, `OPTIONS`
- login `POST` only when explicitly enabled
- no destructive or state-changing probes
- sensitive response values redacted
- unsafe useful probes listed as skipped rather than executed

If the assessment reports `DELETE`, `PUT`, `PATCH`, non-login `POST`, fuzzing, credential guessing, password reset, file upload, or other state-changing behavior, this check is `FAIL` even if the finding is real.

## Output format

```markdown
---
run: <run-id>
review-of: assessment.md
reviewed-at: <ISO timestamp>
verdict: APPROVED | REJECTED
---

# Audit Review

## VERDICT: APPROVED | REJECTED

## Check 1 - Well-formedness: PASS | FAIL
<reason>

## Check 2 - Groundedness: PASS | FAIL
<reason>

## Check 3 - Verdict correctness: PASS | FAIL
<reason>

## Check 4 - Issue-candidate quality: PASS | FAIL
<reason>

## Check 5 - External probe safety: PASS | FAIL
<reason>

## Notes (non-blocking observations)
(none)

## Specific objections (only if REJECTED)
- <exact issue>

## What the auditor must do next (only if REJECTED)
- <specific revision>
```
