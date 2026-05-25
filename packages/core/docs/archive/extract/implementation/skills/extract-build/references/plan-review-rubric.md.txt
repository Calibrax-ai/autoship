# Extract Plan Review Rubric

Use this rubric when `extract-plan-reviewer` judges an extract slice plan before Stage 1 oracle dispatch.

## Required inputs

- `.claude/skills/reviewing/SKILL.md`
- `docs/plan-reviewer-calibration.md`
- project `program.md`
- project `progress.txt`
- project `decisions.md`
- `artifacts/user-journeys.json`
- `artifacts/critic-report.md`
- `artifacts/api-spec.json`
- `artifacts/screenshots/` file listing

The calibration set is required. Cite principle names in the verdict, not case numbers.

## Checks

### Check 1 - Coverage

Does every journey in `user-journeys.json` have either a dedicated slice in `progress.txt` or a defensible cut in `decisions.md`?

Mechanical step first:

```sh
diff <(jq -r '.journeys[].id' artifacts/user-journeys.json | sort) \
     <(grep -oE '\| S[0-9]+ \| J[0-9]+' progress.txt | awk '{print $4}' | sort)
```

Any journey in the diff must have a `Cut because:` or `Cut via` entry in `decisions.md`.

Judgment step: evaluate each cut against calibration principles for probe limitation vs ambiguity, multi-source corroboration, silent drops, and empirical absence. Soft rationales such as "blocked-other in probe", "covered by another slice", or "feels redundant" are `FAIL`.

### Check 2 - Decomposition

Is each slice scoped to one journey, with no bundling, the right slicing axis, and atomic-task decomposition reserved for within-slice work?

Look for:

- slice descriptions listing endpoints from unrelated domains
- slice plan organized around tables/entities rather than journeys
- pages visible in `artifacts/screenshots/` that no slice owns
- one slice claiming to cover multiple journeys

Any unrelated bundling, data-domain slicing, or orphan page is `FAIL`.

### Check 3 - Scope hygiene

Does `progress.txt` contain only handoff content: stage status, slice plan table, current pointer, conventions-set-by-prior-slices, and blockers?

Any of these smells is `FAIL`:

- status enum value lists in the plan
- seed-script normalization logic
- API envelope conventions
- route stubs as verbs
- Drizzle column types or DB column names beyond the tables/routes introduced
- text whose removal from `progress.txt` and addition to an executor prompt would not change the build outcome

The conventions section should be empty at planning time and populated by later slices.

### Check 4 - Anti-pattern fidelity

Does the plan signal stub-shaped thinking that will produce dialog theater, or does it commit to real implementation under spec ambiguity?

Search the plan and `decisions.md` for these phrases, case-insensitive:

- `stub`, `stubbed`, `placeholder`
- `for now`, `TBD`, `coming in`, `later slice`, `deferred`
- `501`, `not yet implemented`, `not yet connected`
- `toast for now`, `no-op`, `shows a toast`

For every match, verify the slice that owns the affordance also implements its handler. The slice that owns the action must implement the action.

For spec-ambiguity resolutions in `decisions.md`, observed evidence wins unless observed is a known bug. Derived values default to derive, not store, unless denormalization is justified.

For any cut justified by spec ambiguity, apply the simplest-interpretation test: if the spec pack contains the inputs and outputs of the action, the contract is derivable. Cutting it is `FAIL`.

Re-ground UI-behavior claims on primary sources. Whenever the plan claims a journey does or does not do something, open `artifacts/user-journeys.json`, locate the journey, and quote the relevant step verbatim. If a step has behavior verbs attached to the affordance (`clickable`, `opens`, `selects`, `triggers`, `navigates`, `enters`, `drops`, `uploads`), the plan's contrary framing is `FAIL`.

## Output format

```markdown
# Plan Review NN - <ISO date>

## VERDICT: APPROVED | REJECTED

## Check 1 - Coverage: PASS | FAIL
<one paragraph, citing journeys and calibration principles>

## Check 2 - Decomposition: PASS | FAIL
<one paragraph>

## Check 3 - Scope hygiene: PASS | FAIL
<one paragraph>

## Check 4 - Anti-pattern fidelity: PASS | FAIL
<one paragraph>

## Specific objections (only if REJECTED)
- <exact lines/slices/cuts that must change>

## What the controller must do next (only if REJECTED)
- <actionable rewrite instruction>

## Notes for calibration set (optional)
<proposed new case shape, if uncovered>
```
