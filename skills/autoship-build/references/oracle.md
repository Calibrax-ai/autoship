# Oracle Assembly

Compile accepted artifacts into the protected oracle bundle that the build loop judges implementation against. This reference is for the `oracle` surface of `autoship-build`.

## Use when

- Accepted artifacts exist for the current run.
- The controller needs pass/fail gates before execution can start, or an existing oracle needs extension for new artifacts.
- The implementation loops need deterministic checks to work against.

Do not use when:

- Artifacts are still under dispute — the reconciler and critic have not converged.
- The goal is to patch backend or frontend code. Oracle assembly does not write product code.

## Protected surfaces during oracle assembly

You read, you do not write:

- **All accepted artifacts** — `api-spec.json`, `data-model.json`, `prd.md`, `user-journeys.json`, `external-contracts.json`, `design.md`, and anything else the reconciler accepted.
- **Policy defaults** — the cross-run rules (auth, tenancy, destructive-action guards) that the oracle must encode but not redefine.
- **Backend application code** — not written during this phase.
- **Frontend application code** — not written during this phase.

You write:

- Oracle bundle files under the layout declared in the run's `program.md`.

## Process

1. Read only the accepted artifacts and policy defaults. Do not consult the prototype, the backend, or the frontend during oracle assembly — the oracle's credibility depends on it being derived from artifacts, not from the implementation it will judge.
2. Generate layered oracles:
   - **Contract tests** — endpoint-level checks derived from `api-spec.json`. One case per status-code branch the handler can take.
   - **State assertions** — invariants and relationships from `data-model.json`. Foreign-key integrity, nullable-vs-required, tenant-scoping where declared.
   - **Journey checks** — end-to-end flows from `user-journeys.json`. Every journey marked `completed` in the source artifact must have a corresponding executable check.
   - **Policy checks** — enforcement of policy defaults (auth required where declared, destructive endpoints gated, tenant isolation).
   - **Approved baselines** — when applicable, snapshot outputs to diff future runs against.
3. Surface contradictions between artifacts instead of smoothing them over. If `api-spec.json` and `user-journeys.json` disagree on an endpoint's shape, the oracle must record the disagreement — as an `xfail` test, a `skipped` check with a reason, or a blocker — rather than pick a side.
4. Keep the oracle bundle separate from application code. The exact layout for this run is declared in `.autoship/program.md`; do not invent a layout.

## What makes an oracle layer real

- **Observable** — the check runs without human judgment.
- **Localized** — a failure points at one surface (contract vs. state vs. journey vs. policy), not a mix.
- **Independent of the implementation's internals** — the oracle reads behavior through the same interfaces the product exposes, not through private state.
- **Reproducible** — same inputs produce same pass/fail.

A test written to be easy to satisfy is not an oracle. It's a placeholder that will eventually let a broken implementation pass.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll make the tests broad so the build can pass" | Weak checks collapse the loop — the controller loses its ability to distinguish progress from regression. |
| "The spec is probably good enough, I'll smooth this mismatch over" | Contradictions should be surfaced, not hidden. The executor has no way to recover from an oracle that quietly resolved something. |
| "One E2E flow covers it" | A single layer masks everything a layered oracle would localize. A failing journey check with no contract test tells you less than the sum of both. |
| "I can fix the app code while I'm in here" | Oracle assembly writes oracle files only. Mixing phases is the failure mode the phase separation prevents. |

## Red flags

- Different artifacts imply conflicting endpoint or state behavior and you're tempted to pick the "cleaner" one.
- The oracle depends entirely on one inferred source (e.g., all journey checks derive from static analysis rather than the journey artifact).
- You're writing a test shape specifically because it's easy to make pass.
- You're editing application code while assembling oracles.

## Verification

- Required oracle layers are present: contract, state, journey, policy. Baselines when applicable.
- Policy defaults are enforced where they apply to the accepted artifacts.
- Contradictions between artifacts are surfaced as blockers or explicit skipped cases — not silently merged.
- Oracle files live outside the mutable app tree and match the layout declared in `program.md`.
- No backend or frontend file was modified during this phase.

## Still to be specified

The canonical oracle bundle layout (directory structure, file naming, test runner entry points, shared fixtures) is not yet stable. This reference will expand once a probe has run oracle assembly end-to-end against a real autoship run. Until then, the bundle layout for a given run is whatever `.autoship/program.md` declares — consult that first.
