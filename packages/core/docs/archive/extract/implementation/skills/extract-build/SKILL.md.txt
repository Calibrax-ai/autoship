---
name: extract-build
description: Use during autoship's optional extract build track when accepted artifacts already exist and the next step touches oracle, backend, or frontend files derived from those artifacts.
---

# Extract Build

## Overview

Autoship's optional extract build track operates against accepted artifacts produced by the extract track. This skill covers the three surfaces the build track writes to:

- **Oracle bundle** — evaluative checks compiled from accepted artifacts, consumed by the implementation loops.
- **Backend** — server code, migrations, runtime config, iterated against the oracle bundle.
- **Frontend** — product UI rebuilt from accepted artifacts and journeys, stabilized for journey verification.

The three surfaces share one discipline: you read accepted artifacts, you do not rewrite them, and you emit a structured blocker rather than invent intent silently. Which surface you're on determines what you write — and, just as importantly, what you must not touch. Get the surface wrong and the author/judge separation that makes this loop trustworthy collapses.

## When to use

Use this skill when:

- The controller has accepted artifacts for the current run and has placed the run in build mode.
- You're about to modify files under the oracle bundle, the backend app, or the frontend app.
- You need shared-discipline guidance before writing the first line of code.

Do not use when:

- Accepted artifacts don't exist yet — run `reverse-spec-extraction` first.
- You're emitting a blocker rather than making progress — use `blocker-escalation`.
- You need to change an accepted artifact — escalate; this skill does not revise artifacts.

## Select your surface first

This is not optional. The protected-surface list, the allowed-output list, and the verification criteria all change with the active surface. Reading the shared discipline below without having identified your surface is how an executor ends up silently rewriting the judge.

| Surface | Input | Output | Reference (read this one only) |
|---|---|---|---|
| **oracle** | accepted artifacts, policy defaults | oracle bundle (contract tests, state assertions, journey checks, policy checks) | `references/oracle.md` |
| **backend** | accepted artifacts + oracle bundle + run state | backend code, migrations, runtime config | `references/backend.md` |
| **frontend** | accepted artifacts + user journeys + design direction | frontend code, screens, navigation, styles | `references/frontend.md` |

The controller declares the active surface in the run's `program.md` or in the dispatch prompt. If you don't know which surface you're on, stop and ask — guessing is worse than asking.

## Shared discipline

These six rules apply to all three surfaces. They exist because the autoship loop's credibility depends on keeping the author (implementation) and the judge (accepted artifacts + oracle bundle) separate.

1. **Accepted artifacts are read-only across all surfaces.** If you think an artifact is wrong, emit a blocker. Editing an artifact to make your code pass is indistinguishable from hiding a failure, and once it happens the spec is compromised for every downstream surface.
2. **The oracle bundle is read-only during backend and frontend phases.** If a test is wrong, that's a blocker, not a patch. Rewriting the judge to pass is the worst-case antipattern this system is designed to prevent.
3. **Protected surfaces are surface-specific.** Each reference lists what is protected during that surface. The union of those lists is what the shared-discipline rules 1–2 rest on, but the specific set differs by phase.
4. **Mismatches are findings, not fixes.** When declared and observed disagree, when two artifacts contradict, when one oracle layer conflicts with another — record and escalate. Silent reconciliation corrupts the spec.
5. **Smallest slice first.** Move the loop forward on narrow evidence, not wide speculation. Wide changes make failures harder to localize and disguise whether your fix actually addressed root cause. A slice that touches one handler and one test typically resolves in one pass; a slice that touches five handlers typically produces a fog of mid-stack failures that takes three passes to untangle.
6. **Every iteration emits either progress or a structured blocker.** Silent stalls are the failure mode this skill is trying to prevent. "Stuck without evidence" is the single most expensive state the loop can enter.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "The test is wrong, I'll just tweak it" | The author must not rewrite the judge. If the test is wrong, escalate — that's what `blocker-escalation` is for. |
| "The artifact is probably wrong, I'll fix it silently" | Wrong artifact means escalate explicitly. Silent artifact edits are indistinguishable from hiding failed work. |
| "I can patch many things at once to keep moving" | Wide changes hide which change caused the pass, which makes the next regression unreachable. |
| "I'll pick a side on this mismatch to move forward" | The mismatch is the finding. The reconciler classifies; the executor surfaces. |
| "One E2E test is enough oracle for this slice" | A single layer collapses the loop. Layered oracles (contract + state + journey + policy) are what let the controller localize failures. |
| "The prototype UI already works, why regenerate it?" | Prototype UI encodes demo-path familiarity, not intended journeys. Verify against journeys, not DOM memory. |
| "I'll change the journey to match the UI I built" | Journeys come from accepted artifacts. If the UI can't support a journey, that's a finding about the UI or a blocker about the journey — never a justification for editing the journey to fit. |

## Red flags

- You're about to modify a file listed as protected in your active surface's reference.
- You authored a test in the same iteration that you authored the implementation it passes.
- The same failure shape is repeating across iterations and you keep adding surface patches instead of narrowing the cause.
- You'd rather edit the oracle than emit a blocker.
- Your slice touches more than one surface — you've lost the surface boundary, and whatever fails next will be hard to localize.
- The controller has not explicitly declared your active surface and you're proceeding anyway.

## Verification

Each surface has specific verification criteria in its reference. Criteria that hold regardless of surface:

- Accepted artifacts were not modified.
- Protected surfaces for the active phase were not modified.
- Policy defaults still hold.
- Remaining issues are emitted as structured blockers, not buried in commit messages or code comments.
- Slice granularity is narrow enough that a failure points at one change.

---

SKILL.md is intentionally lean; per-surface detail lives in `references/`. Read only the reference for your active surface — reading all three invites cross-phase contamination of what you think is protected.
