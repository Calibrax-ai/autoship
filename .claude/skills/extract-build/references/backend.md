# Backend Rewrite Loop

Implement backend code in bounded iterations against accepted artifacts and a protected oracle bundle. This reference is for the `backend` surface of `extract-build`.

## Use when

- Accepted artifacts exist.
- The oracle bundle exists and the controller has declared it protected.
- Backend functionality is missing, incomplete, or failing required checks.
- The controller has placed the backend surface active for this iteration.

Do not use when:

- The reversed spec is still disputed.
- The oracle bundle is known to be invalid — escalate; do not implement against a broken judge.
- The blocker requires artifact or oracle revision instead of coding.

## Protected surfaces during backend iteration

You read, you do not write:

- **Accepted artifacts** — `api-spec.json`, `data-model.json`, `prd.md`, `user-journeys.json`, `external-contracts.json`, `design.md`.
- **Oracle bundle** — every file under the oracle layout. The oracle is the judge, not an authoring target.
- **Policy defaults** — read-only input.
- **Blocker reports** from earlier iterations — read-only history.
- **Frontend application code** — not touched from the backend phase even if a change would feel convenient.

You write:

- Backend application code (handlers, models, services, migrations).
- Runtime config required for the backend to boot and serve (server entry points, env handling, dependency manifests).

## Process

1. Read only the accepted artifacts, oracle bundle, run state, and policy defaults. No prototype, no frontend, no human-authored docs.
2. Pick the smallest viable slice that moves an oracle check from failing to passing. One handler and the one test that fails against it is usually the right granularity.
3. Implement that slice. Keep the change as narrow as you can — widening is how you lose the ability to localize the next failure.
4. Run the oracle bundle's backend-relevant checks.
5. On failure, inspect which oracle layer flagged it. Contract mismatch, state drift, and policy violation are different failure classes — each points at a different kind of fix. Patch at the level the failure describes, not one level up.
6. Repeat within the run budget.
7. Escalate via `blocker-escalation` if progress depends on changing a protected surface, if the oracle contradicts an accepted artifact, or if repeated iterations stop narrowing the failure class.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll tweak the tests to keep moving" | The execution agent must not rewrite the judge. If the test is wrong, that's a blocker. |
| "The spec is probably wrong, I'll fix it silently" | Wrong spec means escalate or revise explicitly through the controller. Silent edits are indistinguishable from hiding failed work. |
| "I can patch many things at once" | Wide changes hide which change caused the pass, which makes the next regression unreachable. |
| "The same test keeps failing, I'll mark it skipped" | Skipping is an oracle edit. If the test is genuinely invalid, escalate it. |

## Red flags

- You want to edit oracle files.
- The same failure repeats without narrowing — you are patching the surface of a deeper problem.
- A passing patch violates accepted artifacts or policy defaults.
- You are solving ambiguity with silent invention rather than surfacing it as a blocker.
- Your slice touches the frontend.

## Verification

- Required backend oracle checks pass.
- No protected surface was modified.
- Policy defaults still hold.
- Remaining issues, if any, are emitted as structured blockers.

## Notes

The "smallest viable slice" rule is the single biggest lever for iteration velocity — it's what makes the loop terminate. Larger slices feel faster but usually cost more passes than they save. When in doubt, cut the slice narrower than you think you need.
